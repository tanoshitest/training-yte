import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { createZaloClient, resetZaloTokenCacheForTests, type ZaloClientConfig } from "../cloudflare/zalo-zbs-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetZaloTokenCacheForTests();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function config(overrides: Partial<ZaloClientConfig> = {}): ZaloClientConfig {
  return {
    appId: "app-1",
    appSecret: "top-secret-app-secret",
    refreshToken: "refresh-token-initial",
    ...overrides,
  };
}

test("sendTemplate thành công trả msgId và sentTime từ phản hồi Zalo", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: { hoc_vien: "A", so_tien: "500000" } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.msgId, "msg-1");
  assert.equal(result.sentTime, "1700000000000");
});

test("hết quota (error khác 0) thì không ok, không retryable trừ khi 5xx/429", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: -32, message: "Vượt quá hạn mức gửi tin." });
  }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: {} });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, false);
  assert.match(result.message, /hạn mức/);
});

test("template chưa duyệt hoặc lỗi 5xx thì retryable", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(500, { error: -1, message: "Server error" });
  }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: {} });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
});

test("timeout (AbortError) phân loại đúng mã TIMEOUT", async () => {
  globalThis.fetch = (async () => { throw new DOMException("The operation was aborted.", "AbortError"); }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.getAccessToken();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "TIMEOUT");
  assert.equal(result.retryable, true);
});

test("refresh token xoay vòng: token mới khác token cũ thì gọi onTokenRotated đúng một lần", async () => {
  let rotatedTo: string | undefined;
  let rotateCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-ROTATED", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  const client = createZaloClient(config({
    onTokenRotated: async (next) => { rotatedTo = next; rotateCalls += 1; },
  }));
  await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: {} });
  assert.equal(rotatedTo, "refresh-token-ROTATED");
  assert.equal(rotateCalls, 1);
});

test("token không đổi thì không gọi onTokenRotated", async () => {
  let rotateCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  const client = createZaloClient(config({ onTokenRotated: async () => { rotateCalls += 1; } }));
  await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: {} });
  assert.equal(rotateCalls, 0);
});

test("gửi 401 thì xoá cache token và retryable", async () => {
  let tokenCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) { tokenCalls += 1; return jsonResponse(200, { access_token: `acc-${tokenCalls}`, refresh_token: "refresh-token-initial", expires_in: 3600 }); }
    return jsonResponse(401, { error: -216, message: "Access token invalid" });
  }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.sendTemplate({ phone: "84912345678", templateId: "tpl-1", templateData: {} });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.equal(result.code, "UNAUTHORIZED");
});

test("JSON phản hồi hỏng không throw, trả kết quả lỗi", async () => {
  globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.getAccessToken();
  assert.equal(result.ok, false);
});

test("ping() gọi được token và không throw khi lỗi mạng", async () => {
  globalThis.fetch = (async () => { throw new TypeError("network down"); }) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.ping();
  assert.equal(result.ok, false);
  assert.ok(result.message);
});

test("bí mật (appSecret) không lọt vào kết quả lỗi trả về", async () => {
  globalThis.fetch = (async () => jsonResponse(401, { error: -216, error_description: "invalid secret" })) as typeof fetch;
  const client = createZaloClient(config());
  const result = await client.getAccessToken();
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("top-secret-app-secret"), false);
});
