import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { applyMatch, emptySepayLedger, processBankTransaction, type SepayBankTransaction } from "../cloudflare/sepay-engine";
import { activateSessionsForPayment, applyAttendanceSessionBalances, backfillTeacherOffRemaining, billedMonthSessions, chargedMonthlySessions, classCourseScheduleSessions, classCourseSessionsForCourse, classTuitionCharge, clearCourseTeacherCredits, clearMonthlyTeacherCredits, collectManualTuition, ensureReceivableForCharge, initializeTuitionStatusByBillingMode, monthlyCarryReceivables, paidSessionsSinceSeptember, rebuildCourseSessionBalances, rebuildSeptemberSessionBalances, reverseTuitionReceipt, studentRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge, tuitionExemptRemainingSessions } from "../cloudflare/tuition-billing";

/** Dựng một giao dịch khớp đúng đơn thanh toán của receivable, y hệt webhook thật sẽ nhận. */
function matchedBankTx(overrides: Partial<SepayBankTransaction> & { content: string; transferAmount: number }): SepayBankTransaction {
  return {
    id: `btx-${overrides.content}`,
    provider: "SEPAY",
    providerTransactionId: `tx-${overrides.content}`,
    accountNumber: "8686838888",
    transactionDate: new Date().toISOString(),
    transferType: "IN",
    status: "RECEIVED",
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

function courseClass(courseSessions?: number): DemoClass {
  return {
    id: "class-test",
    code: "TEST",
    name: "Lớp kiểm thử",
    classTypeId: "class-standard",
    branchId: "branch-test",
    teacherId: "teacher-test",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["student-test"],
    schedules: [],
    note: "",
    billingMode: "COURSE",
    sessionPrice: 160_000,
    courseSessions,
  };
}

test("course tuition uses the class-specific number of sessions", () => {
  const charge = classTuitionCharge(courseClass(10), []);
  assert.equal(charge.billed, 10);
  assert.equal(charge.amount, 1_600_000);
  assert.match(charge.period, /10 buổi/);
});

test("legacy classes still default to 24 course sessions", () => {
  const cls = courseClass();
  assert.equal(classTuitionCharge(cls, []).billed, 24);
  assert.equal(studentRemainingSessions({}, cls, []), 0);
});

test("course tuition follows the configured start date and excludes only admin-planned days off", () => {
  const cls: DemoClass = {
    ...courseClass(4),
    courseStartDate: "2026-09-01",
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
    ],
  };
  const adminOff: DemoLessonSession = {
    id: "holiday", classId: cls.id, date: "2026-09-05", startTime: "09:00", endTime: "11:00",
    teacherId: cls.teacherId, roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: `${cls.id}|2026-09-05|09:00`, note: "Nghỉ lễ", isOff: true, offSource: "ADMIN", attendance: [],
  };
  assert.deepEqual(classCourseScheduleSessions(cls, [adminOff]).map((row) => row.date), ["2026-09-01", "2026-09-05", "2026-09-08", "2026-09-12"]);
  const charge = classTuitionCharge(cls, [adminOff]);
  assert.equal(charge.billed, 3);
  assert.equal(charge.amount, 480_000);

  const teacherOff = { ...adminOff, offSource: "TEACHER" as const };
  assert.equal(classTuitionCharge(cls, [teacherOff]).billed, 4, "teacher changes do not rewrite the finalized course configuration");
});

test("course remaining follows paid course sessions minus charged lessons", () => {
  const cls = courseClass(20);
  assert.equal(studentRemainingSessions({ id: "student-test", sessionBalances: { [cls.id]: 2 } }, cls, []), 20);
});

test("S12-style course remaining is 6 after session 18 on 13 September", () => {
  const now = new Date("2026-09-15T03:00:00+09:00");
  const cls: DemoClass = {
    ...courseClass(24),
    id: "class-import-s12",
    code: "S12",
    sessionPrice: 65_000,
    courseStartDate: "2026-07-17",
    schedules: [
      { weekday: 5, periodId: "fri", startTime: "17:00", endTime: "19:00" },
      { weekday: 0, periodId: "sun", startTime: "07:15", endTime: "09:15" },
    ],
  };
  const student = { ...testStudent(), sessionBalances: { [cls.id]: 3 } };
  const sessions = classCourseScheduleSessions(cls, [], now);
  assert.equal(sessions[17]?.date, "2026-09-13");
  assert.equal(studentRemainingSessions(student, cls, [], emptySepayLedger(), now), 6);
  const [rebuilt] = rebuildCourseSessionBalances([student], [cls], [], emptySepayLedger(), now);
  assert.equal(rebuilt.sessionBalances?.[cls.id], 6);
  const marked = applyAttendanceSessionBalances(
    [student],
    [cls],
    [],
    [{ ...sessions[17]!, status: "COMPLETED", attendance: [{ studentId: student.id, status: "PRESENT", lessonRating: null, homeworkRating: null, pronunciationVideoDone: false, note: "" }] }],
    emptySepayLedger(),
    now,
  );
  assert.equal(marked[0].sessionBalances?.[cls.id], 6, "marking an already elapsed course session must not deduct twice");
});

test("opening tuition status marks monthly classes unpaid and course classes paid", () => {
  const monthly: DemoClass = { ...courseClass(), id: "monthly", billingMode: "MONTHLY", studentIds: ["student-test"] };
  const course: DemoClass = { ...courseClass(), id: "course", studentIds: ["student-test"] };
  const student: DemoStudent = {
    ...testStudent(),
    sessionBalances: { monthly: 8, course: -3, untouched: 5 },
    tuitionPaidThrough: { monthly: "2026-09", untouched: "2026-08" },
  };

  const [normalized] = initializeTuitionStatusByBillingMode([student], [monthly, course]);

  assert.deepEqual(normalized.sessionBalances, { monthly: 0, course: 21, untouched: 5 });
  assert.deepEqual(normalized.tuitionPaidThrough, { untouched: "2026-08" });
});

test("tuition-exempt remaining follows the class course and rolls over after zero", () => {
  const cls: DemoClass = {
    ...courseClass(2),
    billingMode: "MONTHLY",
    courseStartDate: "2026-09-01",
    schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
  };
  const student = { ...testStudent(), tuitionExempt: true };

  assert.equal(studentRemainingSessions(student, cls, [], emptySepayLedger(), new Date("2026-09-01T12:00:00+09:00")), 2);
  assert.equal(tuitionExemptRemainingSessions(cls, [], new Date("2026-09-15T12:00:00+09:00")), 0, "hai buổi đầu kết thúc đúng ở số 0");
  assert.equal(studentRemainingSessions(student, cls, [], emptySepayLedger(), new Date("2026-09-16T12:00:00+09:00")), 1, "buổi đầu khóa mới tự bật số dư khóa mới");
});

test("tuition-exempt students do not create debt and their unpaid open order is cancelled", () => {
  const cls = courseClass(4);
  const student = testStudent();
  const opened = syncTuitionReceivables(emptySepayLedger(), [cls], [student], []);
  assert.equal(opened.receivables[0]?.status, "OPEN");
  assert.equal(opened.paymentOrders[0]?.status, "ACTIVE");

  const exempted = syncTuitionReceivables(opened, [cls], [{ ...student, tuitionExempt: true }], []);
  assert.equal(exempted.receivables[0]?.status, "CANCELLED");
  assert.equal(exempted.receivables[0]?.balanceDue, 0);
  assert.equal(exempted.paymentOrders[0]?.status, "CANCELLED");

  const restored = syncTuitionReceivables(exempted, [cls], [student], []);
  assert.equal(restored.receivables[0]?.status, "OPEN", "bỏ miễn học phí tạo lại khoản thu đang hoạt động");
});

function testStudent(id = "student-test"): DemoStudent {
  return {
    id,
    code: "HV0001",
    fullName: "Học viên kiểm thử",
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING",
    sessionBalances: { "class-test": 10 },
  };
}

function monthlyClass(): DemoClass {
  return {
    ...courseClass(24),
    billingMode: "MONTHLY",
    sessionPrice: 100_000,
    schedules: [
      { weekday: 1, periodId: "period-monday", startTime: "17:00", endTime: "19:00" },
      { weekday: 3, periodId: "period-wednesday", startTime: "14:30", endTime: "16:30" },
    ],
  };
}

function septemberHoliday(): DemoLessonSession {
  return {
    id: "session-holiday",
    classId: "class-test",
    date: "2026-09-02",
    startTime: "14:30",
    endTime: "16:30",
    teacherId: "teacher-test",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: "class-test|2026-09-02|14:30",
    note: "Nghỉ lễ Quốc khánh 02/09",
    isOff: true,
    offSource: "ADMIN",
    attendance: [],
  };
}

test("monthly tuition bills eight September sessions after the 2 September holiday", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -2 }, tuitionPaidThrough: { [cls.id]: "2026-08" } };
  const quote = tuitionCollectionCharge(student, cls, [septemberHoliday()], emptySepayLedger(), new Date("2026-09-09T12:00:00Z"));
  assert.deepEqual(quote.months, ["2026-09"]);
  assert.equal(quote.billed, 8);
  assert.equal(quote.amount, 800_000);
  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions: [septemberHoliday()], method: "TRANSFER", now: new Date("2026-09-09T12:00:00Z") });
  assert.ok(!("error" in collected));
  if (!("error" in collected)) {
    assert.equal(collected.remainingAfter, 7, "đã thu 8 buổi tháng 9, tới 09/09 chỉ mới dạy 1 buổi");
    assert.equal(collected.paidThroughMonth, "2026-09");
  }
});

