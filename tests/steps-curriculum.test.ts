import assert from "node:assert/strict";
import test from "node:test";

import { buildFlyersSeventyTwoCurriculum } from "../cloudflare/flyers-curriculum";
import { buildMoversSeventyTwoCurriculum } from "../cloudflare/movers-curriculum";
import { isRetiredCatalogItem, seedDocuments } from "../cloudflare/syllabus-seed";
import { buildStarterFortyEightCurriculum, buildStarterFourMonthCurriculum, buildStepsThreeYearCurriculum } from "../cloudflare/starter-curriculum";
import type { SyllabusMeta } from "../cloudflare/syllabus-types";

const meta: SyllabusMeta = {
  id: "syllabus-starters",
  code: "STARTER",
  name: "STARTER — 48 Offline · 96 Online · 2 khóa",
  levelId: "level-1",
  level: "Pre-A1 Starters",
  description: "",
  status: "ACTIVE",
  totalCourseDays: 0,
  sortOrder: 1,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
};

test("STARTERS expands each Offline day with two Online home days", () => {
  const document = buildStarterFortyEightCurriculum(meta);
  const offline = document.days.filter((day) => day.deliveryMode === "OFFLINE");
  const online = document.days.filter((day) => day.deliveryMode === "ONLINE");

  assert.equal(document.units.length, 15);
  assert.equal(document.days.length, 144);
  assert.equal(offline.length, 48);
  assert.equal(online.length, 96);
  assert.equal(document.days.filter((day) => day.track === "CLASS").length, 48);
  assert.equal(document.days.filter((day) => day.track === "HOME").length, 96);
  assert.equal(document.lessons.length, 144);
  assert.equal(document.program?.version, "STARTER-144-V9");
  assert.equal(document.program?.coursesCount, 2);
  assert.equal(document.program?.classLessonsPerCourse, 24);
  assert.equal(document.program?.onlineSessionsPerWeek, 4);
  assert.deepEqual(document.units.map((unit) => unit.lessonCount), [3, 3, 2, 3, 2, 2, 3, 3, 2, 2, 2, 3, 2, 2, 1]);
  assert.ok(document.units.every((unit) => unit.flashcardVideoUrl));
  assert.ok((document.units[0].teachingAids || []).length > 0);

  const numbers = document.days.map((day) => day.courseDayNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 144 }, (_, index) => index + 1));

  const dayAt = (n: number) => document.days.find((day) => day.courseDayNumber === n);
  assert.equal(dayAt(1)?.deliveryMode, "OFFLINE");
  assert.equal(dayAt(2)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(3)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(4)?.deliveryMode, "OFFLINE");
  const day1Lesson = document.lessons.find((lesson) => lesson.courseDayId === dayAt(1)?.id);
  assert.match(day1Lesson?.lessonPlan.find((item) => item.startsWith("Speaking:")) || "", /L1:[\s\S]*L5:/);
  const day1Game = document.activities.find((activity) => activity.lessonId === day1Lesson?.id);
  assert.equal(day1Game?.engineType, "flashcard");
  assert.equal(day1Game?.config.items.length, 12);
  assert.ok(day1Game?.config.items.every((item) => item.image));
  assert.match(dayAt(1)?.title || "", /Input & Response/);
  assert.match(dayAt(2)?.title || "", /Online · Recognize/);
  assert.match(dayAt(3)?.title || "", /Online · Respond/);
  assert.match(dayAt(4)?.title || "", /Guided Speaking/);

  assert.ok(offline.every((day) => day.durationMinutes === 90));
  assert.ok(online.every((day) => day.durationMinutes === 20));
  assert.ok(document.days.every((day) => !day.assessmentType && !(day.testSkills || []).length));
  assert.ok(document.days.every((day) => !/test|mini đề|luyện đề|final/i.test(day.title)));

  const lessonIds = new Set(document.lessons.map((lesson) => lesson.id));
  assert.ok(document.days.every((day) => document.lessons.some((lesson) => lesson.courseDayId === day.id)));
  assert.ok(document.days.every((day) => {
    const lesson = document.lessons.find((item) => item.courseDayId === day.id);
    return lesson && document.activities.some((activity) => activity.lessonId === lesson.id);
  }));
  assert.ok(document.activities.length >= 144);
  assert.ok([...lessonIds].every((id) => document.activities.some((activity) => activity.lessonId === id)));

  assert.deepEqual(document.days.filter((day) => day.unitId === "starter48-u01").map((day) => day.courseDayNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(dayAt(70)?.unitId, "starter48-u09");
  assert.equal(dayAt(71)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(72)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(73)?.courseNumber, 2);
  assert.equal(dayAt(73)?.deliveryMode, "OFFLINE");
  assert.ok(document.days.filter((day) => day.unitId === "starter48-u10").some((day) => day.courseDayNumber === 73));
  assert.ok(document.days.filter((day) => !day.unitId).length >= 12);
  assert.match(document.units[9]?.sourceNotes?.join(" ") || "", /YOUR DAY|beach|daily routines/i);
  assert.ok(!(document.units[9]?.coreVocabulary || []).some((item) => /wake up|brush teeth|go to school/i.test(item)));
});

