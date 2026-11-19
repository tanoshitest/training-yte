import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { defaultIntegrationSettings, type IntegrationSettings } from "../cloudflare/integration-settings";
import { enqueueZaloMessage, processZaloOutbox } from "../cloudflare/zalo-outbox";
import { resetZaloTokenCacheForTests } from "../cloudflare/zalo-zbs-client";
import type { DemoFinance } from "../cloudflare/finance-types";
import type { SepayReceivable, SepayInvoice } from "../cloudflare/sepay-engine";
import type { ZaloMessageLog } from "../cloudflare/storage/zalo-message-repository";
import type { FinanceKvEnv } from "../cloudflare/finance-storage";
import type { DemoStudent } from "../cloudflare/people-types";

const AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";
const originalFetch = globalThis.fetch;

beforeEach(() => { resetZaloTokenCacheForTests(); });
afterEach(() => { globalThis.fetch = originalFetch; });

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function receivable(overrides: Partial<SepayReceivable> = {}): SepayReceivable {
  return {
    id: "recv-1", receivableCode: "HP0001", studentId: "student-1", studentName: "Nguyễn Văn A",
    billingPeriod: "Tháng 09/2026", issueDate: "2026-09-01", dueDate: "2026-09-10",
    amountDue: 2_000_000, amountPaid: 0, balanceDue: 2_000_000, currency: "VND", status: "OPEN",
    paymentOrderId: "order-1", publicToken: "public-token-1",
    ...overrides,
  };
}

function invoice(overrides: Partial<SepayInvoice> = {}): SepayInvoice {
  return {
    id: "inv-1", studentId: "student-1", paymentId: "pay-1", receivableId: "recv-1",
    provider: "MISA", amount: 2_000_000, buyerName: "Nguyễn Văn A", status: "ISSUED",
    retryCount: 0, createdAt: "2026-09-22T00:00:00.000Z", invoiceNumber: "0000123", invoiceSeries: "1C26TYY",
    lookupCode: "44C_T5_4MR9P",
    ...overrides,
  };
}

function financeWith(opts: { receivables?: SepayReceivable[]; invoices?: SepayInvoice[] }): DemoFinance {
  return {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: opts.receivables ?? [receivable()],
      paymentOrders: [{ id: "order-1", receivableId: "recv-1", studentId: "student-1", paymentCode: "HP8F4K92", amount: 2_000_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-09-01T00:00:00.000Z" }],
      bankTransactions: [], payments: [], receipts: [],
      invoices: opts.invoices ?? [invoice()],
      credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
}

async function testEnv(opts: { zaloEnabled?: boolean; receivables?: SepayReceivable[]; invoices?: SepayInvoice[]; zaloMessages?: ZaloMessageLog[]; publicBaseUrl?: string } = {}) {
  const store = new Map<string, unknown>();
  const zaloEnabled = opts.zaloEnabled ?? true;
  const settings: IntegrationSettings = {
    ...defaultIntegrationSettings(),
    zalo: {
      ...defaultIntegrationSettings().zalo,
      enabled: zaloEnabled,
      appId: "app-1",
      appSecretEncrypted: await encryptSecret("zalo-app-secret", AUTH_SECRET),
      oaId: "oa-1",
      refreshTokenEncrypted: await encryptSecret("refresh-token-initial", AUTH_SECRET),
      templateIdPaymentRequest: "tpl-payment-request",
      templateIdInvoiceIssued: "tpl-invoice-issued",
    },
  };
  store.set("integrations:steps-demo", settings);
  store.set("finance:steps-demo", financeWith({ receivables: opts.receivables, invoices: opts.invoices }));
  store.set("zalo-messages:steps-demo", opts.zaloMessages ?? []);
  store.set("students:steps-demo", [{ id: "student-1", code: "HV0001", fullName: "Nguyễn Văn A", phone: "", address: "", school: "", parentZalo: "", parentPhone1: "0912345678", status: "STUDYING" } satisfies DemoStudent]);

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
    PUBLIC_BASE_URL: opts.publicBaseUrl ?? "https://steps.example.vn",
  };
  return { env, store };
}

function readLogs(store: Map<string, unknown>): ZaloMessageLog[] {
  return store.get("zalo-messages:steps-demo") as ZaloMessageLog[];
}

test("enqueueZaloMessage: zalo tắt thì không tạo dòng nào, trả reason DISABLED", async () => {
  const { env, store } = await testEnv({ zaloEnabled: false });
  const result = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" });
  assert.equal(readLogs(store).length, 0);
  assert.deepEqual(result, { queued: false, reason: "DISABLED" });
});

test("enqueueZaloMessage: số điện thoại không hợp lệ vẫn tạo dòng nhưng FAILED ngay, không chặn luồng gọi", async () => {
  const { env, store } = await testEnv();
  const result = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "123" });
  const logs = readLogs(store);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.status, "FAILED");
  assert.equal(logs[0]?.errorCode, "INVALID_PHONE");
  assert.deepEqual(result, { queued: true, status: "FAILED", errorCode: "INVALID_PHONE", errorMessage: logs[0]?.errorMessage });
});

