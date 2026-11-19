import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadPeriodicReport() {
  const download = { url: "", body: "", filename: "", blobUrl: "" };
  const toastEl = { textContent: "", classList: { add() {}, remove() {} } };
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\n", fs.readFileSync(new URL("../cloudflare/public/grading-worksheet.js", import.meta.url), "utf8"))
    .concat("\nglobalThis.__periodicReportTest = { state, periodicPeriodRows, periodicReportComplete, periodicReportPage, periodicReportModalHtml, periodicMonthActivity, downloadPeriodicReportPdf, gradingWorksheetPage, gradingVideoPage, gradingTestModalHtml, gradingGroupFiles };\n");
  const context = vm.createContext({
    console,
    document: {
      querySelector: (selector: string) => selector === "#toast" ? toastEl : null,
      querySelectorAll: () => [],
      createElement: () => ({
        href: "",
        download: "",
        click() { download.filename = this.download; download.blobUrl = this.href; },
        remove() {},
      }),
      body: { appendChild() {} },
    },
    window: {
      addEventListener: () => {},
      open: () => null,
    },
    location: { pathname: "/bao-cao/dinh-ky" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL: Object.assign(URL, {
      createObjectURL() { return "blob:periodic-report"; },
      revokeObjectURL() {},
    }),
    URLSearchParams,
    fetch: async (url: string, options: { body?: string } = {}) => {
      download.url = url;
      download.body = String(options.body || "");
      return {
        ok: true,
        blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        headers: { get: () => 'attachment; filename="bao-cao-dinh-ky-HV001-092026.pdf"' },
        json: async () => ({}),
      };
    },
    Blob,
  });
  vm.runInContext(source, context);
  const exposed = (context as typeof context & {
    __periodicReportTest: {
      state: Record<string, any>;
      periodicPeriodRows: () => Array<Record<string, any>>;
      periodicReportComplete: (report: Record<string, any>) => boolean;
      periodicReportPage: () => string;
      periodicReportModalHtml: () => string;
      periodicMonthActivity: (period: Record<string, any>, studentId: string) => Record<string, any>;
      downloadPeriodicReportPdf: (report: Record<string, any>, button?: { disabled: boolean }) => Promise<void>;
      gradingWorksheetPage: () => string;
      gradingVideoPage: () => string;
      gradingTestModalHtml: () => string;
    };
  }).__periodicReportTest;
  return Object.assign(exposed, { download, toastEl });
}

function preparePeriodicReport() {
  const report = loadPeriodicReport();
  report.state.periodicReportClass = "";
  report.state.periodicReportMonth = "2026-09";
  report.state.periodicReportModal = null;
  report.state.data = {
    classes: [
      { id: "class-month", code: "M01", name: "Lớp tháng", status: "ACTIVE", billingMode: "MONTHLY", teacherId: "teacher-1", roomId: "room-1", studentIds: ["student-1"], schedules: [{ weekday: 2, periodId: "p1", startTime: "17:00", endTime: "19:00" }] },
      { id: "class-course", code: "K24", name: "Lớp khóa", status: "ACTIVE", billingMode: "COURSE", courseStartDate: "2026-09-01", courseSessions: 4, teacherId: "teacher-1", roomId: "room-1", studentIds: ["student-2"], schedules: [{ weekday: 2, periodId: "p1", startTime: "19:00", endTime: "20:30" }] },
      { id: "class-finished", code: "OLD", name: "Lớp đã kết thúc", status: "FINISHED", billingMode: "MONTHLY", studentIds: [], schedules: [] },
    ],
    students: [
      { id: "student-1", code: "HV001", fullName: "Khánh An" },
      { id: "student-2", code: "HV002", fullName: "Bảo Châu" },
    ],
    lessonSessions: [
      { id: "session-1", classId: "class-month", date: "2026-09-05", startTime: "17:00", status: "COMPLETED", assessmentColumns: [{ id: "ac1", name: "Bài kiểm tra" }], attendance: [{ studentId: "student-1", status: "PRESENT", late: false, vocabularyScore: "9", assessmentScores: { ac1: "8.5" } }] },
      { id: "session-2", classId: "class-month", date: "2026-09-12", startTime: "17:00", status: "COMPLETED", assessmentColumns: [{ id: "ac2", name: "Bài kiểm tra" }], attendance: [{ studentId: "student-1", status: "EXCUSED", late: false, vocabularyScore: "7", assessmentScores: {} }] },
      { id: "session-3", classId: "class-month", date: "2026-09-19", startTime: "17:00", status: "SCHEDULED", assessmentColumns: [], attendance: [] },
    ],
    periodicReports: [{
      id: "report-1",
      classId: "class-month",
      studentId: "student-1",
      periodType: "MONTHLY",
      periodKey: "2026-09",
      periodLabel: "Tháng 09/2026",
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      scores: { listening: 8, speaking: 7.5, reading: 9, writing: 8.5 },
      attitudeComment: "Tích cực học tập, lễ phép, hòa đồng với bạn bè.",
      skillComments: { listening: "Nghe tốt, phản xạ nhanh.", speaking: "", reading: "", writing: "" },
      comment: "Tiến bộ tốt và tự tin hơn.",
      updatedAt: "2026-09-13T02:00:00.000Z",
      updatedBy: "Quản trị STEPS",
    }],
  };
  return report;
}

test("periodic report: lớp thu tháng theo tháng, lớp thu khóa theo khóa", () => {
  const report = preparePeriodicReport();
  const periods = report.periodicPeriodRows();

  assert.deepEqual(periods.map((row) => row.cls.id).sort(), ["class-course", "class-month"]);
  const month = periods.find((row) => row.cls.id === "class-month");
  const course = periods.find((row) => row.cls.id === "class-course");
  assert.equal(month?.type, "MONTHLY");
  assert.equal(month?.label, "Tháng 09/2026");
  assert.equal(month?.periodKey, "2026-09");
  assert.equal(course?.type, "COURSE");
  assert.match(String(course?.label), /^Khóa \d+$/);
  assert.equal(course?.periodKey, `K${String(course?.label).replace("Khóa ", "")}`);
  assert.ok(course?.fromDate && course?.toDate && course.fromDate <= course.toDate);
  assert.equal(report.periodicReportComplete(report.state.data.periodicReports[0]), true);
});

test("periodic report page selects a class first and renders one full-width roster", () => {
  const report = preparePeriodicReport();
  let html = report.periodicReportPage();

  assert.match(html, /Báo cáo định kỳ theo lớp/);
  assert.match(html, /name="class"/);
  assert.match(html, /Lớp tháng/);
  assert.match(html, /Lớp khóa/);
  assert.doesNotMatch(html, /Lớp đã kết thúc/);
  assert.match(html, /name="month"/);
  assert.doesNotMatch(html, /name="courseFrom"/);
  assert.match(html, /Chọn một lớp đang học/);

  report.state.periodicReportClass = "class-month";
  html = report.periodicReportPage();
  assert.match(html, /name="month"/);
  assert.doesNotMatch(html, /name="courseFrom"/);
  assert.match(html, /Danh sách học viên · Lớp tháng/);
  assert.match(html, /Khánh An/);
  assert.match(html, /Đã hoàn thành/);
  assert.match(html, /data-periodic-report-open="student-1"/);
  assert.match(html, /periodic-student-list/);
  assert.doesNotMatch(html, /periodic-report-workspace|periodic-period-table/);

  report.state.periodicReportClass = "class-course";
  html = report.periodicReportPage();
  assert.match(html, /name="course"/);
  assert.doesNotMatch(html, /name="month"/);
  assert.match(html, /Lớp khóa · Theo khóa/);
  assert.match(html, /Lớp tháng · Theo tháng/);
  assert.match(html, /Bảo Châu/);

  // Chọn khóa khác → danh sách và khoảng ngày đổi theo khóa đó.
  report.state.periodicReportCourse = 1;
  const first = report.periodicPeriodRows()[0];
  assert.equal(first.periodKey, "K1");
  assert.match(report.periodicReportPage(), /data-periodic-period-id="class-course\|COURSE\|1"/);
  report.state.periodicReportModal = { periodId: "class-course|COURSE|1", studentId: "student-2" };
  const courseModal = report.periodicReportModalHtml();
  assert.match(courseModal, /Chuyên cần khóa này/);
  assert.match(courseModal, /Điểm thành phần khóa này/);
  assert.doesNotMatch(courseModal, /tháng này/);
});

test("periodic student popup edits four skills and exports a parent PDF", async () => {
  const report = preparePeriodicReport();
  report.state.periodicReportClass = "class-month";
  report.state.periodicReportModal = { periodId: "class-month|MONTHLY|2026-09", studentId: "student-1" };
  const modal = report.periodicReportModalHtml();

  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /Chuyên cần tháng này/);
  assert.match(modal, /Đánh giá thái độ học tập/);
  assert.match(modal, /name="attitude"/);
  assert.match(modal, /Tích cực học tập, lễ phép/);
  assert.match(modal, /Điểm thành phần tháng này/);
  assert.match(modal, /Bài kiểm tra/);
  assert.match(modal, /Nhận xét chung của trung tâm/);
  for (const skill of ["listening", "speaking", "reading", "writing"]) assert.match(modal, new RegExp(`name="${skill}"`));
  for (const skill of ["listening", "speaking", "reading", "writing"]) assert.match(modal, new RegExp(`name="${skill}Comment"`));
  assert.match(modal, /Nghe tốt, phản xạ nhanh\./);
  assert.match(modal, /Tiến bộ tốt và tự tin hơn/);
  assert.match(modal, /data-periodic-report-pdf/);
  assert.match(modal, />Lưu báo cáo<\/button>/);

  const activity = report.periodicMonthActivity({ cls: report.state.data.classes[0], fromDate: "2026-09-01", toDate: "2026-09-30" }, "student-1");
  assert.equal(activity.sessions.length, 2);
  assert.equal(activity.attendance.present, 1);
  assert.equal(activity.attendance.excused, 1);
  assert.deepEqual([...activity.columnNames], ["Bài kiểm tra"]);

  await report.downloadPeriodicReportPdf(report.state.data.periodicReports[0]);
  assert.equal(report.download.url, "/api/reports/periodic-report");
  const payload = JSON.parse(report.download.body);
  assert.equal(payload.className, "Lớp tháng");
  assert.equal(payload.studentName, "Khánh An");
  assert.equal(payload.studentCode, "HV001");
  assert.equal(payload.periodLabel, "Tháng 09/2026");
  assert.equal(payload.fromLabel, "01/09/2026");
  assert.equal(payload.toLabel, "30/09/2026");
  assert.equal(payload.attitudeComment, "Tích cực học tập, lễ phép, hòa đồng với bạn bè.");
  assert.equal(payload.skillComments.listening, "Nghe tốt, phản xạ nhanh.");
  assert.equal(payload.scores.listening, 8);
  assert.equal(payload.scores.speaking, 7.5);
  assert.equal(payload.comment, "Tiến bộ tốt và tự tin hơn.");
  assert.match(payload.attendance, /Có mặt 1\/2 buổi/);
  assert.match(payload.attendance, /Vắng phép 1/);
  assert.match(payload.attendance, /Đi muộn 0/);
  assert.equal(report.download.filename, "bao-cao-dinh-ky-HV001-092026.pdf");
  assert.equal(report.download.blobUrl, "blob:periodic-report");
  assert.equal(report.toastEl.textContent, "Đã tải báo cáo định kỳ.");
});

