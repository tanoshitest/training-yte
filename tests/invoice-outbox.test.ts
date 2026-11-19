import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { defaultIntegrationSettings, type IntegrationSettings } from "../cloudflare/integration-settings";
import { processInvoiceOutbox } from "../cloudflare/invoice-outbox";
import { resetMisaTokenCacheForTests } from "../cloudflare/misa-invoice-client";
import type { MisaInvoiceFields } from "../cloudflare/misa-invoice-fields";
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
    retryCount: 0, createdAt: "2026-09-22T00:00:00.000Z", approvedAt: "2026-09-22T00:05:00.000Z",
    ...overrides,
  };
}

function financeWith(invoices: SepayInvoice[]): DemoFinance {
  return {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [], payments: [], receipts: [],
      invoices, credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
}

async function testEnv(opts: { misaEnabled?: boolean; issueEnabled?: boolean; invoices?: SepayInvoice[]; students?: unknown[]; invoiceFields?: Partial<MisaInvoiceFields> } = {}) {
  const store = new Map<string, unknown>();
  const misaEnabled = opts.misaEnabled ?? true;
  const issueEnabled = opts.issueEnabled ?? true;
  const settings: IntegrationSettings = {
    ...defaultIntegrationSettings(),
    misa: {
      ...defaultIntegrationSettings().misa,
      enabled: misaEnabled,
      issueEnabled,
      baseUrl: "https://testapi.meinvoice.vn",
      clientId: "app-id-1",
      clientSecretEncrypted: await encryptSecret("misa-client-secret", AUTH_SECRET),
      taxCode: "0312345678",
      username: "steps-api",
      passwordEncrypted: await encryptSecret("misa-password", AUTH_SECRET),
      invSeries: "1C26TYY",
      invTemplateNo: "01GTKT0/001",
      taxRateLabel: "KCT",
      ...(opts.invoiceFields ? { invoiceFields: { ...defaultIntegrationSettings().misa.invoiceFields, ...opts.invoiceFields } } : {}),
    },
  };
  if (!opts.invoiceFields) delete (settings.misa as Partial<typeof settings.misa>).invoiceFields; // mô phỏng bản lưu cũ chưa có khối thông số hóa đơn
  store.set("integrations:steps-demo", settings);
  store.set("finance:steps-demo", financeWith(opts.invoices ?? [invoice()]));
  store.set("students:steps-demo", opts.students ?? []);

  const env: FinanceKvEnv = {
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("chỉ hỗ trợ json");
        return (store.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => { store.set(key, JSON.parse(value)); },
      compareAndPut: async (key: string, expected: string, value: string) => {
        const current = JSON.stringify(store.get(key) ?? null);
        if (current !== expected) return false;
        store.set(key, JSON.parse(value));
        return true;
      },
    },
    AUTH_SECRET,
  };
  return { env, store };
}

function readInvoices(store: Map<string, unknown>): SepayInvoice[] {
  return (store.get("finance:steps-demo") as DemoFinance).sepay!.invoices;
}

test("MISA tắt thì hàng đợi không gọi mạng, không đổi trạng thái hóa đơn", async () => {
  const { env, store } = await testEnv({ misaEnabled: false });
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi khi misa.enabled=false"); }) as typeof fetch;
  const result = await processInvoiceOutbox(env);
  assert.equal(result.processed, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readInvoices(store)[0]?.status, "PENDING");
});

test("issueEnabled=false (công tắc tắt xuất hóa đơn thật) thì hàng đợi tự động cũng không gọi MISA, dù misa.enabled=true", async () => {
  const { env, store } = await testEnv({ issueEnabled: false });
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi khi misa.issueEnabled=false"); }) as typeof fetch;
  const result = await processInvoiceOutbox(env);
  assert.equal(result.processed, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readInvoices(store)[0]?.status, "PENDING");
});

test("phát hành thành công: không có lệnh gọi mạng nào xen giữa lượt đọc và lượt ghi khối tài chính (R1)", async () => {
  const { env, store } = await testEnv();
  const order: string[] = [];
  const originalCompareAndPut = env.STEPS_LMS_DATA.compareAndPut!.bind(env.STEPS_LMS_DATA);
  env.STEPS_LMS_DATA.compareAndPut = async (key, expected, value) => {
    order.push(`write:${key}`);
    return originalCompareAndPut(key, expected, value);
  };
  globalThis.fetch = (async (url: string) => {
    order.push(`fetch:${String(url).includes("/invoice/token") ? "token" : "publish"}`);
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "TX-1", InvNo: "0000001", InvSeries: "1C26TYY", InvCode: "LK001", ErrorCode: null }]) }), { status: 200 });
  }) as typeof fetch;

  const result = await processInvoiceOutbox(env);
  assert.equal(result.issued, 1);
  assert.equal(readInvoices(store)[0]?.status, "ISSUED");

  // Mọi lệnh fetch phải nằm giữa lượt ghi "claim" (đánh dấu PROCESSING) và lượt ghi "apply"
  // kết quả — không có lệnh ghi nào khác xen vào trong lúc gọi mạng đang chạy.
  const writeIndexes = order.reduce<number[]>((acc, item, index) => (item.startsWith("write:") ? [...acc, index] : acc), []);
  assert.equal(writeIndexes.length, 2, "đúng hai lượt ghi: claim và apply");
  const fetchIndexes = order.reduce<number[]>((acc, item, index) => (item.startsWith("fetch:") ? [...acc, index] : acc), []);
  for (const fetchIndex of fetchIndexes) {
    assert.ok(fetchIndex > writeIndexes[0]! && fetchIndex < writeIndexes[1]!, "mọi lệnh gọi mạng phải nằm giữa hai lượt ghi, không xen vào lượt ghi nào khác");
  }
});

