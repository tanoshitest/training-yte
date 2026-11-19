import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T20_CLASS_ID, t20PreviousMonthDebtAmount } from "../cloudflare/t20-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T20 thật: T4 17:00 + T7 14:30, 50k/buổi → lịch tháng 10 sinh 9 suất. */
const T20 = ((): DemoClass => ({
  id: T20_CLASS_ID, code: "T20", name: "T20-2019-2.3",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 50_000,
  schedules: [
    { weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "14:30", endTime: "16:30" },
  ],
  note: "", billingEnabled: false,
}))();

function openReceivable(studentId: string, months: string, amount = 450_000): SepayReceivable {
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
    classId: T20_CLASS_ID,
    billKey: `month|${T20_CLASS_ID}|${months}`,
  };
}

test("T20 tháng 10: 9 suất × 50k = 450k cho 13 bạn không nợ — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("gia-phat", "Nguyễn Gia Phát", "HV0861"), T20, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 9);
  assert.equal(quote.items[0]?.amount, 450_000);
  assert.equal(quote.amount, 450_000);
  assert.equal(quote.oldDebtAmount, 0);
});

test("T20 nợ cũ tháng 10: Hà Giang, Tú Uyên, An Nhiên +400k → 850k mỗi bạn", () => {
  for (const [id, name, code] of [
    ["ha-giang", "Bùi Thị Hà Giang", "HV0866"],
    ["tu-uyen", "Tú Uyên", "HV0871"],
    ["an-nhien", "Dương An Nhiên", "HV0858"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T20, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 850_000, name);
    assert.equal(q.oldDebtAmount, 400_000);
    assert.equal(q.billed, 9);
    assert.equal(q.creditSessions, 0);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t20PreviousMonthDebtAmount(student("hg", "HG", "HV0866"), T20, ["2026-11"]), 0);
  assert.equal(t20PreviousMonthDebtAmount(student("hg", "HG", "HV0866"), { id: "class-import-t19" }, ["2026-10"]), 0);
});

test("T20: khoản tháng trước sót trên production không đếm kép vào công nợ của 16 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("ha-giang", "2026-09"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("ha-giang", "Bùi Thị Hà Giang", "HV0866"), T20, [], ledger as any, NOW).amount, 850_000);
  // Bạn ngoài danh sách 16 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0900"), T20, [], ledger as any, NOW).amount, 450_000);
});

test("T20: sync hủy phiếu tháng trước sót của 16 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T20, billingEnabled: true, studentIds: ["ha-giang", "gia-phat"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("ha-giang", "2026-09"),
      openReceivable("ha-giang", "2026-10", 850_000),
      openReceivable("gia-phat", "2026-09"),
      openReceivable("gia-phat", "2026-10", 450_000),
    ],
    paymentOrders: [],
  };
  const students = [
    student("ha-giang", "Bùi Thị Hà Giang", "HV0866"),
    student("gia-phat", "Nguyễn Gia Phát", "HV0861"),
  ];
  const synced = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byId = new Map(synced.receivables.map((r: any) => [r.id, r]));
  for (const id of ["recv-ha-giang-2026-09", "recv-gia-phat-2026-09"]) {
    assert.equal((byId.get(id) as any)?.status, "CANCELLED", id);
    assert.equal((byId.get(id) as any)?.balanceDue, 0);
  }
  assert.equal((byId.get("recv-ha-giang-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-ha-giang-2026-10") as any)?.amountDue, 850_000);
  assert.equal((byId.get("recv-gia-phat-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-gia-phat-2026-10") as any)?.amountDue, 450_000);
});
