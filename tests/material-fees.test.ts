import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";
import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import {
  classMaterialFee,
  classTuitionCharge,
  collectManualTuition,
  COURSE_MATERIAL_KEY,
  paidSessionsSinceSeptember,
  studentRemainingSessions,
  syncTuitionReceivables,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";
import { emptySepayLedger } from "../cloudflare/sepay-engine";

/** Lớp thu tháng của anh Vân: 8 buổi tính phí tháng 9 sau khi trừ nghỉ lễ 02/09. */
function monthlyClass(materialFees?: DemoClass["materialFees"]): DemoClass {
  return {
    id: "class-test",
    code: "S-TEST",
    name: "Lớp kiểm thử",
    classTypeId: "",
    branchId: "",
    teacherId: "teacher-test",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["student-test"],
    note: "",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    courseSessions: 24,
    schedules: [
      { weekday: 1, periodId: "period-monday", startTime: "17:00", endTime: "19:00" },
      { weekday: 3, periodId: "period-wednesday", startTime: "14:30", endTime: "16:30" },
    ],
    materialFees,
  };
}

function septemberHoliday(): DemoLessonSession {
  return {
    id: "session-holiday",
    classId: "class-test",
    date: "2026-09-02",
    startTime: "14:30",
    endTime: "16:30",
    teacherId: "teacher-test",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: "class-test|2026-09-02|14:30",
    note: "",
    isOff: true,
    offSource: "ADMIN",
    attendance: [],
  };
}

const COLORING_BOOK = { "2026-09": { amount: 60_000, description: "Sách tô màu" } };

test("học phí tháng cộng thêm tiền học liệu của đúng tháng đó", () => {
  const sessions = [septemberHoliday()];
  const withFee = classTuitionCharge(monthlyClass(COLORING_BOOK), sessions, "2026-09");
  assert.equal(withFee.billed, 8, "số buổi tính phí không bị học liệu làm lệch");
  assert.equal(withFee.materialsAmount, 60_000);
  assert.equal(withFee.materialsLabel, "Sách tô màu");
  assert.equal(withFee.amount, 460_000, "8 buổi × 50k = 400k, cộng học liệu 60k");

  const october = classTuitionCharge(monthlyClass(COLORING_BOOK), sessions, "2026-10");
  assert.equal(october.materialsAmount, 0, "tháng không cấu hình thì không thu học liệu");
  assert.equal(october.amount, october.billed * 50_000);

  const noFee = classTuitionCharge(monthlyClass(), sessions, "2026-09");
  assert.equal(noFee.amount, 400_000);
});

test("lớp thu khóa không dùng học liệu cấu hình theo tháng", () => {
  const cls = { ...monthlyClass(COLORING_BOOK), billingMode: "COURSE" as const };
  const charge = classTuitionCharge(cls, [septemberHoliday()], "2026-09");
  assert.equal(charge.materialsAmount, 0);
  assert.equal(charge.amount, charge.billed * 50_000);
});

/** Lớp thu khóa: 24 buổi, học liệu chốt một lần cho cả khóa. */
function courseClass(materialFees?: DemoClass["materialFees"]): DemoClass {
  return { ...monthlyClass(materialFees), billingMode: "COURSE", courseStartDate: "2026-09-01" };
}

const COURSE_BOOK = { [COURSE_MATERIAL_KEY]: { amount: 120_000, description: "Bộ sách khóa" } };

test("bill lớp khóa cộng thêm tiền học liệu của khóa", () => {
  const sessions = [septemberHoliday()];
  const withFee = classTuitionCharge(courseClass(COURSE_BOOK), sessions);
  const noFee = classTuitionCharge(courseClass(), sessions);
  assert.equal(withFee.billed, noFee.billed, "số buổi của khóa không bị học liệu làm lệch");
  assert.equal(withFee.materialsAmount, 120_000);
  assert.equal(withFee.materialsLabel, "Bộ sách khóa");
  assert.equal(withFee.amount, noFee.amount + 120_000);
});

test("phiếu thu lớp khóa giữ nguyên học liệu dù có buổi khấu trừ", () => {
  const cls = courseClass(COURSE_BOOK);
  const sessions = [septemberHoliday()];
  const now = new Date(2026, 8, 9, 12);
  const student = {
    id: "student-test",
    code: "HV0001",
    fullName: "Học viên kiểm thử",
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING" as const,
    sessionBalances: {},
  };

  const quote = tuitionCollectionCharge(student, cls, sessions, emptySepayLedger(), now);
  assert.equal(quote.materialsAmount, 120_000);
  assert.equal(quote.amount, quote.billed * 50_000 + 120_000);

  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions, method: "TRANSFER", now });
  assert.ok(!("error" in collected));
  if ("error" in collected) return;
  assert.equal(collected.receipt.materialsAmount, 120_000, "biên lai ghi rõ phần học liệu");
  assert.equal(
    studentRemainingSessions(student, cls, sessions, collected.ledger, now),
    quote.billed - 1,
    "tiền học liệu không bị quy đổi thành buổi tồn; tới 09/09 lớp đã trôi 1 buổi (T2 07/09)",
  );

  // Khóa kế tiếp vẫn thu học liệu; buổi GV nghỉ không còn khấu trừ qua khóa —
  // tuitionCredits dương sót lại bị bỏ qua, phiếu thu đủ số buổi của khóa.
  const next = tuitionCollectionCharge(
    { ...student, tuitionCredits: { "class-test": 2 } },
    cls,
    sessions,
    collected.ledger,
    now,
  );
  assert.equal(next.creditSessions, 0);
  assert.equal(next.amount, next.billed * 50_000 + 120_000);
});

