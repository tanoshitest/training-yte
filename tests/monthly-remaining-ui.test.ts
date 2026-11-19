import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/** Client có bản sao công thức số buổi tồn, phải khớp cloudflare/tuition-billing.ts. */
function loadUi(today: string) {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__remainingTest = { state, studentSessionRemaining, chargedMonthlySessions, paidSessionsSinceSeptember, tuitionExemptRemainingSessions, classStudentsTab, studentInfoTab, tuitionPage, financeForecastRows };\n");
  const [year, month, day] = today.split("-").map(Number);
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(year, month - 1, day, 12);
      else super(...(args as ConstructorParameters<typeof Date>));
    }
  };
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/lop-hoc/class-1/hoc-vien" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date: FixedDate,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as typeof context & {
    __remainingTest: {
      state: Record<string, any>;
      studentSessionRemaining: (student: any, cls: any) => number;
      chargedMonthlySessions: (studentId: string, cls: any) => number;
      paidSessionsSinceSeptember: (student: any, cls: any) => number;
      tuitionExemptRemainingSessions: (cls: any) => number;
      classStudentsTab: (cls: any, teacherView: boolean) => string;
      studentInfoTab: (student: any) => string;
      tuitionPage: () => string;
      financeForecastRows: (today?: string) => any[];
    };
  }).__remainingTest;
}

const CLS = {
  id: "class-1",
  code: "S1",
  name: "S1-9.1-2012",
  status: "ACTIVE",
  studentIds: ["student-1"],
  billingMode: "MONTHLY",
  sessionPrice: 65_000,
  schedules: [
    { weekday: 2, periodId: "period-tue", startTime: "17:00", endTime: "19:00" },
    { weekday: 6, periodId: "period-sat", startTime: "09:00", endTime: "11:00" },
  ],
};

const STORED_SESSIONS = [
  {
    id: "s1-holiday", classId: "class-1", date: "2026-09-01", startTime: "17:00", endTime: "19:00",
    teacherId: "teacher-1", roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-1|2026-09-01|17:00", isOff: true, offSource: "ADMIN", attendance: [],
  },
  {
    id: "s1-teacher-off", classId: "class-1", date: "2026-09-05", startTime: "09:00", endTime: "11:00",
    teacherId: "teacher-1", roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-1|2026-09-05|09:00", isOff: true, offSource: "TEACHER", attendance: [],
  },
];

/** `balance` là bộ đếm cũ trong dữ liệu, đã lệch và phải bị bỏ qua. */
function seed(ui: ReturnType<typeof loadUi>, balance: number, sessions: any[] = STORED_SESSIONS, paidThrough = "", tuitionExempt = false) {
  ui.state.data = {
    user: { name: "Quản trị STEPS", role: "ADMIN" },
    lessonSessions: sessions,
    students: [{
      id: "student-1",
      code: "HV0001",
      fullName: "Khánh An",
      status: "STUDYING",
      sessionBalances: { "class-1": balance },
      tuitionPaidThrough: paidThrough ? { "class-1": paidThrough } : {},
      tuitionExempt,
    }],
    classes: [CLS],
    finance: { sepay: { receipts: [], payments: [], receivables: [] } },
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };
  return ui.state.data.students[0];
}

test("số buổi tồn trên màn hình trừ theo lịch, không tin bộ đếm đã lệch", () => {
  const ui = loadUi("2026-09-17");
  const student = seed(ui, -1);
  // 01/09 nghỉ lễ không tính phí; 05/09 giáo viên cho nghỉ vẫn tính;
  // 08/09, 12/09, 15/09 đã qua nên tính dù chưa ai điểm danh.
  assert.equal(ui.chargedMonthlySessions("student-1", CLS), 4);
  assert.equal(ui.paidSessionsSinceSeptember(student, CLS), 0);
  assert.equal(ui.studentSessionRemaining(student, CLS), -4);
});

test("cuối tháng số buổi tồn của lớp thu tháng là -8 đúng bằng số buổi tính phí", () => {
  const ui = loadUi("2026-10-01");
  const student = seed(ui, -1);
  assert.equal(ui.studentSessionRemaining(student, CLS), -8);
});

