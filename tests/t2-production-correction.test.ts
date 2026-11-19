import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  removeMyTamFromT2,
  T2_CLASS_ID,
  t2EffectivePaidThrough,
  t2OctoberMinimumCreditSessions,
  t2PreviousMonthDebtAmount,
} from "../cloudflare/t2-production-correction";
import {
  studentRemainingSessions,
  syncTuitionReceivables,
  teacherOffCreditSessions,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

function student(id: string, fullName: string): DemoStudent {
  return {
    id,
    code: id.toUpperCase(),
    fullName,
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING",
  };
}

function monthlyClass(id = T2_CLASS_ID): DemoClass {
  return {
    id,
    code: id === T2_CLASS_ID ? "T2" : "T3",
    name: "Lớp kiểm thử",
    classTypeId: "standard",
    branchId: "branch",
    teacherId: "teacher",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["my-tam", "kieu-oanh", "student-other"],
    tuitionPackageId: "",
    billingMode: "MONTHLY",
    sessionPrice: 200_000,
    schedules: [
      { weekday: 1, periodId: "mon", startTime: "17:00", endTime: "19:00" },
      { weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" },
    ],
    note: "",
  };
}

function productionLikeT2Class(): DemoClass {
  return {
    ...monthlyClass(),
    studentIds: ["thuy", "thao-nguyen", "van-nhi", "khang-huy"],
    sessionPrice: 50_000,
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 4, periodId: "thu", startTime: "17:00", endTime: "19:00" },
    ],
  };
}