test("phiếu thu học phí gộp cả học liệu và buổi khấu trừ vẫn giữ nguyên học liệu", () => {
  const novemberBook = { "2026-11": { amount: 60_000, description: "Sách tô màu" } };
  const sessions = [septemberHoliday()];
  const now = new Date(2026, 10, 9, 12);
  const student = { id: "student-test", tuitionPaidThrough: { "class-test": "2026-10" } };

  const quote = tuitionCollectionCharge(student, monthlyClass(novemberBook), sessions, emptySepayLedger(), now);
  assert.deepEqual(quote.months, ["2026-11"]);
  assert.equal(quote.billed, 9);
  assert.equal(quote.materialsAmount, 60_000);
  assert.equal(quote.amount, 510_000);

  // Buổi giáo viên cho nghỉ kỳ trước chỉ khấu trừ buổi học, không khấu trừ học liệu.
  const credited = tuitionCollectionCharge(
    { ...student, tuitionCredits: { "class-test": 1 } },
    monthlyClass(novemberBook),
    sessions,
    emptySepayLedger(),
    now,
  );
  assert.equal(credited.billed, 8);
  assert.equal(credited.amount, 460_000, "8 buổi × 50k = 400k, cộng học liệu 60k");
});

test("tiền học liệu không làm lệch số buổi đã thu và số buổi tồn", () => {
  const cls = monthlyClass(COLORING_BOOK);
  const sessions = [septemberHoliday()];
  const now = new Date(2026, 8, 9, 12);
  const student = {
    id: "student-test",
    code: "HV0001",
    fullName: "Học viên kiểm thử",
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING" as const,
    sessionBalances: {},
    tuitionPaidThrough: { "class-test": "2026-08" },
  };

  const collected = collectManualTuition({ ledger: emptySepayLedger(), student, cls, sessions, method: "TRANSFER", now });
  assert.ok(!("error" in collected));
  if ("error" in collected) return;
  assert.equal(collected.receipt.amount, 460_000, "biên lai thu đủ cả học liệu");
  assert.equal(
    paidSessionsSinceSeptember(student, cls, sessions, collected.ledger),
    8,
    "đã thu 8 buổi, tiền học liệu không bị quy đổi thành buổi",
  );
  assert.equal(studentRemainingSessions(student, cls, sessions, collected.ledger, now), 7, "tới 09/09 mới dạy 1 buổi");
});

