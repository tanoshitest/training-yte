import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T23_CLASS_ID, t23PreviousMonthDebtAmount } from "../cloudflare/t23-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T23 thật: T4 17:30 + T7 09:30, 60k/buổi → tháng 10 có đúng 9 suất. */
const T23 = ((): DemoClass => ({
  id: T23_CLASS_ID, code: "T23", name: "T23-2020-1.2",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "17:30", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "09:30", endTime: "11:00" },
  ],
  note: "", billingEnabled: false,
}))();

function openReceivable(studentId: string, months: string, amount = 540_000): SepayReceivable {
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
    classId: T23_CLASS_ID,
    billKey: `month|${T23_CLASS_ID}|${months}`,
  };
}

test("T23 tháng 10: 9 suất × 60k = 540k cho 11 bạn không nợ — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("minh-quan", "Nguyễn Văn Minh Quân", "HV0911"), T23, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 9);
  assert.equal(quote.items[0]?.amount, 540_000);
  assert.equal(quote.amount, 540_000);
  assert.equal(quote.oldDebtAmount, 0);
});

test("T23 nợ cũ tháng 10: Quỳnh Anh, Khả Di, Bảo Khang, Anh Thư +480k → 1.020k", () => {
  for (const [id, name, code] of [
    ["quynh-anh", "Nguyễn Quỳnh Anh", "HV0907"],
    ["kha-di", "Trương Khả Di", "HV0910"],
    ["bao-khang", "Nguyễn Dương Bảo Khang", "HV0917"],
    ["anh-thu", "Anh Thư", "HV0921"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T23, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 1_020_000, name);
    assert.equal(q.oldDebtAmount, 480_000);
    assert.equal(q.billed, 9);
    assert.equal(q.creditSessions, 0);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t23PreviousMonthDebtAmount(student("qa", "QA", "HV0907"), T23, ["2026-11"]), 0);
  assert.equal(t23PreviousMonthDebtAmount(student("qa", "QA", "HV0907"), { id: "class-import-t22" }, ["2026-10"]), 0);
});

test("T23: Uyên Nhi chỉ thu 540k tháng 10 — không còn nợ cũ", () => {
  const q = tuitionCollectionCharge(student("uyen-nhi", "Dương Ngọc Uyên Nhi", "HV0908"), T23, [], emptySepayLedger(), NOW);
  assert.equal(q.amount, 540_000);
  assert.equal(q.oldDebtAmount, 0);
});

test("T23: khoản tháng trước sót trên production không đếm kép vào công nợ của 16 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("quynh-anh", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("quynh-anh", "Nguyễn Quỳnh Anh", "HV0907"), T23, [], ledger as any, NOW).amount, 1_020_000);
  // Bạn ngoài danh sách 16 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0950"), T23, [], ledger as any, NOW).amount, 540_000);
});

test("T23: sync hủy phiếu tháng trước sót của 16 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T23, billingEnabled: true, studentIds: ["quynh-anh", "minh-quan"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("quynh-anh", "2026-09"),
      openReceivable("quynh-anh", "2026-10", 1_020_000),
      openReceivable("minh-quan", "2026-09"),
      openReceivable("minh-quan", "2026-10", 540_000),
    ],
    paymentOrders: [],
  };
  const students = [
    student("quynh-anh", "Nguyễn Quỳnh Anh", "HV0907"),
    student("minh-quan", "Nguyễn Văn Minh Quân", "HV0911"),
  ];
  const synced = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byId = new Map(synced.receivables.map((r: any) => [r.id, r]));
  for (const id of ["recv-quynh-anh-2026-09", "recv-minh-quan-2026-09"]) {
    assert.equal((byId.get(id) as any)?.status, "CANCELLED", id);
    assert.equal((byId.get(id) as any)?.balanceDue, 0);
  }
  assert.equal((byId.get("recv-quynh-anh-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-quynh-anh-2026-10") as any)?.amountDue, 1_020_000);
  assert.equal((byId.get("recv-minh-quan-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-minh-quan-2026-10") as any)?.amountDue, 540_000);
});
