import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T24_BAO_MINH_STUDENT_ID, T24_CLASS_ID, t24PreviousMonthDebtAmount } from "../cloudflare/t24-production-correction";
import { collectManualTuition, reverseTuitionReceipt, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T24 thật: T6 17:30 + CN 17:00, 60k/buổi → tháng 10 có đúng 9 suất. */
const T24 = ((): DemoClass => ({
  id: T24_CLASS_ID, code: "T24", name: "T24-2020-1.3",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 5, periodId: "fri", startTime: "17:30", endTime: "19:00" },
    { weekday: 0, periodId: "sun", startTime: "17:00", endTime: "18:30" },
  ],
  note: "", billingEnabled: false,
}))();

function openReceivable(studentId: string, months: string, amount = 480_000): SepayReceivable {
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
    classId: T24_CLASS_ID,
    billKey: `month|${T24_CLASS_ID}|${months}`,
  };
}

test("T24 tháng 10: 9 suất − 1 buổi nghỉ = 8 suất × 60k = 480k cho 15 bạn không nợ", () => {
  const quote = tuitionCollectionCharge(student("nhat-uyen", "Nhật Uyên", "HV0923"), T24, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.items[0]?.creditSessions, 1);
  assert.equal(quote.items[0]?.billed, 8);
  assert.equal(quote.items[0]?.amount, 480_000);
  assert.equal(quote.amount, 480_000);
  assert.equal(quote.oldDebtAmount, 0);
});

test("T24 nợ cũ tháng 10: Bảo Minh +480k → 960k; Nhật Đam +20k → 500k", () => {
  const baoMinh = tuitionCollectionCharge(student(T24_BAO_MINH_STUDENT_ID, "Dương Kim Bảo Minh", "HV0931"), T24, [], emptySepayLedger(), NOW);
  assert.equal(baoMinh.amount, 960_000);
  assert.equal(baoMinh.oldDebtAmount, 480_000);
  assert.equal(baoMinh.billed, 8);
  const nhatDam = tuitionCollectionCharge(student("nhat-dam", "Lê Nhật Đam", "HV0933"), T24, [], emptySepayLedger(), NOW);
  assert.equal(nhatDam.amount, 500_000);
  assert.equal(nhatDam.oldDebtAmount, 20_000);
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t24PreviousMonthDebtAmount(student("bm", "BM", "HV0931"), T24, ["2026-11"]), 0);
  assert.equal(t24PreviousMonthDebtAmount(student("bm", "BM", "HV0931"), { id: "class-import-t23" }, ["2026-10"]), 0);
});

test("T24 Bảo Minh đã đóng 960k: thu tay ghi nhận phiếu PAID đúng 960k, còn nợ 0", () => {
  const minh = student(T24_BAO_MINH_STUDENT_ID, "Dương Kim Bảo Minh", "HV0931");
  const cls = { ...T24, billingEnabled: true, studentIds: [minh.id] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [openReceivable(minh.id, "2026-10", 480_000)],
    paymentOrders: [],
  };
  const result = collectManualTuition({
    ledger: ledger as any,
    student: minh,
    cls,
    sessions: [],
    method: "TRANSFER",
    note: "Đã đóng đủ theo bảng Excel tháng 10",
    now: new Date("2026-10-04T09:00:00+07:00"),
  });
  assert.ok(!("error" in result), "thu phải thành công");
  assert.equal(result.charge.amount, 960_000);
  assert.equal(result.receivable.amountDue, 960_000);
  assert.equal(result.receivable.status, "PAID");
  assert.equal(result.receivable.balanceDue, 0);
  assert.equal(result.paidThroughMonth, "2026-10");
  assert.equal(result.payment.amount, 960_000);
});

test("T24 Bảo Minh CHƯA đóng: hoàn tác biên lai → phiếu T10 về OPEN 960k", () => {
  const minh = student(T24_BAO_MINH_STUDENT_ID, "Dương Kim Bảo Minh", "HV0931");
  const cls = { ...T24, billingEnabled: true, studentIds: [minh.id] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [openReceivable(minh.id, "2026-10", 480_000)],
    paymentOrders: [],
  };
  const collected = collectManualTuition({
    ledger: ledger as any,
    student: minh,
    cls,
    sessions: [],
    method: "TRANSFER",
    note: "Đã đóng đủ theo bảng Excel tháng 10",
    now: new Date("2026-10-04T09:00:00+07:00"),
  });
  assert.ok(!("error" in collected), "thu phải thành công");
  const reversed = reverseTuitionReceipt({
    ledger: collected.ledger,
    receiptId: collected.receipt.id,
    students: [minh],
    classes: [cls],
    sessions: [],
  });
  assert.ok(!("error" in reversed), "hoàn tác phải thành công");
  const reopened = reversed.ledger.receivables.find((row) => row.id === collected.receivable.id) as any;
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.amountPaid, 0);
  assert.equal(reopened.balanceDue, 960_000);
  // Payment bị void, biên lai bị xoá — phiếu về OPEN đủ số phải thu.
  assert.equal(reversed.ledger.payments.find((row) => row.id === collected.payment.id)?.status, "VOIDED");
  assert.equal(reversed.ledger.receipts.find((row) => row.id === collected.receipt.id), undefined);
});

test("T24: khoản tháng trước sót trên production không đếm kép vào công nợ của 17 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("nhat-uyen", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("nhat-uyen", "Nhật Uyên", "HV0923"), T24, [], ledger as any, NOW).amount, 480_000);
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0950"), T24, [], ledger as any, NOW).amount, 480_000);
});

test("T24: sync hủy phiếu tháng trước sót của 17 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T24, billingEnabled: true, studentIds: ["nhat-uyen", "nhat-dam"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("nhat-uyen", "2026-09"),
      openReceivable("nhat-uyen", "2026-10", 480_000),
      openReceivable("nhat-dam", "2026-09"),
      openReceivable("nhat-dam", "2026-10", 500_000),
    ],
    paymentOrders: [],
  };
  const students = [
    student("nhat-uyen", "Nhật Uyên", "HV0923"),
    student("nhat-dam", "Lê Nhật Đam", "HV0933"),
  ];
  const synced = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byId = new Map(synced.receivables.map((r: any) => [r.id, r]));
  for (const id of ["recv-nhat-uyen-2026-09", "recv-nhat-dam-2026-09"]) {
    assert.equal((byId.get(id) as any)?.status, "CANCELLED", id);
    assert.equal((byId.get(id) as any)?.balanceDue, 0);
  }
  assert.equal((byId.get("recv-nhat-uyen-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-nhat-uyen-2026-10") as any)?.amountDue, 480_000);
  assert.equal((byId.get("recv-nhat-dam-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-nhat-dam-2026-10") as any)?.amountDue, 500_000);
});
