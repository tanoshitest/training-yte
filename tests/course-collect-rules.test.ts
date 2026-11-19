import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger, type SepayLedger } from "../cloudflare/sepay-engine";
import {
  collectManualTuition,
  courseRemainingSessions,
  studentCourseCollectStates,
  syncTuitionReceivables,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

/**
 * Quy tắc thu khóa (chốt với trung tâm 23/10/2026, kịch bản lớp S20):
 *  - Qua ngày sau buổi cuối khóa cũ → khóa mới tự phát sinh phiếu cho cả lớp.
 *  - Mỗi khóa một phiếu; nợ khóa cũ nằm ở phiếu khóa cũ, không gộp vào khóa sau.
 *  - Tồn = buổi đã đóng của mọi khóa − buổi đã học (sang khóa mới chưa đóng = 0, âm dần).
 *  - Chỉ thu được khóa đã bắt đầu còn nợ; khóa đã đủ / chưa bắt đầu bị chặn.
 *
 * Lớp 4 buổi/khóa, học thứ 3 + thứ 7 từ 05/09: khóa 1 = 05, 08, 12, 15/09; khóa 2 từ 19/09.
 */
const cls: DemoClass = {
  id: "class-rule",
  code: "R1",
  name: "Lớp quy tắc",
  classTypeId: "",
  branchId: "",
  teacherId: "teacher-1",
  roomId: "",
  syllabusId: "",
  status: "ACTIVE",
  studentIds: ["paid", "owing"],
  schedules: [
    { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
  ],
  note: "",
  billingMode: "COURSE",
  sessionPrice: 100_000,
  courseSessions: 4,
  courseStartDate: "2026-09-05",
};

const student = (id: string): DemoStudent => ({
  id, code: id.toUpperCase(), fullName: id, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING",
});

/** Khóa 1: "paid" đã đóng đủ (có biên lai), "owing" còn nợ cả khóa. */
function ledgerAfterCourseOne(): SepayLedger {
  const ledger = emptySepayLedger();
  for (const [id, paid] of [["paid", true], ["owing", false]] as const) {
    ledger.receivables.push({
      id: `rec-${id}-1`, receivableCode: `HP-${id}`, studentId: id, studentName: id, billingPeriod: "Khóa 4 buổi",
      issueDate: "2026-09-05", dueDate: "2026-09-05", amountDue: 400_000, amountPaid: paid ? 400_000 : 0,
      balanceDue: paid ? 0 : 400_000, currency: "VND", status: paid ? "PAID" : "OPEN",
      paymentOrderId: `order-${id}-1`, classId: cls.id, billKey: `course|${cls.id}`,
    });
    ledger.paymentOrders.push({
      id: `order-${id}-1`, receivableId: `rec-${id}-1`, studentId: id, paymentCode: `HPR1${id.toUpperCase()}`,
      amount: 400_000, qrUrl: "", status: paid ? "PAID" : "ACTIVE", createdAt: "2026-09-05T00:00:00Z",
    });
    if (!paid) continue;
    ledger.payments.push({
      id: `pay-${id}-1`, paymentCode: `HPR1${id.toUpperCase()}`, studentId: id, bankTransactionId: `manual-${id}`,
      receivableId: `rec-${id}-1`, amount: 400_000, allocatedAmount: 400_000, excessAmount: 0, status: "COMPLETED",
      paidAt: "2026-09-06T00:00:00Z",
    } as never);
    ledger.receipts.push({
      id: `rc-${id}-1`, receiptNumber: `PT-${id}`, paymentId: `pay-${id}-1`, studentId: id, amount: 400_000,
      issuedAt: "2026-09-06T00:00:00Z", status: "ISSUED", classId: cls.id, billingMode: "COURSE", billingPeriod: "Khóa 4 buổi",
    });
  }
  return ledger;
}

const LAST_DAY_OF_COURSE_ONE = new Date("2026-09-15T20:00:00");
const DAY_AFTER_COURSE_ONE = new Date("2026-09-16T08:00:00");
const students = [student("paid"), student("owing")];

test("ngày còn buổi cuối khóa 1: chưa phát sinh phiếu khóa 2", () => {
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], LAST_DAY_OF_COURSE_ONE);
  assert.equal(synced.receivables.filter((row) => row.billKey === `course|${cls.id}|2`).length, 0);
});