test("enqueueZaloMessage: số hợp lệ tạo dòng QUEUED đúng field, trả queued true", async () => {
  const { env, store } = await testEnv();
  const result = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" });
  const logs = readLogs(store);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.status, "QUEUED");
  assert.equal(logs[0]?.phone, "84912345678");
  assert.equal(logs[0]?.templateId, "tpl-payment-request");
  assert.deepEqual(result, { queued: true, status: "QUEUED", errorCode: undefined, errorMessage: undefined });
});

test("enqueueZaloMessage: gọi hai lần cùng kind + receivableId chỉ tạo một dòng (chống gửi trùng), lần hai trả DUPLICATE kèm trạng thái dòng cũ", async () => {
  const { env, store } = await testEnv();
  await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" });
  const second = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" });
  assert.equal(readLogs(store).length, 1);
  assert.deepEqual(second, { queued: false, reason: "DUPLICATE", existingStatus: "QUEUED", errorCode: undefined, errorMessage: undefined });
});

test("enqueueZaloMessage: resend đưa dòng đã SENT về QUEUED (cùng id, xoá providerMsgId), dòng đang QUEUED thì vẫn DUPLICATE", async () => {
  const { env, store } = await testEnv();
  const input = { kind: "PAYMENT_REQUEST" as const, receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" };
  await enqueueZaloMessage(env, input);
  const first = readLogs(store)[0]!;
  assert.equal((await enqueueZaloMessage(env, { ...input, resend: true })).queued, false, "đang QUEUED thì chưa gửi lại được");
  store.set("zalo-messages:steps-demo", [{ ...first, status: "SENT", providerMsgId: "m-1", sentAt: "2026-09-29T00:00:00.000Z" }]);
  const again = await enqueueZaloMessage(env, { ...input, resend: true });
  assert.equal(again.queued, true);
  const logs = readLogs(store);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.id, first.id);
  assert.equal(logs[0]?.status, "QUEUED");
  assert.equal(logs[0]?.providerMsgId, undefined);
});

test("enqueueZaloMessage: gọi lại khi dòng cũ đã FAILED (vd lỗi ZBS Account) trả DUPLICATE kèm lý do lỗi cũ, không tạo dòng mới", async () => {
  const { env, store } = await testEnv();
  await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "123" });
  const second = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", rawPhone: "0912345678" });
  assert.equal(readLogs(store).length, 1);
  assert.deepEqual(second, {
    queued: false,
    reason: "DUPLICATE",
    existingStatus: "FAILED",
    errorCode: "INVALID_PHONE",
    errorMessage: "Số điện thoại phụ huynh không hợp lệ, không gửi được tin Zalo.",
  });
});

test("Zalo tắt thì hàng chờ không gọi mạng, không đổi trạng thái", async () => {
  const { env, store } = await testEnv({ zaloEnabled: false, zaloMessages: [{ id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }] });
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi"); }) as typeof fetch;
  const result = await processZaloOutbox(env);
  assert.equal(result.processed, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readLogs(store)[0]?.status, "QUEUED");
});