test("khoản phải thu của lớp gồm luôn tiền học liệu", () => {
  const ledger = syncTuitionReceivables(
    emptySepayLedger(),
    [monthlyClass(COLORING_BOOK)],
    [{ id: "student-test", fullName: "Học viên kiểm thử" }],
    [septemberHoliday()],
  );
  const receivable = ledger.receivables.find((row) => row.studentId === "student-test");
  assert.ok(receivable);
  assert.equal(receivable.amountDue, classTuitionCharge(monthlyClass(COLORING_BOOK), [septemberHoliday()]).amount);
});

test("classMaterialFee bỏ mô tả khi không có tiền", () => {
  assert.deepEqual(classMaterialFee({ materialFees: { "2026-09": { amount: 0, description: "Sách" } } }, "2026-09"), { amount: 0, description: "" });
  assert.deepEqual(classMaterialFee({}, "2026-09"), { amount: 0, description: "" });
});

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

function testEnv() {
  const kvStorage = new MemoryStorage();
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string) => (kvStorage.values.get(key) as T | undefined) ?? null,
      put: async (key: string, value: string) => { kvStorage.values.set(key, JSON.parse(value)); },
    },
    SYLLABUS_CATALOG: {
      getByName(name: string) {
        let value = catalogs.get(name);
        if (!value) {
          value = new SyllabusCatalog({ storage: new MemoryStorage() }, {});
          catalogs.set(name, value);
        }
        return value;
      },
    },
    SYLLABUS_DOCUMENT: {
      getByName(name: string) {
        let value = documents.get(name);
        if (!value) {
          value = new SyllabusDocumentObject({ storage: new MemoryStorage() }, {});
          documents.set(name, value);
        }
        return value;
      },
    },
    AUTH_SECRET: "material-fees-test-secret-at-least-32-characters",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
}

test("lưu lớp giữ lại học liệu theo tháng và bỏ dữ liệu rác", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  const saved = await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{
      id: "class-a",
      code: "A",
      name: "Lớp A",
      status: "ACTIVE",
      studentIds: [],
      billingMode: "MONTHLY",
      sessionPrice: 50_000,
      materialFees: {
        "2026-09": { amount: 60_000, description: "  Sách tô màu  " },
        "2026-10": { amount: 0, description: "Không thu" },
        "thang-9": { amount: 90_000, description: "Khóa tháng sai định dạng" },
      },
    }] }),
  });
  const body = await saved.json() as { items: DemoClass[] };
  const fees = body.items[0]?.materialFees;
  assert.deepEqual(fees, { "2026-09": { amount: 60_000, description: "Sách tô màu" } });
});

test("lưu lớp khóa giữ lại học liệu của cả khóa", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0], "Content-Type": "application/json" };

  const saved = await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{
      id: "class-course",
      code: "C",
      name: "Lớp khóa",
      status: "ACTIVE",
      studentIds: [],
      billingMode: "COURSE",
      sessionPrice: 50_000,
      courseSessions: 24,
      materialFees: { [COURSE_MATERIAL_KEY]: { amount: 120_000, description: " Bộ sách khóa " } },
    }] }),
  });
  const body = await saved.json() as { items: DemoClass[] };
  assert.deepEqual(body.items[0]?.materialFees, { course: { amount: 120_000, description: "Bộ sách khóa" } });
});