test("deleting a monthly tuition receipt restores the unpaid month and consumed credits", () => {
  const cls = monthlyClass();
  const student = {
    ...testStudent(),
    sessionBalances: { [cls.id]: 0 },
    tuitionCredits: { [cls.id]: 1 },
    tuitionPaidThrough: { [cls.id]: "2026-10" },
  };
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const sessions = [teacherOff];
  const collected = collectManualTuition({
    ledger: emptySepayLedger(),
    student,
    cls,
    sessions,
    method: "TRANSFER",
    now: new Date("2026-11-09T12:00:00Z"),
  });
  assert.ok(!("error" in collected));
  if ("error" in collected) return;
  assert.equal(collected.charge.creditSessions, 1);

  const paidStudent = {
    ...student,
    sessionBalances: { [cls.id]: collected.remainingAfter },
    tuitionCredits: { [cls.id]: 0 },
    tuitionPaidThrough: { [cls.id]: "2026-11" },
  };
  const reversed = reverseTuitionReceipt({
    ledger: collected.ledger,
    receiptId: collected.receipt.id,
    students: [paidStudent],
    classes: [cls],
    sessions,
  });
  assert.ok(!("error" in reversed));
  if ("error" in reversed) return;
  assert.equal(reversed.ledger.receivables[0]?.status, "OPEN");
  assert.equal(reversed.ledger.receivables[0]?.amountPaid, 0);
  assert.equal(reversed.ledger.payments[0]?.status, "VOIDED");
  assert.equal(reversed.ledger.receipts.length, 0);
  // Đã thu tới tháng 10 = 9 + 8 buổi; buổi GV nghỉ 07/10 vẫn tính phí → 17 − 1 = 16.
  assert.equal(reversed.students[0]?.sessionBalances?.[cls.id], 16);
  assert.equal(reversed.students[0]?.tuitionCredits?.[cls.id], 1);
  assert.equal(reversed.students[0]?.tuitionPaidThrough?.[cls.id], "2026-10");
});

test("August debt plus September tuition totals seventeen sessions and 1.7 million", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), fullName: "Hồ Ngọc Hân", sessionBalances: { [cls.id]: -11 }, tuitionPaidThrough: { [cls.id]: "2026-07" } };
  const quote = tuitionCollectionCharge(student, cls, [septemberHoliday()], emptySepayLedger(), new Date("2026-09-09T12:00:00Z"));
  assert.deepEqual(quote.months, ["2026-08", "2026-09"]);
  assert.deepEqual(quote.items.map((row) => row.billed), [9, 8]);
  assert.equal(quote.amount, 1_700_000);
  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions: [septemberHoliday()], method: "CASH", now: new Date("2026-09-09T12:00:00Z") });
  assert.ok(!("error" in collected));
  // Số buổi tồn chỉ tính từ 01/09, nên 9 buổi nợ tháng 8 vào tiền mà không vào số tồn.
  if (!("error" in collected)) assert.equal(collected.remainingAfter, 7);
});

function taughtSession(status: DemoLessonSession["status"], extra: Partial<DemoLessonSession> = {}): DemoLessonSession {
  return {
    id: "session-1",
    classId: "class-test",
    date: "2026-09-09",
    startTime: "08:00",
    endTime: "09:30",
    teacherId: "teacher-test",
    roomId: "",
    status,
    isExtra: false,
    recurrenceKey: "class-test|2026-09-09|08:00",
    note: "",
    isOff: false,
    attendance: [{ studentId: "student-test", status: "EXCUSED", lessonRating: null, homeworkRating: null, pronunciationVideoDone: false, note: "" }],
    ...extra,
  };
}

test("saving attendance deducts one session even when the student is excused", () => {
  const cls = courseClass(24);
  const students = applyAttendanceSessionBalances(
    [testStudent()],
    [cls],
    [],
    [taughtSession("COMPLETED")],
  );
  assert.equal(students[0].sessionBalances?.[cls.id], 23);
});

test("saving attendance again does not deduct a second time", () => {
  const cls = courseClass(24);
  const session = taughtSession("COMPLETED");
  const first = applyAttendanceSessionBalances([testStudent()], [cls], [], [session]);
  const second = applyAttendanceSessionBalances(first, [cls], [session], [{ ...session, attendance: [{ ...session.attendance![0], status: "ABSENT" }] }]);
  assert.equal(second[0].sessionBalances?.[cls.id], 23);
});

test("reopening attendance with a generated id does not deduct the same timetable session twice", () => {
  const cls = courseClass(24);
  const stored = taughtSession("COMPLETED", { id: "saved-session" });
  const edited = taughtSession("COMPLETED", {
    id: "recurring|class-test|2026-09-09|08:00",
    attendance: [{ ...stored.attendance![0], status: "PRESENT", note: "edited" }],
  });
  const students = applyAttendanceSessionBalances([testStudent()], [cls], [stored], [edited]);
  assert.equal(students[0].sessionBalances?.[cls.id], 23);
});

test("marking the class off refunds the deducted session", () => {
  const cls = courseClass(24);
  const taught = taughtSession("COMPLETED");
  const afterTeach = applyAttendanceSessionBalances([testStudent()], [cls], [], [taught]);
  const afterOff = applyAttendanceSessionBalances(
    afterTeach,
    [cls],
    [taught],
    [{ ...taught, status: "SCHEDULED", isOff: true }],
  );
  assert.equal(afterOff[0].sessionBalances?.[cls.id], 24);
});

test("admin-planned class-off never deducts remaining sessions", () => {
  const cls = courseClass(24);
  const students = applyAttendanceSessionBalances(
    [testStudent()],
    [cls],
    [],
    [taughtSession("SCHEDULED", { isOff: true, offSource: "ADMIN" })],
  );
  assert.equal(students[0].sessionBalances?.[cls.id], 24);
});

test("teacher-off does not deduct remaining for course classes — the course extends", () => {
  const cls = courseClass(24);
  const students = applyAttendanceSessionBalances(
    [testStudent()],
    [cls],
    [],
    [taughtSession("SCHEDULED", { isOff: true, offSource: "TEACHER" })],
  );
  // Buổi GV nghỉ không chiếm suất khóa: không trừ số dư, không cấp credit —
  // khóa tự kéo dài một suất để học bù.
  assert.equal(students[0].sessionBalances?.[cls.id], 24);
  assert.equal(students[0].tuitionCredits?.[cls.id] ?? 0, 0);
});

test("makeup after teacher-off does not deduct remaining again", () => {
  const cls = courseClass(24);
  const teacherOff = taughtSession("SCHEDULED", { isOff: true, offSource: "TEACHER" });
  const afterOff = applyAttendanceSessionBalances([testStudent()], [cls], [], [teacherOff]);
  const makeup = taughtSession("COMPLETED", { id: teacherOff.id, recurrenceKey: teacherOff.recurrenceKey });
  const afterMakeup = applyAttendanceSessionBalances(afterOff, [cls], [teacherOff], [makeup]);
  assert.equal(afterMakeup[0].sessionBalances?.[cls.id], 23);
  assert.equal(afterMakeup[0].tuitionCredits?.[cls.id] ?? 0, 0);
});

test("teacher-off made up by another session stops crediting the next month", () => {
  const cls = monthlyClass();
  const off = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const afterOff = applyAttendanceSessionBalances([testStudent()], [cls], [], [off]);
  assert.equal(afterOff[0].tuitionCredits?.[cls.id], 1, "buổi GV nghỉ tạo 1 tín dụng chờ khấu trừ");
  const makeup: DemoLessonSession = {
    ...taughtSession("COMPLETED"),
    id: "session-makeup-oct",
    date: "2026-10-31",
    startTime: "15:00",
    endTime: "16:30",
    recurrenceKey: "class-test|2026-10-31|15:00",
    makeupOf: off.id,
  };
  const madeUp = applyAttendanceSessionBalances(afterOff, [cls], [off], [off, makeup]);
  assert.equal(madeUp[0].tuitionCredits?.[cls.id] ?? 0, 0, "đã dạy bù thì không còn tín dụng buổi nghỉ");
  const unlinked = applyAttendanceSessionBalances(madeUp, [cls], [off, makeup], [off]);
  assert.equal(unlinked[0].tuitionCredits?.[cls.id], 1, "gỡ buổi bù thì trả lại tín dụng");
});

test("admin holiday overrides teacher-off and refunds the billed session", () => {
  const cls = courseClass(24);
  const teacherOff = taughtSession("SCHEDULED", { isOff: true, offSource: "TEACHER" });
  const afterOff = applyAttendanceSessionBalances([testStudent()], [cls], [], [teacherOff]);
  const adminOff = { ...teacherOff, offSource: "ADMIN" as const };
  const afterAdmin = applyAttendanceSessionBalances(afterOff, [cls], [teacherOff], [adminOff]);
  assert.equal(afterAdmin[0].sessionBalances?.[cls.id], 24);
  assert.equal(afterAdmin[0].tuitionCredits?.[cls.id] ?? 0, 0);
});

test("teacher-off backfill deducts remaining without adding next-period credit", () => {
  const cls = monthlyClass();
  const teacherOff = taughtSession("SCHEDULED", { isOff: true, offSource: "TEACHER" });
  const first = backfillTeacherOffRemaining([testStudent()], [cls], [teacherOff]);
  assert.equal(first[0].sessionBalances?.[cls.id], 9);
  assert.equal(first[0].tuitionCredits?.[cls.id], undefined);
});

test("teacher cancellation keeps the finalized month fee and credits the next month", () => {
  const cls = monthlyClass();
  const teacherOff = septemberHoliday();
  teacherOff.offSource = "TEACHER";
  const afterOff = new Date(2026, 8, 3, 12);
  const credited = applyAttendanceSessionBalances([testStudent()], [cls], [], [teacherOff], emptySepayLedger(), afterOff);
  assert.equal(credited[0].sessionBalances?.[cls.id], -1);
  assert.equal(credited[0].tuitionCredits?.[cls.id], 1);
  const restored = applyAttendanceSessionBalances(credited, [cls], [teacherOff], [taughtSession("COMPLETED", { id: teacherOff.id, recurrenceKey: teacherOff.recurrenceKey, date: teacherOff.date, startTime: teacherOff.startTime, endTime: teacherOff.endTime })], emptySepayLedger(), afterOff);
  assert.equal(restored[0].sessionBalances?.[cls.id], -1, "makeup must not deduct the same billed session twice");
  assert.equal(restored[0].tuitionCredits?.[cls.id], 0, "re-attending a teacher-cancelled lesson removes its pending credit");
  const september = classTuitionCharge(cls, [teacherOff], "2026-09");
  assert.equal(september.billed, 9, "teacher cancellation must not reopen the finalized September fee");

  const student = { ...testStudent(), sessionBalances: { [cls.id]: 1 }, tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const octoberOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const quote = tuitionCollectionCharge(student, cls, [octoberOff], emptySepayLedger(), new Date("2026-11-10T12:00:00Z"));
  assert.deepEqual(quote.months, ["2026-11"]);
  assert.equal(quote.items[0].originalBilled, 9);
  assert.equal(quote.items[0].creditSessions, 1);
  assert.equal(quote.billed, 8);
  assert.equal(quote.amount, 800_000);

  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions: [octoberOff], method: "TRANSFER", now: new Date("2026-11-10T12:00:00Z") });
  assert.ok(!("error" in collected));
  if (!("error" in collected)) assert.equal(collected.remainingAfter >= 0, true);
});

