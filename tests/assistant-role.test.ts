import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

const ADMIN_PASSWORD = "strong-test-password";

function testEnv() {
  const kvStorage = new MemoryStorage();
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("Bộ nhớ test chỉ hỗ trợ KV JSON.");
        return (kvStorage.values.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => { kvStorage.values.set(key, JSON.parse(value)); },
      compareAndPut: async (key: string, expected: string, value: string) => {
        if (JSON.stringify(kvStorage.values.get(key) ?? null) !== expected) return false;
        kvStorage.values.set(key, JSON.parse(value));
        return true;
      },
    },
    SYLLABUS_CATALOG: {
      getByName(name: string) {
        let value = catalogs.get(name);
        if (!value) { value = new SyllabusCatalog({ storage: new MemoryStorage() }, {}); catalogs.set(name, value); }
        return value;
      },
    },
    SYLLABUS_DOCUMENT: {
      getByName(name: string) {
        let value = documents.get(name);
        if (!value) { value = new SyllabusDocumentObject({ storage: new MemoryStorage() }, {}); documents.set(name, value); }
        return value;
      },
    },
    AUTH_SECRET: "assistant-test-auth-secret-at-least-32-characters",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
}

function client(env: ReturnType<typeof testEnv>) {
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = async (email: string) => {
    const response = await request("/api/login", { method: "POST", body: JSON.stringify({ email, password: ADMIN_PASSWORD }) });
    assert.equal(response.status, 200, `Đăng nhập ${email} phải thành công.`);
    return response.headers.get("set-cookie")!.split(";", 1)[0]!;
  };
  return { request, login };
}

const CLASS_ROW = {
  id: "class-1",
  code: "S1",
  name: "STEPS Starters A",
  classTypeId: "",
  branchId: "",
  teacherId: "teacher-quynh",
  roomId: "",
  status: "ACTIVE",
  studentIds: ["student-1"],
  schedules: [],
  billingMode: "MONTHLY",
  sessionPrice: 100_000,
};

const SESSION_ROW = {
  id: "session-1",
  classId: "class-1",
  date: "2026-09-09",
  startTime: "17:00",
  endTime: "19:00",
  teacherId: "teacher-quynh",
  roomId: "",
  status: "COMPLETED",
  isExtra: true,
  recurrenceKey: "class-1|2026-09-09|17:00",
  isOff: false,
  assessmentColumns: [{ id: "speaking", name: "BTVN" }],
  attendance: [{
    studentId: "student-1",
    status: "PRESENT",
    pronunciationVideoDone: true,
    vocabularyScore: "30/45",
    assessmentScores: { speaking: "50/65" },
    note: "Giáo viên nhận xét",
  }],
};

async function seed(env: ReturnType<typeof testEnv>) {
  const { request, login } = client(env);
  const admin = await login("admin@steps.vn");
  const headers = { Cookie: admin, "Content-Type": "application/json" };
  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "student-1", code: "HV0001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }] }),
  });
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: [CLASS_ROW], syncFinance: false }) });
  await request("/api/assistants", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "assistant-1", code: "TG0001", fullName: "Nguyễn Thị Hà", phone: "", address: "", email: "" }] }),
  });
  const saved = await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: SESSION_ROW }) });
  assert.equal(saved.status, 200);
  return { request, login, admin };
}

test("trợ giảng đăng nhập bằng tên viết liền và chỉ nhận role ASSISTANT", async () => {
  const env = testEnv();
  const { request, login } = await seed(env);
  const cookie = await login("nguyenthiha");
  const bootstrap = await request("/api/bootstrap", { headers: { Cookie: cookie } });
  const data = await bootstrap.json() as { user: { role: string; name: string }; assistants: Array<{ code: string }> };
  assert.equal(data.user.role, "ASSISTANT");
  assert.equal(data.user.name, "Nguyễn Thị Hà");
  assert.deepEqual(data.assistants.map((row) => row.code), ["TG0001"]);
});