test("điểm danh bù không trừ thêm lần nữa", () => {
  const ui = loadUi("2026-09-17");
  const marked = ["2026-09-08", "2026-09-15"].map((date) => ({
    id: `s1-${date}`, classId: "class-1", date, startTime: "17:00", endTime: "19:00",
    teacherId: "teacher-1", roomId: "", status: "COMPLETED", isExtra: false,
    recurrenceKey: `class-1|${date}|17:00`, isOff: false, offSource: "",
    attendance: [{ studentId: "student-1", status: "PRESENT" }],
  }));
  const student = seed(ui, -3, [...STORED_SESSIONS, ...marked]);
  assert.equal(ui.studentSessionRemaining(student, CLS), -4);
});

test("đã thu học phí tháng 9 thì số buổi tồn về dương rồi hết tháng là 0", () => {
  const mid = loadUi("2026-09-17");
  const paid = seed(mid, -1, STORED_SESSIONS, "2026-09");
  assert.equal(mid.paidSessionsSinceSeptember(paid, CLS), 8, "tháng 9 tính phí 8 buổi, trừ 1 buổi nghỉ lễ");
  assert.equal(mid.studentSessionRemaining(paid, CLS), 4);

  const end = loadUi("2026-10-01");
  assert.equal(end.studentSessionRemaining(seed(end, -1, STORED_SESSIONS, "2026-09"), CLS), 0);
});

test("danh sách học viên hiển thị badge đỏ với số buổi đã trừ theo lịch", () => {
  const ui = loadUi("2026-09-17");
  seed(ui, -1);
  const html = ui.classStudentsTab(CLS, false);
  assert.match(html, /badge-red tabular">-4 buổi</);
});

test("lớp thu khóa không bị đụng tới", () => {
  const ui = loadUi("2026-09-17");
  const courseCls = { ...CLS, billingMode: "COURSE", courseSessions: 24 };
  const student = seed(ui, -1);
  // 01/09 nghỉ lễ chiếm suất nhưng không tính phí; 05/09 GV nghỉ không chiếm
  // suất và không tính phí (khóa tự kéo dài); 08, 12, 15/09 đã học → trừ 3.
  assert.equal(ui.studentSessionRemaining(student, courseCls), 21, "24 buổi khóa trừ 3 buổi đã dạy");
});

test("hồ sơ miễn học phí chạy theo khóa lớp và hiện đóng băng trong quản lý học phí", () => {
  const ui = loadUi("2026-09-17");
  const student = seed(ui, -99, STORED_SESSIONS, "", true);
  const remaining = ui.tuitionExemptRemainingSessions(CLS);

  assert.equal(ui.studentSessionRemaining(student, CLS), remaining);
  assert.ok(remaining > 0, "số dư miễn học phí không dùng công nợ -99 cũ");
  const profileHtml = ui.studentInfoTab(student);
  assert.match(profileHtml, /name="tuitionExempt" checked/);
  assert.match(profileHtml, /<span>Miễn học phí<\/span><\/label>/);
  assert.doesNotMatch(profileHtml, /Không phát sinh công nợ|Số buổi tự chạy theo khóa/);
  assert.match(profileHtml, /name="parentPhone1"/);
  assert.match(profileHtml, /name="parentPhone2"/);
  assert.match(profileHtml, /name="nationalId"/);
  assert.match(ui.classStudentsTab(CLS, false), /Miễn học phí/);
  // Vẫn hiện trong bảng công nợ để đủ sĩ số, nhưng đóng băng: không checkbox,
  // không nút thu, không số nợ.
  const pageHtml = ui.tuitionPage();
  const exemptRow = pageHtml.split("</tr>").find((chunk) => chunk.includes(">Khánh An<")) || "";
  assert.ok(exemptRow.includes("tuition-exempt-row"), "dòng miễn phí hiện với class đóng băng");
  assert.ok(exemptRow.includes("Miễn học phí"));
  assert.ok(!exemptRow.includes("data-tuition-select") && !exemptRow.includes("data-collect-tuition"));
  assert.equal(ui.financeForecastRows("2026-09-17").some((row) => row.studentId === student.id), false);
});