function octoberHoliday(): DemoLessonSession {
  // Buổi T4 07/10/2026 — khung 14:30–16:30 của monthlyClass.
  return {
    ...septemberHoliday(),
    id: "session-oct-holiday",
    date: "2026-10-07",
    recurrenceKey: "class-test|2026-10-07|14:30",
    note: "Nghỉ tháng 10",
  };
}

test("teacher-off left standing through month end deducts one session on the next bill", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  // Phiếu tháng 11: 9 buổi theo lịch, khấu trừ 1 buổi nghỉ GV của tháng 10.
  const november = classTuitionCharge(cls, [teacherOff], "2026-11");
  assert.equal(november.billed, 9, "số buổi được cộng của tháng 11 vẫn tính đủ");
  assert.equal(november.offCreditSessions, 1);
  assert.equal(november.amount, 800_000);
  // Buổi nghỉ đã được tính phí ở phiếu tháng 10 — tháng 10 không tự khấu trừ.
  const october = classTuitionCharge(cls, [teacherOff], "2026-10");
  assert.equal(october.offCreditSessions, 0);
  assert.equal(october.billed, 8);
});

test("October bill skips the deduction — pre-October offs were settled manually", () => {
  const cls = monthlyClass();
  const teacherOff = { ...septemberHoliday(), offSource: "TEACHER" as const };
  const septemberOff = classTuitionCharge(cls, [teacherOff], "2026-10");
  assert.equal(septemberOff.offCreditSessions, 0, "phiếu tháng 10 không khấu trừ buổi nghỉ tháng 9");
  assert.equal(septemberOff.amount, 800_000);
  // Quote cũng không trừ dù học viên đã đóng tháng 9.
  const student = { ...testStudent(), tuitionPaidThrough: { [cls.id]: "2026-09" } };
  const quote = tuitionCollectionCharge(student, cls, [teacherOff], emptySepayLedger(), new Date("2026-10-10T12:00:00Z"));
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 800_000);
});

test("implicit teacher-off credit covers legacy offs missing stored tuitionCredits", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const student = { ...testStudent(), tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const quote = tuitionCollectionCharge(student, cls, [teacherOff], emptySepayLedger(), new Date("2026-11-10T12:00:00Z"));
  assert.deepEqual(quote.months, ["2026-11"]);
  assert.equal(quote.items[0].creditSessions, 1, "không cần tuitionCredits lưu sẵn vẫn được khấu trừ");
  assert.equal(quote.items[0].originalBilled, 9);
  assert.equal(quote.amount, 800_000);
});

test("unpaid student with an October receivable still gets the November deduction", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const student = { ...testStudent(), sessionBalances: {} };
  const ledger = emptySepayLedger();
  ledger.receivables.push({
    id: "rec-oct",
    receivableCode: "REC-OCT",
    studentId: student.id,
    studentName: student.fullName,
    billingPeriod: "Tháng 10/2026",
    issueDate: "2026-10-01",
    dueDate: "2026-10-10",
    amountDue: 800_000,
    amountPaid: 0,
    balanceDue: 800_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: "order-oct",
    classId: cls.id,
    billKey: `month|${cls.id}|2026-10`,
  });
  const quote = tuitionCollectionCharge(student, cls, [teacherOff], ledger, new Date("2026-11-10T12:00:00Z"));
  // Phiếu T10 chưa đóng đứng riêng (nợ cũ); báo giá T11 = 9 buổi − 1 buổi GV nghỉ T10.
  assert.deepEqual(quote.months, ["2026-11"]);
  assert.equal(quote.items[0].creditSessions, 1, "chưa đóng nhưng đã bị tính phí tháng 10 thì vẫn được trừ");
  assert.equal(quote.items[0].billed, 8);
  assert.equal(quote.amount, 800_000);
  assert.deepEqual(monthlyCarryReceivables(ledger, student.id, cls.id, new Date("2026-11-10T12:00:00Z")).map((row) => row.id), ["rec-oct"], "T10 là nợ cũ");
});

test("teacher-off deduction does not apply to students never billed the off month", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const newcomer = { ...testStudent("student-new"), sessionBalances: {} };
  const quote = tuitionCollectionCharge(newcomer, cls, [teacherOff], emptySepayLedger(), new Date("2026-11-10T12:00:00Z"));
  assert.equal(quote.items[0].creditSessions, 0, "học viên mới vào tháng 11 không bị trừ buổi nghỉ tháng 10");
  assert.equal(quote.amount, 900_000);
});

test("stored tuitionCredits never stack on top of the implicit off deduction", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const student = { ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const quote = tuitionCollectionCharge(student, cls, [teacherOff], emptySepayLedger(), new Date("2026-11-10T12:00:00Z"));
  assert.equal(quote.items[0].creditSessions, 1, "cùng một buổi nghỉ không được trừ hai lần");
  assert.equal(quote.amount, 800_000);
});

test("admin-planned off does not create a next-month deduction", () => {
  const cls = monthlyClass();
  const october = classTuitionCharge(cls, [septemberHoliday()], "2026-10");
  assert.equal(october.offCreditSessions, 0);
  assert.equal(october.amount, 800_000);
});

test("reverting a teacher-off removes the next-month deduction", () => {
  const cls = monthlyClass();
  const makeup = { ...octoberHoliday(), offSource: "TEACHER" as const, isOff: false, status: "COMPLETED" as const };
  const november = classTuitionCharge(cls, [makeup], "2026-11");
  assert.equal(november.offCreditSessions, 0);
  assert.equal(november.amount, 900_000);
});

test("sync receivables nets the prev-month teacher-off only for students billed that month", () => {
  const cls = monthlyClass();
  const teacherOff = { ...octoberHoliday(), offSource: "TEACHER" as const };
  const billed = { ...testStudent(), tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const newcomer = { ...testStudent("student-new"), sessionBalances: {} };
  cls.studentIds = [billed.id, newcomer.id];
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [billed, newcomer], [teacherOff], new Date("2026-11-10T12:00:00Z"));
  assert.equal(ledger.receivables.find((row) => row.studentId === billed.id)?.amountDue, 800_000);
  assert.equal(ledger.receivables.find((row) => row.studentId === newcomer.id)?.amountDue, 900_000, "học viên mới vào không bị trừ buổi nghỉ của tháng trước");
});

test("teacher-off no longer credits the next course — the extended course absorbs it", () => {
  const cls = courseClass(24);
  // tuitionCredits dương sót từ cơ chế cũ phải bị bỏ qua (migration sẽ xóa hẳn).
  const student = { ...testStudent(), sessionBalances: { [cls.id]: 0 }, tuitionCredits: { [cls.id]: 1 } };
  const firstQuote = tuitionCollectionCharge(student, cls, [], emptySepayLedger());
  if (firstQuote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(firstQuote.originalBilled, 24);
  assert.equal(firstQuote.creditSessions, 0);
  assert.equal(firstQuote.billed, 24);

  const firstCollection = collectManualTuition({
    ledger: emptySepayLedger(),
    student,
    cls,
    sessions: [],
    method: "TRANSFER",
  });
  assert.ok(!("error" in firstCollection));
  if ("error" in firstCollection) return;

  const nextQuote = tuitionCollectionCharge(student, cls, [], firstCollection.ledger, new Date(), 2);
  if (nextQuote.mode !== "COURSE") return assert.fail("expected a next-course tuition quote");
  assert.equal(nextQuote.originalBilled, 24);
  assert.equal(nextQuote.creditSessions, 0, "lớp thu khóa không còn khấu trừ buổi GV nghỉ khóa trước");
  assert.equal(nextQuote.billed, 24);
  assert.equal(nextQuote.amount, 24 * cls.sessionPrice!);
  assert.equal(nextQuote.billKey, `course|${cls.id}|2`);
  assert.match(nextQuote.period, /Khóa kế tiếp 24 buổi/);
});

function scheduledCourseClass(): DemoClass {
  // Khóa 4 buổi từ 01/09, học thứ 3 + thứ 7: khóa 1 = 01,05,08,12/09;
  // khóa 2 bắt đầu 15/09.
  return {
    ...courseClass(4),
    courseStartDate: "2026-09-01",
    sessionPrice: 100_000,
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
    ],
  };
}