test("trợ giảng lưu được điểm và nhận xét nhưng điểm danh, clip và nghỉ học giữ nguyên", async () => {
  const env = testEnv();
  const { request, login } = await seed(env);
  const cookie = await login("nguyenthiha");

  const response = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      item: {
        ...SESSION_ROW,
        isOff: true,
        offSource: "TEACHER",
        status: "SCHEDULED",
        assessmentColumns: [{ id: "speaking", name: "BTVN" }, { id: "listening", name: "Nghe" }],
        attendance: [{
          studentId: "student-1",
          status: "ABSENT",
          pronunciationVideoDone: false,
          vocabularyScore: "42/45",
          assessmentScores: { speaking: "60/65", listening: "18/20" },
          note: "Trợ giảng nhận xét",
        }],
      },
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { item: Record<string, any> };
  const entry = body.item.attendance[0];
  assert.equal(body.item.isOff, false, "Trợ giảng không được cho lớp nghỉ.");
  assert.equal(body.item.status, "COMPLETED");
  assert.equal(entry.status, "PRESENT", "Trạng thái điểm danh phải giữ theo giáo viên.");
  assert.equal(entry.pronunciationVideoDone, true, "Clip quay ở nhà phải giữ theo giáo viên.");
  assert.equal(entry.vocabularyScore, "42/45");
  assert.equal(entry.assessmentScores.listening, "18/20");
  assert.equal(entry.note, "Trợ giảng nhận xét");
  assert.deepEqual(body.item.assessmentColumns.map((column: { id: string }) => column.id), ["speaking", "listening"]);
});

test("trợ giảng không tạo được buổi mới và không sửa được danh sách người dùng", async () => {
  const env = testEnv();
  const { request, login } = await seed(env);
  const cookie = await login("nguyenthiha");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };

  const unseen = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers,
    body: JSON.stringify({ item: { ...SESSION_ROW, id: "session-2", date: "2026-09-11", recurrenceKey: "class-1|2026-09-11|17:00" } }),
  });
  assert.equal(unseen.status, 409, "Buổi chưa điểm danh thì trợ giảng chưa nhập được điểm.");

  const assistants = await request("/api/assistants", { method: "PUT", headers, body: JSON.stringify({ items: [] }) });
  assert.equal(assistants.status, 403);
  const students = await request("/api/students", { method: "PUT", headers, body: JSON.stringify({ items: [] }) });
  assert.equal(students.status, 403);
});

function loadUi(route: string) {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__assistantTest = { state, classAttendanceTab, teacherAcademicReportPage, assistantsPage, normalizeRouteForRole, teacherClassesPage, teacherPage };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: route },
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
  const ui = (context as typeof context & {
    __assistantTest: {
      state: Record<string, any>;
      classAttendanceTab: (cls: any, teacherView: boolean, sessionId: string) => string;
      teacherAcademicReportPage: () => string;
      assistantsPage: () => string;
      normalizeRouteForRole: () => void;
      teacherClassesPage: () => string;
      teacherPage: () => string;
    };
  }).__assistantTest;
  ui.state.route = route;
  ui.state.attendanceOff = null;
  ui.state.attendanceColumnDrafts = {};
  ui.state.attendanceRemovedColumns = {};
  ui.state.data = {
    user: { name: "Nguyễn Thị Hà", role: "ASSISTANT" },
    lessonSessions: [SESSION_ROW],
    students: [{ id: "student-1", code: "HV0001", fullName: "Nguyễn Minh Anh", status: "STUDYING" }],
    classes: [CLASS_ROW],
    teachers: [],
    assistants: [{ id: "assistant-1", code: "TG0001", fullName: "Nguyễn Thị Hà", phone: "", address: "", email: "" }],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
  };
  return ui;
}

test("form điểm danh của trợ giảng khoá điểm danh và clip, vẫn nhập được điểm", () => {
  const ui = loadUi("/gv/lop-hoc/class-1/diem-danh/session-1");
  ui.state.role = "ASSISTANT";
  const html = ui.classAttendanceTab(CLASS_ROW, true, "session-1");

  // Giá trị cũ vẫn gửi lên server để lần lưu của trợ giảng không xoá điểm danh.
  assert.match(html, /<input type="hidden" name="status_student-1" value="PRESENT" \/>/);
  assert.match(html, /<select class="input" data-attendance-status disabled>/);
  assert.doesNotMatch(html, /<select[^>]*name="status_student-1"/);
  assert.match(html, /<input type="hidden" name="clip_student-1" value="1" \/>/);
  assert.doesNotMatch(html, /<input type="checkbox"[^>]*name="clip_student-1"/);
  assert.match(html, /<input type="checkbox" checked disabled \/>/);
  assert.match(html, /id="attendance-off"[^>]*disabled/);
  assert.match(html, /Trợ giảng chỉ nhập điểm và nhận xét/);

  // Các ô điểm và ghi chú vẫn mở để trợ giảng nhập.
  assert.match(html, /name="vocabulary_student-1" value="30\/45"(?![^>]*disabled)/);
  assert.match(html, /name="assessment_speaking_student-1" value="50\/65"(?![^>]*disabled)/);
  assert.match(html, /name="note_student-1"[^>]*value="Giáo viên nhận xét"(?![^>]*disabled)/);
  assert.match(html, /data-attendance-column-add(?![^>]*disabled)/);
});

