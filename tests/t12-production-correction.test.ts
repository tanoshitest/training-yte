import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T12_CLASS_ID, t12PreviousMonthDebtAmount } from "../cloudflare/t12-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T12 thật: T2 17:00 + T4 14:30, 50k/buổi → tháng 10 có đúng 8 suất. */
const T12 = ((): DemoClass => ({
  id: T12_CLASS_ID, code: "T12", name: "T12- 2017-4.1",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 50_000,
  schedules: [
    { weekday: 1, periodId: "mon", startTime: "17:00", endTime: "19:00" },
    { weekday: 3, periodId: "wed", startTime: "14:30", endTime: "16:30" },
  ],
  note: "", billingEnabled: false,
}))();

test("T12 tháng 10: 8 buổi 400k không khấu trừ, học viên thường chỉ thu 400k", () => {
  const quote = tuitionCollectionCharge(student("thuong", "Phan Quốc Bảo An", "HV0731"), T12, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 8);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 400_000);
});

test("T12 nợ cũ tháng 10: Hạ An, Ngọc Hân, Gia Hân +350k = 750k", () => {
  for (const [id, name, code] of [
    ["ha-an", "Hạ An", "HV0730"],
    ["ngoc-han", "Hồ Ngọc Hân", "HV0735"],
    ["gia-han", "Ngô Gia Hân", "HV0736"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T12, [], emptySepayLedger(), NOW);
    assert.equal(q.oldDebtAmount, 350_000, name);
    assert.equal(q.amount, 750_000, name);
  }
  // Bạn khác không được cộng nợ — chỉ khớp theo mã, kể cả Gia Huy.
  assert.equal(t12PreviousMonthDebtAmount(student("bao-an", "Phan Quốc Bảo An", "HV0731"), T12, ["2026-10"]), 0);
  assert.equal(t12PreviousMonthDebtAmount(student("gia-huy", "Gia Huy", "HV0748"), T12, ["2026-10"]), 0);
  assert.equal(t12PreviousMonthDebtAmount(student("khanh-chi", "Khánh Chi", "HV0747"), T12, ["2026-10"]), 0);
  assert.equal(t12PreviousMonthDebtAmount(student("ha-an", "Hạ An", "HV0730"), T12, ["2026-11"]), 0);
  assert.equal(t12PreviousMonthDebtAmount(student("ha-an", "Hạ An", "HV0730"), { id: "class-import-t11" }, ["2026-10"]), 0);
});

function openReceivable(studentId: string, months: string, amount = 400_000): SepayReceivable {
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
    classId: T12_CLASS_ID,
    billKey: `month|${T12_CLASS_ID}|${months}`,
  };
}

test("T12: phiếu tháng 9 sót không được đếm kép vào công nợ", () => {
  // Production sót phiếu T9 OPEN → báo giá vẫn chỉ tính T10 + nợ cũ.
  const ledger = {
    ...emptySepayLedger(),
    receivables: [openReceivable("ha-an", "2026-09")],
    paymentOrders: [{ id: "order-ha-an-2026-09", receivableId: "recv-ha-an-2026-09", status: "ACTIVE", paymentCode: "X", amount: 0, qrImage: "", qrContent: "" }],
  };
  const target = student("ha-an", "Hạ An", "HV0730");
  const q = tuitionCollectionCharge(target, T12, [], ledger as any, NOW);
  assert.deepEqual(q.months, ["2026-10"], "tháng 9 đã được dòng nợ thay thế");
  assert.equal(q.amount, 750_000, "T10 400k + nợ 350k, không cộng lại T9");

  const giaHuy = tuitionCollectionCharge(student("gia-huy", "Gia Huy", "HV0748"), T12, [], ledger as any, NOW);
  assert.equal(giaHuy.amount, 400_000, "Gia Huy chỉ thu T10 — phiếu T9 sót bị bỏ qua");
});

test("T12: sync hủy phiếu tháng 9 sót của 4 bạn đã thay bằng nợ cũ", () => {
  const cls = { ...T12, billingEnabled: true, studentIds: ["ha-an", "gia-huy"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("ha-an", "2026-09"),
      openReceivable("ha-an", "2026-10", 750_000),
      openReceivable("gia-huy", "2026-09"),
      openReceivable("gia-huy", "2026-10"),
    ],
    paymentOrders: [],
  };
  const students = [student("ha-an", "Hạ An", "HV0730"), student("gia-huy", "Gia Huy", "HV0748")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T12_CLASS_ID}|${month}`);
  assert.equal(byBill("ha-an", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — nợ nằm trong phiếu T10");
  assert.equal(byBill("ha-an", "2026-10")?.amountDue, 750_000);
  assert.equal(byBill("gia-huy", "2026-09")?.status, "CANCELLED", "Gia Huy theo Excel không còn nợ T9");
  assert.equal(byBill("gia-huy", "2026-10")?.amountDue, 400_000);
});
