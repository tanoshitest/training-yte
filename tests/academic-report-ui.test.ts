import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadAcademicReport() {
  const download = { url: "", body: "", filename: "", opened: false };
  const toastEl = { textContent: "", classList: { add() {}, remove() {} } };
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__academicReportTest = { state, academicSessionReportRows, academicReportPage, downloadAcademicReportPdf };\n");
  const context = vm.createContext({
    console,
    document: {
      querySelector: (selector: string) => selector === "#toast" ? toastEl : null,
      querySelectorAll: () => [],
      createElement: () => ({
        href: "",
        download: "",
        click() { download.filename = this.download; },
        remove() {},
      }),
      body: { appendChild() {} },
    },
    window: {
      addEventListener: () => {},
      open: () => { download.opened = true; return null; },
    },
    location: { pathname: "/bao-cao/hoc-vu", origin: "http://localhost" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL: Object.assign(URL, {
      createObjectURL() { return "blob:academic-report"; },
      revokeObjectURL() {},
    }),
    URLSearchParams,
    fetch: async (url: string, options: { body?: string } = {}) => {
      download.url = url;
      download.body = String(options.body || "");
      return {
        ok: true,
        blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        headers: { get: () => 'attachment; filename="bao-cao-hoc-vu-S1-Starters-12092026-buoi-1.pdf"' },
        json: async () => ({}),
      };
    },
    Blob,
  });
  vm.runInContext(source, context);
  const exposed = (context as typeof context & {
    __academicReportTest: {
      state: Record<string, any>;
      academicSessionReportRows: () => Array<Record<string, any>>;
      academicReportPage: () => string;
      downloadAcademicReportPdf: (sessionId: string) => Promise<void>;
    };
  }).__academicReportTest;
  return Object.assign(exposed, { download, toastEl });
}

function prepareReport() {
  const report = loadAcademicReport();
  report.state.reportQuery = "";
  report.state.reportClass = "";
  report.state.reportTeacher = "";
  report.state.reportFrom = "";
  report.state.reportTo = "";
  report.state.data = {
    classes: [
      { id: "class-1", code: "S1", name: "S1 Starters", teacherId: "teacher-1", studentIds: ["student-1", "student-2"], schedules: [] },
      { id: "class-2", code: "S2", name: "S2 Movers", teacherId: "teacher-2", studentIds: ["student-3"], schedules: [] },
    ],
    teachers: [
      { id: "teacher-1", fullName: "Cô Vân" },
      { id: "teacher-2", fullName: "Cô Thủy" },
    ],
    students: [
      { id: "student-1", code: "HV001", fullName: "Khánh An" },
      { id: "student-2", code: "HV002", fullName: "Bảo Châu" },
      { id: "student-3", code: "HV003", fullName: "Gia Hân" },
    ],
    settings: {
      center: {
        name: "STEPS Education",
        phone: "0901 234 567",
        email: "contact@steps.edu.vn",
        address: "Hà Tĩnh",
        logoUrl: "",
      },
    },
    lessonSessions: [
      {
        id: "session-1", classId: "class-1", teacherId: "teacher-1", date: "2026-09-12", startTime: "09:00", endTime: "11:00", status: "COMPLETED",
        assessmentColumns: [{ id: "speaking", name: "Speaking" }],
        attendance: [
          { studentId: "student-1", status: "PRESENT", pronunciationVideoDone: true, vocabularyScore: 8, assessmentScores: { speaking: 9 }, note: "Tiến bộ tốt" },
          { studentId: "student-2", status: "EXCUSED", pronunciationVideoDone: false, vocabularyScore: 6, assessmentScores: { speaking: 7 }, note: "" },
        ],
      },
      {
        id: "session-2", classId: "class-2", teacherId: "teacher-2", date: "2026-09-10", startTime: "17:00", endTime: "19:00", status: "COMPLETED",
        attendance: [{ studentId: "student-3", status: "PRESENT", pronunciationVideoDone: true, vocabularyScore: null, assessmentScores: {}, note: "" }],
      },
      { id: "unsaved", classId: "class-1", date: "2026-09-14", startTime: "09:00", endTime: "11:00", status: "SCHEDULED", attendance: [] },
    ],
  };
  return report;
}

test("academic report summarizes real teacher submissions by session", () => {
  const report = prepareReport();
  const rows = report.academicSessionReportRows();

  assert.deepEqual(rows.map((row) => row.session.id), ["session-1", "session-2"]);
  assert.equal(rows[0].present, 1);
  assert.equal(rows[0].excused, 1);
  assert.equal(rows[0].clipDone, 1);
  assert.equal(rows[0].vocabularyAverage, 7);
  assert.equal(rows[0].customScores[0].average, 8);
  assert.deepEqual(rows[0].notes, ["Khánh An: Tiến bộ tốt"]);
});

test("course report uses the timetable sequence instead of a stale stored sequence", () => {
  const report = prepareReport();
  report.state.data.classes[0] = {
    ...report.state.data.classes[0],
    billingMode: "COURSE",
    courseStartDate: "2026-07-05",
    courseSessions: 24,
    schedules: [
      { weekday: 5, startTime: "19:15", endTime: "21:15" },
      { weekday: 0, startTime: "09:00", endTime: "11:00" },
    ],
  };
  report.state.data.lessonSessions[0] = {
    ...report.state.data.lessonSessions[0],
    date: "2026-09-13",
    startTime: "09:00",
    endTime: "11:00",
    sequence: 4,
    recurrenceKey: "class-1|2026-09-13|09:00",
  };

  const row = report.academicSessionReportRows().find((item) => item.session.id === "session-1");
  assert.equal(row?.sequence, 21);
});

test("academic report includes students added to the current class roster", () => {
  const report = prepareReport();
  report.state.data.classes[0].studentIds.push("student-new");
  report.state.data.students.push({ id: "student-new", code: "HV004", fullName: "Trấn Quốc" });

  const row = report.academicSessionReportRows().find((item) => item.session.id === "session-1");
  assert.equal(row?.total, 3);
  assert.equal(row?.marked, 2);
  assert.equal(row?.attendance.at(-1)?.studentId, "student-new");

  report.state.academicReportModal = "session-1";
  const html = report.academicReportPage();
  assert.match(html, /Trấn Quốc/);
  assert.match(html, /Chưa điểm danh/);
});

test("academic report renders compact filters and opens the session popup", () => {
  const report = prepareReport();
  const html = report.academicReportPage();

  assert.match(html, /Báo cáo theo từng buổi \(2\)/);
  assert.match(html, /12\/09\/2026/);
  assert.match(html, /S1 Starters/);
  assert.match(html, /Cô Vân/);
  assert.match(html, /Clip ở nhà/);
  assert.match(html, /Từ vựng TB/);
  assert.match(html, /Speaking: <strong>8<\/strong>/);
  assert.match(html, /Khánh An: Tiến bộ tốt/);
  assert.match(html, /data-academic-report-open="session-1"/);
  assert.match(html, /name="teacher"/);
  assert.match(html, /name="from"/);
  assert.match(html, /name="to"/);
  assert.doesNotMatch(html, /Demo homework|Cần hỗ trợ khi/);
  assert.doesNotMatch(html, /<div class="page-header">/);

  report.state.academicReportModal = "session-1";
  const modal = report.academicReportPage();
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /src="http:\/\/localhost\/steps-wordmark\.png"/);
  assert.match(modal, /Trung tâm Ngoại ngữ STEPS/);
  assert.match(modal, /CS1: 57 Trương Quốc Dụng, P\. Thành Sen, Hà Tĩnh/);
  assert.match(modal, /CS2: Thôn Đồng Giang, xã Thạch Khê, Hà Tĩnh/);
  assert.match(modal, /Hotline: 0813\.661\.668/);
  assert.match(modal, /Báo cáo học vụ · S1 Starters/);
  assert.match(modal, /Khánh An/);
  assert.match(modal, /Vắng phép/);
  assert.match(modal, /Speaking/);
  assert.match(modal, /academic-sheet-table/);
  assert.match(modal, /<col class="academic-sheet-col-stt" style="width:[^"]+" \/>/);
  assert.match(modal, /<th class="academic-stt-head">STT<\/th>/);
  assert.match(modal, /<strong>Báo cáo học vụ · S1 Starters · Buổi 1<\/strong>/);
  assert.match(modal, /<span>12\/09\/2026 · 09:00–11:00 · GV Cô Vân<\/span>/);
  assert.match(modal, /data-academic-report-pdf="session-1"/);
  assert.match(modal, />Xuất PDF<\/button>/);
  assert.doesNotMatch(modal, /academic-modal-summary/);
  assert.doesNotMatch(modal, /badge-green|badge-amber|badge-red/);
});

