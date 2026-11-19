/**
 * Client gọi API MISA meInvoice (luồng "Phát hành hóa đơn lên cloud", ký HSM — SignType 2)
 * theo tài liệu developer.misa.vn/products-openapi/MEINVOICE:
 *   - POST {baseUrl}/invoice/token        — header ClientID/ClientSecret, body taxcode/username/password
 *   - GET  {baseUrl}/invoice/templates    — danh sách ký hiệu/mẫu hóa đơn của doanh nghiệp
 *   - POST {baseUrl}/invoice/unpublishview — xem trước hóa đơn chưa phát hành (link sống 5 phút)
 *   - POST {baseUrl}/invoice/publishing   — phát hành, body { SignType, InvoiceData: [...] }
 *   - POST {baseUrl}/invoice/status       — tra trạng thái theo TransactionID hoặc RefID
 *   - POST {baseUrl}/invoice/Download     — tải PDF/XML (base64) theo TransactionID
 * Mọi API nghiệp vụ gửi header Authorization: Bearer <token> + ClientID.
 *
 * Tài liệu MISA viết tên field lúc PascalCase (`Success`, `Data`) lúc camelCase (`success`,
 * `publishInvoiceResult`), và `Data` có khi là chuỗi JSON thay vì mảng — nên mọi chỗ đọc phản
 * hồi đều đi qua `field()` không phân biệt hoa thường và `parseMaybeJson()`.
 */
import type { MisaInvoiceFields } from "./misa-invoice-fields";
import { buildMisaInvoiceData, type MisaInvoiceBuyer } from "./misa-invoice-payload";

const REQUEST_TIMEOUT_MS = 20_000;
/** MISA cấp token hạn 14 ngày; cache ngắn hơn nhiều cho an toàn, 401 thì xoá cache ngay. */
const TOKEN_CACHE_MS = 12 * 60 * 60 * 1000;
const SIGN_TYPE_HSM = 2;
/** Mã lỗi MISA khuyến nghị gửi lại (tài liệu "Lưu ý khi bắt đầu" + bảng mã lỗi phát hành). */
const RETRYABLE_PUBLISH_ERRORS = new Set(["InvoiceNumberNotCotinuous", "SystemError"]);

export interface MisaClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  taxCode: string;
  username: string;
  password: string;
  invSeries: string;
  invTemplateNo: string;
  taxRateLabel: string;
  /** Thông số hóa đơn admin chỉnh ở UI; thiếu thì payload dùng mặc định. */
  invoiceFields?: Pick<MisaInvoiceFields, "paymentMethodName">;
}

export interface MisaInvoiceInput {
  refId: string;
  buyer: MisaInvoiceBuyer;
  itemName: string;
  unitName?: string;
  amount: number;
}

type MisaFailure = { ok: false; retryable: boolean; code: string; message: string };

export type MisaPublishResult =
  | { ok: true; providerInvoiceId: string; invoiceNumber: string; invoiceSeries: string; lookupCode: string; taxAuthorityCode?: string; invoiceDate?: string }
  | MisaFailure;

export interface MisaTemplate {
  invSeries: string;
  templateName: string;
  inactive: boolean;
  invoiceWithCode: boolean;
}

export interface MisaInvoiceStatus {
  transactionId: string;
  publishStatus?: number;
  sendTaxStatus?: number;
  invoiceCode?: string;
  invoiceNumber?: string;
  isDeleted?: boolean;
  raw: Record<string, unknown>;
}