test("gửi thành công: không có lệnh gọi mạng nào xen giữa lượt đọc và lượt ghi khối log Zalo (R1)", async () => {
  const { env, store } = await testEnv({ zaloMessages: [{ id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }] });
  const order: string[] = [];
  const originalCompareAndPut = env.STEPS_LMS_DATA.compareAndPut!.bind(env.STEPS_LMS_DATA);
  env.STEPS_LMS_DATA.compareAndPut = async (key, expected, value) => {
    if (key === "zalo-messages:steps-demo") order.push("write");
    return originalCompareAndPut(key, expected, value);
  };
  globalThis.fetch = (async (url: string) => {
    order.push("fetch");
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;

  const result = await processZaloOutbox(env);
  assert.equal(result.sent, 1);
  assert.equal(readLogs(store)[0]?.status, "SENT");
  assert.equal(readLogs(store)[0]?.providerMsgId, "msg-1");

  const writeIndexes = order.reduce<number[]>((acc, item, index) => (item === "write" ? [...acc, index] : acc), []);
  assert.equal(writeIndexes.length, 2, "đúng hai lượt ghi khối log Zalo: claim và apply");
  const fetchIndexes = order.reduce<number[]>((acc, item, index) => (item === "fetch" ? [...acc, index] : acc), []);
  for (const fetchIndex of fetchIndexes) {
    assert.ok(fetchIndex > writeIndexes[0]! && fetchIndex < writeIndexes[1]!, "mọi lệnh gọi mạng phải nằm giữa hai lượt ghi");
  }
});

test("chạy hai lượt đồng thời không gửi trùng cùng một dòng", async () => {
  const { env, store } = await testEnv({ zaloMessages: [{ id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }] });
  let sendCalls = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    sendCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;

  const [first, second] = await Promise.all([processZaloOutbox(env), processZaloOutbox(env)]);
  assert.equal(sendCalls, 1);
  assert.equal(first.sent + second.sent, 1);
  assert.equal(readLogs(store)[0]?.status, "SENT");
});

test("dòng kẹt PROCESSING quá 10 phút được cứu về QUEUED rồi gửi", async () => {
  const stuck: ZaloMessageLog = { id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "PROCESSING", processingAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(), createdAt: "2026-09-22T00:00:00.000Z" };
  const { env, store } = await testEnv({ zaloMessages: [stuck] });
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  const result = await processZaloOutbox(env);
  assert.equal(result.sent, 1);
  assert.equal(readLogs(store)[0]?.status, "SENT");
});

test("dòng FAILED không được hàng chờ tự động gửi lại (chỉ gửi 1 lần tự động, tránh tốn phí)", async () => {
  const { env, store } = await testEnv({ zaloMessages: [{ id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "FAILED", errorCode: "NETWORK_ERROR", errorMessage: "lỗi cũ", createdAt: "2026-09-22T00:00:00.000Z" }] });
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("không được gọi"); }) as typeof fetch;
  const result = await processZaloOutbox(env);
  assert.equal(result.processed, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readLogs(store)[0]?.status, "FAILED");
});

const MONTH_CLASS = { id: "class-1", code: "TA101", name: "TA101", branchId: "branch-1", schedules: [], billingMode: "MONTHLY" };
const COURSE_CLASS = {
  ...MONTH_CLASS, id: "class-2", name: "Lớp khóa", billingMode: "COURSE", courseSessions: 4, courseStartDate: "2026-09-01",
  schedules: [
    { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
  ],
};

function captureSends() {
  const sent: { template_data?: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    sent.push(JSON.parse(String(init?.body || "{}")));
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  return sent;
}

const paymentRequestLog: ZaloMessageLog = { id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" };

test("PAYMENT_REQUEST gửi đúng 5 field của mẫu ZBS (order_code, ma_hoc_vien, transfer_amount, loai_hoc_phi, ten_hoc_vien) — lớp thu theo tháng", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "month|class-1|2026-09" })],
    zaloMessages: [paymentRequestLog],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  const sent = captureSends();

  const result = await processZaloOutbox(env);
  assert.equal(result.sent, 1);
  assert.equal(readLogs(store)[0]?.status, "SENT");
  assert.deepEqual(sent[0]?.template_data, {
    order_code: "HPTA101T9HV0001",
    ma_hoc_vien: "HV0001",
    transfer_amount: "2000000",
    loai_hoc_phi: "Theo tháng 01/09/26-30/09/26",
    ten_hoc_vien: "Nguyễn Văn A",
  });
});

