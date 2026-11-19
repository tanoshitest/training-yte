import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { createMisaClient, resetMisaTokenCacheForTests, type MisaClientConfig, type MisaInvoiceInput } from "../cloudflare/misa-invoice-client";
import { buildMisaInvoiceData, parseMisaVatRate } from "../cloudflare/misa-invoice-payload";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetMisaTokenCacheForTests();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function config(overrides: Partial<MisaClientConfig> = {}): MisaClientConfig {
  return {
    baseUrl: "https://developer.misa.vn/apis/itg/meinvoice",
    clientId: "app-id-1",
    clientSecret: "top-secret-value",
    taxCode: "0312345678",
    username: "steps-api",
    password: "super-secret-password",
    invSeries: "1C26TYY",
    invTemplateNo: "",
    taxRateLabel: "KCT",
    ...overrides,
  };
}

function input(overrides: Partial<MisaInvoiceInput> = {}): MisaInvoiceInput {
  return { refId: "inv-1", buyer: { fullName: "Nguyễn Văn A" }, itemName: "Học phí Tháng 09/2026", amount: 2_000_000, ...overrides };
}

const tokenOk = () => jsonResponse(200, { Success: true, Data: "jwt-token-abc" });

test("thuế suất: chấp nhận đúng danh sách MISA, từ chối nhãn lạ", () => {
  assert.deepEqual(parseMisaVatRate("kct"), { name: "KCT", percent: 0 });
  assert.deepEqual(parseMisaVatRate("10"), { name: "10%", percent: 10 });
  assert.deepEqual(parseMisaVatRate("8%"), { name: "8%", percent: 8 });
  assert.deepEqual(parseMisaVatRate("KHAC:3.5%"), { name: "KHAC:3.5%", percent: 3.5 });
  assert.equal(parseMisaVatRate("7%"), null);
  assert.equal(parseMisaVatRate(""), null);
});

test("InvoiceData: tách ngược tiền trước thuế + thuế, tổng luôn khớp số tiền đã thu", () => {
  const built = buildMisaInvoiceData({
    refId: "inv-1", invSeries: "1C26TYY", taxRateLabel: "10%", buyer: { fullName: "Nguyễn Văn A" },
    itemName: "Học phí", amount: 1_000_000, invoiceDate: new Date("2026-09-26T20:00:00.000Z"),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const data = built.data as Record<string, any>;
  assert.equal(data.InvDate, "2026-09-27", "ngày hóa đơn theo giờ Việt Nam");
  assert.equal(data.InvTemplateNo, "1", "không cấu hình mẫu số thì lấy ký tự đầu của ký hiệu");
  assert.equal(data.TotalAmountWithoutVATOC, 909_091);
  assert.equal(data.TotalVATAmountOC, 90_909);
  assert.equal(data.TotalAmountOC, 1_000_000);
  assert.equal(data.OriginalInvoiceDetail[0].VATRateName, "10%");
  assert.equal(data.OriginalInvoiceDetail[0].AmountWithoutVATOC + data.OriginalInvoiceDetail[0].VATAmountOC, 1_000_000);
  assert.deepEqual(data.TaxRateInfo, [{ VATRateName: "10%", AmountWithoutVATOC: 909_091, VATAmountOC: 90_909 }]);
});

test("InvoiceData: KCT không có thuế; có MST mà thiếu địa chỉ thì từ chối trước khi gọi MISA", () => {
  const kct = buildMisaInvoiceData({ refId: "r", invSeries: "1C26TYY", taxRateLabel: "KCT", buyer: { fullName: "A" }, itemName: "Học phí", amount: 500_000 });
  assert.equal(kct.ok, true);
  if (kct.ok) assert.equal((kct.data as Record<string, unknown>).TotalVATAmountOC, 0);
  const missingAddress = buildMisaInvoiceData({ refId: "r", invSeries: "1C26TYY", taxRateLabel: "KCT", buyer: { fullName: "Cty A", taxCode: "0101234567" }, itemName: "x", amount: 1 });
  assert.equal(missingAddress.ok, false);
  const badTax = buildMisaInvoiceData({ refId: "r", invSeries: "1C26TYY", taxRateLabel: "", buyer: { fullName: "A" }, itemName: "x", amount: 1 });
  assert.equal(badTax.ok, false);
});

test("publishInvoice gọi đúng /invoice/publishing, SignType 2, header ClientID + Bearer, đọc publishInvoiceResult dạng chuỗi JSON", async () => {
  let publishUrl = "";
  let publishHeaders: Record<string, string> = {};
  let publishBody: Record<string, any> = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    publishUrl = String(url);
    publishHeaders = init.headers as Record<string, string>;
    publishBody = JSON.parse(String(init.body));
    return jsonResponse(200, {
      success: true, errorCode: null,
      publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "44C_T5_4MR9P", InvTemplateNo: "1", InvSeries: "1C26TYY", InvNo: "00000123", InvCode: "M1-26-ABC", ErrorCode: null }]),
    });
  }) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.equal(publishUrl, "https://developer.misa.vn/apis/itg/meinvoice/invoice/publishing");
  assert.equal(publishHeaders.Authorization, "Bearer jwt-token-abc");
  assert.equal(publishHeaders.ClientID, "app-id-1");
  assert.equal(publishBody.SignType, 2);
  assert.equal(publishBody.InvoiceData.length, 1);
  assert.equal(publishBody.InvoiceData[0].RefID, "inv-1");
  assert.equal(publishBody.InvoiceData[0].BuyerFullName, "Nguyễn Văn A");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.invoiceNumber, "00000123");
  assert.equal(result.lookupCode, "44C_T5_4MR9P");
  assert.equal(result.providerInvoiceId, "44C_T5_4MR9P");
  assert.equal(result.taxAuthorityCode, "M1-26-ABC");
});

