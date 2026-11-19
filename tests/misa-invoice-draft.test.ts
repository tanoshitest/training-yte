import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { defaultIntegrationSettings, type IntegrationSettings } from "../cloudflare/integration-settings";
import { DRAFT_ERROR_PREFIX, prepareInvoiceDraft } from "../cloudflare/misa-invoice-draft";
import { resetMisaTokenCacheForTests } from "../cloudflare/misa-invoice-client";
import type { DemoFinance } from "../cloudflare/finance-types";
import type { SepayInvoice } from "../cloudflare/sepay-engine";
import type { FinanceKvEnv } from "../cloudflare/finance-storage";

const AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";
const originalFetch = globalThis.fetch;

beforeEach(() => { resetMisaTokenCacheForTests(); });
afterEach(() => { globalThis.fetch = originalFetch; });

function invoice(overrides: Partial<SepayInvoice> = {}): SepayInvoice {
  return {
    id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "recv-1",
    provider: "MISA", amount: 2_000_000, buyerName: "Nguyễn Văn A", status: "PENDING",
    retryCount: 0, createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function testEnv(opts: { issueEnabled?: boolean; invoices?: SepayInvoice[] } = {}) {
  const store = new Map<string, unknown>();
  const settings: IntegrationSettings = {
    ...defaultIntegrationSettings(),
    misa: {
      ...defaultIntegrationSettings().misa,
      enabled: true,
      issueEnabled: opts.issueEnabled ?? true,
      baseUrl: "https://testapi.meinvoice.vn",
      clientId: "app-id-1",
      clientSecretEncrypted: await encryptSecret("misa-client-secret", AUTH_SECRET),
      taxCode: "0312345678",
      username: "steps-api",
      passwordEncrypted: await encryptSecret("misa-password", AUTH_SECRET),
      invSeries: "1C26TYY",
      invTemplateNo: "01GTKT0/001",
      taxRateLabel: "KCT",
    },
  };
  const finance: DemoFinance = {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [], payments: [], receipts: [],
      invoices: opts.invoices ?? [invoice()], credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
  store.set("integrations:steps-demo", settings);
  store.set("finance:steps-demo", finance);
  store.set("students:steps-demo", []);
  const env: FinanceKvEnv = {
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("chỉ hỗ trợ json");
        return (store.get(key) as T | undefined) ?? null;
      },
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

const readInvoice = (store: Map<string, unknown>) => (store.get("finance:steps-demo") as DemoFinance).sepay!.invoices[0]!;

function mockMisa(preview: () => Response) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace("https://testapi.meinvoice.vn", "");
    calls.push(path);
    if (path === "/invoice/token") return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    if (path === "/invoice/unpublishview") return preview();
    throw new Error(`không được gọi ${path}`);
  }) as typeof fetch;
  return calls;
}

test("dựng nháp thành công: lưu previewHash, chỉ gọi xem trước, không duyệt cũng không phát hành", async () => {
  const { env, store } = await testEnv();
  const calls = mockMisa(() => new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 }));

  const result = await prepareInvoiceDraft(env, "inv-1");
  assert.deepEqual(result, { status: "READY" });
  const saved = readInvoice(store);
  assert.match(saved.previewHash || "", /^[0-9a-f]{64}$/);
  assert.equal(saved.status, "PENDING");
  assert.equal(saved.approvedAt, undefined, "nháp tự dựng không bao giờ tự duyệt");
  assert.equal(saved.lastError, undefined);
  assert.ok(!calls.includes("/invoice/publish"), "không có lệnh phát hành thật");
});

test("MISA báo lỗi khi dựng nháp: ghi lỗi có tiền tố lên hóa đơn, không có previewHash, vẫn PENDING chờ duyệt", async () => {
  const { env, store } = await testEnv();
  mockMisa(() => new Response(JSON.stringify({ Success: false, ErrorCode: "InvalidTemplate", Errors: [] }), { status: 200 }));

  const result = await prepareInvoiceDraft(env, "inv-1");
  assert.equal(result.status, "FAILED");
  const saved = readInvoice(store);
  assert.ok(saved.lastError?.startsWith(DRAFT_ERROR_PREFIX), `lỗi phải có tiền tố, đang là: ${saved.lastError}`);
  assert.equal(saved.previewHash, undefined);
  assert.equal(saved.status, "PENDING");
});

