import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T18_CLASS_ID, t18PreviousMonthDebtAmount } from "../cloudflare/t18-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T18 thật: T5 17:00 + T7 16:30, 65k/buổi → tháng 10 có đúng 10 suất. */
const T18 = ((): DemoClass => ({
  id: T18_CLASS_ID, code: "T18", name: "T18-2019-2.1",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 65_000,
  schedules: [
    { weekday: 4, periodId: "thu", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "16:30", endTime: "18:30" },
  ],
  note: "", billingEnabled: false,
}))();

test("T18 tháng 10: 10 suất × 65k = 650k cho 12 bạn không nợ — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("bao-an", "Bảo An", "HV0824"), T18, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 10);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 10);
  assert.equal(quote.amount, 650_000);
});

test("T18 nợ cũ tháng 10: Bảo Hân/Anh Thơ/Hà Phương +455k → 1.105k; Tuệ An +2.839k → 3.489k", () => {
  for (const [id, name, code] of [
    ["bao-han", "Châu Hồ Bảo Hân", "HV0826"],
    ["anh-tho", "Hoàng Phan Anh Thơ", "HV0836"],
    ["ha-phuong", "Hà Phương", "HV0838"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T18, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 1_105_000, name);
  }
  const tueAn = tuitionCollectionCharge(student("tue-an", "Nguyễn Ngọc Tuệ An", "HV0834"), T18, [], emptySepayLedger(), NOW);
  assert.equal(tueAn.amount, 3_489_000);
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t18PreviousMonthDebtAmount(student("bh", "BH", "HV0826"), T18, ["2026-11"]), 0);
  assert.equal(t18PreviousMonthDebtAmount(student("bh", "BH", "HV0826"), { id: "class-import-t17" }, ["2026-10"]), 0);
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
    classId: T18_CLASS_ID,
    billKey: `month|${T18_CLASS_ID}|${months}`,
  };
}

test("T18: khoản tháng trước sót trên production không đếm kép vào công nợ của 16 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("bao-an", "2026-09"),
      openReceivable("tue-an", "2026-08"),
      openReceivable("tue-an", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("bao-an", "Bảo An", "HV0824"), T18, [], ledger as any, NOW).amount, 650_000);
  assert.equal(tuitionCollectionCharge(student("tue-an", "Nguyễn Ngọc Tuệ An", "HV0834"), T18, [], ledger as any, NOW).amount, 3_489_000);
  // Bạn ngoài danh sách 16 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0850"), T18, [], ledger as any, NOW).amount, 650_000);
});

test("T18: sync hủy phiếu tháng trước sót của 16 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T18, billingEnabled: true, studentIds: ["bao-an", "tue-an"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("bao-an", "2026-09"),
      openReceivable("bao-an", "2026-10", 650_000),
      openReceivable("tue-an", "2026-09"),
      openReceivable("tue-an", "2026-10", 3_489_000),
    ],
    paymentOrders: [],
  };
  const students = [student("bao-an", "Bảo An", "HV0824"), student("tue-an", "Nguyễn Ngọc Tuệ An", "HV0834")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T18_CLASS_ID}|${month}`);
  assert.equal(byBill("bao-an", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ T10");
  assert.equal(byBill("bao-an", "2026-10")?.amountDue, 650_000);
  assert.equal(byBill("tue-an", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("tue-an", "2026-10")?.amountDue, 3_489_000);
});

test("T18 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T18, billingEnabled: true, studentIds: ["bao-han", "khac"] };
  const baoHan = { ...student("bao-han", "Châu Hồ Bảo Hân", "HV0826"), classJoinedAt: { [T18_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 2 buổi T10 (01/10 T5 + 03/10 T7); nợ cũ 455k = 7 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 7 buổi nợ.
  assert.equal(monthlyRemainingSessions(baoHan, cls, [], emptySepayLedger(), NOW), -(2 + 7));
  // Đóng phiếu T10 gộp nợ (1.105k = 10 buổi tháng + 7 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidHan = { ...baoHan, tuitionPaidThrough: { [T18_CLASS_ID]: "2026-10" } };
  assert.equal(monthlyRemainingSessions(paidHan, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0850"), tuitionPaidThrough: { [T18_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -2);
});
