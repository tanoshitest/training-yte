import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T4_CLASS_ID, t4OctoberMinimumCreditSessions, t4PreviousMonthDebtAmount } from "../cloudflare/t4-production-correction";
import { T5_CLASS_ID, t5PreviousMonthDebtAmount } from "../cloudflare/t5-production-correction";
import { T9_CLASS_ID, t9OctoberMinimumCreditSessions, t9PreviousMonthDebtAmount } from "../cloudflare/t9-production-correction";
import { T10_CLASS_ID, t10PreviousMonthDebtAmount } from "../cloudflare/t10-production-correction";
import { T11_CLASS_ID, t11OctoberMinimumCreditSessions, t11PreviousMonthDebtAmount } from "../cloudflare/t11-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

function baseClass(id: string, name: string, sessionPrice: number, schedules: DemoClass["schedules"]): DemoClass {
  return {
    id, code: name.split("-")[0] || "", name,
    classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
    syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
    billingMode: "MONTHLY", sessionPrice, schedules, note: "", billingEnabled: false,
  };
}

/** T4 thật: CN 14:00–16:00 + T6 17:15–19:15, 50k/buổi → tháng 10 có 9 suất. */
const T4 = baseClass(T4_CLASS_ID, "T4- 2013- 8.2", 50_000, [
  { weekday: 0, periodId: "sun", startTime: "14:00", endTime: "16:00" },
  { weekday: 5, periodId: "fri", startTime: "17:15", endTime: "19:15" },
]);
/** T5 thật: CN 07:15 + T3 17:00, 60k/buổi → tháng 10 có đúng 8 suất. */
const T5 = baseClass(T5_CLASS_ID, "T5-2014-7.1", 60_000, [
  { weekday: 0, periodId: "sun", startTime: "07:15", endTime: "09:15" },
  { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
]);
/** T9 thật: T2 19:00 + T6 14:30, 60k/buổi → tháng 10 có 9 suất. */
const T9 = baseClass(T9_CLASS_ID, "T9-2015-6.3", 60_000, [
  { weekday: 1, periodId: "mon", startTime: "19:00", endTime: "21:00" },
  { weekday: 5, periodId: "fri", startTime: "14:30", endTime: "16:30" },
]);
/** T10 thật: T2 17:00 + T7 07:00, 50k/buổi → tháng 10 có 9 suất. */
const T10 = baseClass(T10_CLASS_ID, "T10-2016-5.1", 50_000, [
  { weekday: 1, periodId: "mon", startTime: "17:00", endTime: "19:00" },
  { weekday: 6, periodId: "sat", startTime: "07:00", endTime: "09:00" },
]);
/** T11 thật: T2 19:00 + T7 09:00, 50k/buổi → tháng 10 có 9 suất. */
const T11 = baseClass(T11_CLASS_ID, "T11- 2016-5.2", 50_000, [
  { weekday: 1, periodId: "mon", startTime: "19:00", endTime: "21:00" },
  { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
]);

function paidThrough(clsId: string, s: DemoStudent) {
  return { ...s, tuitionPaidThrough: { [clsId]: "2026-09" } };
}

test("T4 tháng 10: 9 suất trừ 1 buổi nghỉ = 400k cho cả lớp", () => {
  const quote = tuitionCollectionCharge(paidThrough(T4_CLASS_ID, student("paid", "Học viên")), T4, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 1);
  assert.equal(quote.amount, 400_000);
  const unpaid = tuitionCollectionCharge(student("unpaid", "Bạn chưa thu"), T4, [], emptySepayLedger(), NOW);
  assert.equal(unpaid.amount, 400_000);
});

test("T4 nợ cũ: Quốc Nhật 1.100k; Nhật Đăng, Hương Giang, Minh Quân, Tuệ Nhi 750k", () => {
  for (const [id, name, code, total] of [
    ["quoc-nhat", "Quốc Nhật", "HV0601", 1_100_000],
    ["nhat-dang", "Nguyễn Trần Nhật Đăng", "HV0596", 750_000],
    ["huong-giang", "Phạm Nguyễn Hương Giang", "HV0597", 750_000],
    ["minh-quan", "Minh Quân", "HV0613", 750_000],
    ["tue-nhi", "Trần Tuệ Nhi", "HV0637", 750_000],
  ] as const) {
    const quote = tuitionCollectionCharge(student(id, name, code), T4, [], emptySepayLedger(), NOW);
    assert.equal(quote.oldDebtAmount, total - 400_000, name);
    assert.equal(quote.amount, total, name);
  }
  // Lê Quỳnh Chi: khấu trừ 2 buổi nghỉ (−100k) + nợ cũ 150k = 500k.
  assert.equal(t4PreviousMonthDebtAmount(student("quynh-chi", "Lê Quỳnh Chi", "HV1007"), T4, ["2026-10"]), 150_000);
  const quynhChi = tuitionCollectionCharge(student("quynh-chi", "Lê Quỳnh Chi", "HV1007"), T4, [], emptySepayLedger(), NOW);
  assert.equal(quynhChi.creditSessions, 2);
  assert.equal(quynhChi.oldDebtAmount, 150_000);
  assert.equal(quynhChi.amount, 500_000);
  // Quỳnh Chi HV0609 (người khác) không được dính nợ của HV1007 theo tên.
  assert.equal(t4PreviousMonthDebtAmount(student("quynh-chi-2", "Lê Quỳnh Chi", "HV0609"), T4, ["2026-10"]), 0);
  // Nợ Tuệ Nhi chỉ gắn phiếu T4 — phiếu T7 của bạn ấy vẫn 400k.
  assert.equal(t4PreviousMonthDebtAmount(student("tue-nhi", "Trần Tuệ Nhi", "HV0637"), { id: "class-import-t7" }, ["2026-10"]), 0);
  assert.equal(t4PreviousMonthDebtAmount(student("khac", "Phương Vy", "HV0604"), T4, ["2026-10"]), 0);
  assert.equal(t4PreviousMonthDebtAmount(student("quoc-nhat", "Quốc Nhật", "HV0601"), T4, ["2026-11"]), 0);
  assert.equal(t4OctoberMinimumCreditSessions(student("a", "Ai"), T5, "2026-10"), 0, "khấu trừ không lan sang lớp khác");
});

test("sync hủy phiếu mồ côi của học viên đã gỡ khỏi lớp, giữ phiếu frozen", () => {
  const openRecv = (studentId: string, extra: Partial<SepayReceivable> = {}): SepayReceivable => ({
    id: `recv-${studentId}`,
    receivableCode: "PT-TEST",
    studentId,
    studentName: "",
    billingPeriod: "Tháng 2026-10",
    issueDate: "2026-10-01",
    dueDate: "2026-10-10",
    amountDue: 400_000,
    amountPaid: 0,
    balanceDue: 400_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: `order-${studentId}`,
    classId: T4_CLASS_ID,
    billKey: `month|${T4_CLASS_ID}|2026-10`,
    ...extra,
  });
  // Roster T4 chỉ còn "con-lai" — ba phiếu kia là của bạn đã gỡ khỏi lớp.
  const cls = { ...T4, billingEnabled: true, studentIds: ["con-lai"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openRecv("con-lai"),
      openRecv("da-go"),                          // mồ côi → hủy
      openRecv("da-go-frozen", { frozenAt: "2026-10-02T00:00:00Z" }), // đã gửi → giữ
      openRecv("lop-khac", { classId: "class-import-khac", billKey: "month|class-import-khac|2026-10" }), // lớp không có trong ds → giữ
    ],
    paymentOrders: [],
  };
  const next = syncTuitionReceivables(ledger as any, [cls], [student("con-lai", "Còn Lại"), student("da-go", "Đã Gỡ"), student("da-go-frozen", "Đã Gỡ Frozen"), student("lop-khac", "Lớp Khác")], [], NOW);
  assert.equal(next.receivables.find((r) => r.studentId === "da-go")?.status, "CANCELLED");
  assert.equal(next.receivables.find((r) => r.studentId === "da-go-frozen")?.status, "OPEN", "phiếu đã gửi không tự hủy");
  assert.equal(next.receivables.find((r) => r.studentId === "lop-khac")?.status, "OPEN", "lớp ngoài danh sách không động vào");
  assert.equal(next.receivables.find((r) => r.studentId === "con-lai")?.status, "OPEN");
});

test("T5 tháng 10: 8 buổi tự nhiên 480k; Phúc Huỳnh nợ cũ 480k", () => {
  const quote = tuitionCollectionCharge(paidThrough(T5_CLASS_ID, student("paid", "Học viên")), T5, [], emptySepayLedger(), NOW);
  assert.equal(quote.items[0]?.originalBilled, 8);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 480_000);
  const phuc = tuitionCollectionCharge(student("phuc-huynh", "Phúc Huỳnh", "HV0626"), T5, [], emptySepayLedger(), NOW);
  assert.equal(phuc.oldDebtAmount, 480_000);
  assert.equal(phuc.amount, 960_000);
  const tai = tuitionCollectionCharge(student("phan-tai", "Phan Tài", "HV0956"), T5, [], emptySepayLedger(), NOW);
  assert.equal(tai.oldDebtAmount, 120_000);
  assert.equal(tai.amount, 600_000);
  assert.equal(t5PreviousMonthDebtAmount(student("khac", "Lương Danh", "HV0620"), T5, ["2026-10"]), 0);
});

test("T9 tháng 10: 9 suất trừ 1 buổi nghỉ = 480k; 4 bạn nợ cũ", () => {
  const quote = tuitionCollectionCharge(paidThrough(T9_CLASS_ID, student("paid", "Học viên")), T9, [], emptySepayLedger(), NOW);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 1);
  assert.equal(quote.amount, 480_000);
  for (const [id, name, code, debt] of [
    ["quynh-tho", "Nguyễn Thị Quỳnh Thơ", "HV0681", 480_000],
    ["hoang-anh-thu", "Hoàng Phan Anh Thư", "HV0686", 480_000],
    ["ho-anh-thu", "Hồ Ngọc Anh Thư", "HV0684", 480_000],
    ["phan-anh-thu", "Phan Nguyễn Anh Thư", "HV0672", 420_000],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T9, [], emptySepayLedger(), NOW);
    assert.equal(q.oldDebtAmount, debt, name);
    assert.equal(q.amount, 480_000 + debt, name);
  }
  // Tên gần giống nhưng khác mã thì không được cộng nợ.
  assert.equal(t9PreviousMonthDebtAmount(student("khac", "Trần Anh Thư", "HV0698"), T9, ["2026-10"]), 0);
  assert.equal(t9OctoberMinimumCreditSessions(student("a", "Ai"), T10, "2026-10"), 0);
});