test("dựng nháp thành công sau một lần lỗi thì xoá lỗi nháp cũ, giữ nguyên lỗi phát hành không phải của nháp", async () => {
  const withDraftError = await testEnv({ invoices: [invoice({ lastError: `${DRAFT_ERROR_PREFIX}lỗi cũ` })] });
  mockMisa(() => new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 }));
  await prepareInvoiceDraft(withDraftError.env, "inv-1");
  assert.equal(readInvoice(withDraftError.store).lastError, undefined);

  const withPublishError = await testEnv({ invoices: [invoice({ lastError: "401: hết hạn token" })] });
  mockMisa(() => new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 }));
  await prepareInvoiceDraft(withPublishError.env, "inv-1");
  assert.equal(readInvoice(withPublishError.store).lastError, "401: hết hạn token");
});

test("bỏ qua, không gọi mạng: công tắc xuất hóa đơn tắt, hóa đơn đã duyệt, đã phát hành, hoặc không tồn tại", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi"); }) as typeof fetch;

  assert.deepEqual(await prepareInvoiceDraft((await testEnv({ issueEnabled: false })).env, "inv-1"), { status: "SKIPPED" });
  assert.deepEqual(await prepareInvoiceDraft((await testEnv({ invoices: [invoice({ approvedAt: "2026-10-01T01:00:00.000Z" })] })).env, "inv-1"), { status: "SKIPPED" });
  assert.deepEqual(await prepareInvoiceDraft((await testEnv({ invoices: [invoice({ status: "ISSUED" })] })).env, "inv-1"), { status: "SKIPPED" });
  assert.deepEqual(await prepareInvoiceDraft((await testEnv()).env, "inv-khong-co"), { status: "SKIPPED" });
  assert.equal(fetchCalls, 0);
});

test("trong lúc chờ MISA mà kế toán đã xem trước tay thì nháp tự dựng không ghi đè previewHash của họ", async () => {
  const { env, store } = await testEnv();
  mockMisa(() => {
    // Giả lập kế toán bấm xem trước (đã lưu previewHash khác) đúng lúc nháp tự dựng còn đang chờ MISA.
    const finance = store.get("finance:steps-demo") as DemoFinance;
    finance.sepay!.invoices = finance.sepay!.invoices.map((row) => ({ ...row, previewHash: "tay-ke-toan" }));
    return new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 });
  });
  assert.deepEqual(await prepareInvoiceDraft(env, "inv-1"), { status: "SKIPPED" });
  assert.equal(readInvoice(store).previewHash, "tay-ke-toan");
});

test("không có lệnh gọi mạng nào xen giữa lượt đọc và lượt ghi khối tài chính (R1)", async () => {
  const { env } = await testEnv();
  const order: string[] = [];
  const originalCompareAndPut = env.STEPS_LMS_DATA.compareAndPut!.bind(env.STEPS_LMS_DATA);
  env.STEPS_LMS_DATA.compareAndPut = async (key, expected, value) => {
    order.push(`write:${key}`);
    return originalCompareAndPut(key, expected, value);
  };
  globalThis.fetch = (async (url: string) => {
    order.push("fetch");
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/abc" }), { status: 200 });
  }) as typeof fetch;
  await prepareInvoiceDraft(env, "inv-1");
  const firstWrite = order.findIndex((item) => item.startsWith("write:"));
  assert.ok(firstWrite > 0 && order.slice(0, firstWrite).every((item) => item === "fetch"), "mọi lệnh gọi mạng xong trước lượt ghi duy nhất");
  assert.equal(order.filter((item) => item.startsWith("write:")).length, 1);
});
