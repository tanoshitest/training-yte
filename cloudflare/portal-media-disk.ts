/**
 * Lưu và phục vụ học liệu Portal trên đĩa VPS (chỉ chạy trong Node — vps-server.ts).
 * Xem cloudflare/portal-media.ts cho API tải lên và quy ước đường dẫn.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve, sep } from "node:path";

import { isPortalMediaPath, portalMediaContentType, type PortalMediaStore } from "./portal-media";

export function createDiskMediaStore(mediaRoot: string): PortalMediaStore {
  return {
    async put(body, { ext, maxBytes }) {
      const now = new Date();
      const folder = `portal/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const path = `${folder}/${randomUUID()}.${ext}`;
      const filePath = resolve(mediaRoot, path);
      await mkdir(dirname(filePath), { recursive: true });
      const out = createWriteStream(filePath, { flags: "wx" });
      const reader = body.getReader();
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new Error("MEDIA_TOO_LARGE");
          if (!out.write(value)) await new Promise<void>((ok) => out.once("drain", () => ok()));
        }
        await new Promise<void>((ok, fail) => out.end((error?: Error | null) => error ? fail(error) : ok()));
        return { path, bytes };
      } catch (error) {
        reader.cancel().catch(() => {});
        // Đợi luồng ghi đóng hẳn rồi mới xóa — xóa sớm thì lệnh mở file còn treo sẽ tạo lại file rỗng.
        if (!out.closed) await new Promise<void>((ok) => { out.once("close", () => ok()); out.destroy(); });
        await unlink(filePath).catch(() => {});
        throw error;
      }
    },
  };
}

/** Phục vụ /media/* thẳng từ đĩa, hỗ trợ Range để tua video. Không qua worker (file tên UUID). */
export async function serveDiskMedia(mediaRoot: string, request: IncomingMessage, target: ServerResponse) {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  const relative = pathname.replace(/^\/media\//, "");
  if (!isPortalMediaPath(relative)) { target.statusCode = 404; target.end("Not found"); return; }
  const filePath = resolve(mediaRoot, relative);
  if (!filePath.startsWith(`${mediaRoot}${sep}`)) { target.statusCode = 404; target.end("Not found"); return; }
  let size = 0;
  try { size = (await stat(filePath)).size; } catch { target.statusCode = 404; target.end("Not found"); return; }
  target.setHeader("Content-Type", portalMediaContentType(relative));
  target.setHeader("Accept-Ranges", "bytes");
  target.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || ""));
  let start = 0;
  let end = size - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
    else { start = Math.max(0, size - Number(range[2])); }
    if (start > end || start >= size) {
      target.statusCode = 416;
      target.setHeader("Content-Range", `bytes */${size}`);
      target.end();
      return;
    }
    target.statusCode = 206;
    target.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  } else {
    target.statusCode = 200;
  }
  target.setHeader("Content-Length", end - start + 1);
  if (request.method === "HEAD") { target.end(); return; }
  createReadStream(filePath, { start, end }).on("error", () => target.destroy()).pipe(target);
}