function courseOneTeacherOff(cls: DemoClass): DemoLessonSession {
  return {
    id: "off-course-1",
    classId: cls.id,
    date: "2026-09-05",
    startTime: "09:00",
    endTime: "11:00",
    teacherId: cls.teacherId,
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${cls.id}|2026-09-05|09:00`,
    note: "GV nghỉ",
    isOff: true,
    offSource: "TEACHER",
    attendance: [],
  };
}

test("course teacher-off extends the course window instead of crediting the next course", () => {
  // Ca S14: buổi GV nghỉ 05/09 trong khóa 1 → khóa 1 trượt buổi cuối sang
  // 15/09, khóa 2 bắt đầu 19/09 và vẫn thu đủ 4 buổi.
  const cls = scheduledCourseClass();
  const sessions = [courseOneTeacherOff(cls)];
  const now = new Date("2026-10-10T12:00:00Z");
  const courseOne = classCourseSessionsForCourse(cls, sessions, 1, now).map((item) => item.date);
  assert.deepEqual(courseOne, ["2026-09-01", "2026-09-08", "2026-09-12", "2026-09-15"]);
  const courseTwo = classCourseSessionsForCourse(cls, sessions, 2, now).map((item) => item.date);
  assert.deepEqual(courseTwo, ["2026-09-19", "2026-09-22", "2026-09-26", "2026-09-29"]);

  // Báo giá khóa 2 (chỉ định khóa): khóa 2 vẫn đủ 4 buổi.
  const quote = tuitionCollectionCharge(testStudent(), cls, sessions, emptySepayLedger(), now, 2);
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.billKey, `course|${cls.id}|2`);
  assert.equal(quote.originalBilled, 4);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.billed, 4);
  assert.equal(quote.amount, 400_000);
});

test("stale stored tuitionCredits no longer reduce a course bill", () => {
  const cls = scheduledCourseClass();
  const student = { ...testStudent(), tuitionCredits: { [cls.id]: 1 } };
  const quote = tuitionCollectionCharge(student, cls, [courseOneTeacherOff(cls)], emptySepayLedger(), new Date("2026-10-10T12:00:00Z"));
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.billed, 4);
  assert.equal(quote.amount, 400_000);
});

test("a student who joined after the teacher-off still pays the full next course", () => {
  const cls = scheduledCourseClass();
  const newcomer = { ...testStudent(), classJoinedAt: { [cls.id]: "2026-09-10" } };
  const quote = tuitionCollectionCharge(newcomer, cls, [courseOneTeacherOff(cls)], emptySepayLedger(), new Date("2026-10-10T12:00:00Z"), 2);
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 400_000);
});

test("admin-planned off still occupies a course slot and does not shift the next course", () => {
  const cls = scheduledCourseClass();
  const adminOff = { ...courseOneTeacherOff(cls), offSource: "ADMIN" as const };
  const now = new Date("2026-10-10T12:00:00Z");
  // Nghỉ lễ admin vẫn chiếm suất khóa: khóa 1 kết thúc 12/09, khóa 2 bắt đầu 15/09.
  const courseOne = classCourseSessionsForCourse(cls, [adminOff], 1, now).map((item) => item.date);
  assert.deepEqual(courseOne, ["2026-09-01", "2026-09-05", "2026-09-08", "2026-09-12"]);
  const quote = tuitionCollectionCharge(testStudent(), cls, [adminOff], emptySepayLedger(), now);
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.amount, 400_000);
});

test("clearCourseTeacherCredits drops stale positive credits but keeps old debt and monthly credits", () => {
  const course = courseClass(24);
  const monthly = { ...courseClass(24), id: "class-monthly", billingMode: "MONTHLY" as const };
  const student = {
    ...testStudent(),
    tuitionCredits: { [course.id]: 2, [monthly.id]: 1, "class-other": -3 },
  };
  const [next] = clearCourseTeacherCredits([student], [course, monthly]);
  assert.equal(next.tuitionCredits?.[course.id], undefined);
  assert.equal(next.tuitionCredits?.[monthly.id], 1, "credit lớp thu tháng giữ nguyên");
  assert.equal(next.tuitionCredits?.["class-other"], -3, "nợ cũ (âm) giữ nguyên");
});

test("clearMonthlyTeacherCredits drops stale positive credits but keeps old debt and course credits", () => {
  const course = courseClass(24);
  const monthly = { ...courseClass(24), id: "class-monthly", billingMode: "MONTHLY" as const };
  const student = {
    ...testStudent(),
    tuitionCredits: { [course.id]: 2, [monthly.id]: 1, "class-other": -3 },
  };
  const [next] = clearMonthlyTeacherCredits([student], [course, monthly]);
  assert.equal(next.tuitionCredits?.[monthly.id], undefined, "credit sót trước T10 bị xóa — kế toán đã trừ tay");
  assert.equal(next.tuitionCredits?.[course.id], 2, "credit lớp thu khóa giữ nguyên");
  assert.equal(next.tuitionCredits?.["class-other"], -3, "nợ cũ (âm) giữ nguyên");
});

test("a student newly added mid-course is billed the same course as open peer receivables", () => {
  const cls: DemoClass = {
    ...courseClass(24),
    courseStartDate: "2026-09-28",
    studentIds: ["peer-1", "peer-2", "student-new"],
    schedules: [
      { weekday: 3, periodId: "wed", startTime: "19:00", endTime: "20:30" },
      { weekday: 0, periodId: "sun", startTime: "09:30", endTime: "11:00" },
    ],
  };
  const now = new Date("2026-10-01T12:00:00+07:00"); // lớp đã học 1 buổi (30/9)
  const peers = [testStudent("peer-1"), testStudent("peer-2")];
  const newcomer = { ...testStudent("student-new"), sessionBalances: { [cls.id]: -1 } };
  const ledger = emptySepayLedger();
  for (const [index, peer] of peers.entries()) {
    ledger.receivables.push({
      id: `rec-peer-${index}`,
      receivableCode: `HP-PEER-${index}`,
      studentId: peer.id,
      studentName: peer.fullName,
      billingPeriod: "Khóa 24 buổi",
      issueDate: "2026-09-28",
      dueDate: "2026-10-05",
      amountDue: 1_560_000,
      amountPaid: 0,
      balanceDue: 1_560_000,
      currency: "VND",
      status: "OPEN",
      paymentOrderId: `order-peer-${index}`,
      classId: cls.id,
      billKey: `course|${cls.id}`,
    });
  }
  const quote = tuitionCollectionCharge(newcomer, cls, [], ledger, now);
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.billKey, `course|${cls.id}`, "học viên mới vào lớp thu cùng khóa đang mở với các bạn");
  assert.equal(quote.amount, 24 * cls.sessionPrice!);
});

test("a pre-created next-course receivable does not jump ahead of the course in progress", () => {
  const cls: DemoClass = {
    ...courseClass(24),
    courseStartDate: "2026-09-28",
    studentIds: ["peer-1", "student-new"],
    schedules: [{ weekday: 3, periodId: "wed", startTime: "19:00", endTime: "20:30" }],
  };
  const now = new Date("2026-10-01T12:00:00+07:00");
  const newcomer = testStudent("student-new");
  const ledger = emptySepayLedger();
  ledger.receivables.push({
    id: "rec-new-2",
    receivableCode: "HP-NEW-2",
    studentId: newcomer.id,
    studentName: newcomer.fullName,
    billingPeriod: "Khóa 2",
    issueDate: "2026-09-30",
    dueDate: "2026-10-07",
    amountDue: 1_560_000,
    amountPaid: 0,
    balanceDue: 1_560_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: "order-new-2",
    classId: cls.id,
    billKey: `course|${cls.id}|2`,
  });
  // Bạn cùng lớp đang mở khóa 1 nhưng học viên này đã có phiếu khóa 2 → thu tiếp khóa 2.
  ledger.receivables.push({
    id: "rec-peer-1",
    receivableCode: "HP-PEER-1",
    studentId: "peer-1",
    studentName: "Bạn cùng lớp",
    billingPeriod: "Khóa 24 buổi",
    issueDate: "2026-09-28",
    dueDate: "2026-10-05",
    amountDue: 1_560_000,
    amountPaid: 0,
    balanceDue: 1_560_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: "order-peer-1",
    classId: cls.id,
    billKey: `course|${cls.id}`,
  });
  const quote = tuitionCollectionCharge(newcomer, cls, [], ledger, now);
  if (quote.mode !== "COURSE") return assert.fail("expected a course tuition quote");
  assert.equal(quote.billKey, `course|${cls.id}`, "lớp đang học khóa 1 — thu khóa 1 trước, phiếu khóa 2 lập sẵn chưa tới lượt");
  const blocked = collectManualTuition({ ledger, student: newcomer, cls, sessions: [], method: "CASH", now, courseIndexOverride: 2 });
  assert.ok("error" in blocked && /chưa bắt đầu/.test(blocked.error), "khóa 2 chưa bắt đầu thì không thu được");
});

test("a student joining from the 2nd session is not charged the 1st session", () => {
  const cls: DemoClass = {
    ...courseClass(24),
    courseStartDate: "2026-09-28",
    studentIds: ["student-1", "student-2"],
    schedules: [{ weekday: 3, periodId: "wed", startTime: "19:00", endTime: "20:30" }],
  };
  const now = new Date("2026-10-01T12:00:00+07:00"); // lớp đã học 1 buổi (30/9)
  const ledger = emptySepayLedger();
  for (const [index, studentId] of ["student-1", "student-2"].entries()) {
    ledger.receivables.push({
      id: `rec-join-${index}`,
      receivableCode: `HP-JOIN-${index}`,
      studentId,
      studentName: studentId,
      billingPeriod: "Khóa 24 buổi",
      issueDate: "2026-09-28",
      dueDate: "2026-10-05",
      amountDue: 1_560_000,
      amountPaid: 0,
      balanceDue: 1_560_000,
      currency: "VND",
      status: "OPEN",
      paymentOrderId: `order-join-${index}`,
      classId: cls.id,
      billKey: `course|${cls.id}`,
    });
  }
  const onTime = testStudent("student-1");
  const lateJoiner = { ...testStudent("student-2"), classJoinedAt: { [cls.id]: "2026-10-07" } };
  // Cả hai đều có phiếu khóa 1 đang mở: paid = 0. Người vào từ buổi 1 nợ 1 buổi (-1),
  // người vào từ buổi 2 (07/10) không bị tính buổi 30/9 → số dư 0.
  assert.equal(studentRemainingSessions(onTime, cls, [], ledger, now), -1);
  assert.equal(studentRemainingSessions(lateJoiner, cls, [], ledger, now), 0);
});

test("a course that started before go-live without any receivable counts as paid outside the system", () => {
  const cls: DemoClass = {
    ...courseClass(24),
    courseStartDate: "2026-08-05",
    schedules: [{ weekday: 3, periodId: "wed", startTime: "19:00", endTime: "20:30" }],
  };
  const now = new Date("2026-10-01T12:00:00+07:00");
  const student = testStudent();
  const synced = syncTuitionReceivables(emptySepayLedger(), [{ ...cls, studentIds: [student.id] }], [student], [], now);
  assert.equal(synced.receivables.length, 0, "khóa 1 thu trước khi dùng hệ thống — không lập phiếu, không tính nợ");
  const blocked = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions: [], method: "CASH", now, courseIndexOverride: 1 });
  assert.ok("error" in blocked && /trước khi dùng hệ thống/.test(blocked.error));
});

test("September reset starts every class at 0 then applies attendance and tuition receipts", () => {
  const cls = monthlyClass();
  cls.studentIds = ["student-test", "student-paid"];
  const leftover = { ...testStudent(), sessionBalances: { [cls.id]: -11 }, tuitionPaidThrough: { [cls.id]: "2026-07" } };
  const paid = {
    ...testStudent("student-paid"),
    fullName: "Đã đóng tháng 9",
    sessionBalances: { [cls.id]: 20 },
    tuitionPaidThrough: { [cls.id]: "2026-09" },
  };
  const ledger = emptySepayLedger();
  ledger.receipts = [{
    id: "rcpt-1",
    receiptNumber: "BL0001",
    paymentId: "pay-1",
    studentId: paid.id,
    amount: 800_000,
    issuedAt: "2026-09-05T00:00:00.000Z",
    status: "ISSUED",
    classId: cls.id,
    billingPeriod: "Tháng 09/2026 · Lớp kiểm thử",
    billingMode: "MONTHLY",
  }];
  const [resetLeftover] = rebuildSeptemberSessionBalances([leftover], [cls], [], ledger);
  assert.equal(resetLeftover.sessionBalances?.[cls.id], 0);
  assert.equal(resetLeftover.tuitionPaidThrough?.[cls.id], undefined);

  const [afterAttend, afterPay] = rebuildSeptemberSessionBalances(
    [leftover, paid],
    [cls],
    [taughtSession("COMPLETED")],
    ledger,
  );
  assert.equal(afterAttend.sessionBalances?.[cls.id], -1);
  assert.equal(afterPay.sessionBalances?.[cls.id], classTuitionCharge(cls, [], "2026-09").billed - 1);
  assert.equal(afterPay.tuitionPaidThrough?.[cls.id], "2026-09");
});

test("monthly schedule change keeps old weekdays before the switch and new weekdays after", () => {
  const cls: DemoClass = {
    ...courseClass(),
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 0, periodId: "sun", startTime: "18:30", endTime: "20:30" },
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00", effectiveTo: "2026-09-06" },
      { weekday: 5, periodId: "fri", startTime: "15:00", endTime: "17:00", effectiveFrom: "2026-09-07" },
    ],
  };
  const adminOff: DemoLessonSession = {
    id: "t7-sep1", classId: cls.id, date: "2026-09-01", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: `${cls.id}|2026-09-01|17:00`, note: "", isOff: true, offSource: "ADMIN", attendance: [],
  };
  assert.equal(billedMonthSessions(cls, [adminOff], "2026-09"), 7);
  const charge = classTuitionCharge(cls, [adminOff], "2026-09");
  assert.equal(charge.billed, 7);
  assert.equal(charge.amount, 350_000);
});

/** Lớp S1 thật: T3 17:00 và T7 09:00, 01/09 nghỉ lễ đã khóa, 05/09 giáo viên cho nghỉ. */
function s1Class(): DemoClass {
  return {
    ...courseClass(24),
    billingMode: "MONTHLY",
    sessionPrice: 65_000,
    schedules: [
      { weekday: 2, periodId: "period-tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 6, periodId: "period-sat", startTime: "09:00", endTime: "11:00" },
    ],
  };
}

function s1StoredSessions(): DemoLessonSession[] {
  const base = {
    classId: "class-test",
    teacherId: "teacher-test",
    roomId: "",
    isExtra: false,
    note: "",
    attendance: [],
  };
  return [
    {
      ...base,
      id: "s1-holiday",
      date: "2026-09-01",
      startTime: "17:00",
      endTime: "19:00",
      status: "SCHEDULED",
      recurrenceKey: "class-test|2026-09-01|17:00",
      isOff: true,
      offSource: "ADMIN",
    },
    {
      ...base,
      id: "s1-teacher-off",
      date: "2026-09-05",
      startTime: "09:00",
      endTime: "11:00",
      status: "SCHEDULED",
      recurrenceKey: "class-test|2026-09-05|09:00",
      isOff: true,
      offSource: "TEACHER",
    },
  ];
}

test("monthly remaining follows the timetable even when attendance was never saved", () => {
  const cls = s1Class();
  const sessions = s1StoredSessions();
  // Bộ đếm trong dữ liệu chỉ ghi nhận 1 buổi và đã lệch, phải bị bỏ qua.
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -1 } };

  // 17/09: đã qua 01 (nghỉ lễ, không tính), 05, 08, 12, 15 → 4 buổi tính phí.
  assert.equal(studentRemainingSessions(student, cls, sessions, emptySepayLedger(), new Date(2026, 8, 17, 12)), -4);
  // Hết tháng: thêm 19, 22, 26, 29 → 8 buổi.
  assert.equal(studentRemainingSessions(student, cls, sessions, emptySepayLedger(), new Date(2026, 9, 1, 12)), -8);
  assert.equal(billedMonthSessions(cls, sessions, "2026-09"), 8, "tiền học phí tháng cũng là 8 buổi");
});

test("saving the missing attendance keeps the same monthly remaining", () => {
  const cls = s1Class();
  const now = new Date(2026, 8, 17, 12);
  const previous = s1StoredSessions();
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -1 } };

  const marked = ["2026-09-08", "2026-09-15"].map((date): DemoLessonSession => ({
    classId: cls.id,
    id: `s1-${date}`,
    date,
    startTime: "17:00",
    endTime: "19:00",
    teacherId: cls.teacherId,
    roomId: "",
    status: "COMPLETED",
    isExtra: false,
    recurrenceKey: `${cls.id}|${date}|17:00`,
    note: "",
    isOff: false,
    attendance: [{ studentId: student.id, status: "PRESENT", lessonRating: null, homeworkRating: null, pronunciationVideoDone: false, note: "" }],
  }));
  const next = [...previous, ...marked];

  const [updated] = applyAttendanceSessionBalances([student], [cls], previous, next, emptySepayLedger(), now);
  assert.equal(updated!.sessionBalances?.[cls.id], -4, "bộ đếm được tính lại đúng bằng số hiển thị");
  assert.equal(studentRemainingSessions(updated!, cls, next, emptySepayLedger(), now), -4, "tổng không đổi, không trừ hai lần");
});

test("collecting September tuition clears the timetable debt of a monthly class", () => {
  const cls = s1Class();
  const sessions = s1StoredSessions();
  const now = new Date(2026, 8, 17, 12);
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -1 }, tuitionPaidThrough: { [cls.id]: "2026-08" } };

  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions, method: "TRANSFER", now });
  assert.ok(!("error" in collected));
  if ("error" in collected) return;
  assert.equal(collected.charge.billed, 8);
  assert.equal(collected.charge.amount, 520_000);
  assert.equal(collected.remainingAfter, 4, "đã thu 8 buổi, đã học 4 buổi");

  assert.equal(studentRemainingSessions(student, cls, sessions, collected.ledger, now), 4);
  assert.equal(studentRemainingSessions(student, cls, sessions, collected.ledger, new Date(2026, 9, 1, 12)), 0, "hết tháng là về 0");
});

test("initial imports can keep class prices without creating receivables", () => {
  const cls = { ...courseClass(10), billingEnabled: false };
  const ledger = syncTuitionReceivables(
    emptySepayLedger(),
    [cls],
    [{ id: "student-test", fullName: "Học viên kiểm thử" }],
    [],
  );
  assert.deepEqual(ledger.receivables, []);
  assert.deepEqual(ledger.paymentOrders, []);
});

test("ensureReceivableForCharge dùng đúng số tiền của tuitionCollectionCharge, khớp với đường thu tay (D2)", () => {
  const cls = s1Class();
  const sessions = s1StoredSessions();
  const now = new Date(2026, 8, 17, 12);
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -1 }, tuitionPaidThrough: { [cls.id]: "2026-08" } };
  const ledger = emptySepayLedger();
  const charge = tuitionCollectionCharge(student, cls, sessions, ledger, now);

  const ensured = ensureReceivableForCharge(ledger, student, cls, charge, now.toISOString());
  assert.equal(ensured.receivable.amountDue, charge.amount, "khoản phải thu vừa tạo phải đúng bằng tuitionCollectionCharge(...).amount");
  assert.equal(ensured.receivable.billKey, charge.billKey);
  assert.equal(ensured.receivable.billingPeriod, charge.period);

  // Gọi lại đúng billKey đó phải trả về CHÍNH khoản vừa tạo, không tạo thêm khoản mới.
  const ensuredAgain = ensureReceivableForCharge(ensured.ledger, student, cls, charge, now.toISOString());
  assert.equal(ensuredAgain.receivable.id, ensured.receivable.id);
  assert.equal(ensuredAgain.ledger.receivables.length, 1);
});

test("khoản phải thu đã chốt (frozenAt) không bị syncTuitionReceivables ghi đè amountDue/billingPeriod", () => {
  const cls = s1Class();
  const sessions = s1StoredSessions();
  const now = new Date(2026, 8, 17, 12);
  const student = { ...testStudent(), sessionBalances: { [cls.id]: -1 }, tuitionPaidThrough: { [cls.id]: "2026-08" } };
  const charge = tuitionCollectionCharge(student, cls, sessions, emptySepayLedger(), now);
  const ensured = ensureReceivableForCharge(emptySepayLedger(), student, cls, charge, now.toISOString());
  const frozenLedger = {
    ...ensured.ledger,
    receivables: ensured.ledger.receivables.map((row) => row.id === ensured.receivable.id
      ? { ...row, amountDue: charge.amount, balanceDue: charge.amount, billingPeriod: charge.period, frozenAt: now.toISOString() }
      : row),
  };

  const firstSync = syncTuitionReceivables(frozenLedger, [cls], [student], sessions);
  const secondSync = syncTuitionReceivables(firstSync, [cls], [student], sessions);
  for (const synced of [firstSync, secondSync]) {
    const receivable = synced.receivables.find((row) => row.id === ensured.receivable.id);
    assert.ok(receivable, "khoản đã chốt không được biến mất");
    assert.equal(receivable!.amountDue, charge.amount, "amountDue đã chốt không được ghi đè lại theo classTuitionCharge (chỉ tháng hiện tại)");
    assert.equal(receivable!.billingPeriod, charge.period);
  }
});

/**
 * Chốt khoản phải thu rồi mô phỏng đúng chuỗi webhook thật sẽ đi qua
 * (processBankTransaction + applyMatch), trả về mọi thứ activateSessionsForPayment cần.
 */
function freezeAndMatch(cls: DemoClass, student: DemoStudent, sessions: DemoLessonSession[], now: Date, transferAmount?: number) {
  const ledger = emptySepayLedger();
  const charge = tuitionCollectionCharge(student, cls, sessions, ledger, now);
  const ensured = ensureReceivableForCharge(ledger, student, cls, charge, now.toISOString());
  const order = ensured.ledger.paymentOrders.find((row) => row.id === ensured.receivable.paymentOrderId)!;
  const tx = matchedBankTx({ content: order.paymentCode, transferAmount: transferAmount ?? charge.amount, accountNumber: ensured.ledger.settings.accountNumber });
  const matchResult = processBankTransaction(ensured.ledger, tx);
  const postMatchLedger = applyMatch({ ...ensured.ledger, bankTransactions: [tx, ...ensured.ledger.bankTransactions] }, matchResult);
  return { charge, matchResult, postMatchLedger };
}

test("activateSessionsForPayment (COURSE): tiền học liệu không bị quy thành buổi học thừa (R6)", () => {
  const cls: DemoClass = { ...courseClass(24), id: "class-r6-course", materialFees: { course: { amount: 500_000, description: "Sách giáo trình" } } };
  const student: DemoStudent = { ...testStudent("student-r6"), sessionBalances: { [cls.id]: 0 } };
  const now = new Date(2026, 8, 20, 12);

  const { charge, matchResult, postMatchLedger } = freezeAndMatch(cls, student, [], now);
  assert.equal(charge.materialsAmount, 500_000);
  assert.equal(matchResult.event, "TuitionPaymentCompleted");

  const activation = activateSessionsForPayment({
    ledger: postMatchLedger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: [student], classes: [cls], sessions: [], now,
  });
  assert.equal(activation.status, "OK");
  if (activation.status !== "OK") return;
  assert.equal(activation.receipt.materialsAmount, 500_000, "biên lai phải giữ nguyên materialsAmount");
  const nextStudent = activation.students.find((row) => row.id === student.id);
  assert.equal(nextStudent?.sessionBalances?.[cls.id], 24, "24 buổi của khóa, không cộng khống từ tiền học liệu");
});

test("activateSessionsForPayment (MONTHLY): kích hoạt xong thì tháng đó không còn bị tính phí lại (R6)", () => {
  const cls = s1Class();
  const sessions = s1StoredSessions();
  const now = new Date(2026, 8, 17, 12);
  const student: DemoStudent = { ...testStudent(), sessionBalances: { [cls.id]: -1 }, tuitionPaidThrough: { [cls.id]: "2026-08" } };

  const { charge, matchResult, postMatchLedger } = freezeAndMatch(cls, student, sessions, now);
  assert.equal(matchResult.event, "TuitionPaymentCompleted");

  const activation = activateSessionsForPayment({
    ledger: postMatchLedger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: [student], classes: [cls], sessions, now,
  });
  assert.equal(activation.status, "OK");
  if (activation.status !== "OK") return;
  assert.equal(activation.receipt.billingPeriod, charge.period);
  assert.equal(activation.receipt.billingMode, "MONTHLY");
  const nextStudent = activation.students.find((row) => row.id === student.id)!;
  // Tính lại công nợ sau khi kích hoạt: tháng vừa thu không còn xuất hiện trong danh sách tháng nợ.
  const chargeAfter = tuitionCollectionCharge(nextStudent, cls, sessions, activation.ledger, now);
  assert.deepEqual(chargeAfter.months, [], "tháng đã thu không được tính phí lại");
});

test("activateSessionsForPayment: phiếu đã gửi là số chuẩn — trả đủ phiếu thì ghi theo phiếu dù báo giá tính lại đã đổi", () => {
  const cls = monthlyClass();
  const student = testStudent();
  const now = new Date(2026, 8, 17, 12);

  const { matchResult, postMatchLedger } = freezeAndMatch(cls, student, [], now);
  assert.equal(matchResult.event, "TuitionPaymentCompleted");

  // Lớp đổi đơn giá sau khi khoản phải thu đã gửi — phụ huynh trả đúng số trên phiếu.
  const changedCls = { ...cls, sessionPrice: cls.sessionPrice + 50_000 };
  const activation = activateSessionsForPayment({
    ledger: postMatchLedger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: [student], classes: [changedCls], sessions: [], now,
  });
  assert.equal(activation.status, "OK");
  if (activation.status !== "OK") return;
  assert.equal(activation.receipt.amount, matchResult.payment!.allocatedAmount);
  assert.equal(activation.receipt.classId, cls.id);
  const month = String(matchResult.receivable!.billKey).split("|")[2];
  assert.equal(activation.students[0]!.tuitionPaidThrough?.[cls.id], month);
});

test("activateSessionsForPayment: học viên chuyển sang miễn học phí trước khi tiền về thì không kích hoạt", () => {
  const cls = monthlyClass();
  const student = testStudent();
  const now = new Date(2026, 8, 17, 12);

  const { matchResult, postMatchLedger } = freezeAndMatch(cls, student, [], now);
  const exemptStudent = { ...student, tuitionExempt: true };
  const activation = activateSessionsForPayment({
    ledger: postMatchLedger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: [exemptStudent], classes: [cls], sessions: [], now,
  });
  assert.equal(activation.status, "ERROR");
  if (activation.status !== "ERROR") return;
  assert.equal(activation.reviewReason, "TUITION_EXEMPT");
});

test("activateSessionsForPayment: bắn lặp không kích hoạt lần hai (biên lai đã có classId)", () => {
  const cls = monthlyClass();
  const student = testStudent();
  const now = new Date(2026, 8, 17, 12);

  const { matchResult, postMatchLedger } = freezeAndMatch(cls, student, [], now);
  const first = activateSessionsForPayment({
    ledger: postMatchLedger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: [student], classes: [cls], sessions: [], now,
  });
  assert.equal(first.status, "OK");
  if (first.status !== "OK") return;

  const second = activateSessionsForPayment({
    ledger: first.ledger, receivable: matchResult.receivable!, payment: matchResult.payment!,
    students: first.students, classes: [cls], sessions: [], now,
  });
  assert.equal(second.status, "ALREADY_ACTIVATED");
});

test("student joining mid-month gets a prorated bill for the join month", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-10" } };
  cls.studentIds = [student.id];
  const now = new Date("2026-10-20T12:00:00Z");
  const quote = tuitionCollectionCharge(student, cls, [], emptySepayLedger(), now);
  assert.deepEqual(quote.months, ["2026-10"]);
  // Từ 10/10 tới hết tháng theo lịch T2/T4: 12, 14, 19, 21, 26, 28 → 6 buổi.
  assert.equal(quote.billed, 6, "tháng vào lớp ra phiếu ngay, chỉ tính buổi từ ngày vào");
  assert.equal(quote.amount, 600_000);
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], now);
  assert.equal(ledger.receivables.length, 2, "phiếu tháng vào lớp + phiếu tháng sau tự lập");
  const joinBill = ledger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-10`);
  assert.equal(joinBill?.amountDue, 600_000);
  const nextBill = ledger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`);
  assert.equal(nextBill?.amountDue, 900_000, "phiếu tháng 11 đủ 9 buổi T2/T4 tự lập sẵn");
});

test("student joining on the month's last session is billed one session", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-28" } };
  cls.studentIds = [student.id];
  const quote = tuitionCollectionCharge(student, cls, [], emptySepayLedger(), new Date("2026-10-30T12:00:00Z"));
  assert.equal(quote.billed, 1, "vào đúng buổi cuối tháng (T4 28/10) → phiếu 1 buổi");
  assert.equal(quote.amount, 100_000);
});

test("unpaid join month bundles into the next month's bill", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-10" } };
  cls.studentIds = [student.id];
  const now = new Date("2026-11-03T12:00:00Z");
  const quote = tuitionCollectionCharge(student, cls, [], emptySepayLedger(), now);
  assert.deepEqual(quote.months, ["2026-10", "2026-11"], "phiếu gộp tháng vào + tháng mới = học phí mới + công nợ cũ");
  assert.equal(quote.items[0]?.originalBilled, 6, "tháng 10 prorate từ 10/10");
  assert.equal(quote.items[1]?.originalBilled, 9, "tháng 11 đủ theo lịch: 5×T2 + 4×T4");
  assert.equal(quote.billed, 15);
  assert.equal(quote.amount, 1_500_000);
});

test("student joining on the 5th bills sessions from that day", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-05" } };
  cls.studentIds = [student.id];
  const quote = tuitionCollectionCharge(student, cls, [], emptySepayLedger(), new Date("2026-10-10T12:00:00Z"));
  assert.equal(quote.billed, 8, "vào ngày 5/10 (T2) → đủ 8 buổi còn lại của tháng");
  assert.equal(quote.amount, 800_000);
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-10T12:00:00Z"));
  assert.equal(ledger.receivables[0]?.amountDue, 800_000);
});

test("sessions before the join date are not charged to a mid-month joiner", () => {
  const cls = monthlyClass();
  const now = new Date("2026-10-20T12:00:00Z");
  const baseline = chargedMonthlySessions("student-test", cls, [], now);
  const joined = chargedMonthlySessions("student-test", cls, [], now, "2026-10-10");
  assert.equal(joined, 3, "chỉ tính 12, 14, 19/10 — buổi 5, 7/10 và tháng 9 trước ngày vào");
  assert.ok(baseline > joined, "không có joinDate thì đếm hết như cũ");
});

test("a paid November settles both months for the late joiner", () => {
  const cls = monthlyClass();
  const student = {
    ...testStudent(),
    sessionBalances: {},
    classJoinedAt: { [cls.id]: "2026-10-10" },
    tuitionPaidThrough: { [cls.id]: "2026-11" },
  };
  cls.studentIds = [student.id];
  // T10 prorate 6 buổi từ 10/10 + T11 đủ 9 buổi → paid = 15; tháng 9 trước ngày vào không tính.
  assert.equal(paidSessionsSinceSeptember(student, cls, [], emptySepayLedger(), new Date("2026-11-03T12:00:00Z")), 15);
});

test("sync prorates an open receivable of the join month", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-10" } };
  cls.studentIds = [student.id];
  const ledger = emptySepayLedger();
  ledger.receivables.push({
    id: "rec-stray",
    receivableCode: "REC-STRAY",
    studentId: student.id,
    studentName: student.fullName,
    billingPeriod: "Tháng 10/2026",
    issueDate: "2026-10-01",
    dueDate: "2026-10-10",
    amountDue: 800_000,
    amountPaid: 0,
    balanceDue: 800_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: "order-stray",
    classId: cls.id,
    billKey: `month|${cls.id}|2026-10`,
  });
  ledger.paymentOrders.push({
    id: "order-stray",
    receivableId: "rec-stray",
    studentId: student.id,
    paymentCode: "HPTESTHV0001",
    amount: 800_000,
    qrUrl: "",
    status: "ACTIVE",
    createdAt: "2026-10-01T00:00:00Z",
  });
  const next = syncTuitionReceivables(ledger, [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  const joinBill = next.receivables.find((row) => row.id === "rec-stray");
  assert.equal(joinBill?.status, "OPEN", "phiếu tháng vào lớp vẫn mở, chỉ prorate số tiền");
  assert.equal(joinBill?.amountDue, 600_000);
  assert.equal(joinBill?.balanceDue, 600_000);
  assert.equal(next.paymentOrders.find((row) => row.id === "order-stray")?.amount, 600_000);
  const nextBill = next.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`);
  assert.equal(nextBill?.amountDue, 900_000, "phiếu tháng 11 tự lập sẵn với mã thanh toán riêng");
  const nextOrder = next.paymentOrders.find((row) => row.id === nextBill?.paymentOrderId);
  assert.ok(nextOrder?.paymentCode && nextOrder.paymentCode !== "HPTESTHV0001", "phiếu tháng sau không dùng lại mã của phiếu tháng này");
});

