import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://portal-test:portal-test@localhost:5432/portal-test";

const portalData = import("../src/lib/portal-data");

test("allows student-facing Portal data only for the intended roles", async () => {
  const { canReadPortalData } = await portalData;
  assert.equal(canReadPortalData("ADMIN"), true);
  assert.equal(canReadPortalData("ACADEMIC"), true);
  assert.equal(canReadPortalData("STUDENT"), true);
  assert.equal(canReadPortalData("TEACHER"), false);
});

test("keeps student data scoped to the signed-in student", async () => {
  const { PortalDataError, resolvePortalStudentId } = await portalData;
  const student = {
    id: "user-student-1",
    role: "STUDENT" as const,
    studentId: "student-1",
    fullName: "Student One",
    email: "student@example.com",
  };

  assert.equal(resolvePortalStudentId(student), "student-1");
  assert.equal(resolvePortalStudentId(student, "student-1"), "student-1");
  assert.throws(
    () => resolvePortalStudentId(student, "student-2"),
    (error) => error instanceof PortalDataError && error.status === 403,
  );
});

test("requires administrators to explicitly select a student", async () => {
  const { resolvePortalStudentId } = await portalData;
  const administrator = {
    id: "user-academic-1",
    role: "ACADEMIC" as const,
    studentId: null,
    fullName: "Academic User",
    email: "academic@example.com",
  };

  assert.equal(resolvePortalStudentId(administrator), null);
  assert.equal(resolvePortalStudentId(administrator, " student-1 "), "student-1");
});

test("formats stable Portal display values", async () => {
  const { initials, isoDate, percent } = await portalData;
  assert.equal(initials("Nguyễn Văn An"), "VA");
  assert.equal(initials("  An  "), "A");
  assert.equal(isoDate(new Date("2026-08-30T18:00:00.000Z")), "2026-08-30");
  assert.equal(percent(3, 4), 75);
  assert.equal(percent(3, 0), 0);
  assert.equal(percent(8, 4), 100);
});

test("maps attendance and schedule ranges for Portal pages", async () => {
  const { attendanceMark, parseScheduleRange } = await portalData;
  assert.equal(attendanceMark("PRESENT"), "P");
  assert.equal(attendanceMark("ABSENT"), "A");
  assert.equal(attendanceMark("EXCUSED"), "");
  assert.equal(attendanceMark(undefined), "");

  const range = parseScheduleRange("2026-09-01", "2026-09-07");
  assert.equal(range.from.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-09-07T00:00:00.000Z");

  const swapped = parseScheduleRange("2026-09-10", "2026-09-01");
  assert.equal(swapped.from.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(swapped.to.toISOString(), "2026-09-10T00:00:00.000Z");
});