test("legacy curriculum builders install the 144-day program", () => {
  assert.equal(buildStarterFourMonthCurriculum(meta).program?.version, "STARTER-144-V9");
  assert.equal(buildStepsThreeYearCurriculum(meta).days.length, 144);
});

function assertSeventyTwoRhythm(document: ReturnType<typeof buildMoversSeventyTwoCurriculum>, version: string, firstUnitId: string, course2UnitId: string) {
  const offline = document.days.filter((day) => day.deliveryMode === "OFFLINE");
  const online = document.days.filter((day) => day.deliveryMode === "ONLINE");
  assert.equal(document.units.length, 12);
  assert.equal(document.days.length, 72);
  assert.equal(offline.length, 24);
  assert.equal(online.length, 48);
  assert.equal(document.lessons.length, 72);
  assert.equal(document.program?.version, version);
  assert.equal(document.program?.coursesCount, 2);
  assert.equal(document.program?.classLessonsPerCourse, 12);
  assert.deepEqual(document.units.map((unit) => unit.lessonCount), Array.from({ length: 12 }, () => 2));
  assert.deepEqual(document.days.map((day) => day.courseDayNumber), Array.from({ length: 72 }, (_, index) => index + 1));
  const dayAt = (n: number) => document.days.find((day) => day.courseDayNumber === n);
  assert.equal(dayAt(1)?.deliveryMode, "OFFLINE");
  assert.equal(dayAt(2)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(3)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(4)?.deliveryMode, "OFFLINE");
  assert.match(dayAt(2)?.title || "", /Online · Recognize/);
  assert.match(dayAt(3)?.title || "", /Online · Respond/);
  assert.ok(offline.every((day) => day.durationMinutes === 90));
  assert.ok(online.every((day) => day.durationMinutes === 20));
  assert.deepEqual(document.days.filter((day) => day.unitId === firstUnitId).map((day) => day.courseDayNumber), [1, 2, 3, 4, 5, 6]);
  assert.equal(dayAt(36)?.deliveryMode, "ONLINE");
  assert.equal(dayAt(37)?.courseNumber, 2);
  assert.equal(dayAt(37)?.deliveryMode, "OFFLINE");
  assert.equal(dayAt(37)?.unitId, course2UnitId);
  assert.ok(document.days.every((day) => document.lessons.some((lesson) => lesson.courseDayId === day.id)));
  assert.ok(document.days.every((day) => {
    const lesson = document.lessons.find((item) => item.courseDayId === day.id);
    return lesson && document.activities.some((activity) => activity.lessonId === lesson.id);
  }));
}

test("MOVERS expands 12 units into 24 Offline + 48 Online", () => {
  const document = buildMoversSeventyTwoCurriculum({ ...meta, id: "syllabus-movers", code: "STEPS-MOVERS" });
  assertSeventyTwoRhythm(document, "MOVERS-72-V1", "movers72-u01", "movers72-u07");
  assert.match(document.units[0]?.name || "", /AT THE PARK/);
  assert.match(document.units[6]?.name || "", /THIS IS MY FAMILY/);
  assert.match(document.units[11]?.name || "", /IN THE COUNTRYSIDE/);
});

test("catalog seed keeps one Starter, Movers and Flyers — no Teens or extra Starter", () => {
  const docs = seedDocuments();
  assert.deepEqual(docs.map((item) => item.meta.id), ["syllabus-starters", "syllabus-movers", "syllabus-flyers"]);
  assert.equal(isRetiredCatalogItem({ id: "syllabus-teens", code: "STEPS-TEENS", name: "STEPS Teens" }), true);
  assert.equal(isRetiredCatalogItem({ id: "syllabus-steps", code: "STEPS", name: "STARTER" }), true);
  assert.equal(isRetiredCatalogItem({ id: "syllabus-starters", code: "STARTER", name: "STARTER — 48 Offline · 96 Online · 2 khóa" }), false);
});

test("FLYERS expands 12 units into 24 Offline + 48 Online", () => {
  const document = buildFlyersSeventyTwoCurriculum({ ...meta, id: "syllabus-flyers", code: "STEPS-FLYERS" });
  assertSeventyTwoRhythm(document, "FLYERS-72-V1", "flyers72-u01", "flyers72-u07");
  assert.match(document.units[0]?.name || "", /OUR HOME/);
  assert.match(document.units[7]?.name || "", /SPORTS DAY/);
  assert.match(document.units[11]?.name || "", /PAST AND FUTURE/);
});
