import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T21_CLASS_ID, t21PreviousMonthDebtAmount } from "../cloudflare/t21-production-correction";
import { T22_CLASS_ID } from "../cloudflare/t22-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T21 thật: T6 17:00 + CN 16:30, 50k/buổi → tháng 10 có đúng 9 suất. */
const T21 = ((): DemoClass => ({
  id: T21_CLASS_ID, code: "T21", name: "T21-2017-3.3",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 50_000,
  schedules: [
    { weekday: 5, periodId: "fri", startTime: "17:00", endTime: "19:00" },
    { weekday: 0, periodId: "sun", startTime: "16:30", endTime: "18:30" },
  ],
  note: "", billingEnabled: false,
}))();

/** T22 thật: T4 19:00 + T7 08:00, 60k/buổi → tháng 10 có đúng 9 suất. */
const T22 = ((): DemoClass => ({
  id: T22_CLASS_ID, code: "T22", name: "T22-2020- 1.1",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "19:00", endTime: "20:30" },
    { weekday: 6, periodId: "sat", startTime: "08:00", endTime: "09:30" },
  ],
  note: "", billingEnabled: false,
}))();

function openReceivable(studentId: string, clsId: string, months: string, amount: number): SepayReceivable {
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
    classId: clsId,
    billKey: `month|${clsId}|${months}`,
  };
}

test("T21 tháng 10: 9 suất × 50k = 450k cho 20 bạn không nợ — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("bao-khoi", "Trần Bảo Khôi", "HV0877"), T21, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 9);
  assert.equal(quote.items[0]?.amount, 450_000);
  assert.equal(quote.amount, 450_000);
  assert.equal(quote.oldDebtAmount, 0);
});

test("T21 nợ cũ tháng 10: Gia Phú +450k → 900k", () => {
  const q = tuitionCollectionCharge(student("gia-phu", "Gia Phú", "HV0881"), T21, [], emptySepayLedger(), NOW);
  assert.equal(q.amount, 900_000);
  assert.equal(q.oldDebtAmount, 450_000);
  assert.equal(q.billed, 9);
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t21PreviousMonthDebtAmount(student("gp", "GP", "HV0881"), T21, ["2026-11"]), 0);
  assert.equal(t21PreviousMonthDebtAmount(student("gp", "GP", "HV0881"), { id: T22_CLASS_ID }, ["2026-10"]), 0);
});

test("T21 nợ cũ tháng 10: Bảo Ngọc +200k → 650k", () => {
  const q = tuitionCollectionCharge(student("bao-ngoc", "Bảo Ngọc", "HV0951"), T21, [], emptySepayLedger(), NOW);
  assert.equal(q.oldDebtAmount, 200_000);
  assert.equal(q.amount, 650_000);
});

test("T22 tháng 10: 9 suất × 60k = 540k, không ai công nợ", () => {
  for (const [id, name, code] of [
    ["minh-hoang", "Nguyễn Minh Hoàng", "HV0903"],
    ["uyen-phuong", "Nguyễn Trần Uyên Phương", "HV0905"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T22, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 540_000, name);
    assert.equal(q.oldDebtAmount, 0);
    assert.equal(q.creditSessions, 0);
    assert.equal(q.billed, 9);
  }
});

test("T21+T22: khoản tháng trước sót trên production không đếm kép vào công nợ", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("bao-khoi", T21_CLASS_ID, "2026-09", 450_000),
      openReceivable("minh-hoang", T22_CLASS_ID, "2026-09", 540_000),
      openReceivable("hoc-vien-la", T22_CLASS_ID, "2026-09", 540_000),
    ],
    paymentOrders: [],
  };
  // Phiếu T9 sót không đếm vào — báo giá vẫn đúng 450k/540k.
  assert.equal(tuitionCollectionCharge(student("bao-khoi", "Trần Bảo Khôi", "HV0877"), T21, [], ledger as any, NOW).amount, 450_000);
  assert.equal(tuitionCollectionCharge(student("minh-hoang", "Nguyễn Minh Hoàng", "HV0903"), T22, [], ledger as any, NOW).amount, 540_000);
  // Bạn ngoài danh sách không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0999"), T22, [], ledger as any, NOW).amount, 540_000);
});

test("T21+T22: sync hủy phiếu tháng trước sót, giữ nguyên phiếu tháng 10", () => {
  const cls21 = { ...T21, billingEnabled: true, studentIds: ["gia-phu"] };
  const cls22 = { ...T22, billingEnabled: true, studentIds: ["minh-hoang"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("gia-phu", T21_CLASS_ID, "2026-09", 450_000),
      openReceivable("gia-phu", T21_CLASS_ID, "2026-10", 900_000),
      openReceivable("minh-hoang", T22_CLASS_ID, "2026-09", 540_000),
      openReceivable("minh-hoang", T22_CLASS_ID, "2026-10", 540_000),
    ],
    paymentOrders: [],
  };
  const students = [
    student("gia-phu", "Gia Phú", "HV0881"),
    student("minh-hoang", "Nguyễn Minh Hoàng", "HV0903"),
  ];
  const synced = syncTuitionReceivables(ledger as any, [cls21, cls22], students, [], NOW);
  const byId = new Map(synced.receivables.map((r: any) => [r.id, r]));
  for (const id of ["recv-gia-phu-2026-09", "recv-minh-hoang-2026-09"]) {
    assert.equal((byId.get(id) as any)?.status, "CANCELLED", id);
    assert.equal((byId.get(id) as any)?.balanceDue, 0);
  }
  assert.equal((byId.get("recv-gia-phu-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-gia-phu-2026-10") as any)?.amountDue, 900_000);
  assert.equal((byId.get("recv-minh-hoang-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-minh-hoang-2026-10") as any)?.amountDue, 540_000);
});
