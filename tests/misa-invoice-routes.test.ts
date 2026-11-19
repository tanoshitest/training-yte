import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { defaultIntegrationSettings, type IntegrationSettings } from "../cloudflare/integration-settings";
import { resetMisaTokenCacheForTests } from "../cloudflare/misa-invoice-client";
import { DRAFT_ERROR_PREFIX } from "../cloudflare/misa-invoice-draft";
import { handleMisaInvoiceApi, type MisaRouteHelpers } from "../cloudflare/misa-invoice-routes";
import type { DemoFinance } from "../cloudflare/finance-types";
import type { SepayInvoice } from "../cloudflare/sepay-engine";
import type { FinanceKvEnv } from "../cloudflare/finance-storage";

const AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";
const originalFetch = globalThis.fetch;

beforeEach(() => { resetMisaTokenCacheForTests(); });
afterEach(() => { globalThis.fetch = originalFetch; });

function financeWith(invoices: SepayInvoice[]): DemoFinance {
  return {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [],
      paymentOrders: [],
      bankTransactions: [],
      // Phiếu thu tiền mặt: có payment nội bộ nhưng không có khoản phải thu SePay.
      payments: [{ id: "pay-1", paymentCode: "", studentId: "student-1", bankTransactionId: "", receivableId: "", amount: 1_500_000, allocatedAmount: 1_500_000, excessAmount: 0, status: "COMPLETED", paidAt: "2026-09-20T02:00:00.000Z" }],
      receipts: [{ id: "rcpt-1", receiptNumber: "PT-202609-000001", paymentId: "pay-1", studentId: "student-1", amount: 1_500_000, issuedAt: "2026-09-20T02:00:00.000Z", status: "ISSUED", billingPeriod: "Tháng 09/2026", billingMode: "MONTHLY", studentName: "Hạ An" }],
      invoices, credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  } as DemoFinance;
}

async function testEnv(opts: { invoices?: SepayInvoice[]; misaEnabled?: boolean; issueEnabled?: boolean } = {}) {
  const store = new Map<string, unknown>();
  const settings: IntegrationSettings = {
    ...defaultIntegrationSettings(),
    misa: {
      ...defaultIntegrationSettings().misa,
      enabled: opts.misaEnabled ?? true,
      issueEnabled: opts.issueEnabled ?? true,
      baseUrl: "https://developer.misa.vn/apis/itg/meinvoice",
      clientId: "app-id-1",
      clientSecretEncrypted: await encryptSecret("misa-client-secret", AUTH_SECRET),
      taxCode: "0312345678",
      username: "steps-api",
      passwordEncrypted: await encryptSecret("misa-password", AUTH_SECRET),
      invSeries: "1C26TYY",
      invTemplateNo: "",
      taxRateLabel: "KCT",
    },
  };
  store.set("integrations:steps-demo", settings);
  store.set("finance:steps-demo", financeWith(opts.invoices ?? []));
  store.set("students:steps-demo", [{ id: "student-1", code: "HV0730", fullName: "Hạ An", address: "12 Lê Lợi", loginEmail: "ha.an@example.com" }]);
  const env: FinanceKvEnv = {
    STEPS_LMS_DATA: {
      get: async <T>(key: string) => (store.get(key) as T | undefined) ?? null,
      put: async (key: string, value: string) => { store.set(key, JSON.parse(value)); },
      compareAndPut: async (key: string, expected: string, value: string) => {
        if (JSON.stringify(store.get(key) ?? null) !== expected) return false;
        store.set(key, JSON.parse(value));
        return true;
      },
    },
    AUTH_SECRET,
  };
  return { env, store };
}

const audits: string[] = [];
const helpers: MisaRouteHelpers = {
  json: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  audit: async (summary) => { audits.push(summary); },
};

