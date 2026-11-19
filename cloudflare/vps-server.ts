// Chạy ở local thì đọc cấu hình từ `.env`. Trong container không có file này nên
// lệnh không làm gì, và dotenv không bao giờ ghi đè biến môi trường đã đặt sẵn.
import { onDataGenerationBump, trackKvWrites } from "./data-generation";
import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { extname, resolve, sep } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import worker, { scheduleBootstrapPrewarm } from "./worker";
import { processInvoiceOutbox } from "./invoice-outbox";
import { processZaloOutbox } from "./zalo-outbox";
import { SyllabusCatalog, SyllabusDocumentObject } from "./syllabus-storage";
import { createRelationalKv } from "./storage/relational-kv";
import { RelationalSyllabusCatalogStorage, RelationalSyllabusDocumentStorage } from "./storage/syllabus-object-storage";
import type { DurableObjectStateLike, DurableObjectStorageLike } from "./durable-object-base";
import { createDiskMediaStore, serveDiskMedia } from "./portal-media-disk";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");
if (!process.env.AUTH_SECRET) throw new Error("Thiếu AUTH_SECRET.");
if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
  throw new Error("Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

const assetsRoot = resolve(process.cwd(), "cloudflare", "public");
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function stateKey(prefix: string, key: string) {
  return `${prefix}:${encodeURIComponent(key)}`;
}

class PostgresStorage implements DurableObjectStorageLike {
  constructor(private readonly prefix: string) {}

  async get<T>(key: string): Promise<T | undefined> {
    const row = await prisma.vpsAppState.findUnique({ where: { key: stateKey(this.prefix, key) } });
    return row?.value as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    const dbKey = stateKey(this.prefix, key);
    const jsonValue = JSON.parse(JSON.stringify(value));
    await prisma.vpsAppState.upsert({
      where: { key: dbKey },
      create: { key: dbKey, value: jsonValue },
      update: { value: jsonValue },
    });
  }

  /**
   * Ghi có điều kiện bằng updatedAt của PostgreSQL. updateMany là một câu lệnh
   * nguyên tử, nên request đến sau không thể ghi đè dữ liệu mà request trước vừa lưu.
   */
  async compareAndPut<T>(key: string, expected: string, value: T): Promise<boolean> {
    const dbKey = stateKey(this.prefix, key);
    const jsonValue = JSON.parse(JSON.stringify(value));
    const current = await prisma.vpsAppState.findUnique({
      where: { key: dbKey },
      select: { value: true, updatedAt: true },
    });
    if (JSON.stringify(current?.value ?? null) !== expected) return false;

    if (!current) {
      try {
        await prisma.vpsAppState.create({ data: { key: dbKey, value: jsonValue } });
        return true;
      } catch (error) {
        const createdByAnotherRequest = await prisma.vpsAppState.findUnique({ where: { key: dbKey }, select: { key: true } });
        if (createdByAnotherRequest) return false;
        throw error;
      }
    }

    const updated = await prisma.vpsAppState.updateMany({
      where: { key: dbKey, updatedAt: current.updatedAt },
      data: { value: jsonValue },
    });
    return updated.count === 1;
  }

  async deleteAll(): Promise<void> {
    await prisma.vpsAppState.deleteMany({ where: { key: { startsWith: `${this.prefix}:` } } });
  }
}

const kvStorage = new PostgresStorage("kv");
const jsonBlockKv = {
  async get<T>(key: string, type: "json"): Promise<T | null> {
    if (type !== "json") throw new Error("VPS adapter chỉ hỗ trợ KV JSON.");
    return (await kvStorage.get<T>(key)) ?? null;
  },
  async put(key: string, value: string) {
    await kvStorage.put(key, JSON.parse(value));
  },
  async compareAndPut(key: string, expected: string, value: string) {
    return kvStorage.compareAndPut(key, expected, JSON.parse(value));
  },
};

// Các bảng quan hệ là tầng lưu trữ của ứng dụng ở mọi môi trường, nên quên đặt biến
// vẫn chạy đúng. `STORAGE_MODE=kv` quay về kho JSON trong `vps_app_state` — chỉ dùng
// làm đường lùi khi cắt chuyển production gặp sự cố, phải cố tình đặt mới chạy.
const storageMode = process.env.STORAGE_MODE === "kv" ? "kv" : "relational";
const kv = storageMode === "relational" ? createRelationalKv(prisma, kvStorage) : jsonBlockKv;

function objectState(namespace: string, name: string): DurableObjectStateLike {
  if (storageMode === "relational") {
    if (namespace === "catalog") return { storage: new RelationalSyllabusCatalogStorage(prisma) };
    if (namespace === "document") return { storage: new RelationalSyllabusDocumentStorage(prisma, name) };
  }
  return { storage: new PostgresStorage(`do:${namespace}:${encodeURIComponent(name)}`) };
}

const catalogObjects = new Map<string, SyllabusCatalog>();
const documentObjects = new Map<string, SyllabusDocumentObject>();

function getCatalog(name: string) {
  let object = catalogObjects.get(name);
  if (!object) {
    object = new SyllabusCatalog(objectState("catalog", name), {});
    catalogObjects.set(name, object);
  }
  return object;
}

function getDocument(name: string) {
  let object = documentObjects.get(name);
  if (!object) {
    object = new SyllabusDocumentObject(objectState("document", name), {});
    documentObjects.set(name, object);
  }
  return object;
}

async function assetResponse(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const relative = pathname.replace(/^\/+/, "");
  const filePath = resolve(assetsRoot, relative);
  if (filePath !== assetsRoot && !filePath.startsWith(`${assetsRoot}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const info = await stat(filePath);
    const extension = extname(filePath).toLowerCase();
    const revalidateAsset = pathname === "/index.html" || extension === ".js" || extension === ".css";
    // ETag theo kích thước + thời điểm sửa file: trình duyệt hỏi lại (no-cache) nhận 304, không tải lại cả file.
    const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = {
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
      // index.html gắn ?v=… cho mỗi bản js/css → link có ?v là bất biến, trình duyệt khỏi hỏi lại mỗi lần mở web.
      "Cache-Control": revalidateAsset ? (pathname !== "/index.html" && url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache") : "public, max-age=3600",
      ETag: etag,
      "Last-Modified": new Date(info.mtimeMs).toUTCString(),
    };
    const ifNoneMatch = request.headers.get("if-none-match") || "";
    if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === etag || tag.trim() === etag.slice(2))) {
      return new Response(null, { status: 304, headers });
    }
    const body = await readFile(filePath);
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// Học liệu Portal (ảnh, âm thanh, video) — lưu đĩa VPS. Trong container là volume `media-data`
// gắn ở /app/media (deploy/docker-compose.yml), nên deploy lại không mất file.
const mediaRoot = resolve(process.env.MEDIA_DIR || resolve(process.cwd(), "media"));

const mediaStore = createDiskMediaStore(mediaRoot);

const env = {
  ASSETS: { fetch: assetResponse },
  MEDIA: mediaStore,
  // Mọi lần ghi (cả việc chạy nền hoá đơn / Zalo) tăng "thế hệ dữ liệu" để bộ đệm /api/bootstrap tự làm mới.
  STEPS_LMS_DATA: trackKvWrites(kv),
  SYLLABUS_CATALOG: { getByName: getCatalog },
  SYLLABUS_DOCUMENT: { getByName: getDocument },
  AUTH_SECRET: process.env.AUTH_SECRET,
  DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? "",
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME,
  ALLOW_DEMO_LOGIN: process.env.ALLOW_DEMO_LOGIN ?? "false",
  SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET,
  LMS_READONLY_API_TOKEN: process.env.LMS_READONLY_API_TOKEN,
  LMS_OPS_API_TOKEN: process.env.LMS_OPS_API_TOKEN,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
};

function requestUrl(request: IncomingMessage) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() || "http";
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim()
    || request.headers.host
    || "localhost";
  return `${protocol}://${host}${request.url || "/"}`;
}

async function webRequest(request: IncomingMessage) {
  const method = request.method || "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  if (method === "GET" || method === "HEAD") return new Request(requestUrl(request), { method, headers });
  // Trình duyệt nén gzip thân request lớn (app.js → api()) cho đỡ tốn đường lên. Giải nén ở đây,
  // worker nhận đúng JSON như cũ. Hỏng dữ liệu nén → BODY_DECODE để trình duyệt gửi lại bản không nén.
  if (String(headers.get("content-encoding") || "").toLowerCase() === "gzip") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    let plain: Buffer;
    try { plain = gunzipSync(Buffer.concat(chunks)); } catch { throw new BodyDecodeError(); }
    headers.delete("content-encoding");
    headers.set("content-length", String(plain.byteLength));
    return new Request(requestUrl(request), { method, headers, body: plain });
  }
  return new Request(requestUrl(request), {
    method,
    headers,
    body: request as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

class BodyDecodeError extends Error {}

async function send(response: Response, target: ServerResponse) {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  const bytes = Buffer.from(await response.arrayBuffer());
  target.setHeader("Content-Length", bytes.byteLength);
  target.end(bytes);
}

const port = Number(process.env.PORT || 3000);
const server = createServer(async (request, response) => {
  try {
    if ((request.method === "GET" || request.method === "HEAD") && (request.url || "").startsWith("/media/")) {
      await serveDiskMedia(mediaRoot, request, response);
      return;
    }
    const result = await worker.fetch(await webRequest(request), env as never);
    await send(result, response);
  } catch (error) {
    if (error instanceof BodyDecodeError) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "BODY_DECODE" }));
      return;
    }
    console.error(error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  const storageLabel = storageMode === "relational"
    ? "bảng quan hệ"
    : "khối JSON trong vps_app_state";
  console.log(`STEPS LMS VPS đang chạy tại cổng ${port} — tầng lưu trữ: ${storageLabel} (STORAGE_MODE=${storageMode}).`);
});

// Không có ctx.waitUntil trên đường VPS (worker.fetch gọi thẳng), nên "chạy nền" ở đây
// là một vòng lặp hẹn giờ trong tiến trình — không hoạt động khi tiến trình không chạy,
// cộng thêm lời gọi "bắn rồi quên" ngay sau webhook (worker.ts) để hóa đơn ra sớm.
const invoiceOutboxInterval = setInterval(() => {
  processInvoiceOutbox(env as never).catch((error) => console.error("invoice-outbox:", error));
}, 30_000);

// Dữ liệu vừa đổi → dựng sẵn bản mở web (bootstrap) ở nền, người mở web sau không phải chờ dựng.
onDataGenerationBump(() => scheduleBootstrapPrewarm(env as never));

const zaloOutboxInterval = setInterval(() => {
  processZaloOutbox(env as never).catch((error) => console.error("zalo-outbox:", error));
}, 30_000);

async function shutdown() {
  clearInterval(invoiceOutboxInterval);
  clearInterval(zaloOutboxInterval);
  server.close();
  await prisma.$disconnect();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
