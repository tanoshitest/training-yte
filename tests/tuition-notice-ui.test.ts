import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadTuitionNotice() {
  const printed = { html: "", closed: false };
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__tuitionNoticeTest = { state, shiftMonthKey, tuitionNoticeMonthKeys, tuitionMonthPeriod, tuitionNoticeDetails, tuitionNoticePayload, downloadClassTuitionNotices, classTuitionNoticePanel, collectTuitionModal, openTuitionNotice, sepayBankForm, classInfoTab, parseBillingChoice, billingChoiceLabel };\n");
  const requests: { url: string; body: any }[] = [];
  const context = vm.createContext({
    console,
    Blob,
    document: {
      querySelector: (sel: string) =>
        sel === "#toast" ? { textContent: "", classList: { add: () => {}, remove: () => {} } } : null,
      querySelectorAll: () => [],
      createElement: () => ({ href: "", download: "", click: () => {}, remove: () => {} }),
      body: { appendChild: () => {} },
    },
    fetch: async (url: string, init: any) => {
      requests.push({ url, body: JSON.parse(init?.body || "{}") });
      return {
        ok: true,
        headers: { get: () => 'attachment; filename="phieu.pdf"' },
        blob: async () => new Blob(["pdf"]),
        json: async () => ({}),
      };
    },
    window: {
      addEventListener: () => {},
      open: () => ({
        document: {
          open: () => {},
          write: (html: string) => { printed.html = html; },
          close: () => { printed.closed = true; },
        },
      }),
    },
    location: { pathname: "/ke-toan/hoc-phi" },
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
  const exposed = (context as typeof context & {
    __tuitionNoticeTest: {
      state: Record<string, any>;
      shiftMonthKey: (key: string, offset: number) => string;
      tuitionNoticeMonthKeys: (selected?: string, current?: string) => string[];
      tuitionMonthPeriod: (key: string) => { from: string; to: string };
      tuitionNoticeDetails: (student: any, cls: any, key: string) => any;
      tuitionNoticePayload: (cls: any, student: any, notice: any, branch: any) => any;
      downloadClassTuitionNotices: (classId: string, key: string) => Promise<void>;
      classTuitionNoticePanel: (cls: any) => string;
      collectTuitionModal: () => string;
      openTuitionNotice: (studentId: string, classId: string, key: string) => void;
      sepayBankForm: () => string;
      classInfoTab: (cls: any, teacherView?: boolean) => string;
      parseBillingChoice: (raw: string, fallback?: number) => { billingMode: string; courseSessions: number };
      billingChoiceLabel: (cls: any) => string;
    };
  }).__tuitionNoticeTest;
  return Object.assign(exposed, { printed, requests });
}

test("monthly tuition notice uses the full calendar month and excludes class-off dates", () => {
  const ui = loadTuitionNotice();
  const student = {
    id: "student-1",
    code: "HV0730",
    fullName: "Hạ An",
    sessionBalances: { "class-1": -2 },
    tuitionPaidThrough: { "class-1": "2026-08" },
  };
  const cls = {
    id: "class-1",
    code: "T12",
    name: "T12- 2017-4.1",
    branchId: "branch-1",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [{ weekday: 3, startTime: "14:30", endTime: "16:30" }],
    studentIds: [student.id],
  };
  ui.state.data = {
    students: [student],
    classes: [cls],
    lessonSessions: [{
      id: "holiday",
      classId: cls.id,
      date: "2026-09-02",
      startTime: "14:30",
      endTime: "16:30",
      recurrenceKey: "class-1|2026-09-02|14:30",
      isOff: true,
    }],
    settings: { branches: [{ id: "branch-1", name: "CHI NHÁNH THẠCH KHÊ" }] },
    finance: {
      sepay: {
        settings: { bank: "970418", accountNumber: "868683888", accountName: "CONG TY TNHH DAU TU GIAO DUC STEPS" },
        receivables: [{
          id: "recv-1", receivableCode: "HP7Q2K91", studentId: student.id, studentName: student.fullName,
          billingPeriod: "Tháng 09/2026 · T12- 2017-4.1", issueDate: "2026-09-01", dueDate: "2026-09-01",
          amountDue: 200_000, amountPaid: 0, balanceDue: 200_000, currency: "VND", status: "OPEN",
          paymentOrderId: "po-1", classId: cls.id, billKey: "month|class-1|2026-09",
        }],
        paymentOrders: [{ id: "po-1", receivableId: "recv-1", studentId: student.id, paymentCode: "HP7Q2K91", amount: 200_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-09-01T00:00:00.000Z" }],
        receipts: [],
      },
    },
  };
  ui.state.financeModal = { kind: "collect", studentId: student.id, classId: cls.id, month: "2026-09" };

  assert.equal(ui.shiftMonthKey("2026-12", 1), "2027-01");
  const period = ui.tuitionMonthPeriod("2026-09");
  assert.equal(period.from, "01/09/2026");
  assert.equal(period.to, "30/09/2026");
  const notice = ui.tuitionNoticeDetails(student, cls, "2026-09");
  assert.equal(notice.sessions, 4);
  assert.equal(notice.unitPrice, 50_000);
  assert.equal(notice.amount, 200_000);
  assert.equal(notice.periodLabel, "01/09/2026 – 30/09/2026");
  // Nội dung chuyển khoản = mã HP{lớp}{kỳ}{HV} gắn học viên + lớp + tháng (28/10/2026) — đối soát
  // tự quy về đúng phiếu đang mở của học viên (khớp số tiền, phiếu cũ trước).
  assert.equal(notice.paymentContent, "HPT12T9HV0730");
  assert.match(notice.qrUrl, /\/api\/finance\/tuition-qr\?/);
  assert.match(notice.qrUrl, /addInfo=HPT12T9HV0730/);
  assert.match(notice.qrUrl, /account=8686838888/);
  assert.match(notice.qrUrl, /amount=200000/);

  const staticQr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  ui.state.data.finance.sepay.settings.qrImageDataUrl = staticQr;
  const noticeAfterUpload = ui.tuitionNoticeDetails(student, cls, "2026-09");
  assert.match(noticeAfterUpload.qrUrl, /addInfo=HPT12T9HV0730/);
  assert.notEqual(noticeAfterUpload.qrUrl, staticQr);
  const bankForm = ui.sepayBankForm();
  assert.match(bankForm, /id="sepay-qr-file"/);
  assert.match(bankForm, /accept="image\/png,image\/jpeg,.png,.jpg,.jpeg"/);
  assert.match(bankForm, /name="qrImageDataUrl"/);
  assert.match(bankForm, /data-sepay-qr-preview/);
  assert.match(bankForm, /data-sepay-qr-remove/);

  const html = ui.collectTuitionModal();
  assert.match(html, /Thu và báo học phí/);
  assert.match(html, /id="tuition-notice-month"/);
  assert.match(html, /value="2026-09" selected/);
  assert.match(html, /01\/09\/2026 – 30\/09\/2026/);
  assert.match(html, /4 buổi/);
  assert.match(html, /200\.000/);
  assert.match(html, /Xem trước/);
  assert.match(html, /không ghi nhận đã thu/);
  assert.match(html, /Lưu thu tiền/);

  const printTemplate = ui.openTuitionNotice.toString();
  assert.doesNotMatch(printTemplate, /class="logo"|Phụ huynh học viên|Ký và ghi rõ họ tên/);
  assert.match(printTemplate, /notice\.periodLabel/);
  assert.match(printTemplate, /notice\.contentLabel/);
  ui.openTuitionNotice(student.id, cls.id, "2026-09");
  assert.equal(ui.printed.closed, true);
  assert.match(ui.printed.html, /Phiếu báo học phí - Hạ An/);
  assert.match(ui.printed.html, /01\/09\/2026 – 30\/09\/2026/);
  assert.match(ui.printed.html, /Học phí tháng 09\/2026/);
  assert.match(ui.printed.html, /200\.000/);
  assert.match(ui.printed.html, /8686838888/);
  assert.match(ui.printed.html, /CONG TY TNHH DAU TU GIAO DUC STEPS/);
  assert.match(ui.printed.html, /\/api\/finance\/tuition-qr\?/);
  assert.match(ui.printed.html, /addInfo=HPT12T9HV0730/);
  assert.match(ui.printed.html, /HPT12T9HV0730/);
  assert.match(ui.printed.html, /<table class="fee">[\s\S]*<tbody><tr class="fee-heading">[\s\S]*<tr class="fee-data">/);
  assert.doesNotMatch(ui.printed.html, /<thead>/);
  assert.match(ui.printed.html, /border-collapse:collapse!important;border-spacing:0!important/);
  assert.match(ui.printed.html, />Tải PDF<\/button>/);
  assert.doesNotMatch(ui.printed.html, /window\.print\(/);

  const panel = ui.classTuitionNoticePanel(cls);
  assert.match(panel, /Thông báo học phí/);
  assert.doesNotMatch(panel, /class-tuition-notice-student|name="studentId"/);
  assert.match(panel, /id="class-tuition-notice-period"/);
  assert.doesNotMatch(panel, /value="course"/);
  assert.match(panel, /Tháng học phí/);
  assert.match(panel, /mỗi em một phiếu, học phí riêng/);
  assert.match(panel, /id="class-tuition-notice-download-button"/);
  assert.match(panel, />Tải phiếu<\/button>/);
  assert.doesNotMatch(panel, /class-tuition-notice-preview-button|>Preview</, "đã đổi Preview thành Tải phiếu cả lớp");

  // Phiếu báo chung cho cả lớp: QR của trung tâm với nội dung chuyển khoản là
  // tên lớp — phụ huynh quét được ngay, không cần khoản phải thu của từng bạn.
  ui.openTuitionNotice("", cls.id, "2026-09");
  assert.match(ui.printed.html, /Toàn bộ học viên/);
  assert.match(ui.printed.html, /Sĩ số lớp/);
  assert.match(ui.printed.html, /1 học viên/);
  assert.doesNotMatch(ui.printed.html, /Mã học viên<\/span>/);
  assert.match(ui.printed.html, /addInfo=T12-\+2017-4\.1/);
  assert.match(ui.printed.html, /T12- 2017-4\.1/);
  assert.doesNotMatch(ui.printed.html, /Chưa cấu hình QR nhận tiền/);
});

test("monthly tuition can be previewed before creating a receivable and lists every month through the current month", () => {
  const ui = loadTuitionNotice();
  const student = {
    id: "student-preview",
    code: "HV0998",
    fullName: "Nguyễn An",
    sessionBalances: { "class-preview": 0 },
    tuitionPaidThrough: { "class-preview": "2026-08" },
  };
  const cls = {
    id: "class-preview",
    code: "T9",
    name: "T9-2016-1.1",
    branchId: "branch-preview",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [{ weekday: 3, startTime: "18:00", endTime: "19:30" }],
    studentIds: [student.id],
  };
  ui.state.data = {
    students: [student],
    classes: [cls],
    lessonSessions: [],
    settings: { branches: [{ id: "branch-preview", name: "CHI NHÁNH KIỂM THỬ" }] },
    finance: {
      sepay: {
        settings: {
          bank: "970418",
          accountNumber: "868683888",
          accountName: "CONG TY TNHH DAU TU GIAO DUC STEPS",
        },
        receivables: [],
        paymentOrders: [],
        receipts: [],
      },
    },
  };
  ui.state.financeModal = {
    kind: "collect",
    studentId: student.id,
    classId: cls.id,
    month: "2026-10",
  };

  assert.deepEqual(
    Array.from(ui.tuitionNoticeMonthKeys("2026-10", "2026-10")),
    ["2026-09", "2026-10", "2026-11"],
  );
  assert.deepEqual(
    Array.from(ui.tuitionNoticeMonthKeys("2027-02", "2026-10")),
    ["2026-09", "2026-10", "2026-11", "2027-02"],
  );

  const notice = ui.tuitionNoticeDetails(student, cls, "2026-10");
  assert.equal(notice.missingReceivable, true);
  assert.equal(notice.sessions, 4);
  assert.equal(notice.amount, 200_000);

  const html = ui.collectTuitionModal();
  assert.match(html, /value="2026-09"/);
  assert.match(html, /value="2026-10" selected/);
  assert.match(html, /value="2026-11"/, "bill tháng sau tự lập nên được xem trước ngay trong tháng này");
  assert.doesNotMatch(html, /Bản xem trước|Chưa tạo khoản phải thu/);
  assert.match(html, /\/api\/finance\/tuition-qr\?/);
  assert.match(html, /4 buổi/);
  assert.match(html, /200\.000/);
  assert.match(html, /HPT9T10HV0998/);
  assert.match(html, /thao tác này không tạo công nợ và không ghi nhận đã thu/);
  const previewButton = html.match(/<button[^>]*data-print-tuition-notice[^>]*>/)?.[0];
  assert.ok(previewButton, "expected the tuition preview button to be rendered");
  assert.doesNotMatch(previewButton, /disabled/);
  assert.doesNotMatch(html, /data-request-payment|>Gửi yêu cầu thanh toán<\/button>/);

  ui.openTuitionNotice(student.id, cls.id, "2026-10");
  assert.equal(ui.printed.closed, true);
  assert.doesNotMatch(ui.printed.html, /BẢN XEM TRƯỚC/);
  assert.match(ui.printed.html, /01\/10\/2026 – 31\/10\/2026/);
  assert.match(ui.printed.html, /Học phí tháng 10\/2026/);
  assert.match(ui.printed.html, /<td>4<\/td>/);
  assert.match(ui.printed.html, /200\.000/);
  assert.match(ui.printed.html, /\/api\/finance\/tuition-qr\?/);
  assert.match(ui.printed.html, /HPT9T10HV0998/);
  assert.match(ui.printed.html, /Số tài khoản|Chủ tài khoản|Nội dung<\/dt>/);
  assert.match(ui.printed.html, />Tải PDF<\/button>/);
  assert.match(ui.printed.html, /downloadTuitionPdf/);

  // Tháng trước ngày nhập học (0 buổi tính phí) vẫn mở được phiếu.
  student.classJoinedAt = { "class-preview": "2026-10-05" };
  ui.openTuitionNotice(student.id, cls.id, "2026-09");
  assert.equal(ui.printed.closed, true);
  assert.doesNotMatch(ui.printed.html, /BẢN XEM TRƯỚC/);
  assert.match(ui.printed.html, /Học phí tháng 09\/2026/);
  assert.match(ui.printed.html, /<td>0<\/td>/);
});

test("course tuition notice uses the same printable bill data contract", () => {
  const ui = loadTuitionNotice();
  const student = { id: "student-2", code: "HV0099", fullName: "Minh An" };
  const cls = {
    id: "class-2",
    code: "X",
    name: "Lớp kiểm thử",
    billingMode: "COURSE",
    sessionPrice: 200_000,
    courseSessions: 24,
    schedules: [{ weekday: 3, startTime: "17:00", endTime: "19:00" }],
    studentIds: [student.id],
  };
  ui.state.data = {
    students: [student],
    classes: [cls],
    lessonSessions: [{
      id: "course-holiday", classId: cls.id, date: "2026-09-02", startTime: "17:00", endTime: "19:00",
      recurrenceKey: "class-2|2026-09-02|17:00", status: "SCHEDULED", isExtra: false,
      isOff: true, offSource: "ADMIN", attendance: [],
    }],
    settings: { branches: [] },
    finance: {
      sepay: {
        settings: {},
        receivables: [{
          id: "recv-2", receivableCode: "HP4M8T26", studentId: student.id, studentName: student.fullName,
          billingPeriod: "Khóa 24 buổi · Lớp kiểm thử", issueDate: "2026-09-02", dueDate: "2026-09-02",
          amountDue: 4_600_000, amountPaid: 0, balanceDue: 4_600_000, currency: "VND", status: "OPEN",
          paymentOrderId: "po-2", classId: cls.id, billKey: "course|class-2",
        }],
        paymentOrders: [{ id: "po-2", receivableId: "recv-2", studentId: student.id, paymentCode: "HP4M8T26", amount: 4_600_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-09-02T00:00:00.000Z" }],
        receipts: [],
      },
    },
  };

  const notice = ui.tuitionNoticeDetails(student, cls, "course");
  assert.equal(notice.mode, "COURSE");
  assert.equal(notice.totalSessions, 24);
  assert.equal(notice.sessions, 23);
  assert.equal(notice.unitPrice, 200_000);
  assert.equal(notice.amount, 4_600_000);
  assert.equal(notice.label, "Khóa 24 buổi");
  assert.equal(notice.periodLabel, "02/09/2026 – 10/02/2027");
  assert.equal(notice.contentLabel, "Học phí khóa 24 buổi");
  assert.equal(notice.paymentContent, "HPXK1HV0099");
  ui.openTuitionNotice(student.id, cls.id, "course");
  assert.match(ui.printed.html, /Khóa 24 buổi/);
  assert.match(ui.printed.html, /Học phí khóa 24 buổi/);
  assert.match(ui.printed.html, /4\.600\.000/);

  const panel = ui.classTuitionNoticePanel(cls);
  assert.match(panel, /Số buổi tính phí/);
  assert.match(panel, /value="course\|1" selected/);
  assert.match(panel, /23 buổi tính phí/);
  assert.match(panel, /02\/09\/2026 – 10\/02\/2027/);
  assert.doesNotMatch(panel, /Tháng 09\/2026/);

  ui.state.financeModal = { kind: "collect", studentId: student.id, classId: cls.id, month: "2026-09" };
  const collection = ui.collectTuitionModal();
  assert.match(collection, /tuition-modal-section tuition-collection-section/);
  assert.match(collection, /Số buổi tính phí/);
  assert.match(collection, /value="course\|1" selected/);
  assert.match(collection, /23 buổi tính phí/);
  assert.match(collection, /4\.600\.000/);
});

test("tuition collection modal uses a wide viewport-safe layout", () => {
  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.modal-card\.tuition-collection-modal \{[^}]*width: min\(1180px,calc\(100vw - 40px\)\);[^}]*max-width: 1180px;[^}]*max-height: calc\(100dvh - 40px\)/);
  assert.match(styles, /\.tuition-modal-body \{[^}]*grid-template-columns: minmax\(0,\.92fr\) minmax\(0,1\.08fr\);[^}]*grid-template-areas: "student student" "collection notice"[^}]*overflow-x: hidden/);
  assert.match(styles, /\.tuition-collection-section \{ grid-area: collection; \}/);
  assert.match(styles, /\.tuition-notice-section \{ grid-area: notice;/);
  assert.match(styles, /\.tuition-modal-section \{[^}]*min-width: 0/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.tuition-modal-body \{[^}]*grid-template-columns: 1fr;[^}]*grid-template-areas: "student" "collection" "notice"/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.tuition-modal-body \{[^}]*grid-template-columns: 1fr;[^}]*grid-template-areas: "student" "collection" "notice"/);
});

test("class info keeps identity and billing choice fields only", () => {
  const ui = loadTuitionNotice();
  const cls = {
    id: "class-info-1",
    code: "T12",
    name: "T12-2017-4.1",
    classTypeId: "class-standard",
    branchId: "branch-1",
    teacherId: "teacher-1",
    status: "ACTIVE",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    courseSessions: 24,
    studentIds: [],
    schedules: [{ weekday: 3, periodId: "period-1", startTime: "19:00", endTime: "20:30" }],
    note: "",
  };
  ui.state.data = {
    students: [],
    teachers: [{ id: "teacher-1", fullName: "Cô Lan", code: "GV01" }],
    classes: [cls],
    lessonSessions: [],
    settings: {
      classTypes: [{ id: "class-standard", name: "Lớp tiêu chuẩn" }],
      branches: [{ id: "branch-1", name: "CHI NHÁNH THẠCH KHÊ" }],
      lessonPeriods: [{ id: "period-1", name: "19:00–20:30", startTime: "19:00", endTime: "20:30" }],
      rooms: [{ id: "room-1", name: "Phòng 1" }],
      tuitionPackages: [
        { id: "p24", classTypeId: "class-standard", name: "Gói 24 buổi", sessions: 24 },
        { id: "p48", classTypeId: "class-standard", name: "Gói 48 buổi", sessions: 48 },
      ],
    },
    finance: { sepay: { settings: {}, receivables: [], paymentOrders: [], receipts: [] } },
  };
  const html = ui.classInfoTab(cls);
  assert.match(html, />Tên lớp</);
  assert.match(html, />Mã lớp</);
  assert.match(html, />Loại lớp</);
  assert.match(html, />Trạng thái</);
  assert.match(html, />Chi nhánh</);
  assert.match(html, />Hình thức thu</);
  assert.match(html, /Thu tháng/);
  assert.match(html, /Thu khóa 24 buổi/);
  assert.match(html, /Thu khóa 48 buổi/);
  assert.match(html, /<strong>19:00–20:30<\/strong>/);
  assert.doesNotMatch(html, /<small>19:00–20:30<\/small>/);
  assert.match(html, />Giá \/ buổi</);
  assert.doesNotMatch(html, />Phòng học</);
  assert.doesNotMatch(html, />Số buổi \/ khóa</);
  assert.doesNotMatch(html, />Học phí khóa</);
  assert.doesNotMatch(html, /Tự động tạo khoản phải thu/);
  assert.doesNotMatch(html, />Tạo khoản phải thu</);
  assert.equal(ui.billingChoiceLabel(cls), "Thu tháng");
  const parsed = ui.parseBillingChoice("COURSE:48");
  assert.equal(parsed.billingMode, "COURSE");
  assert.equal(parsed.courseSessions, 48);
});

test("bundled months receivable is found for a single-month notice (regression: status !== CANCELLED bug)", () => {
  const ui = loadTuitionNotice();
  const student = {
    id: "student-b1",
    code: "HV0042",
    fullName: "Thái Bảo",
    sessionBalances: { "class-s1": -10 },
  };
  const cls = {
    id: "class-s1",
    code: "S4",
    name: "S4- 2016-5.3",
    branchId: "branch-1",
    billingMode: "MONTHLY",
    sessionPrice: 65_000,
    schedules: [{ weekday: 6, startTime: "14:30", endTime: "16:00" }],
    studentIds: [student.id],
  };
  ui.state.data = {
    students: [student],
    classes: [cls],
    lessonSessions: [],
    settings: { branches: [{ id: "branch-1", name: "CHI NHÁNH THẠCH KHÊ" }] },
    finance: {
      sepay: {
        settings: { bank: "970418", accountNumber: "868683888", accountName: "CONG TY TNHH DAU TU GIAO DUC STEPS" },
        receivables: [{
          id: "recv-b1", receivableCode: "HPS4T10HV0042", studentId: student.id, studentName: student.fullName,
          billingPeriod: "Tháng 09–10/2026 · S4- 2016-5.3", issueDate: "2026-10-01", dueDate: "2026-10-01",
          amountDue: 1_170_000, amountPaid: 0, balanceDue: 1_170_000, currency: "VND", status: "OPEN",
          paymentOrderId: "po-b1", classId: cls.id, billKey: "months|class-s1|2026-09,2026-10",
        }],
        paymentOrders: [{ id: "po-b1", receivableId: "recv-b1", studentId: student.id, paymentCode: "HPS4T10HV0042", amount: 1_170_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z" }],
        receipts: [],
      },
    },
  };
  const notice = ui.tuitionNoticeDetails(student, cls, "2026-10");
  // Phiếu gộp 09+10 đang OPEN phải được nhận diện — trước đây điều kiện ngược
  // `status !== "CANCELLED"` chỉ khớp phiếu đã hủy nên phiếu báo rơi về số một
  // tháng và sinh QR sai tiền.
  assert.equal(notice.amount, 1_170_000);
  assert.equal(notice.missingReceivable, undefined);
  assert.match(notice.qrUrl, /amount=1170000/);
  assert.equal(notice.paymentContent, "HPS4T10HV0042");
});

test("Tải phiếu cả lớp gửi một notices[] riêng từng học viên theo tháng đã chọn", async () => {
  const ui = loadTuitionNotice();
  const mkStudent = (id: string, code: string, fullName: string) => ({
    id, code, fullName, sessionBalances: { "class-b": 0 }, tuitionPaidThrough: { "class-b": "2026-08" },
  });
  const s1 = mkStudent("st-1", "HV0001", "Học Viên Một");
  const s2 = mkStudent("st-2", "HV0002", "Học Viên Hai");
  const s3 = mkStudent("st-3", "HV0003", "Học Viên Ba");
  const cls = {
    id: "class-b", code: "T7", name: "T7-2015-6.1", branchId: "branch-1",
    billingMode: "MONTHLY", sessionPrice: 50_000,
    schedules: [{ weekday: 3, startTime: "18:00", endTime: "19:30" }],
    studentIds: [s1.id, s2.id, s3.id, "st-missing"],
  };
  ui.state.data = {
    students: [s1, s2, s3],
    classes: [cls],
    lessonSessions: [],
    settings: { branches: [{ id: "branch-1", name: "CHI NHÁNH THẠCH KHÊ" }] },
    finance: {
      sepay: {
        settings: { bank: "970418", accountNumber: "868683888", accountName: "STEPS" },
        receivables: [
          {
            id: "r1", receivableCode: "HPA", studentId: s1.id, studentName: s1.fullName,
            billingPeriod: "Tháng 10/2026 · T7-2015-6.1", issueDate: "2026-10-01", dueDate: "2026-10-01",
            amountDue: 450_000, amountPaid: 0, balanceDue: 450_000, currency: "VND", status: "OPEN",
            paymentOrderId: "po-1", classId: cls.id, billKey: "month|class-b|2026-10",
          },
          {
            id: "r2", receivableCode: "HPB", studentId: s2.id, studentName: s2.fullName,
            billingPeriod: "Tháng 10/2026 · T7-2015-6.1", issueDate: "2026-10-01", dueDate: "2026-10-01",
            amountDue: 550_000, amountPaid: 0, balanceDue: 550_000, currency: "VND", status: "OPEN",
            paymentOrderId: "po-2", classId: cls.id, billKey: "month|class-b|2026-10",
          },
        ],
        paymentOrders: [
          { id: "po-1", receivableId: "r1", studentId: s1.id, paymentCode: "HPA", amount: 450_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z" },
          { id: "po-2", receivableId: "r2", studentId: s2.id, paymentCode: "HPB", amount: 550_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z" },
        ],
        receipts: [],
      },
    },
  };

  await ui.downloadClassTuitionNotices(cls.id, "2026-10");

  assert.equal(ui.requests.length, 1, "gộp thành một request duy nhất");
  const req = ui.requests[0];
  assert.equal(req.url, "/api/finance/tuition-notice");
  assert.equal(req.body.period, "2026-10");
  assert.equal(req.body.className, "T7-2015-6.1");
  assert.ok(Array.isArray(req.body.notices));
  // st-missing không tồn tại trong danh sách học viên → bị lọc ra.
  assert.equal(req.body.notices.length, 3);
  const byStudent = new Map(req.body.notices.map((n: any) => [n.studentId, n]));
  const n1 = byStudent.get("st-1");
  const n2 = byStudent.get("st-2");
  const n3 = byStudent.get("st-3");
  // Mỗi em một phiếu: học phí + nội dung CK riêng.
  assert.equal(n1.amount, 450_000);
  assert.equal(n2.amount, 550_000);
  assert.equal(n3.amount, 200_000, "không có phiếu phải thu thì tính theo buổi × đơn giá");
  assert.equal(n1.studentCode, "HV0001");
  assert.equal(n1.studentName, "Học Viên Một");
  // Mọi phiếu in mã HP{lớp}{kỳ}{HV} (28/10/2026) — mỗi kỳ một mã, đối soát khớp đúng phiếu.
  assert.equal(n1.paymentContent, "HPT7T10HV0001");
  assert.equal(n2.paymentContent, "HPT7T10HV0002");
  assert.equal(n3.paymentContent, "HPT7T10HV0003");
  assert.equal(n1.className, "T7-2015-6.1");
  assert.match(n1.qrUrl, /amount=450000/);
  assert.match(n2.qrUrl, /amount=550000/);
});

test("Tải phiếu cả lớp bỏ qua học viên không có buổi tính phí và báo khi không còn phiếu nào", async () => {
  const ui = loadTuitionNotice();
  const active = { id: "st-a", code: "HV0010", fullName: "Còn Buổi", sessionBalances: { "class-c": 0 } };
  const joinedLate = {
    id: "st-j", code: "HV0011", fullName: "Vào Sau",
    sessionBalances: { "class-c": 0 }, classJoinedAt: { "class-c": "2026-11-01" },
  };
  const cls = {
    id: "class-c", code: "T8", name: "T8-2016-2.1", branchId: "branch-1",
    billingMode: "MONTHLY", sessionPrice: 50_000,
    schedules: [{ weekday: 3, startTime: "18:00", endTime: "19:30" }],
    studentIds: [active.id, joinedLate.id],
  };
  ui.state.data = {
    students: [active, joinedLate],
    classes: [cls],
    lessonSessions: [],
    settings: { branches: [{ id: "branch-1", name: "CN" }] },
    finance: { sepay: { settings: {}, receivables: [], paymentOrders: [], receipts: [] } },
  };

  await ui.downloadClassTuitionNotices(cls.id, "2026-10");
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].body.notices.length, 1, "bạn vào sau kỳ (0 buổi) bị bỏ qua");
  assert.equal(ui.requests[0].body.notices[0].studentId, "st-a");

  // Lớp không còn lịch học nào → không có buổi tính phí → không gọi server, chỉ toast.
  cls.schedules = [];
  await ui.downloadClassTuitionNotices(cls.id, "2026-10");
  assert.equal(ui.requests.length, 1, "không phát request khi không có phiếu nào");
});

test("phiếu đã lập khác phép tính: in thêm dòng chênh lệch để số buổi × đơn giá ± các dòng luôn bằng tổng", () => {
  const ui = loadTuitionNotice();
  const student = { id: "st-r", code: "HV0222", fullName: "Học viên R", sessionBalances: {} };
  const cls = {
    id: "class-r", code: "S17", name: "S17", branchId: "branch-1", billingMode: "COURSE", sessionPrice: 65_000,
    courseSessions: 24, courseStartDate: "2026-09-01", schedules: [{ weekday: 2, startTime: "17:00", endTime: "19:00" }], studentIds: [student.id],
  };
  const shownTotal = (n: any) => n.sessions * n.unitPrice + (n.carryInAmount || 0) - (n.offCreditAmount || 0) + (n.materialsAmount || 0)
    + (n.oldDebtAmount || 0) + (n.transferAmount || 0) - (n.preservedApplied || 0);
  for (const amountDue of [3_120_000, 1_495_000]) {
    ui.state.data = {
      students: [student], classes: [cls], lessonSessions: [], settings: { branches: [{ id: "branch-1", name: "CN" }] },
      finance: { sepay: {
        settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS" },
        receivables: [{ id: "recv-r", studentId: student.id, studentName: student.fullName, billingPeriod: "Khóa 24 buổi · S17", amountDue, amountPaid: 0, balanceDue: amountDue,
          status: "OPEN", paymentOrderId: "po-r", classId: cls.id, billKey: "course|class-r" }],
        paymentOrders: [{ id: "po-r", receivableId: "recv-r", studentId: student.id, paymentCode: "HPS17HV0222", amount: amountDue, status: "ACTIVE" }],
        receipts: [],
      } },
    };
    const notice = ui.tuitionNoticeDetails(student, cls, "course|1");
    assert.equal(notice.amount, amountDue, "tổng = số tiền thật của phiếu");
    assert.equal(shownTotal(notice), amountDue, "các dòng in trên phiếu cộng ra đúng tổng");
    assert.equal(notice.oldDebtLabel, amountDue > 1_560_000 ? "Nợ học phí trước đây chuyển sang" : "Giảm trừ học phí");
  }
});

test("phiếu tháng đã lập in đúng hành trình chuyển lớp (HV1011 Bảo Trâm)", () => {
  const ui = loadTuitionNotice();
  const student = { id: "student-bt", code: "HV1011", fullName: "Bảo Trâm", sessionBalances: {}, classJoinedAt: { "class-t3": "2026-10-01" } };
  const cls = {
    id: "class-t3", code: "T3", name: "T3-2013-8.1", branchId: "branch-steps-2", billingMode: "MONTHLY", sessionPrice: 50_000,
    schedules: [
      { weekday: 3, startTime: "17:00", endTime: "19:00" },
      { weekday: 4, startTime: "17:00", endTime: "19:00" },
    ],
    studentIds: [student.id],
  };
  ui.state.data = {
    students: [student], classes: [cls], lessonSessions: [], settings: { branches: [{ id: "branch-steps-2", name: "CHI NHÁNH THẠCH KHÊ" }] },
    finance: { sepay: {
      settings: { bank: "970418", accountNumber: "8686838888", accountName: "STEPS" },
      receivables: [
        {
          id: "recv-nov", studentId: student.id, studentName: student.fullName, billingPeriod: "Tháng 11/2026 · T3-2013-8.1",
          issueDate: "2026-10-10", amountDue: 1_000_000, amountPaid: 0, balanceDue: 1_000_000, status: "OPEN",
          paymentOrderId: "po-nov", classId: cls.id, billKey: "month|class-t3|2026-11",
        },
        {
          id: "recv-transfer", studentId: student.id, studentName: student.fullName, billingPeriod: "Chênh lệch chuyển lớp S3→T3 · kỳ 11/2026",
          issueDate: "2026-10-10", amountDue: -225_000, amountPaid: 0, balanceDue: -225_000, status: "OPEN",
          paymentOrderId: "", classId: cls.id, billKey: "transfer|class-t3|class-s3|2026-11",
        },
      ],
      paymentOrders: [{ id: "po-nov", receivableId: "recv-nov", studentId: student.id, paymentCode: "HPHZPU8E", amount: 1_000_000, status: "ACTIVE" }],
      receipts: [],
    } },
  };
  const notice = ui.tuitionNoticeDetails(student, cls, "2026-11");
  assert.equal(notice.sessions, 8);
  assert.equal(notice.tuitionAmount, 400_000);
  assert.equal(notice.transferAmount, -225_000, "vẫn in dòng chênh lệch chuyển lớp");
  assert.equal(notice.oldDebtAmount, 825_000, "nợ cũ S3 đầy đủ trước khi trừ chênh lệch chuyển lớp");
  assert.equal(notice.oldDebtLabel, "Nợ cũ S3 trước khi chuyển lớp");
  assert.equal(notice.amount, 1_000_000, "tổng phiếu = đúng số tiền phiếu đã lập");
  assert.equal(notice.sessions * notice.unitPrice + notice.oldDebtAmount + notice.transferAmount, 1_000_000);
  assert.match(notice.qrUrl, /amount=1000000/);

  ui.openTuitionNotice(student.id, cls.id, "2026-11");
  assert.match(ui.printed.html, /1\.000\.000/);
  assert.match(ui.printed.html, /825\.000/);
  assert.match(ui.printed.html, /-225\.000/);
  assert.match(ui.printed.html, /Nợ cũ S3 trước khi chuyển lớp/);
  assert.doesNotMatch(ui.printed.html, /775\.000/);
});
