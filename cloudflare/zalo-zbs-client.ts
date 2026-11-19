/**
 * Client gửi Zalo ZBS Template Message qua số điện thoại (SĐT), dùng cho tin "yêu cầu
 * thanh toán" và "thông báo hóa đơn" gửi tới `parentPhone1` (D3).
 *
 * ĐÃ KIỂM CHỨNG bằng tài khoản OA/ZBS thật ngày 2026-09-28 (Phase 7 Bước 1 của plan):
 * `getAccessToken` (OAuth refresh) và `sendTemplate` đều gọi mạng thật thành công tới
 * production Zalo API và nhận `data.msg_id` hợp lệ (mẫu ZBS `641791`, tin "Yêu cầu thanh
 * toán"). Field/endpoint dưới đây dựng từ:
 *   - Tài liệu chính thức "ZBS Template Message API" (PDF ngày 2025-12 lấy từ
 *     stc-cms-developers.zdn.vn) — xác nhận API gửi qua SĐT "kế thừa từ bộ API gửi ZNS"
 *     hiện tại, response mẫu dùng field `error` (0 = thành công), `message`, và
 *     `data.message_id` / `data.sent_time` (ví dụ đó là của luồng gửi qua UID, cấu trúc
 *     tương tự áp cho luồng SĐT).
 *   - Endpoint gửi qua SĐT `POST https://business.openapi.zalo.me/message/template` và
 *     header `access_token: <token>` — đã xác nhận đúng bằng request thật.
 *   - OAuth refresh: `POST https://oauth.zaloapp.com/v4/oa/access_token`,
 *     `Content-Type: application/x-www-form-urlencoded`, body `app_id` + `grant_type` +
 *     `refresh_token`. Nguồn không thống nhất `secret_key` truyền ở header hay ở body —
 *     dưới đây gửi cả hai để an toàn, xác nhận lại khi có app thật rồi bỏ đường thừa.
 *     Response trả `refresh_token` MỚI mỗi lần gọi (xoay vòng) — không lưu lại là tích
 *     hợp chết sau vài giờ.
 *   - `expires_in` của access token: nguồn ghi nhận không thống nhất (1 giờ hoặc ~25
 *     giờ) — cache theo đúng giá trị API trả về, trừ hao 5 phút, không hardcode.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

const OAUTH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const SEND_TEMPLATE_URL = "https://business.openapi.zalo.me/message/template";

export interface ZaloClientConfig {
  appId: string;
  appSecret: string;
  refreshToken: string;
  /** Gọi ngay sau khi nhận refresh token mới, để ghi vào khối cấu hình tích hợp (Bước 3). */
  onTokenRotated?: (nextRefreshToken: string) => Promise<void>;
}

export interface ZaloSendInput {
  /** Đã chuẩn hoá qua `toZaloPhone`, dạng "84xxxxxxxxx". */
  phone: string;
  templateId: string;
  templateData: Record<string, string>;
}

export type ZaloTokenResult = { ok: true; token: string } | { ok: false; retryable: boolean; code: string; message: string };
export type ZaloSendResult =
  | { ok: true; msgId: string; sentTime: string }
  | { ok: false; retryable: boolean; code: string; message: string };

interface ZaloClient {
  getAccessToken(): Promise<ZaloTokenResult>;
  sendTemplate(input: ZaloSendInput): Promise<ZaloSendResult>;
  ping(): Promise<{ ok: boolean; message: string }>;
}

/** Cache token cấp module — như MISA, reset mỗi lần deploy, không chia sẻ giữa instance. */
let cachedToken: { token: string; expiresAt: number } | null = null;

export function resetZaloTokenCacheForTests(): void {
  cachedToken = null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function networkErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Lỗi mạng khi gọi Zalo.";
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function createZaloClient(config: ZaloClientConfig): ZaloClient {
  async function getAccessToken(): Promise<ZaloTokenResult> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return { ok: true, token: cachedToken.token };
    try {
      const response = await fetchWithTimeout(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: config.appSecret },
        body: new URLSearchParams({
          app_id: config.appId,
          grant_type: "refresh_token",
          refresh_token: config.refreshToken,
          secret_key: config.appSecret,
        }).toString(),
      });
      const body = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number; error_name?: string; error_description?: string } | null;
      if (!response.ok || !body?.access_token) {
        return {
          ok: false,
          retryable: isRetryableStatus(response.status),
          code: body?.error_name || String(body?.error ?? response.status),
          message: body?.error_description || "Không lấy được access token Zalo.",
        };
      }
      const expiresInSeconds = Number(body.expires_in) || 3600;
      cachedToken = { token: body.access_token, expiresAt: Date.now() + Math.max(0, expiresInSeconds * 1000 - TOKEN_SAFETY_MARGIN_MS) };
      if (body.refresh_token && body.refresh_token !== config.refreshToken) {
        config.refreshToken = body.refresh_token;
        await config.onTokenRotated?.(body.refresh_token);
      }
      return { ok: true, token: body.access_token };
    } catch (error) {
      return { ok: false, retryable: true, code: isAbortError(error) ? "TIMEOUT" : "NETWORK_ERROR", message: networkErrorMessage(error) };
    }
  }

  async function sendTemplate(input: ZaloSendInput): Promise<ZaloSendResult> {
    const tokenResult = await getAccessToken();
    if (!tokenResult.ok) return tokenResult;
    try {
      const response = await fetchWithTimeout(SEND_TEMPLATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: tokenResult.token },
        body: JSON.stringify({ phone: input.phone, template_id: input.templateId, template_data: input.templateData }),
      });
      const body = await response.json().catch(() => null) as { error?: number; message?: string; data?: { msg_id?: string; sent_time?: string } } | null;
      if (response.status === 401) {
        cachedToken = null;
        return { ok: false, retryable: true, code: "UNAUTHORIZED", message: "Zalo từ chối token, thử lại sẽ lấy token mới." };
      }
      if (!response.ok || !body || body.error !== 0 || !body.data?.msg_id) {
        return {
          ok: false,
          retryable: isRetryableStatus(response.status) || body?.error === -124 /* quá tần suất, theo bảng mã lỗi ZNS công khai */,
          code: String(body?.error ?? response.status),
          message: body?.message || "Zalo từ chối gửi tin.",
        };
      }
      return { ok: true, msgId: body.data.msg_id, sentTime: String(body.data.sent_time || "") };
    } catch (error) {
      return { ok: false, retryable: true, code: isAbortError(error) ? "TIMEOUT" : "NETWORK_ERROR", message: networkErrorMessage(error) };
    }
  }

  async function ping(): Promise<{ ok: boolean; message: string }> {
    const result = await getAccessToken();
    return result.ok ? { ok: true, message: "Kết nối Zalo OA thành công." } : { ok: false, message: result.message };
  }

  return { getAccessToken, sendTemplate, ping };
}