test("qua ngày sau buổi cuối khóa 1: cả lớp phát sinh phiếu khóa 2, nợ khóa 1 giữ ở phiếu khóa 1", () => {
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  const open = (id: string) => synced.receivables
    .filter((row) => row.studentId === id && ["OPEN", "PARTIALLY_PAID"].includes(row.status))
    .map((row) => [row.billKey, row.balanceDue]);
  assert.deepEqual(open("paid"), [[`course|${cls.id}|2`, 400_000]]);
  assert.deepEqual(open("owing").sort(), [[`course|${cls.id}`, 400_000], [`course|${cls.id}|2`, 400_000]].sort());
  assert.equal(synced.receivables.filter((row) => row.billKey === `course|${cls.id}|3`).length, 0, "khóa 3 chưa bắt đầu — không lập phiếu");
});

test("tồn sang khóa mới: đã đóng khóa cũ = 0, còn nợ khóa cũ = âm đủ số buổi khóa cũ", () => {
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  assert.equal(courseRemainingSessions(student("paid"), cls, [], synced, DAY_AFTER_COURSE_ONE), 0);
  assert.equal(courseRemainingSessions(student("owing"), cls, [], synced, DAY_AFTER_COURSE_ONE), -4);
  const afterFirstLesson = new Date("2026-09-20T08:00:00");
  assert.equal(courseRemainingSessions(student("paid"), cls, [], synced, afterFirstLesson), -1, "học 1 buổi khóa mới → −1");
});

test("popup: khóa đã đủ và khóa chưa bắt đầu bị khóa thu; khóa còn nợ thu được", () => {
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  const states = (id: string) => studentCourseCollectStates(student(id), cls, [], synced, DAY_AFTER_COURSE_ONE)
    .map((row) => [row.index, row.status]);
  assert.deepEqual(states("paid"), [[1, "PAID"], [2, "DUE"], [3, "FUTURE"]]);
  assert.deepEqual(states("owing"), [[1, "DUE"], [2, "DUE"], [3, "FUTURE"]]);

  const paidCourseOne = collectManualTuition({ ledger: synced, student: student("paid"), cls, sessions: [], method: "CASH", now: DAY_AFTER_COURSE_ONE, courseIndexOverride: 1 });
  assert.ok("error" in paidCourseOne && /đã đóng đủ/.test(paidCourseOne.error), "không thu trùng khóa đã đóng đủ");
  const futureCourse = collectManualTuition({ ledger: synced, student: student("owing"), cls, sessions: [], method: "CASH", now: DAY_AFTER_COURSE_ONE, courseIndexOverride: 3 });
  assert.ok("error" in futureCourse && /chưa bắt đầu/.test(futureCourse.error), "khóa 3 chỉ xem phiếu báo");
});

test("phụ huynh chỉ đóng khóa 1: thu khóa 1, công nợ còn đúng khóa 2, tồn về 0", () => {
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  assert.equal(tuitionCollectionCharge(student("owing"), cls, [], synced, DAY_AFTER_COURSE_ONE).billKey, `course|${cls.id}`, "mặc định thu khóa cũ nhất còn nợ");
  const collected = collectManualTuition({ ledger: synced, student: student("owing"), cls, sessions: [], method: "CASH", now: DAY_AFTER_COURSE_ONE, courseIndexOverride: 1 });
  assert.ok(!("error" in collected));
  if ("error" in collected) return;
  assert.equal(collected.payment.allocatedAmount, 400_000);
  const open = collected.ledger.receivables.filter((row) => row.studentId === "owing" && ["OPEN", "PARTIALLY_PAID"].includes(row.status));
  assert.deepEqual(open.map((row) => [row.billKey, row.balanceDue]), [[`course|${cls.id}|2`, 400_000]]);
  assert.equal(courseRemainingSessions(student("owing"), cls, [], collected.ledger, DAY_AFTER_COURSE_ONE), 0);
});