/** Client có bản sao công thức học liệu, phải khớp cloudflare/tuition-billing.ts. */
function loadUi() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__materialsTest = { state, classMaterialFee, classTuitionCharge, tuitionCollectionQuote, studentSessionRemaining, tuitionNoticeDetails, classOffScheduleConfig, classTuitionNoticePanel, openTuitionNotice };\n");
  const printed = { html: "" };
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      addEventListener: () => {},
      open: () => ({ document: { open: () => {}, write: (html: string) => { printed.html = html; }, close: () => {} } }),
    },
    location: { pathname: "/lop-hoc/class-test" },
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
    __materialsTest: {
      state: Record<string, any>;
      classMaterialFee: (cls: any, key: string) => { amount: number; description: string };
      classTuitionCharge: (cls: any, sessions?: any[], key?: string) => any;
      tuitionCollectionQuote: (student: any, cls: any, key?: string) => any;
      studentSessionRemaining: (student: any, cls: any, now?: Date) => number;
      tuitionNoticeDetails: (student: any, cls: any, key: string) => any;
      classOffScheduleConfig: (cls: any) => string;
      classTuitionNoticePanel: (cls: any) => string;
      openTuitionNotice: (studentId: string, classId: string, key: string) => void;
    };
  }).__materialsTest;
  return Object.assign(exposed, { printed });
}

function seedUi(ui: ReturnType<typeof loadUi>, materialFees?: DemoClass["materialFees"]) {
  const cls = monthlyClass(materialFees);
  ui.state.data = {
    user: { name: "Quản trị STEPS", role: "ADMIN" },
    students: [{ id: "student-test", code: "HV0001", fullName: "Học viên kiểm thử", status: "STUDYING", sessionBalances: {} }],
    classes: [cls],
    teachers: [{ id: "teacher-test", fullName: "Cô Lan", code: "GV01" }],
    lessonSessions: [septemberHoliday()],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
    finance: { sepay: { settings: {}, receivables: [], paymentOrders: [], receipts: [] } },
  };
  ui.state.classOffMonth = "2026-09";
  ui.state.classTuitionNoticeFor = "";
  return cls;
}

test("panel cấu hình tháng có ô tiền và mô tả học liệu, thành tiền cộng luôn học liệu", () => {
  const ui = loadUi();
  const cls = seedUi(ui, COLORING_BOOK);
  const panel = ui.classOffScheduleConfig(cls);
  assert.match(panel, /Học liệu tháng này/);
  assert.match(panel, /id="class-materials-amount"/);
  assert.match(panel, /name="materialsDescription"/);
  assert.match(panel, /value="60000"/);
  assert.match(panel, /value="Sách tô màu"/);
  assert.match(panel, /data-billable-amount>460\.000/, "8 buổi × 50k cộng học liệu 60k");

  const empty = ui.classOffScheduleConfig(seedUi(loadUi()));
  assert.match(empty, /id="class-materials-amount"/);
  assert.match(empty, /data-billable-amount>400\.000/);
});

test("phiếu báo học phí in thêm dòng học liệu và tổng thu", () => {
  const ui = loadUi();
  const cls = seedUi(ui, COLORING_BOOK);
  const notice = ui.tuitionNoticeDetails(null, cls, "2026-09");
  assert.equal(notice.sessions, 8);
  assert.equal(notice.tuitionAmount, 400_000);
  assert.equal(notice.materialsAmount, 60_000);
  assert.equal(notice.materialsLabel, "Sách tô màu");
  assert.equal(notice.amount, 460_000);

  assert.match(ui.classTuitionNoticePanel(cls), /Sách tô màu 60\.000/);

  ui.openTuitionNotice("", cls.id, "2026-09");
  assert.match(ui.printed.html, /Sách tô màu/);
  assert.match(ui.printed.html, /400\.000/, "dòng học phí giữ nguyên tiền buổi học");
  assert.match(ui.printed.html, /60\.000/);
  assert.match(ui.printed.html, /Tổng thu<\/span><strong>460\.000/);
});

