import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T14_CLASS_ID, t14PreviousMonthDebtAmount } from "../cloudflare/t14-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T14 thật: T6 18:45 + CN 14:30, 80k/buổi → tháng 10 có đúng 9 suất. */
const T14 = ((): DemoClass => ({
  id: T14_CLASS_ID, code: "T14", name: "T14-2017 vip",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 80_000,
  schedules: [
    { weekday: 5, periodId: "fri", startTime: "18:45", endTime: "20:45" },
    { weekday: 0, periodId: "sun", startTime: "14:30", endTime: "16:30" },
  ],
  note: "", billingEnabled: false,
}))();

test("T14 tháng 10: 9 suất − 1 buổi nghỉ tháng cũ = 8 buổi 640k cho mọi học viên", () => {
  const quote = tuitionCollectionCharge(student("gia-bao", "Gia Bảo", "HV0765"), T14, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 1);
  assert.equal(quote.items[0]?.billed, 8);
  assert.equal(quote.amount, 640_000);
});

test("T14 nợ cũ tháng 10: Gia Khánh và Phương Uyên +640k mỗi bạn", () => {
  for (const [id, name, code] of [
    ["gia-khanh", "Dương Gia Khánh", "HV0764"],
    ["phuong-uyen", "Phương Uyên", "HV0772"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T14, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 1_280_000, name);
  }
  // 7 bạn còn lại chỉ thu 640k.
  for (const [id, name, code] of [
    ["gia-bao", "Gia Bảo", "HV0765"],
    ["cong-phi", "Công Phi", "HV0766"],
    ["phuong-dung", "Phương Dung", "HV0767"],
    ["khanh-linh", "Khánh Linh", "HV0768"],
    ["thuy-tram", "Thùy Trâm", "HV0769"],
    ["tuong-vy", "Tường Vy", "HV0770"],
    ["thao-nguyen", "Thảo Nguyên", "HV0771"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T14, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 640_000, name);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t14PreviousMonthDebtAmount(student("gia-khanh", "Dương Gia Khánh", "HV0764"), T14, ["2026-11"]), 0);
  assert.equal(t14PreviousMonthDebtAmount(student("gia-khanh", "Dương Gia Khánh", "HV0764"), { id: "class-import-t13" }, ["2026-10"]), 0);
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
    classId: T14_CLASS_ID,
    billKey: `month|${T14_CLASS_ID}|${months}`,
  };
}

test("T14: khoản tháng trước sót trên production không đếm kép vào công nợ của 9 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("gia-bao", "2026-09"),
      openReceivable("gia-khanh", "2026-09"),
      openReceivable("phuong-uyen", "2026-08"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("gia-bao", "Gia Bảo", "HV0765"), T14, [], ledger as any, NOW).amount, 640_000);
  assert.equal(tuitionCollectionCharge(student("gia-khanh", "Dương Gia Khánh", "HV0764"), T14, [], ledger as any, NOW).amount, 1_280_000);
  assert.equal(tuitionCollectionCharge(student("phuong-uyen", "Phương Uyên", "HV0772"), T14, [], ledger as any, NOW).amount, 1_280_000);
  // Bạn ngoài danh sách 9 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0800"), T14, [], ledger as any, NOW).amount, 640_000);
});

test("T14: sync hủy phiếu tháng trước sót của 9 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T14, billingEnabled: true, studentIds: ["gia-bao", "gia-khanh"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("gia-bao", "2026-09"),
      openReceivable("gia-bao", "2026-10", 640_000),
      openReceivable("gia-khanh", "2026-09"),
      openReceivable("gia-khanh", "2026-10", 1_280_000),
    ],
    paymentOrders: [],
  };
  const students = [student("gia-bao", "Gia Bảo", "HV0765"), student("gia-khanh", "Dương Gia Khánh", "HV0764")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T14_CLASS_ID}|${month}`);
  assert.equal(byBill("gia-bao", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ T10");
  assert.equal(byBill("gia-bao", "2026-10")?.amountDue, 640_000);
  assert.equal(byBill("gia-khanh", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("gia-khanh", "2026-10")?.amountDue, 1_280_000);
});

test("T14 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T14, billingEnabled: true, studentIds: ["gia-khanh", "khac"] };
  const giaKhanh = { ...student("gia-khanh", "Dương Gia Khánh", "HV0764"), classJoinedAt: { [T14_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 2 buổi T10 (02/10 T6, 04/10 CN); nợ cũ 640k = 8 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 8 buổi nợ.
  assert.equal(monthlyRemainingSessions(giaKhanh, cls, [], emptySepayLedger(), NOW), -(2 + 8));
  // Đóng phiếu T10 gộp nợ (1.280k = 8 buổi tháng + 8 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidKhanh = { ...giaKhanh, tuitionPaidThrough: { [T14_CLASS_ID]: "2026-10" } };
  const octSlots = 9; // toàn bộ suất lịch tháng 10 đã được thu kèm nợ
  assert.equal(monthlyRemainingSessions(paidKhanh, cls, [], emptySepayLedger(), NOW), octSlots + 8 - (2 + 8));
  assert.equal(monthlyRemainingSessions(paidKhanh, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0780"), tuitionPaidThrough: { [T14_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -2);
});