test("T10 tháng 10: 9 buổi 450k không khấu trừ; Anh Quân 2.844k, Thế Anh 800k", () => {
  const quote = tuitionCollectionCharge(paidThrough(T10_CLASS_ID, student("paid", "Học viên")), T10, [], emptySepayLedger(), NOW);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 450_000);
  for (const [id, name, code, total] of [
    ["anh-quan", "Anh Quân", "HV0699", 2_844_000],
    ["the-anh", "Hoàng Đình Thế Anh", "HV0706", 800_000],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T10, [], emptySepayLedger(), NOW);
    assert.equal(q.oldDebtAmount, total - 450_000, name);
    assert.equal(q.amount, total, name);
  }
  assert.equal(t10PreviousMonthDebtAmount(student("khac", "Phan Đăng Khôi", "HV0690"), T10, ["2026-10"]), 0);
});

test("T11 tháng 10 sửa lại: 9 suất không khấu trừ = 450k; 4 bạn nợ cũ 350k → 800k", () => {
  const quote = tuitionCollectionCharge(paidThrough(T11_CLASS_ID, student("paid", "Học viên")), T11, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 450_000);
  for (const [id, name, code] of [
    ["bao-tram", "Bảo Trâm", "HV0727"],
    ["bao-trang", "Bảo Trang", "HV0728"],
    ["thao-dan", "Thảo Đantp", "HV0729"],
    ["dai-hoang", "Nguyễn Đại Hoàng", "HV0940"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T11, [], emptySepayLedger(), NOW);
    assert.equal(q.oldDebtAmount, 350_000, name);
    assert.equal(q.amount, 800_000, name);
  }
  // Bạn chưa thu T9 không có nợ cũ vẫn chỉ thu 450k (months=[T10]).
  const unpaid = tuitionCollectionCharge(student("unpaid", "Trương Thị Khánh Ngọc", "HV0721"), T11, [], emptySepayLedger(), NOW);
  assert.deepEqual(unpaid.months, ["2026-10"]);
  assert.equal(unpaid.amount, 450_000);
  assert.equal(t11PreviousMonthDebtAmount(student("khac", "Ngô Phương Linh", "HV0714"), T11, ["2026-10"]), 0);
  assert.equal(t11OctoberMinimumCreditSessions(student("a", "Ai"), T10, "2026-10"), 0, "khấu trừ không lan sang lớp khác");
});
