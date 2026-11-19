import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

import { verifyWebhookRequest } from "../cloudflare/sepay-webhook-auth";

function hmacHex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

test("HMAC_BODY rejects a request without a signature even when the secret is empty", async () => {
  const result = await verifyWebhookRequest({
    rawBody: "{}",
    headers: new Headers(),
    secret: undefined,
    mode: "HMAC_BODY",
  });
  assert.equal(result.ok, false);
});

test("HMAC_BODY accepts a correctly signed body and rejects a tampered one", async () => {
  const secret = "whsec-test";
  const body = JSON.stringify({ id: "tx-1", amount: 2000 });
  const signature = hmacHex(secret, body);
  const ok = await verifyWebhookRequest({
    rawBody: body,
    headers: new Headers({ "x-sepay-signature": signature }),
    secret,
    mode: "HMAC_BODY",
  });
  assert.equal(ok.ok, true);

  const tampered = await verifyWebhookRequest({
    rawBody: body + "x",
    headers: new Headers({ "x-sepay-signature": signature }),
    secret,
    mode: "HMAC_BODY",
  });
  assert.equal(tampered.ok, false);
});

test("HMAC_TIMESTAMP_BODY signs timestamp.body and rejects stale timestamps", async () => {
  const secret = "whsec-test";
  const body = JSON.stringify({ id: "tx-2" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = hmacHex(secret, `${timestamp}.${body}`);
  const ok = await verifyWebhookRequest({
    rawBody: body,
    headers: new Headers({ "x-sepay-signature": signature, "x-sepay-timestamp": String(timestamp) }),
    secret,
    mode: "HMAC_TIMESTAMP_BODY",
  });
  assert.equal(ok.ok, true);

  const staleTimestamp = timestamp - 600;
  const staleSignature = hmacHex(secret, `${staleTimestamp}.${body}`);
  const stale = await verifyWebhookRequest({
    rawBody: body,
    headers: new Headers({ "x-sepay-signature": staleSignature, "x-sepay-timestamp": String(staleTimestamp) }),
    secret,
    mode: "HMAC_TIMESTAMP_BODY",
  });
  assert.equal(stale.ok, false);
});

test("API_KEY compares the Authorization header against the configured secret", async () => {
  const ok = await verifyWebhookRequest({
    rawBody: "{}",
    headers: new Headers({ authorization: "Apikey secret-token" }),
    secret: "secret-token",
    mode: "API_KEY",
  });
  assert.equal(ok.ok, true);

  const wrong = await verifyWebhookRequest({
    rawBody: "{}",
    headers: new Headers({ authorization: "Apikey wrong-token" }),
    secret: "secret-token",
    mode: "API_KEY",
  });
  assert.equal(wrong.ok, false);
});

test("DISABLED only passes when the demo flag is on, never silently in production", async () => {
  const productionAttempt = await verifyWebhookRequest({
    rawBody: "{}",
    headers: new Headers(),
    mode: "DISABLED",
    allowDemoLogin: false,
  });
  assert.equal(productionAttempt.ok, false);

  const demoAttempt = await verifyWebhookRequest({
    rawBody: "{}",
    headers: new Headers(),
    mode: "DISABLED",
    allowDemoLogin: true,
  });
  assert.equal(demoAttempt.ok, true);
});
