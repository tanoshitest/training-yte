import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadAttendanceUi() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__attendanceGradingTest = { state, repairAttendanceColumnOrder, classAttendanceTab, attendanceAssessmentColumns, attendanceColumnOrder, reorderAttendanceColumnKeys, attendanceScore, attendanceAssessmentText, attendanceAbsenceLocksGrading, attendanceClipValue, attendanceGradeClearIntent };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/gv/lop-hoc/class-1/diem-danh/session-1" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as typeof context & {
    __attendanceGradingTest: {
      state: Record<string, any>;
      classAttendanceTab: (cls: any, teacherView: boolean, sessionId: string) => string;
      attendanceAssessmentColumns: (session: any) => Array<{ id: string; name: string }>;
      attendanceColumnOrder: (session: any, columns?: Array<{ id: string; name: string }>) => string[];
      reorderAttendanceColumnKeys: (order: string[], source: string, target: string, placeAfter?: boolean) => string[];
      attendanceScore: (value: unknown) => number | null;
      attendanceAssessmentText: (value: unknown) => string | null;
      attendanceAbsenceLocksGrading: (status: string) => boolean;
      attendanceClipValue: (formData: FormData, studentId: string, isOff: boolean, previous?: { pronunciationVideoDone?: boolean }) => boolean;
      attendanceGradeClearIntent: (formData: FormData, studentId: string, columns: Array<{ id: string }>, previous?: Record<string, any>, freezeGrades?: boolean) => { studentId: string; vocabulary: boolean; assessmentColumnIds: string[] } | null;
    };
  }).__attendanceGradingTest;
}