test("dòng kết quả có ErrorCode (TemplateNotExist) thì báo lỗi không retry", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    return jsonResponse(200, { success: true, publishInvoiceResult: [{ RefID: "inv-1", ErrorCode: "TemplateNotExist" }] });
  }) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "TemplateNotExist");
  assert.equal(result.retryable, false);
});

test("InvoiceNumberNotCotinuous ở cấp request thì retryable", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    return jsonResponse(200, { success: false, errorCode: "InvoiceNumberNotCotinuous", descriptionErrorCode: "Số hóa đơn không liên tục" });
  }) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.equal(result.message, "Số hóa đơn không liên tục");
});

test("trùng RefID (lần trước đã phát hành nhưng mất phản hồi) thì tra /invoice/status theo RefID và nhận lại hóa đơn", async () => {
  let statusUrl = "";
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    if (String(url).includes("/invoice/status")) {
      statusUrl = String(url);
      return jsonResponse(200, { Success: true, Data: JSON.stringify([{ TransactionID: "TX-OLD", InvNo: "00000099", InvoiceCode: "M1-XYZ", PublishStatus: 1 }]) });
    }
    return jsonResponse(200, { success: true, publishInvoiceResult: [{ RefID: "inv-1", ErrorCode: "InvoiceDuplicated" }] });
  }) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.ok(statusUrl.includes("inputType=2"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lookupCode, "TX-OLD");
  assert.equal(result.invoiceNumber, "00000099");
});

test("dữ liệu sai (thuế suất lạ) bị chặn ngay, không gọi mạng", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return tokenOk(); }) as typeof fetch;
  const result = await createMisaClient(config({ taxRateLabel: "7%" })).publishInvoice(input());
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("getTemplates gộp mẫu có mã và không mã, không trùng ký hiệu", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    seen.push(`${init.method} ${url}`);
    const withCode = String(url).includes("invoiceWithCode=true");
    return jsonResponse(200, { Success: true, Data: withCode
      ? [{ InvSeries: "1C26TYY", TemplateName: "Hóa đơn GTGT", Inactive: false }]
      : JSON.stringify([{ InvSeries: "1K26TYY", TemplateName: "HĐ không mã", Inactive: false }, { InvSeries: "1C26TYY" }]) });
  }) as typeof fetch;
  const result = await createMisaClient(config()).getTemplates(2026);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.templates.map((row) => [row.invSeries, row.invoiceWithCode]), [["1C26TYY", true], ["1K26TYY", false]]);
  assert.ok(seen.every((line) => line.startsWith("GET ") && line.includes("/invoice/templates?") && line.includes("year=2026")));
});