test("PAYMENT_REQUEST: khoản chưa gắn lớp thì order_code lùi về mã lệnh thanh toán", async () => {
  const { env } = await testEnv({ zaloMessages: [paymentRequestLog] });
  const sent = captureSends();
  await processZaloOutbox(env);
  assert.equal(sent[0]?.template_data.order_code, "HP8F4K92");
});

test("PAYMENT_REQUEST nhiều tháng gộp: khoảng từ ngày 1 tháng đầu đến ngày cuối tháng cuối, vẫn ≤ 30 ký tự khi khác năm", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "months|class-1|2026-11,2026-12,2027-01" })],
    zaloMessages: [paymentRequestLog],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  const sent = captureSends();

  await processZaloOutbox(env);
  assert.equal(sent[0]?.template_data?.loai_hoc_phi, "Theo tháng 01/11/26-31/01/27");
  assert.ok((sent[0]?.template_data?.loai_hoc_phi || "").length <= 30);
});

test("PAYMENT_REQUEST lớp thu theo khóa ghi \"Theo khóa\" kèm ngày buổi đầu đến buổi cuối của khóa", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-2", billKey: "course|class-2" })],
    zaloMessages: [paymentRequestLog],
  });
  store.set("classes:steps-demo", [COURSE_CLASS]);
  const sent = captureSends();

  await processZaloOutbox(env);
  assert.equal(sent[0]?.template_data?.loai_hoc_phi, "Theo khóa 01/09/26-12/09/26");
});

test("INVOICE_ISSUED gửi đúng 7 field của mẫu ZBS (date, ma_hoc_vien, loai_hoc_phi, paid_fee, lop, chi_nhanh, ten_hoc_vien)", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "month|class-1|2026-09" })],
    invoices: [invoice({ issuedAt: "2026-09-25T06:30:00.000Z" })],
    zaloMessages: [{ id: "zmsg-1", kind: "INVOICE_ISSUED", studentId: "student-1", invoiceId: "inv-1", phone: "84912345678", templateId: "tpl-invoice-issued", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  store.set("settings:steps-demo", { branches: [{ id: "branch-1", name: "Cơ sở Cầu Giấy" }] });
  const sent = captureSends();

  const result = await processZaloOutbox(env);
  assert.equal(result.sent, 1);
  assert.equal(readLogs(store)[0]?.status, "SENT");
  assert.deepEqual(sent[0]?.template_data, {
    date: "25/09/2026",
    ma_hoc_vien: "HV0001",
    loai_hoc_phi: "Theo tháng 01/09/26-30/09/26",
    paid_fee: "2000000",
    lop: "TA101",
    chi_nhanh: "Cơ sở Cầu Giấy",
    ten_hoc_vien: "Nguyễn Văn A",
  });
});

test("enqueueZaloMessage ghi số thô và người thực hiện; gửi lại đổi người thực hiện và xoá dấu vết webhook cũ", async () => {
  const { env, store } = await testEnv();
  const input = { kind: "PAYMENT_REQUEST" as const, receivableId: "recv-1", studentId: "student-1", rawPhone: "0912 345 678", requestedBy: "ketoan1@steps.vn" };
  await enqueueZaloMessage(env, input);
  const first = readLogs(store)[0]!;
  assert.equal(first.rawPhone, "0912 345 678");
  assert.equal(first.phone, "84912345678");
  assert.equal(first.requestedBy, "ketoan1@steps.vn");

  store.set("zalo-messages:steps-demo", [{
    ...first, status: "DELIVERED", attemptCount: 1, providerMsgId: "m-1", providerSentTime: "1700000000000",
    webhookAt: "2026-09-29T00:00:00.000Z", webhookPayload: "{\"msg_id\":\"m-1\"}", deliveredAt: "2026-09-29T00:00:00.000Z",
  }]);
  await enqueueZaloMessage(env, { ...input, requestedBy: "ketoan2@steps.vn", resend: true });
  const again = readLogs(store)[0]!;
  assert.equal(again.requestedBy, "ketoan2@steps.vn");
  assert.equal(again.attemptCount, 1, "số lần gọi Zalo cộng dồn qua các lần gửi lại");
  assert.equal(again.webhookPayload, undefined);
  assert.equal(again.webhookAt, undefined);
  assert.equal(again.providerSentTime, undefined);
});