test("periodic report PDF renders a branded one-page STEPS letter", async () => {
  const { buildPeriodicReportPdf, periodicReportDownloadName } = await import("../cloudflare/periodic-report-pdf");
  const { PDFDocument } = await import("pdf-lib");
  const fontDir = new URL("../cloudflare/public/fonts/", import.meta.url);
  const pdfBytes = await buildPeriodicReportPdf(
    {
      regular: fs.readFileSync(new URL("Roboto-Regular.ttf", fontDir)),
      medium: fs.readFileSync(new URL("Roboto-Medium.ttf", fontDir)),
    },
    {
      className: "Lớp tháng",
      periodLabel: "Tháng 09/2026",
      fromLabel: "01/09/2026",
      toLabel: "30/09/2026",
      studentName: "Khánh An",
      studentCode: "HV001",
      attendance: "Có mặt 1/2 buổi · Vắng phép 1 · Vắng không phép 0",
      attitudeComment: "Tích cực học tập, lễ phép, hòa đồng với bạn bè.",
      scores: { listening: 8, speaking: 7.5, reading: 9, writing: 8.5 },
      skillComments: { listening: "Nghe tốt, phản xạ nhanh.", speaking: "", reading: "", writing: "" },
      comment: "Tiến bộ tốt và tự tin hơn.",
      logoPng: fs.readFileSync(new URL("../cloudflare/public/steps-wordmark.png", import.meta.url)),
    },
  );
  assert.equal(new TextDecoder().decode(pdfBytes.subarray(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(pdfBytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(periodicReportDownloadName("HV001", "Tháng 09/2026"), "bao-cao-dinh-ky-HV001-092026.pdf");
});

test("grading worksheet page lists server tests, opens the detail steps and the create modal", () => {
  const report = preparePeriodicReport();

  // Chưa tải xong danh sách thì hiện trạng thái đang tải, không vỡ.
  report.state.grading = { tests: null, loading: false, error: "", detail: null, detailLoading: false, busy: "", progress: "" };
  assert.match(report.gradingWorksheetPage(), /Đang tải danh sách bài kiểm tra/);

  report.state.grading.tests = [
    { id: "gtest-1", name: "Bài kiểm tra", classId: "class-month", sessionId: "session-1", createdAt: "2026-09-05T00:00:00.000Z", hasExam: true, hasAnswerKey: true, submissionCount: 2, gradedCount: 1 },
  ];
  const list = report.gradingWorksheetPage();
  assert.match(list, /Danh sách bài kiểm tra/);
  assert.match(list, /data-grading-create/);
  assert.match(list, /Lớp tháng/);
  assert.match(list, /Buổi 1 · 05\/09\/2026/);
  assert.match(list, /Đã chấm 1\/2/);
  assert.match(list, /data-grading-delete="gtest-1"/);

  report.state.gradingTestId = "gtest-1";
  report.state.data.classes[0].studentIds = ["student-1", "student-2"];
  report.state.grading.detail = {
    test: {
      id: "gtest-1", name: "Bài kiểm tra", classId: "class-month", sessionId: "session-1", submissionIds: ["s1", "s2"],
      exam: { fileId: "gfile-exam", name: "rewrite.docx", mime: "x", size: 10, uploadedAt: "2026-09-05T00:00:00.000Z" },
      answerKey: { title: "Rewrite", generatedAt: "2026-09-05T00:00:00.000Z", questions: [{ number: 1, prompt: "There are 40 students.", acceptedAnswers: ["has 40 students", "has forty students"], points: 1 }] },
    },
    submissions: [
      { id: "s1", name: "bai-1.jpg", pages: [{ fileId: "gfile-1", mime: "image/jpeg", name: "bai-1.jpg" }, { fileId: "gfile-1b", mime: "image/jpeg", name: "bai-1-t2.jpg" }], status: "GRADED", studentId: "student-1", matchSource: "AI", result: { detectedName: "Khanh An", earned: 33, total: 44, feedback: "Em cần ôn số nhiều.", answers: [{ number: 1, page: 2, studentAnswer: "has 40 student", correct: false, comment: "Thiếu s", correction: "has 40 students" }], model: "gpt-5.5" } },
      { id: "s2", name: "bai-2.jpg", pages: [{ fileId: "gfile-2", mime: "image/jpeg", name: "bai-2.jpg" }], status: "ERROR", error: "OpenAI báo hết hạn mức", studentId: null },
    ],
    summary: { submissionCount: 2, gradedCount: 1 },
  };
  const detail = report.gradingWorksheetPage();
  assert.match(detail, /1\. Đề bài/);
  assert.match(detail, /rewrite\.docx/);
  assert.match(detail, /2\. Đáp án · 1 câu/);
  assert.match(detail, /has forty students/);
  assert.match(detail, /data-grading-save-key/);
  assert.match(detail, /3\. Bài làm của học viên · 2\/2/);
  assert.match(detail, /data-grading-folder/);
  assert.match(detail, /data-grading-pages-per/);
  assert.match(detail, /2 ảnh/);
  assert.match(detail, /webkitdirectory/);
  assert.match(detail, /data-grading-grade-all/);
  assert.match(detail, /Chấm \(1\)/);
  assert.match(detail, /<strong>33\/44<\/strong> <small class="muted">câu đúng<\/small>/);
  assert.match(detail, /AI đọc: “Khanh An”/);
  assert.match(detail, /OpenAI báo hết hạn mức/);
  assert.match(detail, /Khánh An/);
  assert.match(detail, /Chưa có bài: Bảo Châu/);

  report.state.gradingView = "s1";
  const view = report.gradingWorksheetPage();
  assert.match(view, /Đúng 33\/44 câu/);
  assert.match(view, /Trang 1\/2/);
  assert.match(view, /Trang 2\/2/);
  assert.doesNotMatch(view, /grading-box/, "không còn khung đỏ trên ảnh");
  assert.match(view, /href="\/api\/grading\/tests\/gtest-1\/submissions\/s1\/report\.pdf"/);
  assert.match(view, /has 40 student/);
  assert.match(view, /Thiếu s/);
  assert.match(view, /Sửa lại<\/span><b>has 40 students/);
  assert.match(view, /Em cần ôn số nhiều\./);
  assert.match(view, /data-grading-flip="1"/);
  report.state.gradingView = "";

  report.state.gradingTestId = "";
  report.state.gradingModal = { classId: "class-month", sessionId: "session-1" };
  const modal = report.gradingTestModalHtml();
  assert.match(modal, /Tạo bài kiểm tra/);
  assert.match(modal, /Lớp tháng/);
  assert.match(modal, /Buổi 1 · 05\/09\/2026/);
  assert.match(modal, /Bài đã tạo trong buổi này/);
  assert.match(modal, /Bài kiểm tra · 2 bài nộp/);
  assert.match(modal, /<select class="input" name="name"/);
  assert.match(modal, />Từ vựng</);
});

test("grading groups uploaded photos per student: flat folder by N pages, sub-folders by folder", () => {
  const report = preparePeriodicReport();
  const file = (path: string) => ({ name: path.split("/").pop(), webkitRelativePath: path });
  // Mảng sinh ra trong ngữ cảnh vm khác nên chuẩn hoá qua JSON trước khi so sánh.
  const plain = (groups: unknown) => JSON.parse(JSON.stringify(groups, (key, value) => (key === "webkitRelativePath" ? undefined : value)));

  // Thư mục phẳng, chọn nhầm thứ tự: sắp theo tên (có số) rồi cắt mỗi 2 ảnh một bài.
  const flat = [file("bainop/10.jpg"), file("bainop/2.jpg"), file("bainop/1.jpg"), file("bainop/3.jpg"), file("bainop/11.jpg")];
  assert.deepEqual(plain(report.gradingGroupFiles(flat, 2)).map((g: { files: { name: string }[]; folder: string }) => [g.files.map((f) => f.name), g.folder]),
    [[["1.jpg", "2.jpg"], ""], [["3.jpg", "10.jpg"], ""], [["11.jpg"], ""]]);
  assert.equal(report.gradingGroupFiles(flat, 1).length, 5);
  assert.equal(report.gradingGroupFiles(flat, 99).length, 1, "tối đa 12 ảnh mỗi bài, nên 5 ảnh vẫn một bài");
  // "Tất cả ảnh là một học viên": số ảnh tuỳ ý, thư mục duy nhất làm tên.
  const one = [file("Tung Lam/2.jpg"), file("Tung Lam/1.jpg"), file("Tung Lam/3.jpg")];
  assert.deepEqual(plain(report.gradingGroupFiles(one, "all")).map((g: { files: { name: string }[]; folder: string }) => [g.files.map((f) => f.name), g.folder]), [[["1.jpg", "2.jpg", "3.jpg"], "Tung Lam"]]);
  assert.equal(report.gradingGroupFiles(flat, "all").length, 1);
  // Thư mục con: mỗi học viên số ảnh khác nhau (2, 3, 5) vẫn đúng 3 bài.
  const uneven = [file("bainop/An/1.jpg"), file("bainop/An/2.jpg"), file("bainop/Binh/1.jpg"), file("bainop/Binh/2.jpg"), file("bainop/Binh/3.jpg"), ...[1, 2, 3, 4, 5].map((n) => file(`bainop/Chi/${n}.jpg`))];
  assert.deepEqual(plain(report.gradingGroupFiles(uneven, 1)).map((g: { files: unknown[]; folder: string }) => [g.folder, g.files.length]), [["An", 2], ["Binh", 3], ["Chi", 5]]);

  // Mỗi học sinh một thư mục con: bỏ qua số ảnh mỗi bài, tên thư mục đi kèm để gán học viên.
  const nested = [file("bainop/Nguyen Van An/p1.jpg"), file("bainop/Nguyen Van An/p2.jpg"), file("bainop/Tran Binh/p1.jpg"), file("bainop/Le Chau/p1.jpg"), file("bainop/Le Chau/p2.jpg"), file("bainop/Le Chau/p3.jpg")];
  assert.deepEqual(plain(report.gradingGroupFiles(nested, 1)).map((g: { files: unknown[]; folder: string }) => [g.folder, g.files.length]),
    [["Le Chau", 3], ["Nguyen Van An", 2], ["Tran Binh", 1]]);

  // Chọn cả thư mục cha (đề + bainop/...) vẫn nhận ra thư mục con của từng học sinh.
  const parent = [file("baitap/bainop/An/1.jpg"), file("baitap/bainop/An/2.jpg"), file("baitap/bainop/Binh/1.jpg")];
  assert.deepEqual(plain(report.gradingGroupFiles(parent, 1)).map((g: { folder: string }) => g.folder), ["An", "Binh"]);
});

test("grading video page renders crawled Zalo videos with AI review cards", () => {
  const report = preparePeriodicReport();
  const page = report.gradingVideoPage();
  assert.match(page, /Chấm điểm Video/);
  assert.match(page, /AI nhận biết 16\/20 từ/);
  assert.match(page, /át-tơ-nun/);
  assert.match(page, /GV kiểm tra/);
  assert.match(page, /Gửi qua Zalo OA/);
  assert.match(page, /Đã gửi PH/);
  assert.match(page, /Unit 8: LET&#039;S PLAY/);
});

test("periodic report layout uses a single full-width roster and responsive modal", () => {
  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.periodic-student-list \{[^}]*flex: 1/);
  assert.match(styles, /\.periodic-student-table table \{[^}]*min-width: 820px/);
  assert.doesNotMatch(styles, /\.periodic-report-workspace/);
  assert.match(styles, /\.periodic-report-modal \{[^}]*width: min\(920px,calc\(100vw - 32px\)\);[^}]*max-height: calc\(100dvh - 32px\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.periodic-report-filters\.is-empty/);
});