test("một phiếu khóa trả làm hai lần không bị đếm thành hai khóa", () => {
  const ledger = ledgerAfterCourseOne();
  // "paid" trả khóa 1 thành hai lần chuyển khoản.
  ledger.payments.push({
    id: "pay-paid-1b", paymentCode: "HPR1PAID", studentId: "paid", bankTransactionId: "manual-paid-b",
    receivableId: "rec-paid-1", amount: 0, allocatedAmount: 0, excessAmount: 0, status: "COMPLETED", paidAt: "2026-09-07T00:00:00Z",
  } as never);
  ledger.receipts.push({
    id: "rc-paid-1b", receiptNumber: "PT-paid-b", paymentId: "pay-paid-1b", studentId: "paid", amount: 0,
    issuedAt: "2026-09-07T00:00:00Z", status: "ISSUED", classId: cls.id, billingMode: "COURSE", billingPeriod: "Khóa 4 buổi",
  });
  const synced = syncTuitionReceivables(ledger, [cls], students, [], LAST_DAY_OF_COURSE_ONE);
  assert.equal(synced.receivables.filter((row) => row.studentId === "paid" && row.billKey !== `course|${cls.id}`).length, 0, "không nhảy sang lập phiếu khóa 2/3");
});

test("sao kê ghi mã HP{lớp}{HV} đúng số tiền một khóa: trả khóa cũ trước", async () => {
  const { friendlyPaymentOrderCode } = await import("../cloudflare/sepay-engine");
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  const owing = student("owing");
  const courseOneOrder = synced.paymentOrders.find((order) => order.receivableId === "rec-owing-1");
  const code = friendlyPaymentOrderCode(synced, "HPR1HV0002", [cls], [{ id: owing.id, code: "HV0002" }], 400_000);
  assert.equal(code, courseOneOrder?.paymentCode, "khóa 1 (cũ hơn) được trả trước khóa 2 cùng số tiền");
});

test("gửi yêu cầu lớp khóa: số tiền = khóa hiện tại cộng dồn nợ khóa cũ; sao kê tổng chia trả khóa cũ trước", async () => {
  const { courseRequestBundle, receivableRequestAmount } = await import("../cloudflare/tuition-billing");
  const { processBankStatement } = await import("../cloudflare/bank-statement");
  const synced = syncTuitionReceivables(ledgerAfterCourseOne(), [cls], students, [], DAY_AFTER_COURSE_ONE);
  const k2 = synced.receivables.find((row) => row.studentId === "owing" && row.billKey === `course|${cls.id}|2`)!;
  const k2Paid = synced.receivables.find((row) => row.studentId === "paid" && row.billKey === `course|${cls.id}|2`)!;
  assert.equal(courseRequestBundle(synced, "owing", cls.id, 2).total, 800_000);
  assert.equal(receivableRequestAmount(synced, k2), 800_000, "owing: khóa 2 400k + nợ khóa 1 400k");
  assert.equal(receivableRequestAmount(synced, k2Paid), 400_000, "paid: chỉ khóa 2");

  // Phụ huynh chuyển 800k với mã HP{lớp}{HV}: khóa 1 và khóa 2 cùng tất toán.
  const outcome = processBankStatement(synced, [{ id: "owing", code: "HV0002", fullName: "owing" } as any],
    [{ date: "17/09/2026", amount: 800_000, content: "HPR1HV0002 dong hoc phi", fingerprint: "fp-1" } as any], DAY_AFTER_COURSE_ONE, [cls]);
  const after = outcome.ledger.receivables.filter((row) => row.studentId === "owing" && row.classId === cls.id && row.status !== "CANCELLED");
  assert.deepEqual(after.map((row) => [row.billKey, row.status]).sort(), [[`course|${cls.id}`, "PAID"], [`course|${cls.id}|2`, "PAID"]].sort());
});