test("gửi thành công lưu lại dữ liệu điền mẫu, ảnh chụp học viên/lớp, số lần gọi và sent_time của Zalo", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "month|class-1|2026-09" })],
    zaloMessages: [paymentRequestLog],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  const sent = captureSends();
  await processZaloOutbox(env);

  const log = readLogs(store)[0]!;
  assert.deepEqual(JSON.parse(log.templateData || "null"), sent[0]?.template_data);
  assert.equal(log.studentName, "Nguyễn Văn A");
  assert.equal(log.studentCode, "HV0001");
  assert.equal(log.className, "TA101");
  assert.equal(log.attemptCount, 1);
  assert.ok(log.lastAttemptAt, "phải có mốc gọi Zalo gần nhất");
  assert.equal(log.providerSentTime, "1700000000000");
});

test("gửi lỗi vẫn lưu dữ liệu điền mẫu đã đưa cho Zalo và đếm lần gọi, lần gửi lại cộng dồn", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "month|class-1|2026-09" })],
    zaloMessages: [paymentRequestLog],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-initial", expires_in: 3600 });
    return jsonResponse(200, { error: -118, message: "Zalo account not existed" });
  }) as typeof fetch;
  await processZaloOutbox(env);

  const failed = readLogs(store)[0]!;
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "-118");
  assert.equal(JSON.parse(failed.templateData || "{}").ma_hoc_vien, "HV0001");
  assert.equal(failed.attemptCount, 1);

  store.set("zalo-messages:steps-demo", [{ ...failed, status: "QUEUED", errorCode: undefined, errorMessage: undefined }]);
  await processZaloOutbox(env);
  assert.equal(readLogs(store)[0]?.attemptCount, 2);
});

test("INVOICE_ISSUED lưu ảnh chụp học viên và lớp", async () => {
  const { env, store } = await testEnv({
    receivables: [receivable({ classId: "class-1", billKey: "month|class-1|2026-09" })],
    invoices: [invoice({ issuedAt: "2026-09-25T06:30:00.000Z" })],
    zaloMessages: [{ id: "zmsg-1", kind: "INVOICE_ISSUED", studentId: "student-1", invoiceId: "inv-1", phone: "84912345678", templateId: "tpl-invoice-issued", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }],
  });
  store.set("classes:steps-demo", [MONTH_CLASS]);
  captureSends();
  await processZaloOutbox(env);
  const log = readLogs(store)[0]!;
  assert.equal(log.studentName, "Nguyễn Văn A");
  assert.equal(log.studentCode, "HV0001");
  assert.equal(log.className, "TA101");
  assert.equal(JSON.parse(log.templateData || "{}").paid_fee, "2000000");
});

test("refresh token xoay vòng trong lúc chạy hàng chờ thì được ghi lại vào khối cấu hình tích hợp", async () => {
  const { env, store } = await testEnv({ zaloMessages: [{ id: "zmsg-1", kind: "PAYMENT_REQUEST", studentId: "student-1", receivableId: "recv-1", phone: "84912345678", templateId: "tpl-payment-request", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z" }] });
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("oauth.zaloapp.com")) return jsonResponse(200, { access_token: "acc-1", refresh_token: "refresh-token-ROTATED", expires_in: 3600 });
    return jsonResponse(200, { error: 0, message: "Success", data: { msg_id: "msg-1", sent_time: "1700000000000" } });
  }) as typeof fetch;
  await processZaloOutbox(env);
  const settings = store.get("integrations:steps-demo") as IntegrationSettings;
  assert.ok(settings.zalo.refreshTokenEncrypted, "phải có ciphertext refresh token mới");
  assert.notEqual(settings.zalo.refreshTokenHint, undefined);
});
