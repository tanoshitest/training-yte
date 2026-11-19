import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";

const AUTH_SECRET = "vps-test-auth-secret-at-least-32-characters";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

function testEnv() {
  const kvStorage = new MemoryStorage();
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("VPS adapter chỉ hỗ trợ KV JSON.");
        return (kvStorage.values.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => { kvStorage.values.set(key, JSON.parse(value)); },
      compareAndPut: async (key: string, expected: string, value: string) => {
        const current = JSON.stringify(kvStorage.values.get(key) ?? null);
        if (current !== expected) return false;
        kvStorage.values.set(key, JSON.parse(value));
        return true;
      },
    },
    SYLLABUS_CATALOG: {
      getByName(name: string) {
        let value = catalogs.get(name);
        if (!value) {
          value = new SyllabusCatalog({ storage: new MemoryStorage() }, {});
          catalogs.set(name, value);
        }
        return value;
      },
    },
    SYLLABUS_DOCUMENT: {
      getByName(name: string) {
        let value = documents.get(name);
        if (!value) {
          value = new SyllabusDocumentObject({ storage: new MemoryStorage() }, {});
          documents.set(name, value);
        }
        return value;
      },
    },
    AUTH_SECRET,
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
}

function base64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Ký một phiên hệt định dạng của worker.ts (createSession/encodePayload), để
// dựng sẵn một cookie có exp tuỳ ý thay vì phải chờ thật 8 tiếng trong test.
function signSession(payload: Record<string, unknown>, secret: string) {
  const encoded = base64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest();
  return `${encoded}.${base64Url(signature)}`;
}

test("phiên sắp hết hạn được gia hạn khi người dùng vẫn đang thao tác", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );

  // Phiên còn 1 giây nữa là hết hạn — đã đi quá nửa vòng đời TTL 8 tiếng.
  const nearExpiryToken = signSession(
    { email: "admin@steps.vn", name: "Quản trị STEPS", role: "ADMIN", studentId: "student-demo", exp: Date.now() + 1_000 },
    AUTH_SECRET,
  );
  const response = await request("/api/bootstrap", { headers: { Cookie: `steps_demo_session=${nearExpiryToken}` } });
  assert.equal(response.status, 200, "phiên còn hợp lệ (chưa hết hạn) phải cho qua request bình thường");

  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "phải cấp lại cookie phiên mới khi phiên cũ sắp hết hạn nhưng người dùng vẫn đang hoạt động");
  const renewedToken = setCookie!.split(";", 1)[0]!.slice("steps_demo_session=".length);
  const renewedPayload = JSON.parse(Buffer.from(renewedToken.split(".", 1)[0]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  assert.ok(
    renewedPayload.exp > Date.now() + (SESSION_TTL_SECONDS * 1000) / 2,
    "phiên gia hạn phải có hạn mới gần đủ SESSION_TTL_SECONDS kể từ bây giờ, không phải hạn cũ sắp hết",
  );
});

test("phiên còn nhiều thời gian thì không bị cấp lại cookie ở mỗi request", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );

  // Phiên vừa mới tạo, còn gần trọn TTL — chưa cần gia hạn.
  const freshToken = signSession(
    { email: "admin@steps.vn", name: "Quản trị STEPS", role: "ADMIN", studentId: "student-demo", exp: Date.now() + SESSION_TTL_SECONDS * 1000 },
    AUTH_SECRET,
  );
  const response = await request("/api/bootstrap", { headers: { Cookie: `steps_demo_session=${freshToken}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null, "không cần cấp lại cookie khi phiên còn nhiều thời gian, tránh ghi Set-Cookie ở mọi request");
});

test("phiên đã hết hạn vẫn bị từ chối và không được gia hạn", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );

  const expiredToken = signSession(
    { email: "admin@steps.vn", name: "Quản trị STEPS", role: "ADMIN", studentId: "student-demo", exp: Date.now() - 1_000 },
    AUTH_SECRET,
  );
  const response = await request("/api/bootstrap", { headers: { Cookie: `steps_demo_session=${expiredToken}` } });
  assert.equal(response.status, 401, "phiên đã hết hạn vẫn phải bị từ chối như cũ, không tự động sống lại");
  assert.equal(response.headers.get("set-cookie"), null);
});
