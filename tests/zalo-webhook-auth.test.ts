import assert from "node:assert/strict";
import test from "node:test";

import { verifyZaloWebhookRequest } from "../cloudflare/zalo-webhook-auth";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("bí mật rỗng không bao giờ được coi là hợp lệ, kể cả khi thiếu chữ ký", async () => {
  const result = await verifyZaloWebhookRequest({ rawBody: "{}", headers: new Headers(), appId: "app-1", appSecret: "" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "MISSING_SECRET");
});

test("thiếu header chữ ký hoặc timestamp thì từ chối", async () => {
  const result = await verifyZaloWebhookRequest({ rawBody: "{}", headers: new Headers(), appId: "app-1", appSecret: "secret" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "MISSING_SIGNATURE");
});

test("chữ ký đúng công thức app_id + body + timestamp + secret thì được chấp nhận", async () => {
  const rawBody = JSON.stringify({ msg_id: "msg-1" });
  const timestamp = "1700000000000";
  const appId = "app-1";
  const secret = "zalo-app-secret";
  const signature = await hmacSha256Hex(secret, `${appId}${rawBody}${timestamp}`);
  const headers = new Headers({ "x-zevent-signature": signature, "x-zevent-timestamp": timestamp });
  const result = await verifyZaloWebhookRequest({ rawBody, headers, appId, appSecret: secret });
  assert.equal(result.ok, true);
});

test("chữ ký sai (khác secret hoặc body bị sửa) thì bị từ chối", async () => {
  const rawBody = JSON.stringify({ msg_id: "msg-1" });
  const timestamp = "1700000000000";
  const signature = await hmacSha256Hex("secret-khac", `app-1${rawBody}${timestamp}`);
  const headers = new Headers({ "x-zevent-signature": signature, "x-zevent-timestamp": timestamp });
  const result = await verifyZaloWebhookRequest({ rawBody, headers, appId: "app-1", appSecret: "secret-that" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_SIGNATURE");
});

test("body bị sửa sau khi ký thì chữ ký không còn khớp", async () => {
  const timestamp = "1700000000000";
  const appId = "app-1";
  const secret = "zalo-app-secret";
  const originalBody = JSON.stringify({ msg_id: "msg-1" });
  const signature = await hmacSha256Hex(secret, `${appId}${originalBody}${timestamp}`);
  const headers = new Headers({ "x-zevent-signature": signature, "x-zevent-timestamp": timestamp });
  const tamperedBody = JSON.stringify({ msg_id: "msg-2" });
  const result = await verifyZaloWebhookRequest({ rawBody: tamperedBody, headers, appId, appSecret: secret });
  assert.equal(result.ok, false);
});
