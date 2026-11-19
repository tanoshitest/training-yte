import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger, type SepayLedger } from "../cloudflare/sepay-engine";
import {
  collectManualTuition,
  courseRemainingSessions,
  creditCourseExcessForJoinChange,
  syncTuitionReceivables,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

/**
 * Đổi ngày nhập học SAU KHI phụ huynh đã đóng đủ khóa theo ngày cũ: phần dư thành tín dụng trừ vào khóa sau,
 * số buổi tồn không bị đếm trùng. Lớp 4 buổi/khóa, thứ 3 + thứ 7 từ 05/09, 100k/buổi:
 * khóa 1 = 05, 08, 12, 15/09; khóa 2 = 19, 22, 26, 29/09.
 */
const cls: DemoClass = {
  id: "class-jx", code: "JX", name: "Lớp dư", classTypeId: "", branchId: "", teacherId: "t", roomId: "", syllabusId: "",
  status: "ACTIVE", studentIds: ["a"],
  schedules: [
    { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
  ],
  note: "", billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-05",
};
const base = (joined?: string): DemoStudent => ({
  id: "a", code: "A", fullName: "a", phone: "", address: "", school: "", parentZalo: "", status: "STUDYING",
  ...(joined ? { classJoinedAt: { [cls.id]: joined } } : {}),
});

/** Khóa 1 đã đóng đủ 400k theo ngày cũ (vào từ đầu khóa). */
function paidCourseOne(): SepayLedger {
  const l = emptySepayLedger();
  l.receivables.push({
    id: "r1", receivableCode: "HP1", studentId: "a", studentName: "a", billingPeriod: "Khóa 4 buổi", issueDate: "2026-09-01",
    dueDate: "2026-09-05", amountDue: 400_000, amountPaid: 400_000, balanceDue: 0, currency: "VND", status: "PAID",
    paymentOrderId: "o1", classId: cls.id, billKey: `course|${cls.id}`,
  } as never);
  l.paymentOrders.push({ id: "o1", receivableId: "r1", studentId: "a", paymentCode: "HPJX", amount: 400_000, qrUrl: "", status: "PAID", createdAt: "2026-09-01T00:00:00Z" } as never);
  l.payments.push({
    id: "p1", paymentCode: "HPJX", studentId: "a", bankTransactionId: "b", receivableId: "r1", amount: 400_000, allocatedAmount: 400_000,
    excessAmount: 0, status: "COMPLETED", paidAt: "2026-09-02T00:00:00Z",
  } as never);
  l.receipts.push({
    id: "rc1", receiptNumber: "PT-1", paymentId: "p1", studentId: "a", amount: 400_000, issuedAt: "2026-09-02T00:00:00Z",
    status: "ISSUED", classId: cls.id, billingMode: "COURSE", billingPeriod: "Khóa 4 buổi",
  });
  return l;
}

const NOW = new Date("2026-09-10T08:00:00");
const AFTER_COURSE_ONE = new Date("2026-09-16T08:00:00");
const AFTER_COURSE_TWO = new Date("2026-10-01T08:00:00");

test("đổi ngày vào 12/09 sau khi đã đóng 400k: dư 200k thành tín dụng, khóa 2 được trừ", () => {
  const before = base();
  const after = base("2026-09-12");
  const res = creditCourseExcessForJoinChange({ ledger: paidCourseOne(), previousStudent: before, student: after, cls, sessions: [], now: NOW });
  assert.deepEqual(res.credited, [{ courseIndex: 1, amount: 200_000 }]);
  assert.equal(res.ledger.credits?.[0]?.reason, "JOIN_DATE_EXCESS");
  assert.equal(res.ledger.credits?.[0]?.amount, 200_000);

  const synced = syncTuitionReceivables(JSON.parse(JSON.stringify(res.ledger)), [cls], [after], [], AFTER_COURSE_ONE);
  const two = synced.receivables.find((row) => row.billKey === `course|${cls.id}|2`);
  assert.equal(two?.amountDue, 200_000, "khóa 2 chỉ còn 200k sau khi trừ tín dụng dư");
  assert.equal(two?.appliedCredits?.[0]?.amount, 200_000);
  // Không đếm trùng: khóa 1 chỉ còn 2 buổi đã đóng (đúng 12 + 15/09), tồn sau khóa 1 = 2 (từ tiền khóa 2 đã trừ) − 0 → 0 + buổi khóa 2 chưa học.
  assert.equal(courseRemainingSessions(after, cls, [], synced, AFTER_COURSE_ONE), 2, "2 buổi khóa 2 đã được trừ tiền sẵn, chưa học");
});

test("đóng nốt khóa 2 phần còn lại → hết khóa 2 tồn về 0, không dư không thiếu", () => {
  const after = base("2026-09-12");
  const res = creditCourseExcessForJoinChange({ ledger: paidCourseOne(), previousStudent: base(), student: after, cls, sessions: [], now: NOW });
  const synced = syncTuitionReceivables(JSON.parse(JSON.stringify(res.ledger)), [cls], [after], [], AFTER_COURSE_ONE);
  const collected = collectManualTuition({ ledger: synced, student: after, cls, sessions: [], method: "TRANSFER", now: AFTER_COURSE_ONE, courseIndexOverride: 2, allowEarly: true } as never);
  assert.ok(!("error" in collected), "error" in collected ? collected.error : "");
  if ("error" in collected) return;
  assert.equal(collected.receipt.amount, 200_000, "phụ huynh chỉ phải chuyển 200k");
  const end = syncTuitionReceivables(JSON.parse(JSON.stringify(collected.ledger)), [cls], [after], [], AFTER_COURSE_TWO);
  assert.equal(courseRemainingSessions(after, cls, [], end, AFTER_COURSE_TWO), 0);
  const q = tuitionCollectionCharge(after, cls, [], end, AFTER_COURSE_TWO);
  assert.ok(q.amount === 0 || q.amount === 400_000, "khóa 3 báo giá bình thường");
});

test("đổi lại cùng ngày hoặc không đổi → không tạo tín dụng; phiếu chưa đóng → không tạo tín dụng", () => {
  const same = creditCourseExcessForJoinChange({ ledger: paidCourseOne(), previousStudent: base("2026-09-12"), student: base("2026-09-12"), cls, sessions: [], now: NOW });
  assert.equal(same.credited.length, 0);
  const open = paidCourseOne();
  open.receivables[0] = { ...open.receivables[0], status: "OPEN", amountPaid: 0, balanceDue: 400_000 } as never;
  const res = creditCourseExcessForJoinChange({ ledger: open, previousStudent: base(), student: base("2026-09-12"), cls, sessions: [], now: NOW });
  assert.equal(res.credited.length, 0);
});

test("đổi ngày sớm hơn (phải thu thêm) không tạo tín dụng và không đổi phiếu đã đóng", () => {
  const ledger = paidCourseOne();
  const res = creditCourseExcessForJoinChange({ ledger, previousStudent: base("2026-09-12"), student: base(), cls, sessions: [], now: NOW });
  assert.equal(res.credited.length, 0);
  assert.equal(res.ledger, ledger);
});

test("đổi ngày hai lần liên tiếp không tạo tín dụng trùng", () => {
  const first = creditCourseExcessForJoinChange({ ledger: paidCourseOne(), previousStudent: base(), student: base("2026-09-12"), cls, sessions: [], now: NOW });
  const again = creditCourseExcessForJoinChange({ ledger: first.ledger, previousStudent: base(), student: base("2026-09-12"), cls, sessions: [], now: NOW });
  assert.equal(again.credited.length, 0, "dư đã được tách, không tính lại");
  assert.equal(first.ledger.credits?.length, 1);
});