test("attendance table includes clip, vocabulary and teacher-defined score columns", () => {
  const ui = loadAttendanceUi();
  const cls = {
    id: "class-1", code: "S1", name: "S1", teacherId: "teacher-1", roomId: "room-1",
    studentIds: ["student-1"], schedules: [], billingMode: "MONTHLY", sessionPrice: 100_000,
  };
  const session = {
    id: "session-1", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, roomId: cls.roomId, status: "COMPLETED", isExtra: true,
    recurrenceKey: "class-1|2026-09-09|17:00", assessmentColumns: [{ id: "speaking", name: "BTVN" }],
    attendance: [{
      studentId: "student-1", status: "PRESENT", pronunciationVideoDone: true,
      vocabularyScore: "32/45", assessmentScores: { speaking: "56/65" }, note: "Tốt",
    }],
  };
  ui.state.attendanceOff = null;
  ui.state.attendanceColumnDrafts = { "session-1": [{ id: "listening", name: "" }] };
  ui.state.attendanceRemovedColumns = {};
  ui.state.data = {
    lessonSessions: [session],
    students: [{ id: "student-1", code: "HV001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }],
    classes: [cls],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };

  const html = ui.classAttendanceTab(cls, true, session.id);

  assert.ok(html.indexOf("Điểm danh") < html.indexOf("Clip quay"));
  assert.ok(html.indexOf("Clip quay") < html.indexOf("Từ vựng"));
  assert.match(html, /name="clip_student-1" checked/);
  assert.match(html, /class="input attendance-assessment-input"[^>]*name="vocabulary_student-1" value="32\/45"/);
  assert.doesNotMatch(html, /name="vocabulary_student-1"[^>]*type="number"/);
  assert.match(html, /name="assessment_column_speaking"[^>]*value="BTVN"/);
  assert.match(html, /class="attendance-column-name" type="text"[^>]*name="assessment_column_speaking"/);
  assert.doesNotMatch(html, /<textarea[^>]*name="assessment_column_/);
  assert.match(html, /data-attendance-column-remove="speaking"/);
  assert.match(html, /class="input attendance-assessment-input"[^>]*name="assessment_speaking_student-1" value="56\/65"/);
  assert.match(html, /name="assessment_column_listening"[^>]*placeholder="BTVN"/);
  assert.match(html, /data-attendance-column-remove="listening"/);
  assert.match(html, /data-attendance-column-add[^>]*>\+<\/button>/);
  assert.match(html, /style="min-width:1412px"/);
  assert.match(html, /data-attendance-column-key="worksheet"/);
  assert.match(html, /name="worksheet_student-1"/);
  assert.match(html, /attendance-student-col" title="Nguyễn Minh Anh">Nguyễn Minh Anh<\/td>/);
  assert.match(html, /data-attendance-column-key="status"/);
  assert.match(html, /data-attendance-column-drag-handle/);
});

test("attendance report columns follow the saved drag order without changing field names", () => {
  const ui = loadAttendanceUi();
  const cls = {
    id: "class-1", code: "S1", name: "S1", teacherId: "teacher-1", roomId: "room-1",
    studentIds: ["student-1"], schedules: [], billingMode: "MONTHLY", sessionPrice: 100_000,
  };
  const session = {
    id: "session-1", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, roomId: cls.roomId, status: "COMPLETED", isExtra: true,
    recurrenceKey: "class-1|2026-09-09|17:00", assessmentColumns: [{ id: "speaking", name: "Nói" }],
    attendanceColumnOrder: ["note", "status", "assessment:speaking", "clip", "vocabulary"],
    attendance: [{ studentId: "student-1", status: "PRESENT", assessmentScores: { speaking: "8/10" }, note: "Tốt" }],
  };
  ui.state.attendanceOff = null;
  ui.state.attendanceColumnDrafts = {};
  ui.state.attendanceRemovedColumns = {};
  ui.state.attendanceColumnOrders = {};
  ui.state.data = {
    lessonSessions: [session],
    students: [{ id: "student-1", code: "HV001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }],
    classes: [cls],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };

  const html = ui.classAttendanceTab(cls, true, session.id);
  assert.ok(html.indexOf('data-attendance-column-key="note"') < html.indexOf('data-attendance-column-key="status"'));
  assert.ok(html.indexOf('data-attendance-column-key="status"') < html.indexOf('data-attendance-column-key="assessment:speaking"'));
  assert.ok(html.indexOf('data-attendance-column-key="clip"') < html.indexOf('data-attendance-column-key="worksheet"'));
  assert.ok(html.indexOf('data-attendance-column-key="worksheet"') < html.indexOf('data-attendance-column-key="vocabulary"'));
  assert.match(html, /name="note_student-1"/);
  assert.match(html, /name="assessment_speaking_student-1"/);
  assert.deepEqual(
    Array.from(ui.reorderAttendanceColumnKeys(["status", "clip", "vocabulary", "note"], "note", "status")),
    ["note", "status", "clip", "vocabulary"],
  );
});

test("attendance scores accept non-negative decimals and reject invalid values", () => {
  const ui = loadAttendanceUi();
  assert.equal(ui.attendanceScore("8.75"), 8.75);
  assert.equal(ui.attendanceScore(""), null);
  assert.equal(ui.attendanceScore("-1"), null);
  assert.equal(ui.attendanceScore("không hợp lệ"), null);
});

test("absent students can submit home video while score and note columns stay frozen", () => {
  const ui = loadAttendanceUi();
  assert.equal(ui.attendanceAbsenceLocksGrading("PRESENT"), false);
  assert.equal(ui.attendanceAbsenceLocksGrading("EXCUSED"), true);
  assert.equal(ui.attendanceAbsenceLocksGrading("ABSENT"), true);
  const cls = {
    id: "class-1", code: "S1", name: "S1", teacherId: "teacher-1", roomId: "room-1",
    studentIds: ["student-1", "student-2"], schedules: [], billingMode: "MONTHLY", sessionPrice: 100_000,
  };
  ui.state.attendanceOff = null;
  ui.state.attendanceColumnDrafts = {};
  ui.state.attendanceRemovedColumns = {};
  ui.state.data = {
    lessonSessions: [{
      id: "session-1", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "19:00",
      teacherId: cls.teacherId, roomId: cls.roomId, status: "COMPLETED", isExtra: true,
      recurrenceKey: "class-1|2026-09-09|17:00", assessmentColumns: [{ id: "btvn", name: "BTVN" }],
      attendance: [
        { studentId: "student-1", status: "PRESENT", vocabularyScore: "32/45", assessmentScores: { btvn: "56/65" }, note: "Tốt" },
        { studentId: "student-2", status: "EXCUSED", vocabularyScore: "", assessmentScores: {}, note: "" },
      ],
    }],
    students: [
      { id: "student-1", code: "HV001", fullName: "An Như Dũng", status: "STUDYING" },
      { id: "student-2", code: "HV002", fullName: "Đỗ Ngọc Triều", status: "STUDYING" },
    ],
    classes: [cls],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };
  const html = ui.classAttendanceTab(cls, true, "session-1");
  assert.match(html, /name="vocabulary_student-1" value="32\/45"/);
  assert.doesNotMatch(html, /name="vocabulary_student-1"[^>]*disabled/);
  assert.match(html, /<tr class="is-absent-row">[\s\S]*name="status_student-2"/);
  assert.match(html, /name="clip_student-2"/);
  assert.doesNotMatch(html, /name="clip_student-2"[^>]*disabled/);
  assert.doesNotMatch(html, /name="clip_student-2"[^>]*data-attendance-grade/);
  assert.match(html, /name="vocabulary_student-2"[^>]*disabled/);
  assert.match(html, /name="assessment_btvn_student-2"[^>]*disabled/);
  assert.match(html, /name="note_student-2"[^>]*disabled/);

  const checked = new FormData();
  checked.set("clip_student-2", "on");
  assert.equal(ui.attendanceClipValue(checked, "student-2", false), true);
  assert.equal(ui.attendanceClipValue(new FormData(), "student-2", false, { pronunciationVideoDone: true }), false);
  assert.equal(ui.attendanceClipValue(checked, "student-2", true, { pronunciationVideoDone: false }), false);
  assert.equal(ui.attendanceClipValue(new FormData(), "student-2", true, { pronunciationVideoDone: true }), true);
});

test("ticking only home video does not request clearing previously saved grade columns", () => {
  const ui = loadAttendanceUi();
  const previous = { vocabularyScore: "22/24", assessmentScores: { btvn: "23/24" } };
  const clipOnly = new FormData();
  clipOnly.set("clip_student-1", "on");
  assert.equal(ui.attendanceGradeClearIntent(clipOnly, "student-1", [{ id: "btvn" }], previous), null);

  const explicitClear = new FormData();
  explicitClear.set("vocabulary_student-1", "");
  explicitClear.set("assessment_btvn_student-1", "");
  assert.deepEqual(
    structuredClone(ui.attendanceGradeClearIntent(explicitClear, "student-1", [{ id: "btvn" }], previous)),
    { studentId: "student-1", vocabulary: true, assessmentColumnIds: ["btvn"] },
  );
  assert.equal(ui.attendanceGradeClearIntent(explicitClear, "student-1", [{ id: "btvn" }], previous, true), null);
});

test("vocabulary attendance cells keep legacy numbers and accept free-form text", () => {
  const ui = loadAttendanceUi();
  assert.equal(ui.attendanceAssessmentText("  Cần ôn house / kitchen  "), "Cần ôn house / kitchen");
  const cls = {
    id: "class-1", code: "S1", name: "S1", teacherId: "teacher-1", roomId: "room-1",
    studentIds: ["student-1"], schedules: [], billingMode: "MONTHLY", sessionPrice: 100_000,
  };
  ui.state.attendanceOff = null;
  ui.state.attendanceColumnDrafts = {};
  ui.state.attendanceRemovedColumns = {};
  ui.state.data = {
    lessonSessions: [{
      id: "session-1", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "19:00",
      teacherId: cls.teacherId, roomId: cls.roomId, status: "COMPLETED", isExtra: true,
      recurrenceKey: "class-1|2026-09-09|17:00", attendance: [{
        studentId: "student-1", status: "PRESENT", vocabularyScore: 8.5,
      }],
    }],
    students: [{ id: "student-1", code: "HV001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }],
    classes: [cls],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };
  const html = ui.classAttendanceTab(cls, true, "session-1");
  assert.match(html, /type="text"[^>]*name="vocabulary_student-1" value="8\.5"/);
});

test("teacher-defined attendance columns accept text and can be removed before saving", () => {
  const ui = loadAttendanceUi();
  ui.state.attendanceColumnDrafts = { "session-1": [{ id: "listening", name: "Nghe" }] };
  ui.state.attendanceRemovedColumns = { "session-1": ["speaking"] };
  const session = { id: "session-1", assessmentColumns: [{ id: "speaking", name: "Nói" }] };

  assert.equal(ui.attendanceAssessmentText("  Hoàn thành tốt  "), "Hoàn thành tốt");
  assert.equal(ui.attendanceAssessmentText(9), "9");
  assert.equal(ui.attendanceAssessmentText(""), null);
  assert.deepEqual(Array.from(ui.attendanceAssessmentColumns(session), (column: any) => column.id), ["listening"]);
});

test("attendance grading styles keep the wide table horizontally scrollable", () => {
  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.attendance-clip-check input:checked \+ span/);
  assert.match(styles, /\.attendance-add-column/);
  assert.match(styles, /\.attendance-column-name[^}]*background: transparent !important;[^}]*text-align: center/);
  assert.match(styles, /\.attendance-column-remove/);
  assert.match(styles, /\.attendance-draggable-column/);
  assert.match(styles, /\.attendance-column-drag-handle/);
  assert.match(styles, /\.attendance-assessment-input \{ text-align: center; \}/);
  assert.match(styles, /\.nz-attendance-table th,\s*\.nz-attendance-table td \{ border-right: 1px solid var\(--slate-200\);/);
  assert.match(styles, /\.attendance-student-col \{ width: 108px;/);
  assert.match(styles, /tr\.is-absent-row \[data-attendance-grade\]/);
  assert.match(styles, /\.nz-attendance-table \{ min-height: 0; flex: 1; overflow: auto; \}/);
  assert.match(styles, /\.nz-class-page:has\(#attendance-form\) \.nz-attendance-table \{ max-height: none; -webkit-overflow-scrolling: touch; \}/);
});

test("thứ tự cột cũ bị lỗi (cột điểm nằm sau Nhận xét) được đưa Nhận xét về cuối", () => {
  const ui = loadAttendanceUi() as any;
  assert.deepEqual([...ui.repairAttendanceColumnOrder(["status", "clip", "worksheet", "vocabulary", "note", "assessment:a", "assessment:b"])], ["status", "clip", "worksheet", "vocabulary", "assessment:a", "assessment:b", "note"]);
  assert.deepEqual([...ui.repairAttendanceColumnOrder(["note", "status", "assessment:a", "clip"])], ["note", "status", "assessment:a", "clip"]);
});