function teacherOff(id: string, date: string, classId = T2_CLASS_ID): DemoLessonSession {
  return {
    id,
    classId,
    date,
    startTime: "17:00",
    endTime: "19:00",
    teacherId: "teacher",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${classId}|${date}|17:00`,
    note: "GV cho nghỉ",
    isOff: true,
    offSource: "TEACHER",
    attendance: [],
  };
}

test("migration chỉ gỡ Mỹ Tâm khỏi class-import-t2", () => {
  const students = [
    student("my-tam", "Trương Thị Mỹ Tâm"),
    student("kieu-oanh", "Nguyễn Kiều Oanh"),
    student("student-other", "Học viên khác"),
  ];
  const t2 = monthlyClass();
  const other = monthlyClass("class-import-t3");

  const corrected = removeMyTamFromT2([t2, other], students);

  assert.deepEqual(corrected[0]?.studentIds, ["kieu-oanh", "student-other"]);
  assert.deepEqual(corrected[1]?.studentIds, other.studentIds, "lớp khác không bị thay đổi");
  assert.equal(corrected[1], other, "không tạo bản sao lớp không liên quan");
});

test("phiếu tháng 10 của riêng T2 khấu trừ tối đa hai buổi GV nghỉ tháng 9", () => {
  const sessions = [
    teacherOff("off-1", "2026-09-07"),
    teacherOff("off-2", "2026-09-09"),
    teacherOff("off-3", "2026-09-14"),
  ];
  assert.equal(teacherOffCreditSessions(monthlyClass(), sessions, "2026-10"), 2);

  const other = monthlyClass("class-import-t3");
  const otherSessions = sessions.map((row) => ({ ...row, classId: other.id, recurrenceKey: `${other.id}|${row.date}|17:00` }));
  assert.equal(teacherOffCreditSessions(other, otherSessions, "2026-10"), 0, "lớp khác vẫn không tự trừ nghỉ tháng 9");
});

test("sáu học viên T2 có đúng dòng nợ cũ tháng trước 400.000đ trên phiếu tháng 10", () => {
  for (const name of ["Nguyễn Kiều Oanh", "Trần Phương Linh", "Lê Quỳnh Trang", "Phạm Gia Huy", "Nguyễn Thị Thảo Nguyên", "Trương Lê Vân Nhi"]) {
    assert.equal(t2PreviousMonthDebtAmount(student("target", name), monthlyClass(), ["2026-10"]), 400_000, name);
  }
  assert.equal(t2PreviousMonthDebtAmount({ ...student("target", "Tên đã đổi"), code: "HV0567" }, monthlyClass(), ["2026-10"]), 400_000);
  assert.equal(t2PreviousMonthDebtAmount(student("other", "Trần Khang Huy"), monthlyClass(), ["2026-10"]), 0);
  assert.equal(t2PreviousMonthDebtAmount(student("target", "Nguyễn Kiều Oanh"), monthlyClass("class-import-t3"), ["2026-10"]), 0);
  assert.equal(t2PreviousMonthDebtAmount(student("target", "Nguyễn Kiều Oanh"), monthlyClass(), ["2026-11"]), 0);
});

test("quy tắc hai buổi chỉ áp cho mọi học viên T2 trong tháng 10", () => {
  const cls = monthlyClass();
  const thuy = { ...student("thuy", "Thúy"), code: "HV0942" };
  assert.equal(t2EffectivePaidThrough(thuy, cls, undefined), "2026-09");
  assert.equal(t2EffectivePaidThrough(thuy, monthlyClass("class-import-t3"), undefined), undefined);
  assert.equal(t2PreviousMonthDebtAmount(thuy, cls, ["2026-10"]), 0, "Thúy không bị cộng nợ cũ 400k");

  for (const target of [
    thuy,
    { ...student("khang-huy", "Trần Khang Huy"), code: "HV0565" },
    { ...student("thao-nguyen", "Nguyễn Thị Thảo Nguyên"), code: "HV0567" },
    { ...student("van-nhi", "Trương Lê Vân Nhi"), code: "HV0569" },
  ]) {
    assert.equal(t2OctoberMinimumCreditSessions(target, cls, "2026-10"), 2);
    assert.equal(t2OctoberMinimumCreditSessions(target, cls, "2026-11"), 0);
    assert.equal(t2OctoberMinimumCreditSessions(target, monthlyClass("class-import-t3"), "2026-10"), 0);
  }
});

test("báo giá T2 cộng nợ cũ riêng và vẫn trừ đúng hai buổi nghỉ", () => {
  const cls = monthlyClass();
  const target = {
    ...student("kieu-oanh", "Nguyễn Kiều Oanh"),
    tuitionPaidThrough: { [cls.id]: "2026-09" },
  };
  const sessions = [teacherOff("off-1", "2026-09-07"), teacherOff("off-2", "2026-09-09")];
  const quote = tuitionCollectionCharge(target, cls, sessions, emptySepayLedger(), new Date("2026-10-03T12:00:00+07:00"));

  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 8);
  assert.equal(quote.creditSessions, 2);
  assert.equal(quote.oldDebtAmount, 400_000);
  assert.equal(quote.oldDebtLabel, "Nợ cũ tháng trước");
  assert.equal(quote.amount, 1_600_000, "8 buổi − 2 buổi nghỉ = 1,2tr; cộng nợ cũ 400k");

  const ordinary = tuitionCollectionCharge(
    { ...student("other", "Học viên khác"), tuitionPaidThrough: { [cls.id]: "2026-09" } },
    cls,
    sessions,
    emptySepayLedger(),
    new Date("2026-10-03T12:00:00+07:00"),
  );
  assert.equal(ordinary.oldDebtAmount, 0);
  assert.equal(ordinary.amount, 1_200_000);
});

test("phiếu T2 tháng 10 đã chốt nhưng chưa thu vẫn nhận bản sửa công nợ", () => {
  const cls = monthlyClass();
  const target = {
    ...student("kieu-oanh", "Nguyễn Kiều Oanh"),
    tuitionPaidThrough: { [cls.id]: "2026-09" },
  };
  const sessions = [teacherOff("off-1", "2026-09-07"), teacherOff("off-2", "2026-09-09")];
  const now = new Date("2026-10-03T12:00:00+07:00");
  const created = syncTuitionReceivables(emptySepayLedger(), [cls], [target], sessions, now);
  const frozenAt = "2026-10-03T01:00:00.000Z";
  const frozenWithOldAmount = {
    ...created,
    receivables: created.receivables.map((row) => ({
      ...row,
      amountDue: 123_000,
      balanceDue: 123_000,
      frozenAt,
    })),
  };

  const corrected = syncTuitionReceivables(frozenWithOldAmount, [cls], [target], sessions, now);
  assert.equal(corrected.receivables[0]?.amountDue, 1_600_000);
  assert.equal(corrected.receivables[0]?.balanceDue, 1_600_000);
  assert.equal(corrected.receivables[0]?.frozenAt, frozenAt, "vẫn giữ trạng thái đã gửi yêu cầu thanh toán");
});

test("phiếu T2 tháng 10 của học viên thường đã chốt 400k được sửa còn 350k", () => {
  const cls = productionLikeT2Class();
  const target = { ...student("khang-huy", "Trần Khang Huy"), code: "HV0565" };
  const sessions = [
    { ...teacherOff("admin-off", "2026-09-01"), offSource: "ADMIN" as const },
    teacherOff("teacher-off", "2026-09-03"),
  ];
  const now = new Date("2026-10-03T12:00:00+07:00");
  const created = syncTuitionReceivables(emptySepayLedger(), [cls], [target], sessions, now);
  const frozenWithOneCredit = {
    ...created,
    receivables: created.receivables.map((row) => ({
      ...row,
      amountDue: 400_000,
      balanceDue: 400_000,
      frozenAt: "2026-10-03T01:00:00.000Z",
    })),
  };

  const corrected = syncTuitionReceivables(frozenWithOneCredit, [cls], [target], sessions, now);
  assert.equal(corrected.receivables[0]?.amountDue, 350_000);
  assert.equal(corrected.receivables[0]?.balanceDue, 350_000);
  assert.equal(corrected.paymentOrders[0]?.amount, 350_000);
});

test("dữ liệu giống production: mọi học viên T2 được trừ hai buổi trong tháng 10", () => {
  const cls = productionLikeT2Class();
  const now = new Date("2026-10-03T12:00:00+07:00");
  const sessions = [
    { ...teacherOff("admin-off", "2026-09-01"), offSource: "ADMIN" as const, note: "Nghỉ học vụ" },
    teacherOff("teacher-off", "2026-09-03"),
  ];
  const thuy = { ...student("thuy", "Thúy"), code: "HV0942" };
  const khangHuy = { ...student("khang-huy", "Trần Khang Huy"), code: "HV0565" };
  const thaoNguyen = { ...student("thao-nguyen", "Nguyễn Thị Thảo Nguyên"), code: "HV0567" };
  const vanNhi = { ...student("van-nhi", "Trương Lê Vân Nhi"), code: "HV0569" };

  assert.equal(studentRemainingSessions(thuy, cls, sessions, emptySepayLedger(), now), -1);
  const thuyQuote = tuitionCollectionCharge(thuy, cls, sessions, emptySepayLedger(), now);
  assert.equal(thuyQuote.creditSessions, 2);
  assert.equal(thuyQuote.oldDebtAmount, 0);
  assert.equal(thuyQuote.amount, 350_000);

  const khangHuyQuote = tuitionCollectionCharge(khangHuy, cls, sessions, emptySepayLedger(), now);
  assert.deepEqual(khangHuyQuote.months, ["2026-10"]);
  assert.equal(khangHuyQuote.items[0]?.originalBilled, 9);
  assert.equal(khangHuyQuote.creditSessions, 2);
  assert.equal(khangHuyQuote.items[0]?.amount, 350_000);
  assert.equal(khangHuyQuote.oldDebtAmount, 0);
  assert.equal(khangHuyQuote.amount, 350_000);

  for (const target of [thaoNguyen, vanNhi]) {
    assert.equal(studentRemainingSessions(target, cls, sessions, emptySepayLedger(), now), -9, target.fullName);
    const quote = tuitionCollectionCharge(target, cls, sessions, emptySepayLedger(), now);
    assert.deepEqual(quote.months, ["2026-10"]);
    assert.equal(quote.items[0]?.originalBilled, 9);
    assert.equal(quote.creditSessions, 2);
    assert.equal(quote.items[0]?.amount, 350_000);
    assert.equal(quote.oldDebtAmount, 400_000);
    assert.equal(quote.amount, 750_000, `${target.fullName}: 350k tháng mới + 400k nợ cũ`);
  }
});
