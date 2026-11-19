import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T16_CLASS_ID, t16PreviousMonthDebtAmount } from "../cloudflare/t16-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T16 thật: T4 07:00 + T6 18:30, 60k/buổi → tháng 10 có đúng 9 suất. */
const T16 = ((): DemoClass => ({
  id: T16_CLASS_ID, code: "T16", name: "T16-2018- 3.2",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "07:00", endTime: "09:00" },
    { weekday: 5, periodId: "fri", startTime: "18:30", endTime: "20:30" },
  ],
  note: "", billingEnabled: false,
}))();

test("T16 tháng 10: 9 suất × 60k = 540k cho mọi học viên — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("dan-thu", "Nguyễn Đan Thư", "HV0791"), T16, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 9);
  assert.equal(quote.amount, 540_000);
});

test("T16 nợ cũ tháng 10: Đăng Khoa, Tuệ Lâm, Nguyên Khôi, Ngọc Tuyền, Hạo Doanh +480k mỗi bạn", () => {
  for (const [id, name, code] of [
    ["dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800"],
    ["tue-lam", "Trần Tuệ Lâm", "HV0801"],
    ["nguyen-khoi", "Nguyễn Nguyên Khôi", "HV0796"],
    ["ngoc-tuyen", "Ngoc Tuyen", "HV0804"],
    ["hao-doanh", "Trần Hạo Doanh", "HV0803"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T16, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 1_020_000, name);
  }
  // Các bạn còn lại chỉ thu 540k — kể cả bạn Excel ghi "-" trong cột nợ cũ.
  for (const [id, name, code] of [
    ["gia-han", "Gia Hân", "HV0792"],
    ["gia-bao", "Nguyễn Quốc Gia Bảo", "HV0807"],
    ["duy-khang", "Duy Khang", "HV0821"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T16, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 540_000, name);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t16PreviousMonthDebtAmount(student("dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800"), T16, ["2026-11"]), 0);
  assert.equal(t16PreviousMonthDebtAmount(student("dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800"), { id: "class-import-t15" }, ["2026-10"]), 0);
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
    classId: T16_CLASS_ID,
    billKey: `month|${T16_CLASS_ID}|${months}`,
  };
}

test("T16: khoản tháng trước sót trên production không đếm kép vào công nợ của 21 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("dan-thu", "2026-09"),
      openReceivable("dang-khoa", "2026-09"),
      openReceivable("ngoc-tuyen", "2026-08"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("dan-thu", "Nguyễn Đan Thư", "HV0791"), T16, [], ledger as any, NOW).amount, 540_000);
  assert.equal(tuitionCollectionCharge(student("dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800"), T16, [], ledger as any, NOW).amount, 1_020_000);
  assert.equal(tuitionCollectionCharge(student("ngoc-tuyen", "Ngoc Tuyen", "HV0804"), T16, [], ledger as any, NOW).amount, 1_020_000);
  // Bạn ngoài danh sách 21 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0850"), T16, [], ledger as any, NOW).amount, 540_000);
});

test("T16: sync hủy phiếu tháng trước sót của 21 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T16, billingEnabled: true, studentIds: ["dan-thu", "dang-khoa"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("dan-thu", "2026-09"),
      openReceivable("dan-thu", "2026-10", 540_000),
      openReceivable("dang-khoa", "2026-09"),
      openReceivable("dang-khoa", "2026-10", 1_020_000),
    ],
    paymentOrders: [],
  };
  const students = [student("dan-thu", "Nguyễn Đan Thư", "HV0791"), student("dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T16_CLASS_ID}|${month}`);
  assert.equal(byBill("dan-thu", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ T10");
  assert.equal(byBill("dan-thu", "2026-10")?.amountDue, 540_000);
  assert.equal(byBill("dang-khoa", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("dang-khoa", "2026-10")?.amountDue, 1_020_000);
});

test("T16 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T16, billingEnabled: true, studentIds: ["dang-khoa", "khac"] };
  const dangKhoa = { ...student("dang-khoa", "Hoàng Đình Đăng Khoa", "HV0800"), classJoinedAt: { [T16_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 1 buổi T10 (02/10 T6); nợ cũ 480k = 8 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 8 buổi nợ.
  assert.equal(monthlyRemainingSessions(dangKhoa, cls, [], emptySepayLedger(), NOW), -(1 + 8));
  // Đóng phiếu T10 gộp nợ (1.020k = 9 buổi tháng + 8 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidKhoa = { ...dangKhoa, tuitionPaidThrough: { [T16_CLASS_ID]: "2026-10" } };
  const octSlots = 9;
  assert.equal(monthlyRemainingSessions(paidKhoa, cls, [], emptySepayLedger(), NOW), octSlots + 8 - (1 + 8));
  assert.equal(monthlyRemainingSessions(paidKhoa, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0850"), tuitionPaidThrough: { [T16_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -1);
});
