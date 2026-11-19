import { verifySepaySignature } from "./sepay-engine";

export type SepayWebhookAuthMode = "HMAC_BODY" | "HMAC_TIMESTAMP_BODY" | "API_KEY" | "DISABLED";

export interface VerifyWebhookRequestInput {
  rawBody: string;
  headers: Headers;
  secret?: string;
  mode: SepayWebhookAuthMode;
  /** DISABLED chỉ hợp lệ khi cờ demo bật, để tránh tắt xác thực trên production. */
  allowDemoLogin?: boolean;
  /** Độ lệch thời gian tối đa cho HMAC_TIMESTAMP_BODY, tính bằng giây. */
  maxTimestampSkewSeconds?: number;
}

export type VerifyWebhookResult = { ok: true } | { ok: false; reason: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Xác thực webhook SePay. Không còn nhánh nào bỏ qua chữ ký khi bí mật rỗng —
 * DISABLED là lựa chọn tường minh, chỉ hợp lệ khi cờ demo bật.
 */
export async function verifyWebhookRequest(input: VerifyWebhookRequestInput): Promise<VerifyWebhookResult> {
  const { rawBody, headers, secret, mode } = input;

  if (mode === "DISABLED") {
    return input.allowDemoLogin ? { ok: true } : { ok: false, reason: "DISABLED_NOT_ALLOWED_IN_PRODUCTION" };
  }

  if (mode === "API_KEY") {
    if (!secret) return { ok: false, reason: "MISSING_SECRET" };
    const provided = (headers.get("authorization") || "").replace(/^Apikey\s+/i, "").trim();
    if (!provided || !timingSafeEqual(provided, secret)) return { ok: false, reason: "INVALID_API_KEY" };
    return { ok: true };
  }

  if (mode === "HMAC_TIMESTAMP_BODY") {
    if (!secret) return { ok: false, reason: "MISSING_SECRET" };
    const timestampHeader = headers.get("x-sepay-timestamp") || headers.get("x-timestamp");
    const signature = headers.get("x-sepay-signature") || headers.get("x-signature");
    if (!timestampHeader || !signature) return { ok: false, reason: "MISSING_SIGNATURE" };
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) return { ok: false, reason: "INVALID_TIMESTAMP" };
    const skewSeconds = Math.abs(Date.now() / 1000 - timestamp);
    if (skewSeconds > (input.maxTimestampSkewSeconds ?? 300)) return { ok: false, reason: "TIMESTAMP_OUT_OF_RANGE" };
    const valid = await verifySepaySignature(`${timestampHeader}.${rawBody}`, signature, secret);
    return valid ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
  }

  // HMAC_BODY (mặc định) — giữ nguyên công thức hiện có, không phá tương thích.
  if (!secret) return { ok: false, reason: "MISSING_SECRET" };
  const signature = headers.get("x-sepay-signature") || headers.get("x-signature");
  const valid = await verifySepaySignature(rawBody, signature, secret);
  return valid ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
}