test("panel cấu hình khóa có ô học liệu của khóa, phiếu báo khóa cộng thêm", () => {
  const ui = loadUi();
  const cls = courseClass(COURSE_BOOK);
  seedUi(ui);
  ui.state.data.classes = [cls];

  const panel = ui.classOffScheduleConfig(cls);
  assert.match(panel, /Học liệu của khóa/);
  assert.match(panel, /id="class-materials-amount"/);
  assert.match(panel, /value="120000"/);
  assert.match(panel, /value="Bộ sách khóa"/);

  const notice = ui.tuitionNoticeDetails(null, cls, "course");
  assert.equal(notice.materialsAmount, 120_000);
  assert.equal(notice.materialsLabel, "Bộ sách khóa");
  assert.equal(notice.amount, notice.tuitionAmount + 120_000);

  ui.openTuitionNotice("", cls.id, "course");
  assert.match(ui.printed.html, /Bộ sách khóa/);
  assert.match(ui.printed.html, /Tổng thu<\/span><strong>/);
});

test("tháng không thu học liệu thì phiếu báo giữ nguyên như cũ", () => {
  const ui = loadUi();
  const cls = seedUi(ui);
  const notice = ui.tuitionNoticeDetails(null, cls, "2026-09");
  assert.equal(notice.materialsAmount, 0);
  assert.equal(notice.amount, 400_000);
  ui.openTuitionNotice("", cls.id, "2026-09");
  assert.doesNotMatch(ui.printed.html, /Học liệu/);
  assert.match(ui.printed.html, /Tổng học phí<\/span><strong>400\.000/);
});

test("phiếu tháng 10 của Kiều Oanh lớp T2 hiện khấu trừ hai buổi và dòng nợ cũ 400k", () => {
  const ui = loadUi();
  const cls = { ...seedUi(ui), id: "class-import-t2", code: "T2", studentIds: ["student-test"] };
  const student = {
    ...ui.state.data.students[0],
    fullName: "Nguyễn Kiều Oanh",
    tuitionPaidThrough: { [cls.id]: "2026-09" },
  };
  ui.state.data.classes = [cls];
  ui.state.data.students = [student];
  ui.state.data.lessonSessions = [
    { ...septemberHoliday(), id: "off-1", classId: cls.id, date: "2026-09-07", recurrenceKey: `${cls.id}|2026-09-07|17:00`, offSource: "TEACHER" },
    { ...septemberHoliday(), id: "off-2", classId: cls.id, date: "2026-09-09", recurrenceKey: `${cls.id}|2026-09-09|14:30`, offSource: "TEACHER" },
  ];

  const preview = ui.tuitionNoticeDetails(student, cls, "2026-10");
  assert.equal(preview.offCreditSessions, 2);
  assert.equal(preview.oldDebtAmount, 400_000);
  assert.equal(preview.oldDebtLabel, "Nợ cũ tháng trước");
  assert.equal(preview.oldDebtPeriodLabel, "Tháng 09/2026");
  assert.equal(preview.amount, 700_000);

  ui.state.data.finance.sepay.receivables = [{
    id: "rec-t2-oct", studentId: student.id, classId: cls.id,
    billKey: `month|${cls.id}|2026-10`, paymentOrderId: "order-t2-oct",
    amountDue: preview.amount, amountPaid: 0, balanceDue: preview.amount, status: "OPEN",
  }];
  ui.state.data.finance.sepay.paymentOrders = [{ id: "order-t2-oct", paymentCode: "HPT2HV0001" }];
  ui.openTuitionNotice(student.id, cls.id, "2026-10");
  assert.match(ui.printed.html, /Khấu trừ buổi nghỉ tháng trước/);
  assert.match(ui.printed.html, /Nợ cũ tháng trước/);
  assert.match(ui.printed.html, /Tháng 09\/2026/);
  assert.match(ui.printed.html, /400\.000/);
  assert.match(ui.printed.html, /Tổng thu<\/span><strong>700\.000/);
});

