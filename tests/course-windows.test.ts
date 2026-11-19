import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import { emptySepayLedger, type SepayLedger, type SepayReceipt } from "../cloudflare/sepay-engine";
import {
  billedCourseSessions,
  chargedCourseSessions,
  classCourseSessionsForCourse,
  classTuitionCharge,
  countCompletedClassSessions,
  courseMaterialKey,
  syncTuitionReceivables,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

function courseClass(courseSessions = 4): DemoClass {
  return {
    id: "class-course",
    code: "K24",
    name: "Lớp khóa",
    classTypeId: "",
    branchId: "",
    teacherId: "teacher-1",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["student-1"],
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" },
      { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" },
    ],
    note: "",
    billingMode: "COURSE",
    sessionPrice: 100_000,
    courseSessions,
    courseStartDate: "2026-09-01",
  };
}

function adminOff(cls: DemoClass, date: string, startTime = "09:00"): DemoLessonSession {
  return {
    id: `off-${date}`,
    classId: cls.id,
    date,
    startTime,
    endTime: "11:00",
    teacherId: cls.teacherId,
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${cls.id}|${date}|${startTime}`,
    note: "Nghỉ lễ",
    isOff: true,
    offSource: "ADMIN",
    attendance: [],
  };
}

function ledgerWithCourseReceipt(studentId: string, classId: string, count = 1): SepayLedger {
  const ledger = emptySepayLedger();
  for (let index = 1; index <= count; index += 1) {
    const receipt: SepayReceipt = {
      id: `rc-${index}`,
      receiptNumber: `BL-${index}`,
      paymentId: `pay-${index}`,
      studentId,
      amount: 400_000,
      issuedAt: "2026-09-01T00:00:00.000Z",
      status: "ISSUED",
      classId,
      billingMode: "COURSE",
      billingPeriod: `Khóa ${index}`,
    };
    ledger.receipts.push(receipt);
    // Biên lai thật luôn gắn phiếu khóa qua payment — khóa đã đóng suy ra từ phiếu.
    const billKey = index === 1 ? `course|${classId}` : `course|${classId}|${index}`;
    ledger.receivables.push({
      id: `rec-${index}`, receivableCode: `HP-${index}`, studentId, studentName: studentId, billingPeriod: `Khóa ${index}`,
      issueDate: "2026-09-01", dueDate: "2026-09-01", amountDue: 400_000, amountPaid: 400_000, balanceDue: 0,
      currency: "VND", status: "PAID", paymentOrderId: `order-${index}`, classId, billKey,
    });
    ledger.payments.push({
      id: `pay-${index}`, paymentCode: `HP-${index}`, studentId, bankTransactionId: `manual-${index}`, receivableId: `rec-${index}`,
      amount: 400_000, allocatedAmount: 400_000, excessAmount: 0, status: "COMPLETED", paidAt: "2026-09-01T00:00:00.000Z",
    } as never);
  }
  return ledger;
}

test("classCourseSessionsForCourse enumerates consecutive course windows", () => {
  const cls = courseClass(4);
  const first = classCourseSessionsForCourse(cls, [], 1, new Date("2026-09-01T00:00:00"));
  const second = classCourseSessionsForCourse(cls, [], 2, new Date("2026-09-01T00:00:00"));
  const third = classCourseSessionsForCourse(cls, [], 3, new Date("2026-09-01T00:00:00"));
  assert.deepEqual(first.map((row) => row.date), ["2026-09-01", "2026-09-05", "2026-09-08", "2026-09-12"]);
  assert.deepEqual(second.map((row) => row.date), ["2026-09-15", "2026-09-19", "2026-09-22", "2026-09-26"], "khóa 2 nối tiếp ngay suất cuối khóa 1");
  assert.deepEqual(third.map((row) => row.date), ["2026-09-29", "2026-10-03", "2026-10-06", "2026-10-10"]);
});

test("classCourseSessionsForCourse returns empty without schedules", () => {
  const cls = { ...courseClass(4), schedules: [] };
  assert.deepEqual(classCourseSessionsForCourse(cls, [], 2).map((row) => row.date), []);
});

test("course windows keep each holiday inside its own course billing", () => {
  const cls = courseClass(4);
  const offCourse2 = adminOff(cls, "2026-09-19");
  assert.equal(billedCourseSessions(cls, [offCourse2], 1, new Date("2026-09-01T00:00:00")), 4, "khóa 1 không bị ảnh hưởng nghỉ của khóa 2");
  assert.equal(billedCourseSessions(cls, [offCourse2], 2, new Date("2026-09-01T00:00:00")), 3, "khóa 2 trừ đúng buổi nghỉ trong cửa sổ của nó");
});

test("tuitionCollectionCharge bills the next course window after each paid course", () => {
  const cls = courseClass(4);
  const student = { id: "student-1" };
  const ledger = ledgerWithCourseReceipt("student-1", cls.id, 1);
  const offCourse2 = adminOff(cls, "2026-09-19");
  const charge = tuitionCollectionCharge(student, cls, [offCourse2], ledger, new Date("2026-09-15T00:00:00"));
  assert.equal(charge.billKey, `course|${cls.id}|2`);
  assert.equal(charge.billed, 3, "khóa 2 tính 3 buổi vì có 1 ngày nghỉ lễ trong cửa sổ khóa 2");
  assert.equal(charge.amount, 300_000);
  assert.match(charge.period, /Khóa 2/);
});

test("tuitionCollectionCharge after two paid courses bills course 3 with its own materials", () => {
  const cls: DemoClass = { ...courseClass(4), materialFees: { "course|3": { amount: 50_000, description: "Sách khóa 3" } } };
  const student = { id: "student-1" };
  const ledger = ledgerWithCourseReceipt("student-1", cls.id, 2);
  const charge = tuitionCollectionCharge(student, cls, [], ledger, new Date("2026-09-30T00:00:00"));
  assert.equal(charge.billKey, `course|${cls.id}|3`);
  assert.equal(charge.billed, 4);
  assert.equal(charge.materialsAmount, 50_000);
  assert.equal(charge.amount, 450_000);
});

test("courseMaterialKey keeps legacy key for course 1 and per-course keys after", () => {
  assert.equal(courseMaterialKey(1), "course");
  assert.equal(courseMaterialKey(2), "course|2");
  const cls: DemoClass = { ...courseClass(4), materialFees: { course: { amount: 10_000, description: "Khóa 1" }, "course|2": { amount: 20_000, description: "Khóa 2" } } };
  assert.equal(classTuitionCharge(cls, []).materialsAmount, 10_000);
  assert.equal(classTuitionCharge(cls, [], undefined, 2).materialsAmount, 20_000);
});

test("chargedCourseSessions counts elapsed slots across later courses", () => {
  const cls = courseClass(4);
  // Tại 20/09: khóa 1 đã qua 4 suất, khóa 2 đã qua 2 suất (15, 19).
  const charged = chargedCourseSessions("student-1", cls, [], new Date("2026-09-20T12:00:00"));
  assert.equal(charged, 6, "buổi ảo của khóa 2 cũng trừ số dư buổi");
  const offCourse2 = adminOff(cls, "2026-09-19");
  assert.equal(chargedCourseSessions("student-1", cls, [offCourse2], new Date("2026-09-20T12:00:00")), 5, "nghỉ lễ khóa 2 không trừ số dư");
});

test("syncTuitionReceivables creates the receivable for the course being billed", () => {
  const cls = courseClass(4);
  const ledger = ledgerWithCourseReceipt("student-1", cls.id, 1);
  const synced = syncTuitionReceivables(ledger, [cls], [{ id: "student-1", fullName: "Nguyễn Văn A" }], [], new Date("2026-09-16T12:00:00"));
  const receivable = synced.receivables.find((row) => row.studentId === "student-1" && row.status === "OPEN");
  assert.ok(receivable, "phải tạo khoản phải thu cho khóa 2");
  assert.equal(receivable.billKey, `course|${cls.id}|2`);
  assert.equal(receivable.amountDue, 400_000);
});

interface CourseWindow {
  index: number;
  start: string;
  end: string;
  isPast?: boolean;
  isCurrent?: boolean;
  isFuture?: boolean;
}

interface TuitionNoticeStub {
  key: string;
  sessions: number;
  label: string;
  periodLabel: string;
}

function loadCourseUi() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__courseUi = { state, classCourseWindows, classCourseWindowByIndex, classOffScheduleConfig, tuitionNoticeDetails, classSessions, calendarSessions };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/lop-hoc/class-course", origin: "http://localhost:3000" },
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
    __courseUi: {
      state: Record<string, unknown>;
      classCourseWindows: (cls: unknown) => CourseWindow[];
      classCourseWindowByIndex: (cls: unknown, index?: number) => CourseWindow;
      classOffScheduleConfig: (cls: unknown) => string;
      tuitionNoticeDetails: (student: unknown, cls: unknown, key?: string) => TuitionNoticeStub;
      classSessions: (cls: unknown) => { date: string; classId: string }[];
      calendarSessions: () => { date: string; classId: string }[];
    };
  }).__courseUi;
}

test("class course config renders a dropdown of past, current and next courses", () => {
  const ui = loadCourseUi();
  const cls = {
    id: "class-course", code: "K24", name: "Khóa 4 buổi", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-01", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };
  const windows = ui.classCourseWindows(cls);
  assert.ok(windows.length >= 3, "có quá khứ + hiện tại + tương lai");
  assert.ok(windows.some((item) => item.isCurrent), "đánh dấu khóa đang học");
  assert.equal(windows.filter((item) => item.isFuture).length, 1, "chỉ một khóa tương lai");

  const config = ui.classOffScheduleConfig(cls);
  const currentIndex = windows.find((item) => item.isCurrent)?.index;
  assert.match(config, /id="class-course-index"/);
  assert.match(config, /Đang học/);
  assert.match(config, /Sắp tới/);
  assert.match(config, /Đã kết thúc/);
  assert.match(config, new RegExp(`data-course-index="${currentIndex}"`), "mặc định mở khóa đang học");
});

test("course config for a later course hides the anchor inputs and keeps course 1 editable", () => {
  const ui = loadCourseUi();
  const cls = {
    id: "class-course", code: "K24", name: "Khóa 4 buổi", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-01", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };
  ui.state.classCourseConfigFor = cls.id;
  ui.state.classCourseIndex = 3;
  const config = ui.classOffScheduleConfig(cls);
  assert.match(config, /data-course-index="3"/);
  assert.doesNotMatch(config, /id="class-course-start"/, "khóa 3 không cho sửa ngày bắt đầu");
  ui.state.classCourseIndex = 1;
  const first = ui.classOffScheduleConfig(cls);
  assert.match(first, /id="class-course-start"[^>]*value="2026-09-01"/);
});

test("tuition notice details resolve the selected course window", () => {
  const ui = loadCourseUi();
  const cls = {
    id: "class-course", code: "K24", name: "Khóa 4 buổi", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-01", studentIds: [],
    schedules: [
      { weekday: 2, startTime: "17:00", endTime: "19:00" },
      { weekday: 6, startTime: "09:00", endTime: "11:00" },
    ],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] }, finance: { sepay: { receivables: [], paymentOrders: [], receipts: [], payments: [] } } };
  const notice = ui.tuitionNoticeDetails(null, cls, "course|2");
  assert.equal(notice.key, "course|2");
  assert.equal(notice.sessions, 4);
  assert.match(notice.label, /Khóa 2/);
  assert.match(notice.periodLabel, /15\/09\/2026.*26\/09\/2026/);
});

function dateKeyIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("future course class stays off attendance and calendar until its start date", () => {
  const ui = loadCourseUi();
  const startKey = dateKeyIn(7);
  const preKey = dateKeyIn(3);
  const weekday = new Date(`${preKey}T12:00:00`).getDay();
  const cls = {
    id: "class-future", code: "K99", name: "Lớp chưa mở", teacherId: "teacher-1", roomId: "",
    billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: startKey, studentIds: [],
    schedules: [{ weekday, startTime: "17:00", endTime: "19:00" }],
  };
  ui.state.data = { lessonSessions: [], students: [], classes: [cls], settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] } };
  const sessions = ui.classSessions(cls);
  assert.ok(sessions.length > 0, "lớp vẫn có suất lịch sau ngày khai giảng");
  assert.ok(sessions.every((item) => item.date >= startKey), "không sinh suất trước courseStartDate");

  (ui.state as { calendarDate?: string }).calendarDate = preKey;
  (ui.state as { calendarView?: string }).calendarView = "week";
  assert.equal(ui.calendarSessions().filter((item) => item.classId === cls.id).length, 0, "tuần trước khai giảng không có lớp trên lịch");
});

test("countCompletedClassSessions ignores slots before the course start date", () => {
  const cls: DemoClass = { ...courseClass(4), courseStartDate: dateKeyIn(7) };
  assert.equal(countCompletedClassSessions(cls, []), 0, "lớp chưa khai giảng không có buổi đã học");
  const started: DemoClass = { ...courseClass(4), courseStartDate: dateKeyIn(-10) };
  assert.ok(countCompletedClassSessions(started, []) > 0, "lớp đã khai giảng vẫn đếm bình thường");
});
