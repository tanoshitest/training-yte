import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadAttendanceReport() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__attendanceReportTest = { state, attendanceReportData, attendanceReportPage };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/bao-cao/chuyen-can" },
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
    __attendanceReportTest: {
      state: Record<string, unknown>;
      attendanceReportData: () => {
        sessions: Array<{ id: string }>;
        rows: Array<{ student: { id: string }; rate: number; statuses: Array<string | null> }>;
      };
      attendanceReportPage: () => string;
    };
  }).__attendanceReportTest;
}

test("attendance matrix uses saved sessions and calculates present percentage", () => {
  const report = loadAttendanceReport();
  report.state.reportClass = "class-1";
  report.state.data = {
    classes: [{ id: "class-1", code: "T1", name: "T1", studentIds: ["student-1", "student-2", "student-3"] }],
    students: [
      { id: "student-1", code: "HV001", fullName: "One" },
      { id: "student-2", code: "HV002", fullName: "Two" },
      { id: "student-3", code: "HV003", fullName: "Three" },
    ],
    lessonSessions: [
      {
        id: "later",
        classId: "class-1",
        date: "2026-09-09",
        startTime: "16:30",
        endTime: "18:30",
        attendance: [
          { studentId: "student-1", status: "EXCUSED" },
          { studentId: "student-2", status: "PRESENT" },
        ],
      },
      {
        id: "first",
        classId: "class-1",
        date: "2026-09-07",
        startTime: "16:30",
        endTime: "18:30",
        attendance: [
          { studentId: "student-1", status: "PRESENT" },
          { studentId: "student-2", status: "ABSENT" },
          { studentId: "student-3", status: "PRESENT" },
        ],
      },
      { id: "future", classId: "class-1", date: "2026-09-14", startTime: "16:30", endTime: "18:30", attendance: [] },
    ],
  };

  const data = report.attendanceReportData();
  assert.deepEqual(data.sessions.map((row) => row.id), ["first", "later"]);
  assert.equal(data.rows.find((row) => row.student.id === "student-1")?.rate, 50);
  assert.equal(data.rows.find((row) => row.student.id === "student-2")?.rate, 50);
  assert.equal(data.rows.find((row) => row.student.id === "student-3")?.rate, 100);

  const html = report.attendanceReportPage();
  assert.doesNotMatch(html, /class-summary-grid|Tình trạng|Tìm kiếm/);
  assert.match(html, /<th>STT<\/th><th>Mã học viên<\/th><th>Tên học viên<\/th><th>Chuyên cần<\/th>/);
  assert.match(html, /title="07\/09\/2026 · 16:30–18:30">07\/09<\/th>/);
  assert.match(html, /title="09\/09\/2026 · 16:30–18:30">09\/09<\/th>/);
  assert.match(html, /<td title="One">One<\/td>/);
  assert.match(html, /Có mặt/);
  assert.match(html, /Vắng có phép/);
  assert.match(html, /Vắng không phép/);
  assert.match(html, /aria-label="Có mặt">✓<\/span>/);
  assert.match(html, /aria-label="Vắng có phép">P<\/span>/);
  assert.match(html, /aria-label="Vắng không phép">×<\/span>/);
  assert.equal((html.match(/<select/g) || []).length, 1);
  assert.match(html, /style="--attendance-desktop-width:466px;--attendance-mobile-width:388px"/);

  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.attendance-matrix-wrap \.attendance-matrix \{ width: var\(--attendance-desktop-width\); min-width: var\(--attendance-desktop-width\); max-width: var\(--attendance-desktop-width\); table-layout: fixed;/);
  assert.match(styles, /\.attendance-session-column, \.attendance-session-cell \{ width: 48px; min-width: 48px; max-width: 48px; height: 48px;/);
  assert.match(styles, /\.attendance-matrix th:nth-child\(1\).*width: 40px/);
  assert.match(styles, /\.attendance-matrix th:nth-child\(2\).*left: 40px; width: 96px/);
  assert.match(styles, /\.attendance-matrix th:nth-child\(3\).*left: 136px; width: 150px/);
  assert.match(styles, /\.attendance-matrix th:nth-child\(4\).*left: 286px; width: 84px/);
});