test("unpaid September stays on the October receivable as old debt", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-09-01" } };
  cls.studentIds = [student.id];
  const ledger = emptySepayLedger();
  const sep = syncTuitionReceivables(ledger, [cls], [student], [], new Date("2026-09-20T12:00:00Z"));
  assert.equal(sep.receivables[0]?.amountDue, 900_000, "tháng 9 đủ 9 buổi T2/T4");
  const oct = syncTuitionReceivables(sep, [cls], [student], [], new Date("2026-10-10T12:00:00Z"));
  const bundle = oct.receivables.find((row) => row.billKey === `months|${cls.id}|2026-09,2026-10`);
  assert.ok(bundle, "phiếu gộp T9+T10 vẫn ôm nợ cũ");
  assert.equal(bundle?.amountDue, 900_000 + 800_000, "hp tháng mới + công nợ tháng trước");
  const novBill = oct.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`);
  assert.equal(novBill?.amountDue, 900_000, "phiếu tháng 11 tự lập sẵn");
  assert.equal(oct.receivables.filter((row) => row.status === "OPEN").length, 2, "một phiếu gộp + một phiếu tháng sau, không trùng lặp");
});

test("two open month receivables merge into one bundle without double-charging", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-09-01" } };
  cls.studentIds = [student.id];
  const ledger = emptySepayLedger();
  for (const [id, month, amount] of [["rec-sep", "2026-09", 900_000], ["rec-oct", "2026-10", 800_000]] as const) {
    ledger.receivables.push({
      id,
      receivableCode: `REC-${month}`,
      studentId: student.id,
      studentName: student.fullName,
      billingPeriod: `Tháng ${month}/2026`,
      issueDate: `${month}-01`,
      dueDate: `${month}-10`,
      amountDue: amount,
      amountPaid: 0,
      balanceDue: amount,
      currency: "VND",
      status: "OPEN",
      paymentOrderId: `order-${id}`,
      classId: cls.id,
      billKey: `month|${cls.id}|${month}`,
    });
    ledger.paymentOrders.push({
      id: `order-${id}`,
      receivableId: id,
      studentId: student.id,
      paymentCode: `HPTEST${month}`,
      amount,
      qrUrl: "",
      status: "ACTIVE",
      createdAt: `${month}-01T00:00:00Z`,
    });
  }
  const next = syncTuitionReceivables(ledger, [cls], [student], [], new Date("2026-10-10T12:00:00Z"));
  const open = next.receivables.filter((row) => row.status === "OPEN");
  assert.equal(open.length, 2, "hai phiếu lẻ gộp thành một phiếu gộp + phiếu tháng 11 tự lập");
  const bundle = open.find((row) => row.billKey === `months|${cls.id}|2026-09,2026-10`);
  assert.ok(bundle, "hai phiếu lẻ gộp thành một phiếu gộp duy nhất");
  assert.equal(bundle?.amountDue, 900_000 + 800_000, "tổng công nợ hai tháng, không thu kép");
  assert.ok(open.some((row) => row.billKey === `month|${cls.id}|2026-11`), "phiếu tháng 11 tự lập riêng");
  const cancelled = next.receivables.filter((row) => row.status === "CANCELLED");
  assert.equal(cancelled.length, 1, "phiếu lẻ còn lại bị hủy");
  const cancelledOrders = next.paymentOrders.filter((row) => row.status === "CANCELLED");
  assert.equal(cancelledOrders.length, 1, "QR của phiếu lẻ cũng bị hủy");
});

test("phiếu tháng sau tự lập ngay trong tháng hiện tại — lặp lại không trùng, mã thanh toán riêng", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {} };
  cls.studentIds = [student.id];
  const now = new Date("2026-10-20T12:00:00Z");
  const first = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], now);
  const octBill = first.receivables.find((row) => row.billKey === `month|${cls.id}|2026-10`);
  const novBill = first.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`);
  assert.equal(octBill?.amountDue, 800_000);
  assert.equal(novBill?.amountDue, 900_000, "phiếu T11 tự lập sẵn — không cần bấm gửi yêu cầu");
  const octOrder = first.paymentOrders.find((row) => row.id === octBill?.paymentOrderId);
  const novOrder = first.paymentOrders.find((row) => row.id === novBill?.paymentOrderId);
  assert.ok(novOrder?.paymentCode && novOrder.paymentCode !== octOrder?.paymentCode,
    "hai phiếu hai mã — SePay đối soát chỉ theo mã nên trùng mã sẽ ghi nhầm khoản");
  const second = syncTuitionReceivables(first, [cls], [student], [], now);
  assert.equal(second.receivables.filter((row) => row.status !== "CANCELLED").length, 2, "sync lặp không sinh trùng phiếu");
});

