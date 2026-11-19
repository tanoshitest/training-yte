import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import { classCourseStartDateOf, classCurrentCourseIndex } from "../cloudflare/tuition-billing";

/**
 * S36 (chốt 23/10/2026): buổi thêm không tính phí Thứ 7 24/10 thuộc khóa 1; khóa 2
 * mở buổi 1 ngày 29/10; công nợ khóa 2 chỉ hiện từ 25/10 (sau buổi thêm).
 * Fixture thu nhỏ: khóa 4 buổi, học Thứ 5 + Thứ 7 từ 10/10 → khóa 1 = 10, 15, 17, 22/10.
 */
const cls = {
  id: "class-import-s36", code: "S36", name: "S36", billingMode: "COURSE", sessionPrice: 65_000, courseSessions: 4,
  courseStartDate: "2026-10-10", studentIds: [], branchId: "b", status: "ACTIVE", teacherId: "t",
  schedules: [{ weekday: 4, periodId: "thu", startTime: "17:30", endTime: "19:00" }, { weekday: 6, periodId: "sat", startTime: "16:00", endTime: "17:30" }],
} as unknown as DemoClass;
const extra = {
  id: "s36-24", classId: cls.id, date: "2026-10-24", startTime: "16:00", endTime: "17:30", teacherId: "t", status: "SCHEDULED",
  isExtra: false, recurrenceKey: `${cls.id}|2026-10-24|16:00`, note: "", isOff: false, noFee: true, attendance: [],
} as unknown as DemoLessonSession;

test("S36: buổi thêm 24/10 không tính phí — khóa 2 bắt đầu 29/10, công nợ khóa 2 mở từ 25/10", () => {
  const at = (day: string) => classCurrentCourseIndex(cls, new Date(`${day}T15:00:00+07:00`), [extra]);
  assert.equal(classCourseStartDateOf(cls, [extra], 2, new Date("2026-10-23T15:00:00+07:00")), "2026-10-29");
  assert.equal(at("2026-10-23"), 1, "sau buổi 24 khóa 1 nhưng chưa qua buổi thêm — vẫn khóa 1");
  assert.equal(at("2026-10-24"), 1, "ngày học buổi thêm — vẫn khóa 1");
  assert.equal(at("2026-10-25"), 2, "qua buổi thêm — khóa 2, công nợ hiện");
});
