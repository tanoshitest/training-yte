import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession, DemoAttendanceRow } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { isPlannedTuitionOff, monthlyRemainingSessions, sessionChargesTuition } from "../cloudflare/tuition-billing";
import {
  T7_CLASS_ID,
  T8_CLASS_ID,
  t7ScheduleEffectiveFrom,
  t7t8SeptemberMakeupSessions,
} from "../cloudflare/t7-t8-schedule-correction";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code: string): DemoStudent {
  return { id, code, fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

const T7_IDS = ["a1", "a2", "a3"];
const T8_IDS = ["b1", "b2"];

function makeClass(id: string, schedules: DemoClass["schedules"]): DemoClass {
  return {
    id, code: id, name: id, classTypeId: "standard", branchId: "b", teacherId: "teacher",
    roomId: "room", syllabusId: "", status: "ACTIVE",
    studentIds: id === T7_CLASS_ID ? [...T7_IDS] : [...T8_IDS],
    tuitionPackageId: "", billingMode: "MONTHLY", sessionPrice: 50_000,
    schedules, note: "", billingEnabled: true,
  };
}

const T7 = makeClass(T7_CLASS_ID, [
  { weekday: 0, periodId: "p1", startTime: "18:30", endTime: "20:30" },
  { weekday: 5, periodId: "p2", startTime: "15:00", endTime: "17:00", effectiveFrom: "2026-09-07" },
]);
const T8 = makeClass(T8_CLASS_ID, [
  { weekday: 0, periodId: "p1", startTime: "14:30", endTime: "16:30" },
  { weekday: 3, periodId: "p2", startTime: "15:00", endTime: "17:00" },
]);

function att(studentId: string, status: DemoAttendanceRow["status"]): DemoAttendanceRow {
  return {
    studentId, status, lessonRating: "A", homeworkRating: "FULL_100",
    pronunciationVideoDone: false, note: "",
  };
}

function session(classId: string, date: string, startTime: string, endTime: string, attendance: DemoAttendanceRow[]): DemoLessonSession {
  return {
    id: `session-${classId}-${date}-${startTime.replace(":", "")}`,
    classId, date, startTime, endTime, teacherId: "teacher", roomId: "room",
    status: "COMPLETED", isExtra: false, recurrenceKey: `${classId}|${date}|${startTime}`,
    note: "", isOff: false, hasHomework: false,
    attendanceColumnOrder: ["vocabularyScore"],
    attendance,
  };
}

function septemberSessions(): DemoLessonSession[] {
  return [
    // T7 — buổi phát sinh 4/9 + buổi gốc 13/9 + các buổi thường
    session(T7_CLASS_ID, "2026-09-04", "15:00", "17:00", T7_IDS.map((id) => att(id, "PRESENT"))),
    session(T7_CLASS_ID, "2026-09-06", "18:30", "20:30", T7_IDS.map((id) => att(id, "PRESENT"))),
    session(T7_CLASS_ID, "2026-09-11", "15:00", "17:00", T7_IDS.map((id) => att(id, "PRESENT"))),
    session(T7_CLASS_ID, "2026-09-13", "18:30", "20:30", [
      att("a1", "PRESENT"), att("a2", "PRESENT"), att("a3", "EXCUSED"), att("moved-out", "PRESENT"),
    ]),
    session(T7_CLASS_ID, "2026-09-18", "15:00", "17:00", T7_IDS.map((id) => att(id, "PRESENT"))),
    session(T7_CLASS_ID, "2026-09-20", "18:30", "20:30", T7_IDS.map((id) => att(id, "PRESENT"))),
    session(T7_CLASS_ID, "2026-09-25", "15:00", "17:00", T7_IDS.map((id) => att(id, "EXCUSED"))),
    session(T7_CLASS_ID, "2026-09-27", "18:30", "20:30", T7_IDS.map((id) => att(id, "PRESENT"))),
    // T8 — buổi gốc 23/9 + các buổi thường
    session(T8_CLASS_ID, "2026-09-06", "14:30", "16:30", T8_IDS.map((id) => att(id, "PRESENT"))),
    session(T8_CLASS_ID, "2026-09-09", "15:00", "17:00", T8_IDS.map((id) => att(id, "PRESENT"))),
    session(T8_CLASS_ID, "2026-09-13", "14:30", "16:30", T8_IDS.map((id) => att(id, "PRESENT"))),
    session(T8_CLASS_ID, "2026-09-16", "15:00", "17:00", T8_IDS.map((id) => att(id, "PRESENT"))),
    session(T8_CLASS_ID, "2026-09-20", "14:30", "16:30", T8_IDS.map((id) => att(id, "PRESENT"))),
    session(T8_CLASS_ID, "2026-09-23", "15:00", "17:00", [att("b1", "PRESENT"), att("b2", "EXCUSED"), att("t8-moved", "PRESENT")]),
    session(T8_CLASS_ID, "2026-09-27", "14:30", "16:30", T8_IDS.map((id) => att(id, "PRESENT"))),
  ];
}

const PAID_SEPT = (classId: string) => ({ [classId]: "2026-09" });

test("T7 suất CN được gắn mốc hiệu lực 07/09 — hết sinh buổi ảo", () => {
  const next = t7ScheduleEffectiveFrom([T7, T8]);
  const t7 = next.find((cls) => cls.id === T7_CLASS_ID)!;
  assert.equal(t7.schedules.find((s) => s.weekday === 0)?.effectiveFrom, "2026-09-07");
  assert.equal(t7.schedules.find((s) => s.weekday === 5)?.effectiveFrom, "2026-09-07");
  // T8 không bị đụng.
  assert.equal(next.find((cls) => cls.id === T8_CLASS_ID)!.schedules[0]?.effectiveFrom, undefined);
});

test("4/9 T7 thành nghỉ học vụ: gỡ khỏi học phí, giữ COMPLETED + điểm danh", () => {
  const next = t7t8SeptemberMakeupSessions(septemberSessions(), [T7, T8]);
  const s4 = next.find((s) => s.classId === T7_CLASS_ID && s.date === "2026-09-04")!;
  assert.equal(s4.isOff, true);
  assert.equal(s4.offSource, "ADMIN");
  assert.equal(s4.status, "COMPLETED");
  assert.equal(s4.attendance?.length, 3); // chuyên cần giữ nguyên
  assert.equal(isPlannedTuitionOff(s4), true);
  assert.equal(sessionChargesTuition(s4), false); // không tính phí
});

test("13/9 T7 & 23/9 T8 thành GV nghỉ đã bù: vẫn tính phí, rơi khỏi chuyên cần", () => {
  const next = t7t8SeptemberMakeupSessions(septemberSessions(), [T7, T8]);
  const s13 = next.find((s) => s.classId === T7_CLASS_ID && s.date === "2026-09-13")!;
  const s23 = next.find((s) => s.classId === T8_CLASS_ID && s.date === "2026-09-23")!;
  for (const s of [s13, s23]) {
    assert.equal(s.isOff, true);
    assert.equal(s.offSource, "TEACHER");
    assert.equal(s.status, "SCHEDULED"); // ra khỏi báo cáo chuyên cần
    assert.equal(sessionChargesTuition(s), true); // vẫn tính phí — đã bù
    assert.equal(isPlannedTuitionOff(s), false);
  }
  assert.match(s13.note, /19\/09|2026-09-19/);
  assert.match(s23.note, /29\/09|2026-09-29/);
});

test("Buổi bù 19/9 & 29/9: extra, giờ buổi gốc, copy điểm danh chỉ ai còn trong lớp", () => {
  const next = t7t8SeptemberMakeupSessions(septemberSessions(), [T7, T8]);
  const t7Makeup = next.find((s) => s.classId === T7_CLASS_ID && s.date === "2026-09-19")!;
  const t8Makeup = next.find((s) => s.classId === T8_CLASS_ID && s.date === "2026-09-29")!;
  assert.equal(t7Makeup.startTime, "18:30");
  assert.equal(t7Makeup.endTime, "20:30");
  assert.equal(t7Makeup.status, "COMPLETED");
  assert.equal(t7Makeup.isExtra, true);
  assert.equal(t8Makeup.startTime, "15:00");
  assert.equal(t8Makeup.endTime, "17:00");
  assert.equal(t8Makeup.status, "COMPLETED");
  // Copy y đúc trạng thái của học viên còn trong lớp; bạn đã chuyển bị loại.
  assert.deepEqual(
    t7Makeup.attendance?.map((row) => [row.studentId, row.status]),
    [["a1", "PRESENT"], ["a2", "PRESENT"], ["a3", "EXCUSED"]],
  );
  assert.equal(t7Makeup.attendance?.some((row) => row.studentId === "moved-out"), false);
  assert.equal(t8Makeup.attendance?.some((row) => row.studentId === "t8-moved"), false);
  assert.deepEqual(t7Makeup.attendanceColumnOrder, ["vocabularyScore"]);
});

test("Học phí không đổi: số buổi tồn trước/sau vá giữ nguyên", () => {
  const before = septemberSessions();
  const after = t7t8SeptemberMakeupSessions(before, [T7, T8]);
  const ledger = emptySepayLedger();
  // Bạn đã đóng T9: tồn giữ nguyên tuyệt đối ở cả hai lớp.
  for (const [cls, id] of [[T7, "a1"], [T7, "a2"], [T8, "b1"], [T8, "b2"]] as const) {
    const stu = { ...student(id, `HV ${id}`, id.toUpperCase()), tuitionPaidThrough: PAID_SEPT(cls.id) };
    const beforeBalance = monthlyRemainingSessions(stu, cls, before, ledger, NOW);
    const afterBalance = monthlyRemainingSessions(stu, cls, after, ledger, NOW);
    assert.equal(afterBalance, beforeBalance, `${cls.id}/${id}: ${beforeBalance} -> ${afterBalance}`);
  }
  // Bạn T7 chưa đóng T9: -4/9 (+1) và +19/9 (-1) tự triệt tiêu -> tồn không đổi.
  const unpaidT7 = student("a3", "HV a3", "A3");
  assert.equal(
    monthlyRemainingSessions(unpaidT7, T7, after, ledger, NOW),
    monthlyRemainingSessions(unpaidT7, T7, before, ledger, NOW),
  );
});

test("Chạy lại migration không nhân đôi buổi bù", () => {
  const once = t7t8SeptemberMakeupSessions(septemberSessions(), [T7, T8]);
  const twice = t7t8SeptemberMakeupSessions(once, [T7, T8]);
  assert.equal(twice.length, once.length);
  assert.deepEqual(twice, once);
});