test("phiếu tháng 10 đã gửi (frozen) giữ nguyên — phiếu tháng 11 lập riêng, không thu kép", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {} };
  cls.studentIds = [student.id];
  const octLedger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  const octBill = octLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-10`)!;
  const frozenLedger = {
    ...octLedger,
    receivables: octLedger.receivables.map((row) => (
      row.id === octBill.id ? { ...row, frozenAt: "2026-10-25T00:00:00.000Z" } : row
    )),
  };
  const novLedger = syncTuitionReceivables(frozenLedger, [cls], [student], [], new Date("2026-11-03T12:00:00Z"));
  const octAfter = novLedger.receivables.find((row) => row.id === octBill.id);
  assert.equal(octAfter?.frozenAt, "2026-10-25T00:00:00.000Z");
  assert.equal(octAfter?.billKey, `month|${cls.id}|2026-10`);
  assert.equal(octAfter?.amountDue, 800_000, "phiếu T10 đã chốt giữ nguyên số tiền");
  const novBill = novLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`);
  assert.equal(novBill?.amountDue, 900_000, "phiếu T11 vẫn riêng, không gộp T10 đã chốt");
  const decBill = novLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-12`);
  assert.equal(decBill?.amountDue, 900_000, "phiếu T12 tự lập sẵn khi đã qua T11");
  const open = novLedger.receivables.filter((row) => row.status === "OPEN");
  assert.equal(open.length, 3, "T10 chốt + T11 + T12 — không phiếu gộp thu kép T10");
  assert.ok(!open.some((row) => String(row.billKey || "").includes("2026-10") && row.id !== octBill.id),
    "không phiếu nào khác chứa tháng 10 ngoài phiếu đã chốt");
});

test("qua tháng 11: phiếu T10 chưa đóng đứng riêng thành nợ cũ (không gộp), phiếu T11 riêng — như lớp khóa (28/10/2026)", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {} };
  cls.studentIds = [student.id];
  const octLedger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  const octBill = octLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-10`)!;
  const octCode = octLedger.paymentOrders.find((row) => row.id === octBill.paymentOrderId)?.paymentCode;
  const novLedger = syncTuitionReceivables(octLedger, [cls], [student], [], new Date("2026-11-03T12:00:00Z"));
  assert.ok(!novLedger.receivables.some((row) => String(row.billKey).startsWith("months|")), "không lập phiếu gộp");
  const oct = novLedger.receivables.find((row) => row.id === octBill.id)!;
  assert.equal(oct.status, "OPEN");
  assert.equal(oct.balanceDue, octBill.balanceDue, "nợ cũ T10 giữ đúng số đã báo");
  assert.equal(novLedger.paymentOrders.find((row) => row.id === oct.paymentOrderId)?.paymentCode, octCode, "mã T10 giữ nguyên");
  const novRow = novLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-11`)!;
  assert.equal(novRow.status, "OPEN", "phiếu T11 riêng");
  const decBill = novLedger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-12`);
  assert.equal(decBill?.amountDue, 900_000, "phiếu T12 tự lập sẵn");
  assert.equal(novLedger.receivables.filter((row) => row.status === "OPEN").length, 3, "nợ cũ T10 + T11 + T12");
});