test("chạy hai lượt đồng thời không phát hành trùng cùng một hóa đơn", async () => {
  const { env, store } = await testEnv();
  let publishCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    publishCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "TX-1", InvNo: "0000001", InvSeries: "1C26TYY", InvCode: "LK001", ErrorCode: null }]) }), { status: 200 });
  }) as typeof fetch;

  const [first, second] = await Promise.all([processInvoiceOutbox(env), processInvoiceOutbox(env)]);
  assert.equal(publishCalls, 1, "chỉ đúng một lượt gọi publish cho hóa đơn này");
  assert.equal(first.issued + second.issued, 1);
  assert.equal(readInvoices(store)[0]?.status, "ISSUED");
});

test("hóa đơn kẹt PROCESSING quá 10 phút được cứu về PENDING rồi phát hành", async () => {
  const stuck = invoice({ status: "PROCESSING", processingAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
  const { env, store } = await testEnv({ invoices: [stuck] });
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "TX-1", InvNo: "0000001", InvSeries: "1C26TYY", InvCode: "LK001", ErrorCode: null }]) }), { status: 200 });
  }) as typeof fetch;

  const result = await processInvoiceOutbox(env);
  assert.equal(result.issued, 1, "hóa đơn kẹt phải được cứu và phát hành lại được");
  assert.equal(readInvoices(store)[0]?.status, "ISSUED");
});

test("hóa đơn kẹt PROCESSING chưa quá 10 phút thì không bị đụng vào", async () => {
  const fresh = invoice({ status: "PROCESSING", processingAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() });
  const { env, store } = await testEnv({ invoices: [fresh] });
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi"); }) as typeof fetch;
  const result = await processInvoiceOutbox(env);
  assert.equal(result.processed, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readInvoices(store)[0]?.status, "PROCESSING", "hóa đơn còn mới, chưa kẹt, phải để nguyên chờ lượt đang xử lý nó");
});

test("lỗi không retry được (401) thì FAILED, retryCount tăng dần rồi dừng hẳn, không quay vòng vô hạn", async () => {
  const { env, store } = await testEnv();
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ Success: false, ErrorCode: "INVALID_DATA" }), { status: 401 });
  }) as typeof fetch;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    resetMisaTokenCacheForTests();
    await processInvoiceOutbox(env);
  }
  const finalInvoice = readInvoices(store)[0]!;
  assert.equal(finalInvoice.status, "FAILED");
  assert.equal(finalInvoice.retryCount, 5, "phải dừng lại đúng 5 lần thử, không tăng mãi");
  assert.ok(finalInvoice.lastError?.includes("401") || finalInvoice.lastError, "phải ghi lại lỗi gần nhất");
});

/** Chạy hàng chờ với một hóa đơn và trả về InvoiceData đã gửi lên MISA. */
async function publishedInvoiceData(opts: Parameters<typeof testEnv>[0]) {
  const { env } = await testEnv(opts);
  let sent: Record<string, unknown> | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    sent = (JSON.parse(String(init?.body)) as { InvoiceData: Array<Record<string, unknown>> }).InvoiceData[0];
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "TX-1", InvNo: "0000001", InvSeries: "1C26TYY", ErrorCode: "" }]) }), { status: 200 });
  }) as typeof fetch;
  await processInvoiceOutbox(env);
  assert.ok(sent, "phải có lệnh publish gửi lên MISA");
  return sent;
}

