import assert from "node:assert/strict";
import test, { after } from "node:test";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import type { DemoFinance } from "../cloudflare/finance-types";
import type {
  SepayBankTransaction, SepayCredit, SepayInvoice, SepayLedgerPayment, SepayPaymentOrder, SepayReceipt, SepayReceivable, SepaySettings, SepayWebhookLog,
} from "../cloudflare/sepay-engine";
import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { defaultIntegrationSettings, type IntegrationSettings } from "../cloudflare/integration-settings";
import { encryptSecret } from "../cloudflare/crypto-secrets";
import type { FinanceKvEnv } from "../cloudflare/finance-storage";
import { resetMisaTokenCacheForTests } from "../cloudflare/misa-invoice-client";
import { handleMisaInvoiceApi } from "../cloudflare/misa-invoice-routes";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { integrationSettingsRepository } from "../cloudflare/storage/integration-settings-repository";
import { createRelationalKv, writeBlock, type LegacyKvStorage } from "../cloudflare/storage/relational-kv";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import type { TxClient } from "../cloudflare/storage/relational-table-sync";
import { zaloMessageRepository, type ZaloMessageLog } from "../cloudflare/storage/zalo-message-repository";

const connectionString = process.env.STORAGE_TEST_DATABASE_URL
  ?? (process.env.DATABASE_URL ?? "").replace(/\/([^/?]+)(\?|$)/, "/stepslms_storage_test$2");