test("lớp thu khóa không lập phiếu theo tháng — phiếu khóa vẫn tự lập", () => {
  const cls = courseClass(24);
  const student = { ...testStudent(), sessionBalances: {} };
  cls.studentIds = [student.id];
  const next = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  assert.ok(next.receivables.every((row) => !String(row.billKey || "").startsWith("month")),
    "lớp khóa không bị lập phiếu tháng");
  assert.ok(next.receivables.some((row) => String(row.billKey || "").startsWith("course|")),
    "phiếu khóa vẫn tự lập");
});

test("đã thu tới tháng sau thì không lập phiếu tháng sau", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {}, tuitionPaidThrough: { [cls.id]: "2026-11" } };
  cls.studentIds = [student.id];
  const next = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  assert.equal(next.receivables.length, 0, "T10 và T11 đều đã đóng → không phiếu nào");
});

test("tháng sau nghỉ hết theo cấu hình admin thì không lập phiếu tháng sau", () => {
  const cls = monthlyClass();
  const student = { ...testStudent(), sessionBalances: {} };
  cls.studentIds = [student.id];
  const offDates = [
    ["2026-11-02", "17:00"], ["2026-11-04", "14:30"], ["2026-11-09", "17:00"],
    ["2026-11-11", "14:30"], ["2026-11-16", "17:00"], ["2026-11-18", "14:30"],
    ["2026-11-23", "17:00"], ["2026-11-25", "14:30"], ["2026-11-30", "17:00"],
  ] as const;
  const sessions = offDates.map(([date, startTime], index) => taughtSession("SCHEDULED", {
    id: `nov-off-${index}`, date, startTime, endTime: "19:00",
    isOff: true, offSource: "ADMIN",
    recurrenceKey: `${cls.id}|${date}|${startTime}`,
  }));
  const next = syncTuitionReceivables(emptySepayLedger(), [cls], [student], sessions, new Date("2026-10-20T12:00:00Z"));
  assert.ok(next.receivables.some((row) => row.billKey === `month|${cls.id}|2026-10`), "phiếu T10 vẫn lập");
  assert.equal(next.receivables.filter((row) => String(row.billKey || "").includes("2026-11")).length, 0,
    "T11 nghỉ hết theo lịch admin → không phiếu T11");
});