const studentRow = { id: "student-1", code: "HV0001", fullName: "Nguyễn Văn A", parentName: "Nguyễn Thị Phụ Huynh", parentPhone1: "0909111222", address: "Quận 1", nationalId: "042183060283", loginEmail: "a@example.com" };

test("hóa đơn tự động ghi tên phụ huynh; mẫu tên dòng hàng, đơn vị tính, hình thức thanh toán theo cấu hình", async () => {
  const data = await publishedInvoiceData({
    students: [studentRow],
    invoices: [invoice({ buyerName: "Nguyễn Văn A" })],
    invoiceFields: { itemNameTemplate: "Học phí {studentName} ({studentCode})", unitNameCourse: "Gói", paymentMethodName: "Chuyển khoản" },
  });
  const line = (data.OriginalInvoiceDetail as Array<Record<string, unknown>>)[0]!;
  assert.equal(data.BuyerFullName, "Nguyễn Thị Phụ Huynh");
  assert.equal(line.ItemName, "Học phí Nguyễn Văn A (HV0001)");
  assert.equal(line.UnitName, "Gói");
  assert.equal(data.PaymentMethodName, "Chuyển khoản");
  assert.equal(data.BuyerTaxCode, "042183060283", "CCCD điền vào mã số thuế người mua");
  assert.equal(data.BuyerIDNumber, "", "không còn gửi riêng ở ô CCCD");
  assert.equal(data.BuyerLegalName, data.BuyerFullName, "MISA bắt buộc Tên đơn vị khi có mã số thuế, kể cả CCCD 12 số");
  assert.equal(data.BuyerAddress, "Quận 1");
  assert.equal(data.IsSendEmail, true);
  assert.equal(data.ReceiverEmail, "a@example.com");
});

test("thiếu CCCD thì xuất mẫu không thông tin: tên cố định, không địa chỉ/CCCD/SĐT; có email vẫn cho MISA gửi", async () => {
  const data = await publishedInvoiceData({ students: [{ ...studentRow, nationalId: "" }] });
  assert.equal(data.BuyerFullName, "Khách hàng chưa cung cấp thông tin");
  assert.equal(data.BuyerAddress, "");
  assert.equal(data.BuyerTaxCode, "");
  assert.equal(data.BuyerIDNumber, "");
  assert.equal(data.BuyerPhoneNumber, "");
  assert.equal(data.IsSendEmail, true);
});

test("phát hành hóa đơn xong không xếp tin Zalo", async () => {
  const { env, store } = await testEnv({ students: [studentRow] });
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-1" }), { status: 200 });
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: JSON.stringify([{ RefID: "inv-1", TransactionID: "TX-1", InvNo: "0000001", InvSeries: "1C26TYY", ErrorCode: "" }]) }), { status: 200 });
  }) as typeof fetch;
  assert.equal((await processInvoiceOutbox(env)).issued, 1);
  assert.deepEqual([...store.keys()].filter((key) => key.startsWith("zalo")), []);
});

test("cấu hình bản cũ chưa có khối thông số hóa đơn vẫn phát hành với giá trị mặc định", async () => {
  const data = await publishedInvoiceData({ students: [studentRow] });
  const line = (data.OriginalInvoiceDetail as Array<Record<string, unknown>>)[0]!;
  assert.equal(data.BuyerFullName, "Nguyễn Thị Phụ Huynh");
  assert.equal(line.ItemName, "Học phí - Nguyễn Văn A");
  assert.equal(line.UnitName, "Khóa");
  assert.equal(data.PaymentMethodName, "TM/CK");
});

test("nguồn tên là học viên, hoặc tên trên hóa đơn đã sửa tay, thì không bị thay bằng tên phụ huynh", async () => {
  const byStudent = await publishedInvoiceData({ students: [studentRow], invoiceFields: { buyerNameSource: "STUDENT" } });
  assert.equal(byStudent.BuyerFullName, "Nguyễn Văn A");
  const edited = await publishedInvoiceData({ students: [studentRow], invoices: [invoice({ buyerName: "Công ty ABC" })] });
  assert.equal(edited.BuyerFullName, "Công ty ABC");
});

test("hóa đơn chưa được duyệt (webhook tự tạo) thì hàng chờ không phát hành", async () => {
  const { env } = await testEnv({ invoices: [invoice({ approvedAt: undefined })] });
  globalThis.fetch = (async () => { throw new Error("không được gọi MISA"); }) as typeof fetch;
  const result = await processInvoiceOutbox(env);
  assert.deepEqual(result, { processed: 0, issued: 0, failed: 0 });
});