test("form điểm danh của giáo viên không bị khoá thêm", () => {
  const ui = loadUi("/gv/lop-hoc/class-1/diem-danh/session-1");
  ui.state.role = "TEACHER";
  ui.state.data.user = { name: "Trịnh Thị Xuân Quỳnh", role: "TEACHER" };
  const html = ui.classAttendanceTab(CLASS_ROW, true, "session-1");

  assert.match(html, /<select class="input" name="status_student-1" data-attendance-status>/);
  assert.match(html, /name="clip_student-1" checked/);
  assert.doesNotMatch(html, /<input type="hidden" name="status_student-1"/);
  assert.doesNotMatch(html, /Trợ giảng chỉ nhập điểm/);
});

test("báo cáo học vụ của trợ giảng mở được form nhập điểm của lớp không do mình dạy", () => {
  const ui = loadUi("/gv/bao-cao-hoc-vu");
  ui.state.role = "ASSISTANT";
  ui.state.reportQuery = "";
  ui.state.reportClass = "";
  ui.state.reportFrom = "";
  ui.state.reportTo = "";
  const html = ui.teacherAcademicReportPage();

  assert.match(html, /data-nav="\/gv\/lop-hoc\/class-1\/diem-danh\/session-1">Nhập điểm<\/button>/);
  assert.match(html, /data-academic-report-open="session-1"/);
  assert.match(html, /Bấm Nhập điểm để thêm cột điểm/);
});

test("trợ giảng bị đưa về Báo cáo học vụ khi mở route ngoài quyền", () => {
  const ui = loadUi("/dashboard");
  ui.state.role = "ASSISTANT";
  ui.normalizeRouteForRole();
  assert.equal(ui.state.route, "/gv/bao-cao-hoc-vu");

  ui.state.route = "/gv/lop-hoc/class-1/diem-danh/session-1";
  ui.normalizeRouteForRole();
  assert.equal(ui.state.route, "/gv/lop-hoc/class-1/diem-danh/session-1");

  ui.state.route = "/gv/task";
  ui.normalizeRouteForRole();
  assert.equal(ui.state.route, "/gv/bao-cao-hoc-vu");
});

test("trang quản lý trợ giảng liệt kê tên đăng nhập", () => {
  const ui = loadUi("/tro-giang");
  ui.state.role = "ADMIN";
  ui.state.peopleQuery = "";
  ui.state.peopleModal = null;
  const html = ui.assistantsPage();

  assert.match(html, /<h1>Trợ giảng<\/h1>/);
  assert.match(html, /data-people-add="assistants"/);
  assert.match(html, /Tên đăng nhập: nguyenthiha/);
  assert.match(html, /data-nav="\/tro-giang\/assistant-1"/);
});

async function seedAssistantTeacher(env: ReturnType<typeof testEnv>, department: string) {
  const ctx = await seed(env);
  const headers = { Cookie: ctx.admin, "Content-Type": "application/json" };
  const teachers = await ctx.request("/api/teachers", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [
      { id: "teacher-quynh", code: "GV0001", fullName: "Trịnh Thị Xuân Quỳnh", phone: "", address: "", email: "quynh@steps.vn", assignedClasses: [] },
      { id: "teacher-linh", code: "GV0012", fullName: "Phan Thùy Linh", phone: "", address: "", email: "linh@steps.vn", assignedClasses: [] },
    ] }),
  });
  assert.equal(teachers.status, 200);
  const config = await ctx.request("/api/payroll-config", {
    method: "PUT",
    headers,
    body: JSON.stringify({ config: { teachers: { "teacher-linh": { department, contractKind: "BTG", payMode: "HOURLY" } }, months: {} } }),
  });
  assert.equal(config.status, 200);
  return ctx;
}