test("teacher-off in the join month charges and credits the joiner like everyone else", () => {
  const cls = monthlyClass();
  const joiner = { ...testStudent(), id: "student-joiner", sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-10" } };
  const veteran = { ...testStudent(), id: "student-veteran", sessionBalances: {}, classJoinedAt: { [cls.id]: "2026-10-01" } };
  cls.studentIds = [joiner.id, veteran.id];
  const now = new Date("2026-11-03T12:00:00Z");
  const teacherOff = taughtSession("COMPLETED", {
    date: "2026-10-14",
    startTime: "14:30",
    endTime: "16:30",
    isOff: true,
    offSource: "TEACHER",
    recurrenceKey: `${cls.id}|2026-10-14|14:30`,
  });
  // Buổi nghỉ GV 14/10 nằm sau ngày vào → tính phí như các bạn (khấu trừ kỳ sau).
  assert.equal(chargedMonthlySessions(joiner.id, cls, [teacherOff], now, "2026-10-10"), 7);
  assert.equal(chargedMonthlySessions(veteran.id, cls, [teacherOff], now, "2026-10-01"), 9);
  const updated = applyAttendanceSessionBalances([joiner, veteran], [cls], [], [teacherOff]);
  assert.equal(updated.find((s) => s.id === joiner.id)?.tuitionCredits?.[cls.id] ?? 0, 1);
  assert.equal(updated.find((s) => s.id === veteran.id)?.tuitionCredits?.[cls.id] ?? 0, 1);
});

test("course bill prorates sessions before the join date", () => {
  const cls: DemoClass = {
    ...courseClass(4),
    courseStartDate: "2026-09-01",
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
    ],
  };
  const student = { ...testStudent(), classJoinedAt: { [cls.id]: "2026-09-05" } };
  cls.studentIds = [student.id];
  // Phiếu khóa 1 đang mở để khóa cần thu là khóa 1 (không nhảy khóa 2 theo elapsed).
  const ledger = emptySepayLedger();
  ledger.receivables.push({
    id: "rec-course1",
    receivableCode: "REC-C1",
    studentId: student.id,
    studentName: student.fullName,
    billingPeriod: "Khóa 4 buổi · Lớp kiểm thử",
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    amountDue: 640_000,
    amountPaid: 0,
    balanceDue: 640_000,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: "order-c1",
    classId: cls.id,
    billKey: `course|${cls.id}`,
  });
  ledger.paymentOrders.push({
    id: "order-c1",
    receivableId: "rec-course1",
    studentId: student.id,
    paymentCode: "HPTESTHV0001",
    amount: 640_000,
    qrUrl: "",
    status: "ACTIVE",
    createdAt: "2026-09-01T00:00:00Z",
  });
  const quote = tuitionCollectionCharge(student, cls, [], ledger, new Date("2026-09-20T12:00:00Z"));
  assert.equal(quote.mode, "COURSE");
  assert.equal(quote.billed, 3, "vào từ 05/09: buổi 01/09 không tính — khóa 4 buổi còn 3");
  assert.equal(quote.amount, 480_000);
  // Sync cập nhật luôn phiếu đang mở theo số tiền đã trừ.
  const next = syncTuitionReceivables(ledger, [cls], [student], [], new Date("2026-09-20T12:00:00Z"));
  assert.equal(next.receivables.find((row) => row.billKey === `course|${cls.id}`)?.amountDue, 480_000);
  assert.equal(next.receivables.find((row) => row.billKey === `course|${cls.id}|2`)?.amountDue, 640_000, "khóa 2 bắt đầu 15/09 — tự lập phiếu đủ 4 buổi");
});

test("course class without a course schedule keeps the configured session count", () => {
  const cls = courseClass(24);
  const student = { ...testStudent(), classJoinedAt: { [cls.id]: "2026-10-10" } };
  const quote = tuitionCollectionCharge(student, cls, [], emptySepayLedger(), new Date("2026-10-20T12:00:00Z"));
  assert.equal(quote.mode, "COURSE");
  assert.equal(quote.billed, 24);
});

test("từ phiếu tháng 12/2026 không trừ thêm tín dụng buổi nghỉ lưu trên hồ sơ (tránh trừ lần 2)", () => {
  const cls = monthlyClass();
  // Tín dụng 1 buổi còn treo trên hồ sơ, tháng trước không có buổi GV nghỉ nào.
  const nov = tuitionCollectionCharge({ ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-10" } }, cls, [], emptySepayLedger(), new Date("2026-11-09T12:00:00Z"));
  assert.equal(nov.creditSessions, 1, "phiếu tháng 11 giữ nguyên cách tính cũ");
  const dec = tuitionCollectionCharge({ ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-11" } }, cls, [], emptySepayLedger(), new Date("2026-12-09T12:00:00Z"));
  assert.equal(dec.creditSessions, 0, "từ tháng 12 không trừ tín dụng lưu");
  // Buổi GV nghỉ của chính tháng 11 (chưa dạy bù) vẫn được trừ trên phiếu tháng 12.
  const novOff: DemoLessonSession = { ...octoberHoliday(), id: "s-nov-off", date: "2026-11-04", recurrenceKey: "class-test|2026-11-04|14:30", offSource: "TEACHER" };
  const decWithOff = tuitionCollectionCharge({ ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-11" } }, cls, [novOff], emptySepayLedger(), new Date("2026-12-09T12:00:00Z"));
  assert.equal(decWithOff.creditSessions, 1, "buổi GV nghỉ tháng 11 vẫn trừ đúng 1 lần ở tháng 12");
});

test("T11/2026 chốt 08/11: buổi GV nghỉ tháng 11 không trừ vào phiếu T11 mà trừ ở T12 (trừ đúng 1 lần)", () => {
  const cls = monthlyClass();
  // Buổi T4 04/11 GV tick nghỉ → hồ sơ có tín dụng 1.
  const off: DemoLessonSession = { ...octoberHoliday(), id: "s-nov-off", date: "2026-11-04", recurrenceKey: "class-test|2026-11-04|14:30", offSource: "TEACHER" };
  const st = { ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const nov = tuitionCollectionCharge(st, cls, [off], emptySepayLedger(), new Date("2026-11-09T12:00:00Z"));
  assert.equal(nov.creditSessions, 0, "phiếu T11 không trừ buổi nghỉ của chính tháng 11");
  const dec = tuitionCollectionCharge({ ...st, tuitionPaidThrough: { [cls.id]: "2026-11" } }, cls, [off], emptySepayLedger(), new Date("2026-12-09T12:00:00Z"));
  assert.equal(dec.creditSessions, 1, "phiếu T12 trừ buổi nghỉ tháng 11");
});

test("T11/2026 chốt 08/11: buổi T8 04/11 đã trừ trên phiếu T11 thì giữ, phiếu T12 không trừ lại", () => {
  const cls = { ...monthlyClass(), id: "class-import-t8" };
  const off: DemoLessonSession = { ...octoberHoliday(), id: "s-t8-off", classId: cls.id, date: "2026-11-04", recurrenceKey: "class-import-t8|2026-11-04|14:30", offSource: "TEACHER" };
  const st = { ...testStudent(), tuitionCredits: { [cls.id]: 1 }, tuitionPaidThrough: { [cls.id]: "2026-10" } };
  const nov = tuitionCollectionCharge(st, cls, [off], emptySepayLedger(), new Date("2026-11-09T12:00:00Z"));
  assert.equal(nov.creditSessions, 1, "giữ như bảng chốt 08/11");
  const dec = tuitionCollectionCharge({ ...st, tuitionPaidThrough: { [cls.id]: "2026-11" } }, cls, [off], emptySepayLedger(), new Date("2026-12-09T12:00:00Z"));
  assert.equal(dec.creditSessions, 0, "không trừ lần 2 ở T12");
});

test("S1: buổi GV nghỉ 03/11/2026 không trừ trên phiếu T11, trừ ở phiếu T12; T8 (Thạch Khê) giữ ngoại lệ", async () => {
  const { november2026DeferredOffSessions, teacherOffCreditSessions } = await import("../cloudflare/tuition-billing");
  const off = (classId: string, date: string) => ({ id: `${classId}-${date}`, classId, date, startTime: "17:00", endTime: "19:00", isOff: true, offSource: "TEACHER", status: "SCHEDULED", attendance: [] }) as unknown as DemoLessonSession;
  const sessions = [off("class-import-s1", "2026-11-03"), off("class-import-t8", "2026-11-04")];
  assert.equal(november2026DeferredOffSessions({ id: "class-import-s1" }, sessions), 1);
  assert.equal(teacherOffCreditSessions({ id: "class-import-s1" }, sessions, "2026-12"), 1);
  assert.equal(november2026DeferredOffSessions({ id: "class-import-t8" }, sessions), 0);
  assert.equal(teacherOffCreditSessions({ id: "class-import-t8" }, sessions, "2026-12"), 0);
});