test("downloadInvoice trả base64 PDF theo TransactionID", async () => {
  let body = "";
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/invoice/token")) return tokenOk();
    body = String(init.body);
    assert.ok(String(url).includes("/invoice/Download?downloadDataType=Pdf"));
    return jsonResponse(200, { Success: true, Data: [{ TransactionID: "TX-1", Data: "JVBERi0=" }] });
  }) as typeof fetch;
  const result = await createMisaClient(config()).downloadInvoice("TX-1");
  assert.deepEqual(JSON.parse(body), ["TX-1"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.base64, "JVBERi0=");
});

test("token trả 401 (sai credential) thì không retryable", async () => {
  globalThis.fetch = (async () => jsonResponse(401, { Success: false, ErrorCode: "INVALID_CREDENTIAL" })) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, false);
});

test("token trả 500 thì retryable", async () => {
  globalThis.fetch = (async () => jsonResponse(500, { Success: false })) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
});

test("publish trả 401 sau khi đã có token thì xoá cache token và retryable", async () => {
  let tokenCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) { tokenCalls += 1; return jsonResponse(200, { Success: true, Data: `jwt-${tokenCalls}` }); }
    return jsonResponse(401, { Success: false });
  }) as typeof fetch;
  const client = createMisaClient(config());
  const result = await client.publishInvoice(input());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.equal(result.code, "UNAUTHORIZED");
  await client.getToken();
  assert.equal(tokenCalls, 2, "sau 401 phải xin token mới");
});

test("token cache theo bộ thông tin đăng nhập — đổi Base URL (sandbox → production) thì xin token mới", async () => {
  let tokenCalls = 0;
  globalThis.fetch = (async () => { tokenCalls += 1; return tokenOk(); }) as typeof fetch;
  await createMisaClient(config()).getToken();
  await createMisaClient(config()).getToken();
  await createMisaClient(config({ baseUrl: "https://other.example" })).getToken();
  assert.equal(tokenCalls, 2);
});

test("khi fetch báo AbortError thì phân loại đúng mã TIMEOUT, không lẫn với lỗi mạng thường", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("The operation was aborted.", "AbortError");
  }) as typeof fetch;
  const result = await createMisaClient(config()).getToken();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "TIMEOUT");
  assert.equal(result.retryable, true);
});

test("JSON phản hồi hỏng không throw, trả kết quả lỗi", async () => {
  globalThis.fetch = (async () => new Response("not json at all", { status: 200 })) as typeof fetch;
  const result = await createMisaClient(config()).getToken();
  assert.equal(result.ok, false);
});

test("ping() gọi được token và không throw khi lỗi mạng", async () => {
  globalThis.fetch = (async () => { throw new TypeError("network down"); }) as typeof fetch;
  const result = await createMisaClient(config()).ping();
  assert.equal(result.ok, false);
  assert.ok(result.message);
});

test("getToken gọi đúng /invoice/token với ClientID/ClientSecret ở header, không có appid trong body", async () => {
  let seenUrl = "";
  let seenHeaders: Record<string, string> = {};
  let seenBody = "";
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seenUrl = String(url);
    seenHeaders = init.headers as Record<string, string>;
    seenBody = String(init.body);
    return tokenOk();
  }) as typeof fetch;
  const result = await createMisaClient(config()).getToken();
  assert.equal(result.ok, true);
  assert.ok(seenUrl.endsWith("/invoice/token"));
  assert.equal(seenHeaders.ClientID, "app-id-1");
  assert.equal(seenHeaders.ClientSecret, "top-secret-value");
  assert.equal(JSON.parse(seenBody).appid, undefined);
  assert.equal(JSON.parse(seenBody).taxcode, "0312345678");
});

test("lỗi UserNotExist hiện đúng DescriptionErrorCode thay vì thông báo chung chung", async () => {
  globalThis.fetch = (async () => jsonResponse(400, {
    Success: false, ErrorCode: "UnAuthorize", DescriptionErrorCode: "User chưa được phân quyền", Errors: ["UserNotExist"],
  })) as typeof fetch;
  const result = await createMisaClient(config()).getToken();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.message, "User chưa được phân quyền");
});

test("bí mật (ClientSecret/mật khẩu) không lọt vào kết quả lỗi trả về", async () => {
  globalThis.fetch = (async () => jsonResponse(401, { Success: false, ErrorCode: "INVALID_CREDENTIAL", Errors: "unauthorized" })) as typeof fetch;
  const result = await createMisaClient(config()).publishInvoice(input());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("top-secret-value"), false);
  assert.equal(serialized.includes("super-secret-password"), false);
});