test("giáo viên phòng ban Trợ giảng nhập được điểm lớp khác nhưng không đổi điểm danh", async () => {
  const env = testEnv();
  const { request, login } = await seedAssistantTeacher(env, "Trợ giảng");
  const cookie = await login("phanthuylinh");
  const bootstrap = await (await request("/api/bootstrap", { headers: { Cookie: cookie } })).json() as { user: { role: string; assistantScope: boolean } };
  assert.equal(bootstrap.user.role, "TEACHER");
  assert.equal(bootstrap.user.assistantScope, true);

  const response = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ item: { ...SESSION_ROW, attendance: [{ ...SESSION_ROW.attendance[0], status: "ABSENT", pronunciationVideoDone: false, vocabularyScore: "44/45" }] } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { item: Record<string, any> };
  assert.equal(body.item.attendance[0].status, "PRESENT", "Điểm danh lớp khác giữ theo giáo viên lớp.");
  assert.equal(body.item.attendance[0].pronunciationVideoDone, true);
  assert.equal(body.item.attendance[0].vocabularyScore, "44/45");
});

test("giáo viên phòng ban khác vẫn không sửa được lớp không phải của mình", async () => {
  const env = testEnv();
  const { request, login } = await seedAssistantTeacher(env, "Giáo viên");
  const cookie = await login("phanthuylinh");
  const bootstrap = await (await request("/api/bootstrap", { headers: { Cookie: cookie } })).json() as { user: { assistantScope: boolean } };
  assert.equal(bootstrap.user.assistantScope, false);
  const response = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ item: SESSION_ROW }),
  });
  assert.equal(response.status, 403);
});

test("giao diện: giáo viên-trợ giảng thấy lớp khác để nhập điểm, form lớp khác khoá điểm danh", () => {
  const ui = loadUi("/gv/lop-hoc/class-1/diem-danh/session-1");
  ui.state.role = "TEACHER";
  ui.state.data.user = { name: "Phan Thùy Linh", role: "TEACHER", teacherId: "teacher-linh", assistantScope: true };
  ui.state.data.teachers = [
    { id: "teacher-quynh", code: "GV0001", fullName: "Trịnh Thị Xuân Quỳnh", assignedClasses: [] },
    { id: "teacher-linh", code: "GV0012", fullName: "Phan Thùy Linh", assignedClasses: [] },
  ];
  ui.state.data.syllabuses = [];
  const html = ui.classAttendanceTab(CLASS_ROW, true, "session-1");
  assert.match(html, /<input type="hidden" name="status_student-1" value="PRESENT" \/>/);
  assert.match(html, /Trợ giảng chỉ nhập điểm và nhận xét/);
  assert.match(html, /name="vocabulary_student-1" value="30\/45"(?![^>]*disabled)/);

  ui.state.route = "/gv/lop-hoc";
  const list = ui.teacherClassesPage();
  assert.match(list, /Nhập điểm lớp khác \(1\)/);
  assert.match(list, /STEPS Starters A/);

  // Không có quyền trợ giảng thì lớp khác không hiện.
  ui.state.data.user = { name: "Phan Thùy Linh", role: "TEACHER", teacherId: "teacher-linh", assistantScope: false };
  assert.doesNotMatch(ui.teacherClassesPage(), /Nhập điểm lớp khác/);
});

test("báo cáo học vụ của giáo viên phòng ban Trợ giảng hiện buổi mọi lớp kèm nút Nhập điểm", () => {
  const ui = loadUi("/gv/bao-cao-hoc-vu");
  ui.state.role = "TEACHER";
  ui.state.reportQuery = "";
  ui.state.reportClass = "";
  ui.state.reportFrom = "";
  ui.state.reportTo = "";
  ui.state.data.teachers = [
    { id: "teacher-quynh", code: "GV0001", fullName: "Trịnh Thị Xuân Quỳnh", assignedClasses: [] },
    { id: "teacher-linh", code: "GV0012", fullName: "Phan Thùy Linh", assignedClasses: [] },
  ];
  ui.state.data.user = { name: "Phan Thùy Linh", role: "TEACHER", teacherId: "teacher-linh", assistantScope: true };
  const html = ui.teacherAcademicReportPage();
  assert.match(html, /data-nav="\/gv\/lop-hoc\/class-1\/diem-danh\/session-1">Nhập điểm<\/button>/);

  // Giáo viên thường không thấy buổi của lớp người khác.
  ui.state.data.user = { name: "Phan Thùy Linh", role: "TEACHER", teacherId: "teacher-linh", assistantScope: false };
  assert.doesNotMatch(ui.teacherAcademicReportPage(), /data-academic-report-open="session-1"/);
});
