import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables, unfreezeCourseReceivablesForJoinChange } from "../cloudflare/tuition-billing";

/**
 * Đổi ngày nhập học ở lớp thu khóa: phiếu khóa đã chốt (frozenAt) chưa thu phải tính lại theo mốc mới.
 * Lớp 4 buổi/khóa, thứ 3 + thứ 7 từ 05/09, 100k/buổi: khóa 1 = 05, 08, 12, 15/09 (đủ 400k).
 */
const cls: DemoClass = {
  id: "class-join", code: "J1", name: "Lớp đổi ngày", classTypeId: "", branchId: "", teacherId: "t", roomId: "", syllabusId: "",
  status: "ACTIVE", studentIds: ["a", "b"],
  schedules: [
    { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
  ],
  note: "", billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-05",
};
const student = (id: string, joined?: string): DemoStudent => ({
  id, code: id.toUpperCase(), fullName: id, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING",
  ...(joined ? { classJoinedAt: { [cls.id]: joined } } : {}),
});
const NOW = new Date("2026-09-01T08:00:00");

function frozenLedger() {
  const ledger = emptySepayLedger();
  for (const id of ["a", "b"]) {
    ledger.receivables.push({
      id: `rec-${id}`, receivableCode: `HP-${id}`, studentId: id, studentName: id, billingPeriod: "Khóa 4 buổi",
      issueDate: "2026-09-01", dueDate: "2026-09-05", amountDue: 400_000, amountPaid: 0, balanceDue: 400_000, currency: "VND",
      status: "OPEN", paymentOrderId: `order-${id}`, classId: cls.id, billKey: `course|${cls.id}`, frozenAt: "2026-08-30T00:00:00.000Z",
    } as never);
    ledger.paymentOrders.push({
      id: `order-${id}`, receivableId: `rec-${id}`, studentId: id, paymentCode: `HPJ1${id.toUpperCase()}`,
      amount: 400_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-09-01T00:00:00Z",
    } as never);
  }
  return ledger;
}

test("phiếu khóa đã chốt giữ nguyên số tiền khi đổi ngày nhập học nếu không nhả chốt (hành vi cũ)", () => {
  const students = [student("a", "2026-09-12"), student("b")];
  const synced = syncTuitionReceivables(frozenLedger(), [cls], students, [], NOW);
  assert.equal(synced.receivables.find((row) => row.studentId === "a")?.amountDue, 400_000);
});

test("nhả chốt đúng học viên đã đổi ngày → đồng bộ tính lại theo mốc mới, bạn khác giữ nguyên", () => {
  const students = [student("a", "2026-09-12"), student("b")];
  const released = unfreezeCourseReceivablesForJoinChange(frozenLedger(), [{ studentId: "a", classId: cls.id }]);
  assert.equal(released.unfrozen, 1);
  const synced = syncTuitionReceivables(released.ledger, [cls], students, [], NOW);
  const a = synced.receivables.find((row) => row.studentId === "a" && row.status === "OPEN");
  const b = synced.receivables.find((row) => row.studentId === "b" && row.status === "OPEN");
  assert.equal(a?.amountDue, 200_000, "vào từ 12/09 → còn 2 buổi (12, 15/09) × 100k");
  assert.equal(a?.balanceDue, 200_000);
  assert.equal(b?.amountDue, 400_000);
  assert.ok(b?.frozenAt, "bạn khác vẫn chốt");
});

test("không nhả phiếu đã thu một phần, đã đóng, hoặc của lớp/học viên khác", () => {
  const ledger = frozenLedger();
  ledger.receivables[0] = { ...ledger.receivables[0], amountPaid: 100_000, balanceDue: 300_000 } as never;
  const none = unfreezeCourseReceivablesForJoinChange(ledger, [{ studentId: "a", classId: cls.id }]);
  assert.equal(none.unfrozen, 0);
  assert.equal(none.ledger, ledger);
  const other = unfreezeCourseReceivablesForJoinChange(frozenLedger(), [{ studentId: "a", classId: "class-khac" }]);
  assert.equal(other.unfrozen, 0);
});
