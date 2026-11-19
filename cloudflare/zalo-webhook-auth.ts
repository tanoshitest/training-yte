/**
 * Xác thực webhook callback trạng thái tin Zalo ZBS (`POST /api/webhooks/zalo`).
 *
 * CHƯA KIỂM CHỨNG BẰNG TÀI KHOẢN OA THẬT (Phase 7 Bước 1 của plan — `developers.zalo.me`
 * là SPA, không trích được tài liệu đầy đủ qua công cụ tự động). Công thức dưới đây dựa
 * trên quy ước xác thực webhook OA đã ghi nhận: header `x-zevent-signature` mang
 * `sha256(app_id + rawBody + timestamp + appSecret)`, `timestamp` lấy từ header
 * `x-zevent-timestamp`. Xác nhận lại đúng tên header/field khi có tài khoản OA thật.
 *
 * Áp dụng đúng bài học của Phase 1 (`sepay-webhook-auth.ts`): bí mật rỗng KHÔNG BAO GIỜ
 * được coi là hợp lệ, kể cả khi `zalo.enabled` chưa bật.
 */

export interface VerifyZaloWebhookInput {
  rawBody: string;
  headers: Headers;
  appId: string;
  appSecret: string | undefined;
}

export type VerifyZaloWebhookResult = { ok: true } | { ok: false; reason: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyZaloWebhookRequest(input: VerifyZaloWebhookInput): Promise<VerifyZaloWebhookResult> {
  const { rawBody, headers, appId, appSecret } = input;
  if (!appSecret) return { ok: false, reason: "MISSING_SECRET" };

  const signature = headers.get("x-zevent-signature");
  const timestamp = headers.get("x-zevent-timestamp");
  if (!signature || !timestamp) return { ok: false, reason: "MISSING_SIGNATURE" };

  const expected = await hmacSha256Hex(appSecret, `${appId}${rawBody}${timestamp}`);
  return timingSafeEqual(expected, signature.toLowerCase()) ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
}
