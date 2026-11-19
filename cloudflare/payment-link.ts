import type { SepayLedger, SepayReceivable } from "./sepay-engine";

export function generatePublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function paymentLinkPath(receivable: Pick<SepayReceivable, "id" | "publicToken">): string {
  return `/thanh-toan/${receivable.id}/${receivable.publicToken}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** So sánh token hằng thời gian; không tiết lộ khoản phải thu có tồn tại hay không khi sai. */
export function findReceivableByToken(ledger: SepayLedger, receivableId: string, token: string): SepayReceivable | undefined {
  const receivable = ledger.receivables.find((row) => row.id === receivableId);
  if (!receivable || !receivable.publicToken || !token) return undefined;
  return timingSafeEqual(receivable.publicToken, token) ? receivable : undefined;
}

/**
 * Đếm request theo IP trong bộ nhớ tiến trình — đủ để chặn dò receivableId ở mức này.
 * `vps-server.ts` chạy một tiến trình duy nhất nên biến module cấp tiến trình dùng
 * được, nhưng nó reset mỗi lần deploy và không chia sẻ giữa nhiều instance.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestCounters = new Map<string, { count: number; windowStart: number }>();

export function isPublicPaymentRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const entry = requestCounters.get(clientKey);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounters.set(clientKey, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}
