import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T17_CLASS_ID, t17PreviousMonthDebtAmount } from "../cloudflare/t17-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T17 thật: T4 17:00 + CN 07:30, 60k/buổi → tháng 10 có đúng 8 suất. */
const T17 = ((): DemoClass => ({
  id: T17_CLASS_ID, code: "T17", name: "T17-2018-3.3",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" },
    { weekday: 0, periodId: "sun", startTime: "07:30", endTime: "09:00" },
  ],
  note: "", billingEnabled: false,
}))();

const DEBT_CODES = ["HV0810", "HV0811", "HV0812", "HV0813", "HV0815", "HV0816", "HV0817", "HV0818", "HV0819", "HV0822"];

test("T17 tháng 10: 8 suất × 60k − khấu trừ 3 buổi = 300k cho Minh Đức (không nợ)", () => {
  const quote = tuitionCollectionCharge(student("minh-duc", "Minh Đức", "HV0820"), T17, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 8);
  assert.equal(quote.creditSessions, 3);
  assert.equal(quote.items[0]?.billed, 5);
  assert.equal(quote.amount, 300_000);
});

test("T17 tháng 10: 10 bạn có nợ cũ 480k → thu 780k mỗi bạn", () => {
  for (const code of DEBT_CODES) {
    const q = tuitionCollectionCharge(student(`s-${code}`, `Học viên ${code}`, code), T17, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 780_000, code);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t17PreviousMonthDebtAmount(student("s", "S", "HV0810"), T17, ["2026-11"]), 0);
  assert.equal(t17PreviousMonthDebtAmount(student("s", "S", "HV0810"), { id: "class-import-t16" }, ["2026-10"]), 0);
  // Minh Đức không có nợ cũ.
  assert.equal(t17PreviousMonthDebtAmount(student("md", "Minh Đức", "HV0820"), T17, ["2026-10"]), 0);
});

function openReceivable(studentId: string, months: string, amount = 500_000): SepayReceivable {
  return {
    id: `recv-${studentId}-${months}`,
    receivableCode: "PT-TEST",
    studentId,
    studentName: "",
    billingPeriod: `Tháng ${months}`,
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    amountDue: amount,
    amountPaid: 0,
    balanceDue: amount,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: `order-${studentId}-${months}`,
    classId: T17_CLASS_ID,
    billKey: `month|${T17_CLASS_ID}|${months}`,
  };
}

test("T17: khoản tháng trước sót trên production không đếm kép vào công nợ của 11 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("s1", "2026-09"),
      openReceivable("md", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("s1", "Ngô Đức Nhân", "HV0818"), T17, [], ledger as any, NOW).amount, 780_000);
  assert.equal(tuitionCollectionCharge(student("md", "Minh Đức", "HV0820"), T17, [], ledger as any, NOW).amount, 300_000);
  // Bạn ngoài danh sách 11 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0850"), T17, [], ledger as any, NOW).amount, 780_000);
});

test("T17: sync hủy phiếu tháng trước sót của 11 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T17, billingEnabled: true, studentIds: ["s-nhan", "md"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("s-nhan", "2026-09"),
      openReceivable("s-nhan", "2026-10", 780_000),
      openReceivable("md", "2026-09"),
      openReceivable("md", "2026-10", 300_000),
    ],
    paymentOrders: [],
  };
  const students = [student("s-nhan", "Ngô Đức Nhân", "HV0818"), student("md", "Minh Đức", "HV0820")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T17_CLASS_ID}|${month}`);
  assert.equal(byBill("s-nhan", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ trong dòng nợ cũ");
  assert.equal(byBill("s-nhan", "2026-10")?.amountDue, 780_000);
  assert.equal(byBill("md", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("md", "2026-10")?.amountDue, 300_000);
});

test("T17 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T17, billingEnabled: true, studentIds: ["s-nhan", "md"] };
  const nhan = { ...student("s-nhan", "Ngô Đức Nhân", "HV0818"), classJoinedAt: { [T17_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 1 buổi T10 (04/10 CN); nợ cũ 480k = 8 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 8 buổi nợ.
  assert.equal(monthlyRemainingSessions(nhan, cls, [], emptySepayLedger(), NOW), -(1 + 8));
  // Đóng phiếu T10 gộp nợ (780k = 5 buổi tháng sau trừ + 8 buổi nợ): tồn nhảy
  // dương rồi trừ dần về 0 khi học hết tháng.
  const paidNhan = { ...nhan, tuitionPaidThrough: { [T17_CLASS_ID]: "2026-10" } };
  assert.equal(monthlyRemainingSessions(paidNhan, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Minh Đức không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const md = { ...student("md", "Minh Đức", "HV0820"), tuitionPaidThrough: { [T17_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(md, cls, [], emptySepayLedger(), NOW), -1);
});
