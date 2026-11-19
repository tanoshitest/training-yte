import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T13_CLASS_ID, t13PreviousMonthDebtAmount } from "../cloudflare/t13-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T13 thật: T4 16:30 + T7 07:00, 50k/buổi → tháng 10 có đúng 9 suất. */
const T13 = ((): DemoClass => ({
  id: T13_CLASS_ID, code: "T13", name: "T13-2017-3.2",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 50_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "16:30", endTime: "18:30" },
    { weekday: 6, periodId: "sat", startTime: "07:00", endTime: "09:00" },
  ],
  note: "", billingEnabled: false,
}))();

test("T13 tháng 10: 9 suất − 1 buổi bù = 8 buổi 400k cho mọi học viên", () => {
  const quote = tuitionCollectionCharge(student("thuong", "Phí Lê Mạnh Hùng", "HV0750"), T13, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 1);
  assert.equal(quote.items[0]?.billed, 8);
  assert.equal(quote.amount, 400_000);
});

test("T13 nợ cũ tháng 10: Gia Hân/Tuệ Nhi/Nhật Quang +350k, Ngọc Lê +1.400k", () => {
  for (const [id, name, code, total] of [
    ["gia-han", "Nguyễn Gia Hân", "HV0749", 750_000],
    ["ngoc-le", "Ngọc Lê", "HV0752", 1_800_000],
    ["tue-nhi", "Hồ Nguyễn Tuệ Nhi", "HV0759", 750_000],
    ["nhat-quang", "Nhật Quang", "HV0763", 750_000],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T13, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, total, name);
  }
  // Trương Gia Hân cùng tên "Gia Hân" nhưng không nợ — chỉ khớp mã.
  const truong = tuitionCollectionCharge(student("truong-gia-han", "Trương Gia Hân", "HV0758"), T13, [], emptySepayLedger(), NOW);
  assert.equal(truong.amount, 400_000);
  assert.equal(t13PreviousMonthDebtAmount(student("truong-gia-han", "Trương Gia Hân", "HV0758"), T13, ["2026-10"]), 0);
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t13PreviousMonthDebtAmount(student("gia-han", "Nguyễn Gia Hân", "HV0749"), T13, ["2026-11"]), 0);
  assert.equal(t13PreviousMonthDebtAmount(student("gia-han", "Nguyễn Gia Hân", "HV0749"), { id: "class-import-t12" }, ["2026-10"]), 0);
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
    classId: T13_CLASS_ID,
    billKey: `month|${T13_CLASS_ID}|${months}`,
  };
}

test("T13: khoản tháng trước sót trên production không đếm kép vào công nợ của 8 bạn", () => {
  // 8 bạn Excel đã chốt "Còn lại" — phiếu tháng trước OPEN sót (+500k) bị loại.
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("manh-hung", "2026-09"),
      openReceivable("gia-han", "2026-09"),
      openReceivable("ngoc-le", "2026-08"),
      openReceivable("khoi-nguyen", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("manh-hung", "Phí Lê Mạnh Hùng", "HV0750"), T13, [], ledger as any, NOW).amount, 400_000);
  assert.equal(tuitionCollectionCharge(student("gia-han", "Nguyễn Gia Hân", "HV0749"), T13, [], ledger as any, NOW).amount, 750_000);
  assert.equal(tuitionCollectionCharge(student("ngoc-le", "Ngọc Lê", "HV0752"), T13, [], ledger as any, NOW).amount, 1_800_000);
  // Bạn ngoài danh sách 8 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("khoi-nguyen", "Khôi Nguyên", "HV0753"), T13, [], ledger as any, NOW).amount, 400_000);
});

test("T13: sync hủy phiếu tháng trước sót của 8 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T13, billingEnabled: true, studentIds: ["manh-hung", "gia-han"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("manh-hung", "2026-09"),
      openReceivable("manh-hung", "2026-10", 400_000),
      openReceivable("gia-han", "2026-09"),
      openReceivable("gia-han", "2026-10", 750_000),
    ],
    paymentOrders: [],
  };
  const students = [student("manh-hung", "Phí Lê Mạnh Hùng", "HV0750"), student("gia-han", "Nguyễn Gia Hân", "HV0749")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T13_CLASS_ID}|${month}`);
  assert.equal(byBill("manh-hung", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ T10");
  assert.equal(byBill("manh-hung", "2026-10")?.amountDue, 400_000);
  assert.equal(byBill("gia-han", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("gia-han", "2026-10")?.amountDue, 750_000);
});

test("T13 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T13, billingEnabled: true, studentIds: ["gia-han", "khac"] };
  const giaHan = { ...student("gia-han", "Nguyễn Gia Hân", "HV0749"), classJoinedAt: { [T13_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 1 buổi T10 (02/10 T7); nợ cũ 350k = 7 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 7 buổi nợ.
  assert.equal(monthlyRemainingSessions(giaHan, cls, [], emptySepayLedger(), NOW), -(1 + 7));
  // Đóng phiếu T10 gộp nợ (750k = 8 buổi tháng + 7 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidHan = { ...giaHan, tuitionPaidThrough: { [T13_CLASS_ID]: "2026-10" } };
  const octSlots = 9; // toàn bộ suất lịch tháng 10 đã được thu kèm nợ
  assert.equal(monthlyRemainingSessions(paidHan, cls, [], emptySepayLedger(), NOW), octSlots + 7 - (1 + 7));
  assert.equal(monthlyRemainingSessions(paidHan, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0780"), tuitionPaidThrough: { [T13_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -1);
});