/** Cache token theo bộ thông tin đăng nhập — đổi sandbox ↔ production không dùng nhầm token cũ. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Chỉ dùng trong test, để mỗi test case không dính token cache của test trước. */
export function resetMisaTokenCacheForTests(): void {
  tokenCache.clear();
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

/** Không dựa vào `instanceof Error` — DOMException do AbortController ném ra không phải lúc nào cũng kế thừa Error. */
function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function networkFailure(error: unknown): MisaFailure {
  return {
    ok: false, retryable: true, code: isAbortError(error) ? "TIMEOUT" : "NETWORK_ERROR",
    message: isAbortError(error) ? "MISA không phản hồi trong 20 giây." : error instanceof Error ? error.message : "Lỗi mạng khi gọi MISA.",
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Đọc field không phân biệt hoa thường (`Success`/`success`, `Data`/`data`...). */
function field(source: unknown, name: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function text(source: unknown, name: string): string {
  const value = field(source, name);
  return value === undefined || value === null ? "" : String(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  return parsed && typeof parsed === "object" ? [parsed as Record<string, unknown>] : [];
}

/** Thông điệp lỗi dễ hiểu nhất MISA trả về: DescriptionErrorCode > Errors > ErrorCode > HTTP status. */
function misaErrorMessage(body: unknown, status: number, fallback: string): string {
  const errors = field(body, "Errors");
  const errorsText = Array.isArray(errors)
    ? errors.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("; ")
    : typeof errors === "string" ? errors : "";
  return text(body, "DescriptionErrorCode") || errorsText || (text(body, "ErrorCode") ? `${fallback} (mã lỗi ${text(body, "ErrorCode")})` : `${fallback} (HTTP ${status})`);
}

/** Ký tự thứ 2 của ký hiệu: C = hóa đơn có mã CQT, K = không mã. */
function seriesWithCode(invSeries: string): boolean {
  return invSeries.trim().charAt(1).toUpperCase() !== "K";
}

/** Ký tự thứ 5 của ký hiệu: M = hóa đơn khởi tạo từ máy tính tiền. */
function seriesIsCashRegister(invSeries: string): boolean {
  return invSeries.trim().charAt(4).toUpperCase() === "M";
}

export function createMisaClient(config: MisaClientConfig) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const cacheKey = [baseUrl, config.clientId, config.taxCode, config.username].join("|");
  const statusQuery = () => `invoiceWithCode=${seriesWithCode(config.invSeries)}&invoiceCalcu=${seriesIsCashRegister(config.invSeries)}`;

  async function getToken(): Promise<{ ok: true; token: string } | MisaFailure> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return { ok: true, token: cached.token };
    try {
      const response = await fetchWithTimeout(`${baseUrl}/invoice/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ClientID: config.clientId, ClientSecret: config.clientSecret },
        body: JSON.stringify({ taxcode: config.taxCode, username: config.username, password: config.password }),
      });
      const body = await response.json().catch(() => null) as unknown;
      const token = text(body, "Data");
      if (!response.ok || field(body, "Success") !== true || !token) {
        return {
          ok: false, retryable: isRetryableStatus(response.status), code: text(body, "ErrorCode") || String(response.status),
          message: misaErrorMessage(body, response.status, "Không lấy được token MISA. Kiểm tra lại Base URL và thông tin đăng nhập MISA"),
        };
      }
      tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_CACHE_MS });
      return { ok: true, token };
    } catch (error) {
      return networkFailure(error);
    }
  }

  /** Gọi một API nghiệp vụ; trả nguyên thân phản hồi (đã kiểm Success) để từng hàm tự đọc field riêng. */
  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; body: unknown } | MisaFailure> {
    const tokenResult = await getToken();
    if (!tokenResult.ok) return tokenResult;
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenResult.token}`,
          ClientID: config.clientId,
          ClientSecret: config.clientSecret,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const parsed = await response.json().catch(() => null) as unknown;
      if (response.status === 401) {
        tokenCache.delete(cacheKey); // token có thể đã hết hạn dù chưa tới lúc cache dự kiến
        return { ok: false, retryable: true, code: "UNAUTHORIZED", message: "MISA từ chối token, lần thử sau sẽ lấy token mới." };
      }
      if (!response.ok || field(parsed, "Success") !== true) {
        return {
          ok: false, retryable: isRetryableStatus(response.status) || RETRYABLE_PUBLISH_ERRORS.has(text(parsed, "ErrorCode")),
          code: text(parsed, "ErrorCode") || String(response.status),
          message: misaErrorMessage(parsed, response.status, "MISA từ chối yêu cầu"),
        };
      }
      return { ok: true, body: parsed };
    } catch (error) {
      return networkFailure(error);
    }
  }

  function buildData(input: MisaInvoiceInput) {
    return buildMisaInvoiceData({
      refId: input.refId,
      invSeries: config.invSeries,
      invTemplateNo: config.invTemplateNo,
      taxRateLabel: config.taxRateLabel,
      buyer: input.buyer,
      itemName: input.itemName,
      unitName: input.unitName,
      amount: input.amount,
      paymentMethodName: config.invoiceFields?.paymentMethodName,
    });
  }

  async function getTemplates(year = new Date().getFullYear()): Promise<{ ok: true; templates: MisaTemplate[] } | MisaFailure> {
    const templates: MisaTemplate[] = [];
    // Gọi cả hai loại (có mã / không mã) để admin thấy đủ ký hiệu trước khi chọn.
    for (const withCode of [true, false]) {
      const result = await call("GET", `/invoice/templates?invoiceWithCode=${withCode}&ticket=false&year=${year}`);
      if (!result.ok) return result;
      for (const row of rowsOf(field(result.body, "Data"))) {
        const invSeries = text(row, "InvSeries");
        if (!invSeries || templates.some((item) => item.invSeries === invSeries)) continue;
        templates.push({ invSeries, templateName: text(row, "TemplateName"), inactive: field(row, "Inactive") === true, invoiceWithCode: withCode });
      }
    }
    return { ok: true, templates };
  }

  async function previewInvoice(input: MisaInvoiceInput): Promise<{ ok: true; link: string } | MisaFailure> {
    const built = buildData(input);
    if (!built.ok) return { ok: false, retryable: false, code: built.code, message: built.message };
    const result = await call("POST", "/invoice/unpublishview", built.data);
    if (!result.ok) return result;
    const link = text(result.body, "Data");
    return link ? { ok: true, link } : { ok: false, retryable: false, code: "PREVIEW_EMPTY", message: "MISA không trả link xem trước." };
  }

  async function getInvoiceStatus(ids: string[], inputType: 1 | 2 = 1): Promise<{ ok: true; statuses: MisaInvoiceStatus[] } | MisaFailure> {
    const result = await call("POST", `/invoice/status?inputType=${inputType}&${statusQuery()}`, ids);
    if (!result.ok) return result;
    const statuses = rowsOf(field(result.body, "Data")).map((row): MisaInvoiceStatus => ({
      transactionId: text(row, "TransactionID"),
      publishStatus: typeof field(row, "PublishStatus") === "number" ? field(row, "PublishStatus") as number : undefined,
      sendTaxStatus: typeof field(row, "SendTaxStatus") === "number" ? field(row, "SendTaxStatus") as number : undefined,
      invoiceCode: text(row, "InvoiceCode") || undefined,
      invoiceNumber: text(row, "InvNo") || undefined,
      isDeleted: field(row, "IsDelete") === true,
      raw: row,
    }));
    return { ok: true, statuses };
  }

  async function publishInvoice(input: MisaInvoiceInput): Promise<MisaPublishResult> {
    const built = buildData(input);
    if (!built.ok) return { ok: false, retryable: false, code: built.code, message: built.message };
    const result = await call("POST", "/invoice/publishing", { SignType: SIGN_TYPE_HSM, InvoiceData: [built.data], PublishInvoiceData: null });
    if (!result.ok) return result;
    const row = rowsOf(field(result.body, "publishInvoiceResult"))[0];
    const rowError = text(row, "ErrorCode");
    if (row && !rowError && text(row, "TransactionID")) {
      return {
        ok: true,
        providerInvoiceId: text(row, "TransactionID"),
        invoiceNumber: text(row, "InvNo"),
        invoiceSeries: text(row, "InvSeries") || config.invSeries,
        lookupCode: text(row, "TransactionID"),
        taxAuthorityCode: text(row, "InvCode") || undefined,
        invoiceDate: text(row, "InvDate") || undefined,
      };
    }
    if (rowError === "InvoiceDuplicated") {
      // Trùng RefID thường là lần gửi trước đã phát hành xong nhưng mất phản hồi (timeout) —
      // tra theo RefID để nhận lại hóa đơn đó thay vì báo lỗi hoặc phát hành trùng.
      const existing = await getInvoiceStatus([input.refId], 2);
      const found = existing.ok ? existing.statuses.find((item) => item.transactionId) : undefined;
      if (found) {
        return {
          ok: true, providerInvoiceId: found.transactionId, invoiceNumber: found.invoiceNumber || "", invoiceSeries: config.invSeries,
          lookupCode: found.transactionId, taxAuthorityCode: found.invoiceCode,
        };
      }
    }
    const code = rowError || "PUBLISH_EMPTY_RESPONSE";
    return {
      ok: false, retryable: RETRYABLE_PUBLISH_ERRORS.has(code) || code === "InvoiceDuplicated", code,
      message: text(row, "ErrorDescription") || text(row, "DescriptionErrorCode") || misaErrorMessage(result.body, 200, "MISA không phát hành được hóa đơn"),
    };
  }

  /** Tải file hóa đơn đã phát hành; PDF trả về dạng base64 theo tài liệu /invoice/Download. */
  async function downloadInvoice(transactionId: string, type: "Pdf" | "Xml" = "Pdf"): Promise<{ ok: true; base64: string } | MisaFailure> {
    const result = await call("POST", `/invoice/Download?downloadDataType=${type}&${statusQuery()}`, [transactionId]);
    if (!result.ok) return result;
    const row = rowsOf(field(result.body, "Data")).find((item) => text(item, "TransactionID") === transactionId) ?? rowsOf(field(result.body, "Data"))[0];
    const base64 = text(row, "Data") || text(row, "FileData");
    if (!base64) {
      return { ok: false, retryable: false, code: text(row, "ErrorCode") || "DOWNLOAD_EMPTY", message: "MISA không trả dữ liệu file hóa đơn (hóa đơn có thể chưa phát hành xong)." };
    }
    return { ok: true, base64 };
  }

  async function ping(): Promise<{ ok: boolean; message: string }> {
    const result = await getToken();
    return result.ok ? { ok: true, message: "Kết nối MISA thành công." } : { ok: false, message: result.message };
  }

  return { getToken, getTemplates, previewInvoice, publishInvoice, getInvoiceStatus, downloadInvoice, ping };
}