test("popup tints score cells and shows the colour legend like the printed sheet", () => {
  const report = prepareReport();
  report.state.data.lessonSessions[0].attendance[0].vocabularyScore = "32/43";
  report.state.data.lessonSessions[0].attendance[0].assessmentScores = { speaking: 4 };
  report.state.data.lessonSessions[0].attendance[1].vocabularyScore = "9/18";
  report.state.academicReportModal = "session-1";
  const modal = report.academicReportPage();

  // 32/43 ~74% vàng, 4 (trên 10) 40% đỏ, 9/18 đúng mốc 50% nên vàng.
  assert.match(modal, /class="academic-score-cell academic-score-yellow">32\/43</);
  assert.match(modal, /class="academic-score-cell academic-score-red">4</);
  assert.match(modal, /class="academic-score-cell academic-score-yellow">9\/18</);
  assert.match(modal, /academic-legend-dot academic-score-red"><\/i>Cần chú ý nhiều/);
  assert.match(modal, /academic-legend-dot academic-score-yellow"><\/i>Khá/);
  assert.match(modal, /academic-legend-dot academic-score-green"><\/i>Giỏi/);
});

test("popup leaves out the legend and tint when the session has no score", () => {
  const report = prepareReport();
  report.state.academicReportModal = "session-2";
  const modal = report.academicReportPage();

  assert.doesNotMatch(modal, /academic-score-legend/);
  assert.doesNotMatch(modal, /academic-score-red|academic-score-yellow|academic-score-green/);
});

test("academic report export downloads a PDF with the popup content", async () => {
  const report = prepareReport();
  await report.downloadAcademicReportPdf("session-1");

  assert.equal(report.download.opened, false);
  assert.equal(report.download.url, "/api/reports/academic-session");
  assert.equal(report.download.filename, "bao-cao-hoc-vu-S1-Starters-12092026-buoi-1.pdf");
  assert.match(report.download.body, /"className":"S1 Starters"/);
  assert.match(report.download.body, /"fullName":"Khánh An"/);
  assert.match(report.download.body, /"status":"Có mặt"/);
  assert.match(report.download.body, /"status":"Vắng phép"/);
  assert.match(report.download.body, /"note":"Tiến bộ tốt"/);
  assert.match(report.download.body, /"name":"Speaking"/);
  assert.equal(report.toastEl.textContent, "Đã tải báo cáo học vụ.");
});

test("departed students disappear from session report rows and PDF", async () => {
  const report = prepareReport();
  // ID vẫn nằm trong roster + attendance nhưng hồ sơ đã bị xoá.
  report.state.data.classes[0].studentIds.push("student-gone");
  report.state.data.lessonSessions[0].attendance.push({ studentId: "student-gone", status: "PRESENT", pronunciationVideoDone: true, vocabularyScore: 9, assessmentScores: { speaking: 10 }, note: "Gone note" });
  // Hồ sơ còn tồn tại nhưng đã bị gỡ khỏi roster lớp.
  report.state.data.students.push({ id: "student-left", code: "HV009", fullName: "Đã Rời" });
  report.state.data.lessonSessions[0].attendance.push({ studentId: "student-left", status: "PRESENT", vocabularyScore: 10, assessmentScores: {}, note: "" });

  const row = report.academicSessionReportRows().find((item) => item.session.id === "session-1");
  assert.equal(row?.total, 2);
  assert.equal(row?.marked, 2);
  assert.equal(row?.present, 1);
  assert.deepEqual([...(row?.attendance || []).map((entry: any) => entry.studentId)], ["student-1", "student-2"]);

  report.state.academicReportModal = "session-1";
  const modal = report.academicReportPage();
  assert.doesNotMatch(modal, /Học viên đã rời lớp/);
  assert.doesNotMatch(modal, /Đã Rời/);
  assert.doesNotMatch(modal, /Gone note/);

  await report.downloadAcademicReportPdf("session-1");
  assert.doesNotMatch(report.download.body, /student-gone|student-left|Đã Rời/);
});

test("popup and PDF follow the column order saved from attendance", async () => {
  const report = prepareReport();
  report.state.data.lessonSessions[0].attendanceColumnOrder = [
    "note",
    "status",
    "assessment:speaking",
    "clip",
    "vocabulary",
  ];
  report.state.academicReportModal = "session-1";

  const modal = report.academicReportPage();
  const sheetStart = modal.indexOf('class="academic-sheet-table"');
  const headerStart = modal.indexOf('<thead><tr>', sheetStart);
  const headerEnd = modal.indexOf('</tr></thead>', headerStart);
  const headers = modal.slice(headerStart, headerEnd);
  assert.ok(headers.indexOf("Nhận xét") < headers.indexOf("Điểm danh"));
  assert.ok(headers.indexOf("Điểm danh") < headers.indexOf("Speaking"));
  assert.ok(headers.indexOf("Speaking") < headers.indexOf("Clip ở nhà"));
  assert.ok(headers.indexOf("Clip ở nhà") < headers.indexOf("Từ vựng"));

  await report.downloadAcademicReportPdf("session-1");
  const payload = JSON.parse(report.download.body);
  assert.deepEqual(payload.columnOrder, ["note", "status", "assessment:speaking", "clip", "vocabulary"]);
});