test("lớp cũ (khóa 1 trước golive): nợ một phần khóa 1 chỉ trừ đúng số buổi còn nợ khỏi buổi đã đóng", async () => {
  const { paidCourseSessions } = await import("../cloudflare/tuition-billing");
  const cls: any = { id: "c-old", code: "S99", billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-01", schedules: [] };
  const ledgerWith = (balance: number) => ({ receivables: balance ? [{ id: `r-${balance}`, studentId: "st", classId: cls.id, billKey: `course|${cls.id}`, amountDue: balance, amountPaid: 0, balanceDue: balance, status: "OPEN" }] : [], payments: [], receipts: [], paymentOrders: [], credits: [], invoices: [] }) as any;
  assert.equal(paidCourseSessions({ id: "st" }, cls, ledgerWith(0), 1), 24, "không nợ → mặc định đã đóng đủ khóa 1");
  assert.equal(paidCourseSessions({ id: "st" }, cls, ledgerWith(715_000), 1), 13, "nợ 715.000đ = 11 buổi → đã đóng 13 buổi");
  assert.equal(paidCourseSessions({ id: "st" }, cls, ledgerWith(1_560_000), 1), 0, "nợ cả khóa → 0 buổi");
});

test("lớp cũ: nợ cũ gộp trong phiếu khóa 2 (phần vượt học phí khóa) trừ vào buổi đã đóng khóa 1; đã có nợ buổi nhập tay thì không trừ lần hai", async () => {
  const { paidCourseSessions } = await import("../cloudflare/tuition-billing");
  const cls: any = { id: "c-old2", code: "S98", billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 24, courseStartDate: "2026-08-01", schedules: [] };
  const ledger: any = { receivables: [{ id: "r2", studentId: "st", classId: cls.id, billKey: `course|${cls.id}|2`, amountDue: 2_285_000, amountPaid: 0, balanceDue: 2_285_000, status: "OPEN" }], payments: [], receipts: [], paymentOrders: [], credits: [], invoices: [] };
  assert.equal(paidCourseSessions({ id: "st" } as any, cls, ledger, 1), 13, "nợ cũ 725.000đ = 11 buổi → khóa 1 đã đóng 13 buổi");
  assert.equal(paidCourseSessions({ id: "st", tuitionCredits: { [cls.id]: -11 } } as any, cls, ledger, 1), 24, "nợ buổi nhập tay đã tính riêng");
  const big: any = { ...ledger, receivables: [{ ...ledger.receivables[0], id: "r3", amountDue: 3_325_000, balanceDue: 3_325_000 }] };
  assert.equal(paidCourseSessions({ id: "st2" } as any, cls, { ...big, receivables: big.receivables.map((r: any) => ({ ...r, studentId: "st2" })) }, 1), 0, "nợ cũ vượt cả khóa → khóa 1 tính 0 buổi");
});

test("S42 chốt cứng lịch: khóa 1 chiếm 22 suất tính phí trên lịch, học phí vẫn 24 buổi", async () => {
  const { courseIndexAtSlotOrdinal, billedCourseSessions, classCourseWindowSlotsAt } = await import("../cloudflare/tuition-billing");
  const s42: any = { id: "class-import-s42", billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24, courseStartDate: "2026-08-01", schedules: [{ weekday: 6, startTime: "17:30", endTime: "19:00" }] };
  assert.equal(classCourseWindowSlotsAt(s42, 1), 22);
  assert.equal(classCourseWindowSlotsAt(s42, 2), 24);
  assert.equal(courseIndexAtSlotOrdinal(s42, 21), 1);
  assert.equal(courseIndexAtSlotOrdinal(s42, 22), 2, "suất tính phí thứ 23 là buổi 1 khóa 2");
  assert.equal(billedCourseSessions(s42, [], 1), 24, "học phí khóa 1 giữ 24 buổi");
  assert.equal(classCourseWindowSlotsAt({ ...s42, id: "other" }, 1), 24, "lớp khác không đổi");
});