if (!connectionString) throw new Error("Thiếu STORAGE_TEST_DATABASE_URL hoặc DATABASE_URL.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
after(() => prisma.$disconnect());

/** Kho JSON cũ giả lập, chỉ để bộ định tuyến có chỗ đẩy các khóa chưa chuyển. */
const legacy: LegacyKvStorage = {
  values: new Map<string, unknown>(),
  async get<T>(key: string) { return this.values.get(key) as T | undefined; },
  async put<T>(key: string, value: T) { this.values.set(key, value); },
  async compareAndPut<T>(key: string, expected: string, value: T) {
    if (JSON.stringify(this.values.get(key) ?? null) !== expected) return false;
    this.values.set(key, value);
    return true;
  },
} as LegacyKvStorage & { values: Map<string, unknown> };

function student(id: string, overrides: Partial<DemoStudent> = {}): DemoStudent {
  return {
    id,
    code: id.toUpperCase(),
    fullName: `Học viên ${id}`,
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    parentPhone1: "",
    parentPhone2: "",
    status: "STUDYING",
    dateOfBirth: "",
    parentName: "",
    nationalId: "",
    note: "",
    loginEmail: "",
    loginPassword: "",
    tuitionExempt: false,
    sessionBalances: {},
    tuitionCredits: {},
    tuitionPaidThrough: {},
    classJoinedAt: {},
    ...overrides,
  };
}

/** Chạy trong transaction rồi hủy bỏ, để test không để lại dữ liệu. */
async function inRollback<T>(run: (tx: TxClient) => Promise<T>): Promise<T> {
  const marker = new Error("ROLLBACK");
  let result: T | undefined;
  await prisma.$transaction(async (tx) => {
    result = await run(tx as TxClient);
    throw marker;
  }).catch((error) => {
    if (error !== marker) throw error;
  });
  return result as T;
}

test("dựng lại danh sách học viên giống hệt bản đã ghi, kể cả số dư âm và trường rỗng", async () => {
  const items: DemoStudent[] = [
    student("student-1", { sessionBalances: { "class-a": -4, "class-b": 0 }, tuitionCredits: { "class-a": 1 }, tuitionPaidThrough: { "class-a": "2026-09" }, classJoinedAt: { "class-a": "2026-09-05" } }),
    student("student-2", { tuitionExempt: true, note: "", parentName: "Phụ huynh" }),
  ];
  const rebuilt = await inRollback(async (tx) => {
    await studentsRepository.write(tx, items);
    return studentsRepository.read(tx);
  });
  assert.deepEqual(rebuilt, items, "JSON dựng lại phải giống hệt bản gốc");
});

test("giữ nguyên thứ tự lớp, thứ tự lịch học và phân biệt trường vắng mặt với chuỗi rỗng", async () => {
  const items: DemoClass[] = [
    {
      id: "class-b", code: "B", name: "Lớp B", classTypeId: "", branchId: "", teacherId: "", roomId: "", syllabusId: "",
      status: "ACTIVE", studentIds: ["student-2", "student-1"], tuitionPackageId: "", billingMode: "MONTHLY",
      sessionPrice: 65_000, courseSessions: 24, billingEnabled: true, materialFees: {},
      schedules: [
        { weekday: 2, periodId: "period-1", startTime: "17:00", endTime: "19:00" },
        { weekday: 4, periodId: "period-1", startTime: "17:00", endTime: "19:00", effectiveFrom: "2026-09-07" },
      ],
      note: "",
    },
    {
      id: "class-a", code: "A", name: "Lớp A", classTypeId: "", branchId: "", teacherId: "", roomId: "", syllabusId: "",
      status: "ACTIVE", studentIds: [], tuitionPackageId: "", billingMode: "COURSE",
      sessionPrice: 75_000, courseSessions: 10, courseStartDate: "2026-07-17", billingEnabled: false,
      materialFees: { "2026-09": { amount: 60_000, description: "sách tô màu" } },
      schedules: [],
      note: "ghi chú",
    },
  ];
  const rebuilt = await inRollback(async (tx) => {
    await classesRepository.write(tx, items);
    return classesRepository.read(tx);
  });
  assert.deepEqual(rebuilt, items);
  assert.equal("courseStartDate" in rebuilt[0], false, "lớp không có ngày khai giảng thì trường phải vắng mặt");
  assert.equal(rebuilt[1].courseStartDate, "2026-07-17");
});

test("dựng lại buổi học giữ nguyên điểm danh null, cột đánh giá và thứ tự cột", async () => {
  const items: DemoLessonSession[] = [
    {
      id: "session-1", classId: "class-a", date: "2026-09-09", startTime: "17:00", endTime: "19:00",
      teacherId: "teacher-1", roomId: "", status: "COMPLETED", isExtra: false,
      recurrenceKey: "class-a|2026-09-09|17:00", note: "", isOff: false, hasHomework: false,
      assessmentColumns: [{ id: "score-1", name: "BTVN" }, { id: "score-2", name: "Nghe" }],
      attendanceColumnOrder: ["status", "clip", "assessment:score-1"],
      attendance: [
        {
          studentId: "student-1", status: "PRESENT", firstStatus: "ABSENT", late: true,
          lessonRating: null, homeworkRating: null, pronunciationVideoDone: true, worksheetDone: false,
          vocabularyScore: "32/43", assessmentScores: { "score-1": "56/65" }, note: "",
        },
        {
          studentId: "student-2", status: null, firstStatus: null, late: false,
          lessonRating: null, homeworkRating: null, pronunciationVideoDone: false, worksheetDone: false,
          vocabularyScore: null, assessmentScores: {}, note: "Ốm",
        },
      ],
    },
    {
      id: "session-2", classId: "class-a", date: "2026-09-11", startTime: "17:00", endTime: "19:00",
      teacherId: "teacher-1", roomId: "", status: "SCHEDULED", isExtra: false,
      recurrenceKey: "class-a|2026-09-11|17:00", note: "Nghỉ lễ", isOff: true, offSource: "ADMIN", hasHomework: false,
      assessmentColumns: [], attendanceColumnOrder: [], attendance: [],
    },
  ];
  const rebuilt = await inRollback(async (tx) => {
    await sessionsRepository.write(tx, items);
    return sessionsRepository.read(tx);
  });
  assert.deepEqual(rebuilt, items);
  assert.equal("offSource" in rebuilt[0], false, "buổi học bình thường không có trường offSource");
});

test("sửa một học viên chỉ chạm đúng dòng của học viên đó", async () => {
  const before = [student("student-1"), student("student-2"), student("student-3")];
  const report = await inRollback(async (tx) => {
    await studentsRepository.write(tx, before);
    const after = before.map((row) => row.id === "student-2" ? { ...row, note: "đã đổi" } : row);
    return studentsRepository.write(tx, after);
  });
  const students = report.find((row) => row.table === "students");
  assert.deepEqual(
    { created: students?.created, updated: students?.updated, deleted: students?.deleted },
    { created: 0, updated: 1, deleted: 0 },
  );
});

test("xóa học viên khỏi danh sách thì dòng phụ thuộc cũng biến mất", async () => {
  const before = [student("student-1", { sessionBalances: { "class-a": 3 } }), student("student-2")];
  const { report, balances } = await inRollback(async (tx) => {
    await studentsRepository.write(tx, before);
    const result = await studentsRepository.write(tx, [before[1]]);
    return { report: result, balances: await tx.opsStudentSessionBalance.count() };
  });
  assert.equal(report.find((row) => row.table === "students")?.deleted, 1);
  assert.equal(balances, 0, "số dư buổi của học viên đã xóa không được ở lại");
});

test("compareAndPut từ chối bản đã cũ và nhận bản đúng", async () => {
  const kv = createRelationalKv(prisma, legacy);
  const finance = (): DemoFinance => ({
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [], payments: [], receipts: [], invoices: [], credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  });

  await writeBlock(prisma, financeRepository, finance());
  const snapshot = JSON.stringify(await kv.get<DemoFinance>("finance:steps-demo", "json"));

  const changed = finance();
  changed.cashbookSkippedReceiptIds = ["rcpt-1"];
  assert.equal(await kv.compareAndPut("finance:steps-demo", snapshot, JSON.stringify(changed)), true, "bản đúng phải ghi được");

  const stale = finance();
  stale.cashbookSkippedReceiptIds = ["rcpt-2"];
  assert.equal(await kv.compareAndPut("finance:steps-demo", snapshot, JSON.stringify(stale)), false, "bản cũ phải bị từ chối");

  const current = await kv.get<DemoFinance>("finance:steps-demo", "json");
  assert.deepEqual(current?.cashbookSkippedReceiptIds, ["rcpt-1"], "lần ghi bị từ chối không được đụng vào dữ liệu");

  await prisma.$transaction(async (tx) => { await financeRepository.write(tx as TxClient, finance()); });
});

test("hai lượt ghi đồng thời trên hai nhóm khác nhau đều giữ nguyên thay đổi", async () => {
  const kv = createRelationalKv(prisma, legacy);
  const students = [student("student-song-1"), student("student-song-2")];
  const classes: DemoClass[] = [{
    id: "class-song", code: "SONG", name: "Lớp song song", classTypeId: "", branchId: "", teacherId: "", roomId: "",
    syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "", billingMode: "COURSE",
    sessionPrice: 0, courseSessions: 1, billingEnabled: true, materialFees: {}, schedules: [], note: "",
  }];

  await Promise.all([
    kv.put("students:steps-demo", JSON.stringify(students)),
    kv.put("classes:steps-demo", JSON.stringify(classes)),
  ]);

  assert.equal((await kv.get<DemoStudent[]>("students:steps-demo", "json"))?.length, 2);
  assert.equal((await kv.get<DemoClass[]>("classes:steps-demo", "json"))?.[0].id, "class-song");

  await Promise.all([
    kv.put("students:steps-demo", JSON.stringify([])),
    kv.put("classes:steps-demo", JSON.stringify([])),
  ]);
});

test("tám field hóa đơn MISA mới (bảy field Phase 2 + processingAt Phase 6) dựng lại đúng bằng giá trị đã ghi", async () => {
  const finance = (): DemoFinance => ({
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [], payments: [], receipts: [],
      invoices: [{
        id: "inv-misa-1", studentId: "student-1", paymentId: "pay-1", receivableId: "recv-1",
        provider: "MISA", amount: 2_000_000, buyerName: "Nguyễn Văn A", status: "ISSUED",
        retryCount: 0, createdAt: "2026-09-01T00:00:00.000Z", issuedAt: "2026-09-01T00:05:00.000Z",
        invoiceNumber: "INV-001", invoiceSeries: "1C26TAA",
        buyerTaxCode: "0312345678", buyerAddress: "12 Nguyễn Trãi, Hà Nội", buyerEmail: "a@example.com",
        pdfUrl: "https://misa.example/inv-001.pdf", xmlUrl: "https://misa.example/inv-001.xml",
        providerInvoiceId: "misa-inv-001", taxAuthorityCode: "TCT-001",
        processingAt: "2026-09-01T00:02:00.000Z",
      }],
      credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  });
  const rebuilt = await inRollback(async (tx) => {
    await financeRepository.write(tx, finance());
    return financeRepository.read(tx);
  });
  assert.deepEqual(rebuilt.sepay.invoices, finance().sepay.invoices, "cả tám field mới lẫn field cũ phải dựng lại đúng nguyên bản");
});

test("ba field frozenAt/publicToken/requestedBy của khoản phải thu dựng lại đúng bằng giá trị đã ghi (Phase 4)", async () => {
  const finance = (): DemoFinance => ({
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [{
        id: "recv-frozen-1", receivableCode: "HPABCDEF", studentId: "student-1", studentName: "Nguyễn Văn A",
        billingPeriod: "Tháng 09/2026", issueDate: "2026-09-01", dueDate: "2026-09-01",
        amountDue: 2_400_000, amountPaid: 0, balanceDue: 2_400_000, currency: "VND", status: "OPEN",
        paymentOrderId: "po-frozen-1", classId: "class-1", billKey: "month|class-1|2026-09",
        frozenAt: "2026-09-22T08:00:00.000Z", publicToken: "0123456789abcdef0123456789abcdef", requestedBy: "admin@steps.vn",
      }],
      paymentOrders: [], bankTransactions: [], payments: [], receipts: [], invoices: [], credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  });
  const rebuilt = await inRollback(async (tx) => {
    await financeRepository.write(tx, finance());
    return financeRepository.read(tx);
  });
  assert.deepEqual(rebuilt.sepay.receivables, finance().sepay.receivables, "frozenAt, publicToken và requestedBy phải dựng lại đúng nguyên bản");
});

test("khoản phải thu cũ chưa có frozenAt/publicToken/requestedBy thì JSON dựng lại không mọc thêm khóa nào", async () => {
  const legacyReceivable = {
    id: "recv-legacy-1", receivableCode: "HPLEGACY", studentId: "student-1", studentName: "Nguyễn Văn A",
    billingPeriod: "Tháng 08/2026", issueDate: "2026-08-01", dueDate: "2026-08-01",
    amountDue: 2_000, amountPaid: 0, balanceDue: 2_000, currency: "VND", status: "OPEN" as const,
    paymentOrderId: "po-legacy-1",
  };
  const finance: DemoFinance = {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [legacyReceivable],
      paymentOrders: [], bankTransactions: [], payments: [], receipts: [], invoices: [], credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
  const rebuilt = await inRollback(async (tx) => {
    await financeRepository.write(tx, finance);
    return financeRepository.read(tx);
  });
  assert.deepEqual(rebuilt.sepay.receivables[0], legacyReceivable, "khóa của ba field mới không được xuất hiện trên khoản phải thu cũ chưa chốt");
});

test("hóa đơn cũ không có bảy field mới thì JSON dựng lại không mọc thêm khóa nào", async () => {
  const legacyInvoice = {
    id: "inv-legacy-1", studentId: "student-1", paymentId: "pay-1", receivableId: "recv-1",
    provider: "SEPAY_DEMO", amount: 2_000, buyerName: "Học viên demo", status: "PENDING" as const,
    retryCount: 0, createdAt: "2026-08-01T00:00:00.000Z",
  };
  const finance: DemoFinance = {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [], payments: [], receipts: [],
      invoices: [legacyInvoice],
      credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
  const rebuilt = await inRollback(async (tx) => {
    await financeRepository.write(tx, finance);
    return financeRepository.read(tx);
  });
  assert.deepEqual(rebuilt.sepay.invoices[0], legacyInvoice, "khóa của bảy field mới không được xuất hiện trên hóa đơn cũ chưa có dữ liệu MISA");
});

/**
 * Chốt chặn "trường rơi mất khi ghi DB": mỗi mẫu dưới đây dùng `satisfies Required<...>` nên phải điền ĐỦ
 * mọi trường của kiểu. Thêm trường mới vào kiểu mà không điền vào mẫu thì `tsc` báo lỗi; điền vào mẫu mà
 * chưa có cột trong DB thì test này báo trường nào bị rơi. Trường `approvedAt`/`previewHash` của hóa đơn
 * từng mất đúng kiểu này (chỉ nằm trong bộ nhớ) và làm hỏng luồng xem trước → xuất hóa đơn MISA.
 */
test("mọi trường của sổ SePay (khoản phải thu, lệnh, giao dịch, thanh toán, phiếu thu, hóa đơn, số dư, log webhook) sống sót qua ghi/đọc DB", async () => {
  const settings = {
    bank: "970418", accountNumber: "8686838888", accountName: "STEPS", qrImageDataUrl: "data:image/png;base64,AAAA",
    autoMatchExact: true, autoPartial: true, autoOverpayment: true, autoInvoiceExact: true, autoInvoicePartial: true, autoInvoiceOverpayment: true,
  } satisfies Required<SepaySettings>;
  const receivable = {
    id: "recv-full", receivableCode: "HPFULL", studentId: "student-1", studentName: "Học viên Đủ", billingPeriod: "Tháng 10/2026",
    issueDate: "2026-10-01", dueDate: "2026-10-10", amountDue: 1_560_000, amountPaid: 500_000, balanceDue: 1_060_000, currency: "VND",
    status: "PARTIALLY_PAID", paymentOrderId: "order-full", classId: "class-1", billKey: "month|class-1|2026-10",
    frozenAt: "2026-10-01T02:00:00.000Z", publicToken: "token-full", requestedBy: "ketoan@steps.vn",
  } satisfies Required<SepayReceivable>;
  const paymentOrder = {
    id: "order-full", receivableId: "recv-full", studentId: "student-1", paymentCode: "HPS43HV1", amount: 1_560_000,
    qrUrl: "https://qr.example/x.png", status: "ACTIVE", createdAt: "2026-10-01T02:00:00.000Z",
  } satisfies Required<SepayPaymentOrder>;
  const bankTransaction = {
    id: "bank-full", provider: "SEPAY", providerTransactionId: "tx-full", accountNumber: "8686838888", transactionDate: "2026-10-01 09:00:00",
    transferType: "IN", transferAmount: 500_000, content: "HPS43HV1", status: "ALLOCATED", reviewReason: "UNKNOWN_CODE",
    receivedAt: "2026-10-01T02:00:00.000Z", processedAt: "2026-10-01T02:00:05.000Z",
  } satisfies Required<SepayBankTransaction>;
  const payment = {
    id: "pay-full", paymentCode: "HPS43HV1", studentId: "student-1", bankTransactionId: "bank-full", receivableId: "recv-full",
    amount: 500_000, allocatedAmount: 450_000, excessAmount: 50_000, status: "PARTIAL", paidAt: "2026-10-01T02:00:05.000Z",
    method: "Chuyển khoản", note: "ghi chú đủ",
  } satisfies Required<SepayLedgerPayment>;
  const receipt = {
    id: "rcpt-full", receiptNumber: "PT-202610-000001", paymentId: "pay-full", studentId: "student-1", amount: 450_000,
    issuedAt: "2026-10-01T02:00:06.000Z", status: "ISSUED", method: "Chuyển khoản", note: "phiếu đủ", classId: "class-1", className: "S43",
    billingPeriod: "Tháng 10/2026", billingMode: "MONTHLY", studentName: "Học viên Đủ", studentCode: "HV1",
    creditSessionsUsed: 2, materialsAmount: 100_000, paidThroughBefore: "2026-09",
  } satisfies Required<SepayReceipt>;
  const invoice = {
    id: "inv-full", studentId: "student-1", paymentId: "pay-full", receivableId: "recv-full", provider: "MISA",
    invoiceNumber: "0000123", invoiceSeries: "1C26TYY", amount: 450_000, buyerName: "Phụ huynh Đủ", lookupCode: "LK-1",
    status: "PENDING", retryCount: 2, lastError: "Nháp MISA: lỗi", createdAt: "2026-10-01T02:00:07.000Z", issuedAt: "2026-10-01T03:00:00.000Z",
    buyerTaxCode: "0312345678", buyerAddress: "12 Lê Lợi", buyerEmail: "me@example.com", pdfUrl: "https://misa.test/a.pdf", xmlUrl: "https://misa.test/a.xml",
    providerInvoiceId: "TX-1", taxAuthorityCode: "CQT-1", processingAt: "2026-10-01T03:00:01.000Z",
    previewHash: "ab12cd34", approvedAt: "2026-10-01T02:30:00.000Z",
  } satisfies Required<SepayInvoice>;
  const credit = {
    id: "credit-full", studentId: "student-1", sourcePaymentId: "pay-full", amount: 50_000, remainingAmount: 20_000,
    reason: "Thanh toán dư", status: "OPEN", createdAt: "2026-10-01T02:00:08.000Z",
  } satisfies Required<SepayCredit>;
  const webhookLog = {
    id: "wh-full", requestId: "req-full", signatureValid: true, processingStatus: "ACCEPTED", providerTransactionId: "tx-full",
    createdAt: "2026-10-01T02:00:00.000Z",
  } satisfies Required<SepayWebhookLog>;

  const finance: DemoFinance = {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings,
      receivables: [receivable], paymentOrders: [paymentOrder], bankTransactions: [bankTransaction],
      payments: [payment], receipts: [receipt], invoices: [invoice], credits: [credit], webhookLogs: [webhookLog],
    },
    cashbookSkippedReceiptIds: [],
  };
  const rebuilt = await inRollback(async (tx) => {
    await financeRepository.write(tx, finance);
    return financeRepository.read(tx);
  });
  const ledger = rebuilt.sepay!;
  assert.deepEqual(ledger.settings, settings, "settings");
  assert.deepEqual(ledger.receivables[0], receivable, "khoản phải thu");
  assert.deepEqual(ledger.paymentOrders[0], paymentOrder, "lệnh thanh toán");
  assert.deepEqual(ledger.bankTransactions[0], bankTransaction, "giao dịch ngân hàng");
  assert.deepEqual(ledger.payments[0], payment, "thanh toán");
  assert.deepEqual(ledger.receipts[0], receipt, "phiếu thu");
  assert.deepEqual(ledger.invoices[0], invoice, "hóa đơn (gồm approvedAt, previewHash)");
  assert.deepEqual(ledger.credits[0], credit, "số dư");
  assert.deepEqual(ledger.webhookLogs[0], webhookLog, "log webhook");
});

test("cấu hình tích hợp lưu ciphertext dựng lại y hệt, và trả mặc định khi chưa có dòng nào", async () => {
  const settings: IntegrationSettings = {
    sepay: { webhookMode: "HMAC_TIMESTAMP_BODY", webhookSecretEncrypted: "enc:abc123", webhookSecretHint: "1234" },
    misa: {
      enabled: true, baseUrl: "https://actapp.misa.vn", clientId: "client-1",
      clientSecretEncrypted: "enc:def456", clientSecretHint: "5678",
      taxCode: "0312345678", username: "steps-api", passwordEncrypted: "enc:ghi789", passwordHint: "9012",
      invSeries: "1C26TYY", invTemplateNo: "01GTKT0/001", taxRateLabel: "KCT",
    },
    zalo: {
      enabled: true, appId: "app-1", appSecretEncrypted: "enc:jkl012", appSecretHint: "3456",
      oaId: "oa-1", refreshTokenEncrypted: "enc:mno345", refreshTokenHint: "7890",
      templateIdPaymentRequest: "tpl-1", templateIdInvoiceIssued: "tpl-2",
    },
    updatedAt: "2026-09-22T00:00:00.000Z", updatedBy: "admin@steps.vn",
  };
  const rebuilt = await inRollback(async (tx) => {
    await integrationSettingsRepository.write(tx, settings);
    return integrationSettingsRepository.read(tx);
  });
  assert.deepEqual(rebuilt, settings, "JSON.stringify của cấu hình tích hợp phải giống hệt bản gốc, kể cả ciphertext");

  // Xóa trong chính giao dịch sẽ rollback, để không đụng dữ liệu thật của test khác
  // mà vẫn kiểm chứng được hành vi khi bảng chưa có dòng "integration" nào.
  const defaults = await inRollback(async (tx) => {
    await tx.opsIntegrationSetting.deleteMany({ where: { id: "integration" } });
    return integrationSettingsRepository.read(tx);
  });
  assert.deepEqual(defaults, defaultIntegrationSettings(), "chưa có dòng nào thì phải trả về mặc định, không phải lỗi hay null");
});

test("hai dòng log tin Zalo dựng lại đúng thứ tự position", async () => {
  const logs: ZaloMessageLog[] = [
    {
      id: "zalo-2", kind: "INVOICE_ISSUED", invoiceId: "inv-1", studentId: "student-1", phone: "0901000000",
      templateId: "tpl-invoice", status: "SENT", providerMsgId: "msg-2", createdAt: "2026-09-22T01:00:00.000Z",
      sentAt: "2026-09-22T01:00:05.000Z",
    },
    {
      id: "zalo-1", kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", phone: "0901000000",
      templateId: "tpl-payment", status: "QUEUED", createdAt: "2026-09-22T00:00:00.000Z",
    },
  ];
  const rebuilt = await inRollback(async (tx) => {
    await zaloMessageRepository.write(tx, logs);
    return zaloMessageRepository.read(tx);
  });
  assert.deepEqual(rebuilt, logs, "thứ tự và toàn bộ field phải giữ nguyên như mảng đã ghi");
});

test("processingAt của log Zalo (Phase 7, khoá chống kẹt hàng chờ) dựng lại đúng bằng giá trị đã ghi", async () => {
  const logs: ZaloMessageLog[] = [{
    id: "zalo-3", kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", phone: "0901000000",
    templateId: "tpl-payment", status: "PROCESSING", createdAt: "2026-09-22T00:00:00.000Z",
    processingAt: "2026-09-22T00:05:00.000Z",
  }];
  const rebuilt = await inRollback(async (tx) => {
    await zaloMessageRepository.write(tx, logs);
    return zaloMessageRepository.read(tx);
  });
  assert.deepEqual(rebuilt, logs);
});

test("các cột nội dung tin của log Zalo (templateData, ảnh chụp học viên, webhook...) dựng lại đúng và attemptCount 0 không hiện ra", async () => {
  const logs: ZaloMessageLog[] = [
    {
      id: "zalo-4", kind: "PAYMENT_REQUEST", receivableId: "recv-1", studentId: "student-1", phone: "84901000000",
      templateId: "tpl-payment", status: "DELIVERED", createdAt: "2026-10-01T00:00:00.000Z",
      templateData: "{\"order_code\":\"HP1\"}", studentName: "Học viên 1", studentCode: "HV1", className: "S43",
      rawPhone: "0901 000 000", requestedBy: "ketoan@steps.vn", attemptCount: 2, lastAttemptAt: "2026-10-01T00:00:05.000Z",
      providerMsgId: "m-1", providerSentTime: "1700000000000", webhookAt: "2026-10-01T00:00:09.000Z", webhookPayload: "{\"msg_id\":\"m-1\"}",
    },
    { id: "zalo-5", kind: "INVOICE_ISSUED", invoiceId: "inv-1", studentId: "student-1", phone: "", templateId: "tpl-invoice", status: "FAILED", createdAt: "2026-10-01T00:01:00.000Z" },
  ];
  const rebuilt = await inRollback(async (tx) => {
    await zaloMessageRepository.write(tx, logs);
    return zaloMessageRepository.read(tx);
  });
  assert.deepEqual(rebuilt, logs);
});

test("ghi lại đúng khối cấu hình tích hợp thì compareAndPut với expected cũ phải bị từ chối", async () => {
  const kv = createRelationalKv(prisma, legacy);
  const first: IntegrationSettings = { ...defaultIntegrationSettings(), updatedAt: "2026-09-22T00:00:00.000Z", updatedBy: "admin@steps.vn" };
  await writeBlock(prisma, integrationSettingsRepository, first);
  const snapshot = JSON.stringify(await kv.get<IntegrationSettings>("integrations:steps-demo", "json"));

  const second = { ...first, misa: { ...first.misa, enabled: true } };
  assert.equal(await kv.compareAndPut("integrations:steps-demo", snapshot, JSON.stringify(second)), true, "bản đúng phải ghi được");

  const stale = { ...first, misa: { ...first.misa, enabled: false, baseUrl: "https://stale.example" } };
  assert.equal(await kv.compareAndPut("integrations:steps-demo", snapshot, JSON.stringify(stale)), false, "bản cũ phải bị từ chối");

  const current = await kv.get<IntegrationSettings>("integrations:steps-demo", "json");
  assert.equal(current?.misa.enabled, true, "lần ghi bị từ chối không được đụng vào dữ liệu");
});

/**
 * Luồng "xem trước → xuất hóa đơn MISA" chạy trên DB thật (kho quan hệ), không phải bộ nhớ: dấu vân tay
 * `previewHash` và mốc duyệt `approvedAt` phải sống qua từng lần ghi thì hàng chờ mới phát hành được.
 */
test("MISA trên DB thật: xem trước rồi xuất, previewHash và approvedAt sống qua các lần ghi, hóa đơn ISSUED", async () => {
  const authSecret = "test-auth-secret-at-least-32-characters-long";
  const kv = createRelationalKv(prisma, legacy);
  const settings: IntegrationSettings = {
    ...defaultIntegrationSettings(),
    misa: {
      ...defaultIntegrationSettings().misa,
      enabled: true, issueEnabled: true, baseUrl: "https://developer.misa.vn/apis/itg/meinvoice", clientId: "app-id-e2e",
      clientSecretEncrypted: await encryptSecret("misa-client-secret", authSecret), taxCode: "0312345678", username: "steps-api",
      passwordEncrypted: await encryptSecret("misa-password", authSecret), invSeries: "1C26TYY", invTemplateNo: "1", taxRateLabel: "KCT",
    },
  };
  const finance: DemoFinance = {
    debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [],
    sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS", autoMatchExact: true, autoPartial: true, autoOverpayment: false, autoInvoiceExact: true, autoInvoicePartial: false, autoInvoiceOverpayment: false },
      receivables: [], paymentOrders: [], bankTransactions: [],
      payments: [{ id: "pay-e2e", paymentCode: "", studentId: "student-e2e", bankTransactionId: "", receivableId: "", amount: 1_500_000, allocatedAmount: 1_500_000, excessAmount: 0, status: "COMPLETED", paidAt: "2026-10-01T02:00:00.000Z", method: "Chuyển khoản" }],
      receipts: [{ id: "rcpt-e2e", receiptNumber: "PT-202610-000099", paymentId: "pay-e2e", studentId: "student-e2e", amount: 1_500_000, issuedAt: "2026-10-01T02:00:00.000Z", status: "ISSUED", billingPeriod: "Tháng 10/2026", studentName: "Học viên E2E", studentCode: "HVE2E" }],
      invoices: [], credits: [], webhookLogs: [],
    },
    cashbookSkippedReceiptIds: [],
  };
  await kv.put("integrations:steps-demo", JSON.stringify(settings));
  await kv.put("students:steps-demo", JSON.stringify([student("student-e2e", { fullName: "Học viên E2E", parentName: "Phụ huynh E2E" })]));
  await kv.put("finance:steps-demo", JSON.stringify(finance));

  const env = { STEPS_LMS_DATA: kv, AUTH_SECRET: authSecret } as unknown as FinanceKvEnv;
  const helpers = { json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }), audit: async () => undefined };
  const call = (path: string, body: unknown) => {
    const request = new Request(`https://lms.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return handleMisaInvoiceApi(request, new URL(request.url), env, { role: "ACCOUNTANT" }, helpers);
  };
  const originalFetch = globalThis.fetch;
  resetMisaTokenCacheForTests();
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-e2e" }), { status: 200 });
    if (String(url).endsWith("/invoice/unpublishview")) return new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/e2e" }), { status: 200 });
    return new Response(JSON.stringify({ success: true, publishInvoiceResult: [{ RefID: "x", TransactionID: "TX-E2E", InvNo: "0000777", InvSeries: "1C26TYY", ErrorCode: null }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const body = { receiptId: "rcpt-e2e", buyerName: "Phụ huynh E2E", buyerEmail: "me@example.com" };
    const preview = await call("/api/finance/invoices/preview", body);
    assert.equal(preview?.status, 200, "xem trước phải thành công");
    const afterPreview = (await kv.get<DemoFinance>("finance:steps-demo", "json"))!.sepay!.invoices[0]!;
    assert.match(afterPreview.previewHash || "", /^[0-9a-f]{64}$/, "previewHash phải còn sau khi ghi DB");

    const issued = await call("/api/finance/invoices/issue", body);
    assert.equal(issued?.status, 200);
    const payload = await issued!.json() as { invoice: { status: string; invoiceNumber?: string; approvedAt?: string }; message: string };
    assert.equal(payload.invoice.status, "ISSUED", `xuất phải phát hành được, đang là: ${payload.message}`);
    assert.equal(payload.invoice.invoiceNumber, "0000777");
    const saved = (await kv.get<DemoFinance>("finance:steps-demo", "json"))!.sepay!.invoices[0]!;
    assert.equal(saved.status, "ISSUED");
    assert.ok(saved.approvedAt, "approvedAt phải còn sau khi ghi DB");
  } finally {
    globalThis.fetch = originalFetch;
    await kv.put("finance:steps-demo", JSON.stringify({ ...finance, sepay: { ...finance.sepay!, payments: [], receipts: [], invoices: [] } }));
    await kv.put("students:steps-demo", JSON.stringify([]));
    await kv.put("integrations:steps-demo", JSON.stringify(defaultIntegrationSettings()));
  }
});
