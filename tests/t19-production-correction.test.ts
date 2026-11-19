import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T19_CLASS_ID, T19_DANG_KHOI_STUDENT_ID, t19PreviousMonthDebtAmount } from "../cloudflare/t19-production-correction";
import { collectManualTuition, monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T19 thật: T3 17:00 + CN 16:30, 60k/buổi → tháng 10 có đúng 8 suất. */
const T19 = ((): DemoClass => ({
  id: T19_CLASS_ID, code: "T19", name: "T19-2019 mới",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 0, periodId: "sun", startTime: "16:30", endTime: "18:30" },
  ],
  note: "", billingEnabled: false,
}))();

test("T19 tháng 10: 8 suất × 60k = 480k cho 15 bạn không nợ — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("tien-phong", "Bùi Tiến Phong", "HV0839"), T19, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 8);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 8);
  assert.equal(quote.amount, 480_000);
});

test("T19 nợ cũ tháng 10: Bảo Lâm & Đăng Khôi +480k → 960k mỗi bạn", () => {
  for (const [id, name, code] of [
    ["bao-lam", "Phạm Bảo Lâm", "HV0843"],
    ["dang-khoi", "Nguyễn Hữu Đăng Khôi", "HV0840"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T19, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 960_000, name);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t19PreviousMonthDebtAmount(student("bl", "BL", "HV0843"), T19, ["2026-11"]), 0);
  assert.equal(t19PreviousMonthDebtAmount(student("bl", "BL", "HV0843"), { id: "class-import-t18" }, ["2026-10"]), 0);
});

test("T19 Đăng Khôi đã CK 960k: thu tay ghi nhận phiếu PAID đúng 960k, còn nợ 0", () => {
  const khoi = student(T19_DANG_KHOI_STUDENT_ID, "Nguyễn Hữu Đăng Khôi", "HV0840");
  const cls = { ...T19, billingEnabled: true, studentIds: [khoi.id] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [openReceivable(khoi.id, "2026-10", 480_000)],
    paymentOrders: [],
  };
  const result = collectManualTuition({
    ledger: ledger as any,
    student: khoi,
    cls,
    sessions: [],
    method: "TRANSFER",
    note: "Đã chuyển khoản ngày 01/10",
    now: new Date("2026-10-01T09:00:00+07:00"),
  });
  assert.ok(!("error" in result), "thu phải thành công");
  assert.equal(result.charge.amount, 960_000);
  assert.equal(result.receivable.amountDue, 960_000);
  assert.equal(result.receivable.status, "PAID");
  assert.equal(result.receivable.balanceDue, 0);
  assert.equal(result.paidThroughMonth, "2026-10");
  assert.equal(result.payment.amount, 960_000);
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
    classId: T19_CLASS_ID,
    billKey: `month|${T19_CLASS_ID}|${months}`,
  };
}

test("T19: khoản tháng trước sót trên production không đếm kép vào công nợ của 17 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("bao-lam", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("bao-lam", "Phạm Bảo Lâm", "HV0843"), T19, [], ledger as any, NOW).amount, 960_000);
  // Bạn ngoài danh sách 17 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0900"), T19, [], ledger as any, NOW).amount, 480_000);
});

test("T19: sync hủy phiếu tháng trước sót của 17 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T19, billingEnabled: true, studentIds: ["bao-lam", "tien-phong"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("bao-lam", "2026-09"),
      openReceivable("bao-lam", "2026-10", 960_000),
      openReceivable("tien-phong", "2026-09"),
      openReceivable("tien-phong", "2026-10", 480_000),
    ],
    paymentOrders: [],
  };
  const students = [student("bao-lam", "Phạm Bảo Lâm", "HV0843"), student("tien-phong", "Bùi Tiến Phong", "HV0839")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T19_CLASS_ID}|${month}`);
  assert.equal(byBill("bao-lam", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — nợ nằm trong dòng nợ cũ");
  assert.equal(byBill("bao-lam", "2026-10")?.amountDue, 960_000);
  assert.equal(byBill("tien-phong", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("tien-phong", "2026-10")?.amountDue, 480_000);
});

test("T19 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T19, billingEnabled: true, studentIds: ["bao-lam", "khac"] };
  const baoLam = { ...student("bao-lam", "Phạm Bảo Lâm", "HV0843"), classJoinedAt: { [T19_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 1 buổi T10 (04/10 CN); nợ cũ 480k = 8 buổi.
  assert.equal(monthlyRemainingSessions(baoLam, cls, [], emptySepayLedger(), NOW), -(1 + 8));
  // Đóng phiếu T10 gộp nợ (960k = 8 buổi tháng + 8 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidLam = { ...baoLam, tuitionPaidThrough: { [T19_CLASS_ID]: "2026-10" } };
  assert.equal(monthlyRemainingSessions(paidLam, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0900"), tuitionPaidThrough: { [T19_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -1);
});