function post(path: string, body: unknown) {
  const request = new Request(`https://lms.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return { request, url: new URL(request.url) };
}

function misaFetch(onPublish?: (body: Record<string, any>) => void) {
  return (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    if (String(url).endsWith("/invoice/unpublishview")) return new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 });
    onPublish?.(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: [{ RefID: "x", TransactionID: "TX-9", InvNo: "00000009", InvSeries: "1C26TYY", ErrorCode: null }] }), { status: 200 });
  }) as typeof fetch;
}

/** Bước xem trước bắt buộc trước khi xuất: trả response của route preview. */
async function previewReceipt(env: FinanceKvEnv, body: Record<string, unknown>, role: "ADMIN" | "ACCOUNTANT" = "ACCOUNTANT") {
  const { request, url } = post("/api/finance/invoices/preview", { receiptId: "rcpt-1", ...body });
  return handleMisaInvoiceApi(request, url, env, { role }, helpers);
}

test("xuất hóa đơn thủ công cho phiếu thu tiền mặt: tạo hóa đơn, phát hành ngay, trả số hóa đơn", async () => {
  const { env, store } = await testEnv();
  let published: Record<string, any> = {};
  globalThis.fetch = misaFetch((body) => { if (body.InvoiceData) published = body; });
  const buyer = { buyerName: "Phạm Thị Mẹ", buyerEmail: "me@example.com" };
  assert.equal((await previewReceipt(env, buyer))?.status, 200);
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", ...buyer });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ACCOUNTANT" }, helpers);
  assert.ok(response);
  const payload = await response.json() as { ok: boolean; invoice: SepayInvoice; message: string };
  assert.equal(response.status, 200);
  assert.equal(payload.invoice.status, "ISSUED");
  assert.equal(payload.invoice.invoiceNumber, "00000009");
  assert.match(payload.message, /00000009/);
  const data = published.InvoiceData[0];
  // Hồ sơ chưa có địa chỉ + CCCD nên xuất mẫu không thông tin; email vẫn giữ để MISA gửi hóa đơn.
  assert.equal(data.BuyerFullName, "Khách hàng chưa cung cấp thông tin");
  assert.equal(data.BuyerEmail, "me@example.com");
  assert.equal(data.IsSendEmail, true);
  assert.equal(data.TotalAmountOC, 1_500_000);
  assert.equal(data.OriginalInvoiceDetail[0].ItemName, "Học phí Tháng 09/2026 - Hạ An");
  assert.equal(data.OriginalInvoiceDetail[0].UnitName, "Tháng");
  const saved = (store.get("finance:steps-demo") as DemoFinance).sepay!.invoices;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.paymentId, "pay-1");
});

test("xem trước thủ công thành công xoá lỗi của bản nháp tự dựng, nhưng giữ lỗi phát hành lần trước", async () => {
  const base: SepayInvoice = { id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "", provider: "MISA", amount: 1_500_000, buyerName: "Hạ An", status: "PENDING", retryCount: 0, createdAt: "2026-09-20T02:00:00.000Z" };
  const draftFailed = await testEnv({ invoices: [{ ...base, lastError: `${DRAFT_ERROR_PREFIX}InvalidTemplate` }] });
  globalThis.fetch = misaFetch();
  assert.equal((await previewReceipt(draftFailed.env, { buyerName: "Phạm Thị Mẹ" }))?.status, 200);
  const cleared = (draftFailed.store.get("finance:steps-demo") as DemoFinance).sepay!.invoices[0]!;
  assert.equal(cleared.lastError, undefined);
  assert.ok(cleared.previewHash, "xem trước thành công vẫn lưu dấu vân tay");

  const publishFailed = await testEnv({ invoices: [{ ...base, status: "FAILED", lastError: "401: hết hạn token" }] });
  globalThis.fetch = misaFetch();
  assert.equal((await previewReceipt(publishFailed.env, { buyerName: "Phạm Thị Mẹ" }))?.status, 200);
  assert.equal((publishFailed.store.get("finance:steps-demo") as DemoFinance).sepay!.invoices[0]!.lastError, "401: hết hạn token");
});

test("phiếu thu đã có hóa đơn phát hành thì từ chối xuất lần hai", async () => {
  const issued: SepayInvoice = { id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "", provider: "MISA", amount: 1_500_000, buyerName: "A", status: "ISSUED", retryCount: 0, createdAt: "2026-09-20T02:00:00.000Z" };
  const { env } = await testEnv({ invoices: [issued] });
  globalThis.fetch = (async () => { throw new Error("không được gọi MISA"); }) as typeof fetch;
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "A" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ADMIN" }, helpers);
  assert.equal(response?.status, 400);
});

test("hóa đơn lỗi được phát hành lại với thông tin người mua đã sửa, dùng lại cùng mã hóa đơn", async () => {
  const failed: SepayInvoice = { id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "", provider: "MISA", amount: 1_500_000, buyerName: "Sai tên", status: "FAILED", retryCount: 5, lastError: "TemplateNotExist: x", createdAt: "2026-09-20T02:00:00.000Z" };
  const { env, store } = await testEnv({ invoices: [failed] });
  let refId = "";
  globalThis.fetch = misaFetch((body) => { if (body.InvoiceData) refId = body.InvoiceData[0].RefID; });
  assert.equal((await previewReceipt(env, { buyerName: "Đúng tên" }))?.status, 200);
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Đúng tên" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ACCOUNTANT" }, helpers);
  assert.equal(response?.status, 200);
  assert.equal(refId, "inv-1");
  const saved = (store.get("finance:steps-demo") as DemoFinance).sepay!.invoices;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.status, "ISSUED");
  assert.equal(saved[0]!.buyerName, "Đúng tên");
});

test("xem trước trả link MISA, lưu dấu vân tay và không phát hành hóa đơn", async () => {
  const { env, store } = await testEnv();
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(String(url));
    return misaFetch()(url, init);
  }) as typeof fetch;
  const response = await previewReceipt(env, { buyerName: "Phạm Thị Mẹ" });
  const payload = await response?.json() as { ok: boolean; link: string };
  assert.equal(response?.status, 200);
  assert.equal(payload.link, "https://misa.test/preview/abc");
  assert.ok(!calls.some((call) => call.endsWith("/invoice/publishing")), "xem trước không được phát hành");
  const saved = (store.get("finance:steps-demo") as DemoFinance).sepay!.invoices;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.status, "PENDING");
  assert.ok(saved[0]!.previewHash);
  assert.equal(saved[0]!.approvedAt, undefined);
});

test("chưa xem trước thì không xuất được, và không gọi MISA phát hành", async () => {
  const { env, store } = await testEnv();
  globalThis.fetch = (async () => { throw new Error("không được gọi MISA"); }) as typeof fetch;
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Phạm Thị Mẹ" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ACCOUNTANT" }, helpers);
  assert.equal(response?.status, 400);
  assert.equal((store.get("finance:steps-demo") as DemoFinance).sepay!.invoices.length, 0);
});

test("sửa thông tin sau khi xem trước thì phải xem trước lại mới xuất được", async () => {
  const { env, store } = await testEnv();
  globalThis.fetch = misaFetch();
  assert.equal((await previewReceipt(env, { buyerName: "Phạm Thị Mẹ" }))?.status, 200);
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Phạm Thị Mẹ", buyerEmail: "khac@example.com" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ACCOUNTANT" }, helpers);
  assert.equal(response?.status, 400);
  assert.equal((store.get("finance:steps-demo") as DemoFinance).sepay!.invoices[0]!.approvedAt, undefined);
});

test("hóa đơn webhook đang chờ duyệt: xem trước rồi xuất thì phát hành bằng đúng mã hóa đơn đó", async () => {
  const waiting: SepayInvoice = { id: "inv-web", studentId: "student-1", paymentId: "pay-1", receivableId: "", provider: "MISA", amount: 1_500_000, buyerName: "Hạ An", status: "PENDING", retryCount: 0, createdAt: "2026-09-20T02:00:00.000Z" };
  const { env, store } = await testEnv({ invoices: [waiting] });
  let refId = "";
  globalThis.fetch = misaFetch((body) => { if (body.InvoiceData) refId = body.InvoiceData[0].RefID; });
  assert.equal((await previewReceipt(env, { buyerName: "Hạ An" }))?.status, 200);
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Hạ An" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ACCOUNTANT" }, helpers);
  assert.equal(response?.status, 200);
  assert.equal(refId, "inv-web");
  assert.equal((store.get("finance:steps-demo") as DemoFinance).sepay!.invoices[0]!.status, "ISSUED");
});

test("có MST mà thiếu địa chỉ thì báo lỗi ngay, không tạo hóa đơn", async () => {
  const { env, store } = await testEnv();
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Cty A", buyerTaxCode: "0101234567" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ADMIN" }, helpers);
  assert.equal(response?.status, 400);
  assert.equal((store.get("finance:steps-demo") as DemoFinance).sepay!.invoices.length, 0);
});

test("tắt issueEnabled thì chặn API xuất hóa đơn, không tạo hóa đơn PENDING", async () => {
  const { env, store } = await testEnv({ issueEnabled: false });
  globalThis.fetch = (async () => { throw new Error("không được gọi MISA"); }) as typeof fetch;
  const { request, url } = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "Phạm Thị Mẹ" });
  const response = await handleMisaInvoiceApi(request, url, env, { role: "ADMIN" }, helpers);
  assert.equal(response?.status, 403);
  assert.equal((store.get("finance:steps-demo") as DemoFinance).sepay!.invoices.length, 0);
});

test("giáo viên không được xuất hóa đơn; kế toán không được dùng công cụ thử MISA", async () => {
  const { env } = await testEnv();
  const issue = post("/api/finance/invoices/issue", { receiptId: "rcpt-1", buyerName: "A" });
  assert.equal((await handleMisaInvoiceApi(issue.request, issue.url, env, { role: "TEACHER" }, helpers))?.status, 403);
  const tool = post("/api/integrations/misa/templates", {});
  assert.equal((await handleMisaInvoiceApi(tool.request, tool.url, env, { role: "ACCOUNTANT" }, helpers))?.status, 403);
});

test("route khác trả null để worker xử lý tiếp", async () => {
  const { env } = await testEnv();
  const other = post("/api/finance/sepay", {});
  assert.equal(await handleMisaInvoiceApi(other.request, other.url, env, { role: "ADMIN" }, helpers), null);
});

test("tải PDF hóa đơn đã phát hành: trả file application/pdf giải mã từ base64 MISA", async () => {
  const issued: SepayInvoice = { id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "", provider: "MISA", amount: 1_500_000, buyerName: "A", status: "ISSUED", invoiceNumber: "00000009", invoiceSeries: "1C26TYY", lookupCode: "TX-9", providerInvoiceId: "TX-9", retryCount: 0, createdAt: "2026-09-20T02:00:00.000Z" };
  const { env } = await testEnv({ invoices: [issued] });
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ Success: true, Data: [{ TransactionID: "TX-9", Data: Buffer.from("%PDF-1.4 test").toString("base64") }] }), { status: 200 });
  }) as typeof fetch;
  const request = new Request("https://lms.test/api/misa/invoice-pdf?invoiceId=inv-1");
  const response = await handleMisaInvoiceApi(request, new URL(request.url), env, { role: "ACCOUNTANT" }, helpers);
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("Content-Type"), "application/pdf");
  assert.equal(await response?.text(), "%PDF-1.4 test");
});