test("UI T2 tháng 10 trừ hai buổi cho mọi học viên và giữ đúng nợ cũ", () => {
  const ui = loadUi();
  seedUi(ui);
  const cls = {
    ...monthlyClass(),
    id: "class-import-t2",
    code: "T2",
    studentIds: ["thuy", "khang-huy", "thao-nguyen", "van-nhi"],
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 4, periodId: "thu", startTime: "17:00", endTime: "19:00" },
    ],
  };
  const thuy = { id: "thuy", code: "HV0942", fullName: "Thúy", status: "STUDYING" };
  const khangHuy = { id: "khang-huy", code: "HV0565", fullName: "Trần Khang Huy", status: "STUDYING" };
  const thaoNguyen = { id: "thao-nguyen", code: "HV0567", fullName: "Nguyễn Thị Thảo Nguyên", status: "STUDYING" };
  const vanNhi = { id: "van-nhi", code: "HV0569", fullName: "Trương Lê Vân Nhi", status: "STUDYING" };
  ui.state.data.classes = [cls];
  ui.state.data.students = [thuy, khangHuy, thaoNguyen, vanNhi];
  ui.state.data.lessonSessions = [
    { ...septemberHoliday(), id: "admin-off", classId: cls.id, date: "2026-09-01", startTime: "17:00", recurrenceKey: `${cls.id}|2026-09-01|17:00` },
    { ...septemberHoliday(), id: "teacher-off", classId: cls.id, date: "2026-09-03", startTime: "17:00", recurrenceKey: `${cls.id}|2026-09-03|17:00`, offSource: "TEACHER" },
  ];
  const now = new Date("2026-10-03T12:00:00+07:00");

  assert.equal(ui.studentSessionRemaining(thuy, cls, now), -1);
  const thuyQuote = ui.tuitionCollectionQuote(thuy, cls, "2026-10");
  assert.equal(thuyQuote.creditSessions, 2);
  assert.equal(thuyQuote.oldDebtAmount, 0);
  assert.equal(thuyQuote.amount, 350_000);

  const khangHuyQuote = ui.tuitionCollectionQuote(khangHuy, cls, "2026-10");
  assert.equal(khangHuyQuote.creditSessions, 2);
  assert.equal(khangHuyQuote.items[0]?.originalBilled, 9);
  assert.equal(khangHuyQuote.items[0]?.amount, 350_000);
  assert.equal(khangHuyQuote.oldDebtAmount, 0);
  assert.equal(khangHuyQuote.amount, 350_000);
  const khangHuyNotice = ui.tuitionNoticeDetails(khangHuy, cls, "2026-10");
  assert.equal(khangHuyNotice.offCreditSessions, 2);
  assert.equal(khangHuyNotice.amount, 350_000);
  assert.equal(ui.tuitionNoticeDetails(khangHuy, cls, "2026-11").offCreditSessions, 0);
  assert.equal(ui.tuitionNoticeDetails(khangHuy, { ...cls, id: "class-import-t3" }, "2026-10").offCreditSessions, 0);

  for (const target of [thaoNguyen, vanNhi]) {
    assert.equal(ui.studentSessionRemaining(target, cls, now), -9, target.fullName);
    const quote = ui.tuitionCollectionQuote(target, cls, "2026-10");
    assert.equal(quote.creditSessions, 2, target.fullName);
    assert.equal(quote.items[0]?.amount, 350_000, target.fullName);
    assert.equal(quote.oldDebtAmount, 400_000, target.fullName);
    assert.equal(quote.amount, 750_000, target.fullName);
    const notice = ui.tuitionNoticeDetails(target, cls, "2026-10");
    assert.equal(notice.offCreditSessions, 2, target.fullName);
    assert.equal(notice.oldDebtAmount, 400_000, target.fullName);
    assert.equal(notice.amount, 750_000, target.fullName);
  }
});
