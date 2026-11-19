import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

import worker from "../cloudflare/worker";
import { defaultSepaySettings } from "../cloudflare/sepay-engine";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import { vietQrSvg } from "../cloudflare/vietqr";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

function testEnv(overrides: { ALLOW_DEMO_LOGIN?: string; SEPAY_WEBHOOK_SECRET?: string; PUBLIC_BASE_URL?: string } = {}) {
  const kvStorage = new MemoryStorage();
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("VPS adapter chỉ hỗ trợ KV JSON.");
        return (kvStorage.values.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => { kvStorage.values.set(key, JSON.parse(value)); },
      // Đồng bộ (không await giữa đọc và ghi) để mô phỏng đúng ngữ nghĩa compare-and-swap
      // nguyên tử của adapter PostgreSQL thật, cho phép test được kịch bản ghi đồng thời.
      compareAndPut: async (key: string, expected: string, value: string) => {
        const current = JSON.stringify(kvStorage.values.get(key) ?? null);
        if (current !== expected) return false;
        kvStorage.values.set(key, JSON.parse(value));
        return true;
      },
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
    AUTH_SECRET: "vps-test-auth-secret-at-least-32-characters",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: overrides.ALLOW_DEMO_LOGIN ?? "false",
    SEPAY_WEBHOOK_SECRET: overrides.SEPAY_WEBHOOK_SECRET,
    PUBLIC_BASE_URL: overrides.PUBLIC_BASE_URL,
  };
}

test("VPS worker authenticates the production admin and persists application state", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );

  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "wrong" }),
  })).status, 401);

  const teacherLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "trinhthixuanquynh", password: "strong-test-password" }),
  });
  assert.equal(teacherLogin.status, 200);
  const teacherCookie = teacherLogin.headers.get("set-cookie")?.split(";", 1)[0];
  const teacherBootstrap = await request("/api/bootstrap", { headers: { Cookie: teacherCookie! } });
  const teacherData = await teacherBootstrap.json() as { user: { role: string; teacherId: string } };
  assert.equal(teacherData.user.role, "TEACHER");
  assert.equal(teacherData.user.teacherId, "teacher-quynh");

  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("steps_demo_session="));
  assert.doesNotMatch(login.headers.get("set-cookie") ?? "", /; Secure/);

  const bootstrap = await request("/api/bootstrap", { headers: { Cookie: cookie! } });
  assert.equal(bootstrap.status, 200);
  const data = await bootstrap.json() as { user: { role: string }; students: unknown[] };
  assert.equal(data.user.role, "ADMIN");
  assert.ok(Array.isArray(data.students));

  const updated = await request("/api/students", {
    method: "PUT",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: "student-vps", code: "HV0001", fullName: "Học viên VPS", phone: "0901000000", parentPhone1: "0901000000", parentPhone2: "0902000000", nationalId: "042123456789", status: "UNASSIGNED", sessionBalances: { "class-vps": -2, "class-import-t12": -11 }, tuitionPaidThrough: { "class-vps": "2026-08" } }] }),
  });
  assert.equal(updated.status, 200);
  const reread = await request("/api/students", { headers: { Cookie: cookie! } });
  const students = await reread.json() as { items: Array<{ id: string; parentPhone1?: string; parentPhone2?: string; nationalId?: string; tuitionPaidThrough?: Record<string, string> }> };
  assert.deepEqual(students.items.map((item) => item.id), ["student-vps"]);
  assert.equal(students.items[0]?.parentPhone1, "0901000000");
  assert.equal(students.items[0]?.parentPhone2, "0902000000");
  assert.equal(students.items[0]?.nationalId, "042123456789");
  assert.deepEqual(students.items[0]?.tuitionPaidThrough, { "class-vps": "2026-08" });

  const attemptedBalanceEdit = await request("/api/students", {
    method: "PUT",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{
      id: "student-vps",
      code: "HV0001",
      fullName: "Updated profile",
      status: "STUDYING",
      sessionBalances: { "class-vps": 4, "class-import-t12": 99 },
      tuitionPaidThrough: { "class-vps": "2026-08" },
    }] }),
  });
  assert.equal(attemptedBalanceEdit.status, 200);
  const balanceEditPayload = await attemptedBalanceEdit.json() as {
    items: Array<{ fullName: string; sessionBalances?: Record<string, number> }>;
  };
  assert.equal(balanceEditPayload.items[0]?.fullName, "Updated profile");
  assert.deepEqual(balanceEditPayload.items[0]?.sessionBalances, { "class-vps": 4, "class-import-t12": 99 });

  const savedCourse = await request("/api/classes", {
    method: "PUT",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-vps", code: "K24", name: "Khóa VPS", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: [], billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24,
        courseStartDate: "2026-09-01", schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
      }],
    }),
  });
  assert.equal(savedCourse.status, 200);
  const rereadClasses = await request("/api/classes", { headers: { Cookie: cookie! } });
  const classesPayload = await rereadClasses.json() as { items: Array<{ id: string; courseStartDate?: string; courseSessions?: number }> };
  assert.deepEqual(classesPayload.items.map((item) => ({ id: item.id, start: item.courseStartDate, sessions: item.courseSessions })), [
    { id: "class-vps", start: "2026-09-01", sessions: 24 },
  ]);

  const updatedAccountants = await request("/api/accountants", {
    method: "PUT",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: "accountant-vps", code: "KT0001", fullName: "Kế toán VPS", phone: "0900000000", email: "", address: "Hà Tĩnh" }] }),
  });
  assert.equal(updatedAccountants.status, 200);
  const accountantPayload = await updatedAccountants.json() as { items: Array<{ id: string; fullName: string; email: string }> };
  assert.deepEqual(accountantPayload.items, [{ id: "accountant-vps", code: "KT0001", fullName: "Kế toán VPS", phone: "0900000000", address: "Hà Tĩnh", email: "" }]);

  const accountantWrongPassword = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "ketoanvps", password: "strong-test-password" }),
  });
  assert.equal(accountantWrongPassword.status, 401);

  const accountantLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "ketoanvps", password: "123456789" }),
  });
  assert.equal(accountantLogin.status, 200);
  const accountantCookie = accountantLogin.headers.get("set-cookie")?.split(";", 1)[0];
  const accountantBootstrap = await request("/api/bootstrap", { headers: { Cookie: accountantCookie! } });
  assert.equal(accountantBootstrap.status, 200);
  const accountantData = await accountantBootstrap.json() as { user: { role: string; name: string } };
  assert.equal(accountantData.user.role, "ACCOUNTANT");
  assert.equal(accountantData.user.name, "Kế toán VPS");

  const clearSessions = await request("/api/lesson-sessions", {
    method: "PUT",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(clearSessions.status, 200);
  const rereadSessions = await request("/api/lesson-sessions", { headers: { Cookie: cookie! } });
  const sessions = await rereadSessions.json() as { items: unknown[] };
  assert.deepEqual(sessions.items, []);
});

test("attendance upserts preserve sessions saved by other teachers", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  await request("/api/lesson-sessions", { method: "PUT", headers, body: JSON.stringify({ items: [] }) });

  const classes = [
    { id: "class-a", code: "A", name: "Lớp A", status: "ACTIVE", teacherId: "teacher-a", studentIds: ["student-a"], schedules: [], billingMode: "COURSE", sessionPrice: 0, courseSessions: 24, billingEnabled: false },
    { id: "class-b", code: "B", name: "Lớp B", status: "ACTIVE", teacherId: "teacher-b", studentIds: ["student-b"], schedules: [], billingMode: "COURSE", sessionPrice: 0, courseSessions: 24, billingEnabled: false },
  ];
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: classes, syncFinance: false }) });

  const sessionA = {
    id: "session-a", classId: "class-a", date: "2026-09-09", startTime: "17:00", endTime: "19:00", teacherId: "teacher-a", status: "COMPLETED", recurrenceKey: "class-a|2026-09-09|17:00",
    assessmentColumns: [{ id: "speaking", name: "Speaking" }],
    attendanceColumnOrder: ["note", "status", "assessment:speaking", "clip", "vocabulary"],
    attendance: [{ studentId: "student-a", status: "PRESENT", pronunciationVideoDone: true, vocabularyScore: "Thuộc 12/15 từ", assessmentScores: { speaking: "Hoàn thành tốt" } }],
  };
  const sessionB = { id: "session-b", classId: "class-b", date: "2026-09-09", startTime: "17:30", endTime: "19:30", teacherId: "teacher-b", status: "COMPLETED", recurrenceKey: "class-b|2026-09-09|17:30", attendance: [{ studentId: "student-b", status: "EXCUSED" }] };

  assert.equal((await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: sessionA }) })).status, 200);
  assert.equal((await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: sessionB }) })).status, 200);

  const reread = await request("/api/lesson-sessions", { headers });
  const payload = await reread.json() as { items: Array<{ id: string; assessmentColumns?: Array<{ id: string; name: string }>; attendanceColumnOrder?: string[]; attendance: Array<{ status: string | null; pronunciationVideoDone?: boolean; vocabularyScore?: string | number | null; assessmentScores?: Record<string, string | number | null> }> }> };
  assert.deepEqual(payload.items.map((row) => row.id), ["session-a", "session-b"]);
  assert.deepEqual(payload.items.map((row) => row.attendance[0]?.status), ["PRESENT", "EXCUSED"]);
  assert.deepEqual(payload.items[0]?.assessmentColumns, [{ id: "speaking", name: "Speaking" }]);
  assert.deepEqual(payload.items[0]?.attendanceColumnOrder, ["note", "status", "assessment:speaking", "clip", "vocabulary"]);
  assert.equal(payload.items[0]?.attendance[0]?.pronunciationVideoDone, true);
  assert.equal(payload.items[0]?.attendance[0]?.vocabularyScore, "Thuộc 12/15 từ");
  assert.deepEqual(payload.items[0]?.attendance[0]?.assessmentScores, { speaking: "Hoàn thành tốt" });
});

test("clip-only stale attendance saves preserve grade data unless the user explicitly clears it", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  await request("/api/lesson-sessions", { method: "PUT", headers, body: JSON.stringify({ items: [] }) });
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-clip-safe", code: "CLIP", name: "Lớp clip", status: "ACTIVE", teacherId: "teacher-a",
        studentIds: ["student-a"], schedules: [], billingMode: "COURSE", sessionPrice: 0, courseSessions: 24, billingEnabled: false,
      }],
    }),
  });

  const savedWithGrades = {
    id: "session-clip-safe", classId: "class-clip-safe", date: "2026-09-17", startTime: "17:00", endTime: "19:00",
    teacherId: "teacher-a", status: "COMPLETED", recurrenceKey: "class-clip-safe|2026-09-17|17:00",
    assessmentColumns: [{ id: "btvn", name: "BTVN" }],
    attendanceColumnOrder: ["status", "clip", "vocabulary", "assessment:btvn", "note"],
    attendance: [{
      studentId: "student-a", status: "PRESENT", pronunciationVideoDone: false,
      vocabularyScore: "22/24", assessmentScores: { btvn: "23/24" }, note: "",
    }],
  };
  assert.equal((await request("/api/lesson-sessions/upsert", {
    method: "POST", headers, body: JSON.stringify({ item: savedWithGrades }),
  })).status, 200);

  const staleClipOnly = {
    ...savedWithGrades,
    assessmentColumns: [],
    attendanceColumnOrder: ["status", "clip", "vocabulary", "note"],
    attendance: [{
      studentId: "student-a", status: "PRESENT", pronunciationVideoDone: true,
      vocabularyScore: null, assessmentScores: {}, note: "",
    }],
  };
  const clipSaved = await request("/api/lesson-sessions/upsert", {
    method: "POST", headers, body: JSON.stringify({ item: staleClipOnly }),
  });
  assert.equal(clipSaved.status, 200);
  const clipPayload = await clipSaved.json() as { item: { assessmentColumns: Array<{ id: string; name: string }>; attendance: Array<{ pronunciationVideoDone: boolean; vocabularyScore: string | null; assessmentScores: Record<string, string> }> } };
  assert.deepEqual(clipPayload.item.assessmentColumns, [{ id: "btvn", name: "BTVN" }]);
  // Cột điểm chỉ có trong bản đã lưu được chèn lại đúng chỗ — "Nhận xét" vẫn ở cuối.
  assert.deepEqual((clipPayload.item as any).attendanceColumnOrder, ["status", "clip", "worksheet", "vocabulary", "assessment:btvn", "note"]);
  assert.equal(clipPayload.item.attendance[0]?.pronunciationVideoDone, true);
  assert.equal(clipPayload.item.attendance[0]?.vocabularyScore, "22/24");
  assert.deepEqual(clipPayload.item.attendance[0]?.assessmentScores, { btvn: "23/24" });

  const explicitlyCleared = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers,
    body: JSON.stringify({
      item: { ...savedWithGrades, attendance: staleClipOnly.attendance },
      gradeClearIntents: [{ studentId: "student-a", vocabulary: true, assessmentColumnIds: ["btvn"] }],
    }),
  });
  assert.equal(explicitlyCleared.status, 200);
  const clearedPayload = await explicitlyCleared.json() as { item: { attendance: Array<{ vocabularyScore: string | null; assessmentScores: Record<string, string> }> } };
  assert.equal(clearedPayload.item.attendance[0]?.vocabularyScore, null);
  assert.deepEqual(clearedPayload.item.attendance[0]?.assessmentScores, {});

  const explicitlyRemoved = await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers,
    body: JSON.stringify({ item: staleClipOnly, removedAssessmentColumnIds: ["btvn"] }),
  });
  assert.equal(explicitlyRemoved.status, 200);
  const removedPayload = await explicitlyRemoved.json() as { item: { assessmentColumns: unknown[]; attendance: Array<{ assessmentScores: Record<string, string> }> } };
  assert.deepEqual(removedPayload.item.assessmentColumns, []);
  assert.deepEqual(removedPayload.item.attendance[0]?.assessmentScores, {});
});

test("tuition exemption is persisted, blocks collection, and resumes debt after being unchecked", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  const student = {
    id: "student-exempt", code: "HV0999", fullName: "Học viên miễn phí", status: "STUDYING",
    tuitionExempt: true, sessionBalances: { "class-exempt": -99 },
  };
  type ExemptStudentPayload = {
    items: Array<{ id: string; tuitionExempt?: boolean }>;
    finance: { sepay: { receivables: Array<{ studentId: string; status: string }> } };
  };
  type ExemptClassPayload = ExemptStudentPayload & {
    students: Array<{ sessionBalances?: Record<string, number> }>;
  };

  const savedStudent = await request("/api/students", {
    method: "PUT", headers, body: JSON.stringify({ items: [student] }),
  });
  assert.equal(savedStudent.status, 200);
  assert.equal(((await savedStudent.json()) as ExemptStudentPayload).items[0]?.tuitionExempt, true);

  const savedClass = await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{
      id: "class-exempt", code: "FREE", name: "Lớp miễn phí", status: "ACTIVE",
      teacherId: "teacher-test", studentIds: [student.id], billingMode: "COURSE",
      sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-01", schedules: [],
    }] }),
  });
  assert.equal(savedClass.status, 200);
  const classPayload = await savedClass.json() as ExemptClassPayload;
  assert.equal(classPayload.students[0]?.sessionBalances?.["class-exempt"], 4);
  assert.equal(classPayload.finance.sepay.receivables.some((row) => row.studentId === student.id && row.status === "OPEN"), false);

  const blockedCollection = await request("/api/finance/sepay", {
    method: "POST", headers, body: JSON.stringify({ action: "collect", studentId: student.id, classId: "class-exempt" }),
  });
  assert.equal(blockedCollection.status, 400);
  assert.match(((await blockedCollection.json()) as { error: string }).error, /miễn học phí/i);

  const restoredStudent = await request("/api/students", {
    method: "PUT", headers, body: JSON.stringify({ items: [{ ...student, tuitionExempt: false }] }),
  });
  assert.equal(restoredStudent.status, 200);
  const restoredPayload = await restoredStudent.json() as ExemptStudentPayload;
  assert.equal(restoredPayload.items[0]?.tuitionExempt, false);
  assert.equal(restoredPayload.finance.sepay.receivables.some((row) => row.studentId === student.id && row.status === "OPEN"), true);
});

test("admin-planned days off are immutable through attendance while teacher-off sessions stay editable", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const adminLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const teacherLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "trinhthixuanquynh", password: "strong-test-password" }),
  });
  const adminHeaders = { Cookie: adminLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const teacherHeaders = { Cookie: teacherLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const cls = {
    id: "class-locked-off", code: "LOCK", name: "Lớp nghỉ lễ", status: "ACTIVE", teacherId: "teacher-quynh",
    studentIds: [], schedules: [], billingMode: "MONTHLY", sessionPrice: 100_000, courseSessions: 24, billingEnabled: true,
  };
  assert.equal((await request("/api/classes", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ items: [cls], syncFinance: false }),
  })).status, 200);

  const adminOff = {
    id: "session-admin-off", classId: cls.id, date: "2026-09-02", startTime: "17:00", endTime: "19:00",
    teacherId: cls.teacherId, status: "SCHEDULED", recurrenceKey: `${cls.id}|2026-09-02|17:00`,
    isOff: true, offSource: "ADMIN", attendance: [],
  };
  assert.equal((await request("/api/lesson-sessions", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ items: [adminOff] }),
  })).status, 200);

  const attemptedAttendance = { ...adminOff, status: "COMPLETED", isOff: false, offSource: undefined };
  assert.equal((await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ item: attemptedAttendance }),
  })).status, 409);
  assert.equal((await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ item: attemptedAttendance }),
  })).status, 409, "admins must reopen the session from holiday configuration, not attendance");

  const teacherOff = {
    ...adminOff,
    id: "session-teacher-off",
    date: "2026-09-09",
    recurrenceKey: `${cls.id}|2026-09-09|17:00`,
    offSource: "TEACHER",
  };
  assert.equal((await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ item: teacherOff }),
  })).status, 200);
  assert.equal((await request("/api/lesson-sessions/upsert", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ item: { ...teacherOff, status: "COMPLETED", isOff: false, offSource: undefined } }),
  })).status, 200);
});

test("cashbook entries are deleted by exact id and daily reconciliation is rebuilt", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  const income = { id: "cash-income", date: "2026-09-09", kind: "IN", source: "MANUAL", category: "Khác", description: "Thu thử", amount: 500000, method: "Tiền mặt" };
  const expense = { id: "cash-expense", date: "2026-09-09", kind: "OUT", source: "MANUAL", category: "Khác", description: "Chi thử", amount: 150000, method: "Tiền mặt" };
  const forecast = { id: "forecast-rent", kind: "OUT", category: "Tiền thuê nhà", description: "Thuê cơ sở tháng 10", amount: 12000000, dueDate: "2026-10-05", status: "PLANNED" };

  const saved = await request("/api/finance", {
    method: "PUT",
    headers,
    body: JSON.stringify({ cashbook: [income, expense], debts: [], payroll: [], recon: [], forecasts: [forecast] }),
  });
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json() as { finance: { forecasts: Array<{ id: string; amount: number }> } };
  assert.deepEqual(savedPayload.finance.forecasts.map((row) => ({ id: row.id, amount: row.amount })), [{ id: "forecast-rent", amount: 12000000 }]);

  const deleted = await request("/api/finance/cashbook/cash-income", { method: "DELETE", headers });
  assert.equal(deleted.status, 200);
  const payload = await deleted.json() as {
    finance: { cashbook: Array<{ id: string }>; recon: Array<{ manualIn: number; manualOut: number; net: number }>; forecasts: Array<{ id: string }> };
  };
  assert.deepEqual(payload.finance.cashbook.map((row) => row.id), ["cash-expense"]);
  assert.deepEqual(payload.finance.recon.map((row) => ({ manualIn: row.manualIn, manualOut: row.manualOut, net: row.net })), [
    { manualIn: 0, manualOut: 150000, net: -150000 },
  ]);
  assert.deepEqual(payload.finance.forecasts.map((row) => row.id), ["forecast-rent"]);

  const missing = await request("/api/finance/cashbook/not-found", { method: "DELETE", headers });
  assert.equal(missing.status, 404);
});

test("tuition receipts are recovered into cashbook once and stay deleted when explicitly removed", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "student-fee", code: "HV0900", fullName: "Học viên đã thu", status: "STUDYING", sessionBalances: {} }] }),
  });
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-fee", code: "K24", name: "Lớp thu học phí", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: ["student-fee"], billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24,
        courseStartDate: "2026-12-01", schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
      }],
    }),
  });
  const openingStudents = await (await request("/api/students", { headers })).json() as {
    items: Array<{ id: string; sessionBalances?: Record<string, number> }>;
  };
  assert.equal(openingStudents.items.find((row) => row.id === "student-fee")?.sessionBalances?.["class-fee"], 24);
  await request("/api/finance", {
    method: "PUT",
    headers,
    body: JSON.stringify({ debts: [], cashbook: [], recon: [], payroll: [] }),
  });

  const collected = await request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "collect", studentId: "student-fee", classId: "class-fee", method: "TRANSFER" }),
  });
  assert.equal(collected.status, 200);
  const collectedPayload = await collected.json() as {
    finance: { cashbook: Array<{ id: string; receiptId?: string; source: string }> };
  };
  assert.equal(collectedPayload.finance.cashbook.length, 1);
  assert.equal(collectedPayload.finance.cashbook[0]?.source, "TUITION");
  assert.ok(collectedPayload.finance.cashbook[0]?.receiptId);

  const corrupted = { ...(await (await request("/api/finance", { headers })).json() as { finance: Record<string, unknown> }).finance, cashbook: [] };
  assert.equal((await request("/api/finance", { method: "PUT", headers, body: JSON.stringify(corrupted) })).status, 200);

  const recovered = await request("/api/finance", { headers });
  const recoveredPayload = await recovered.json() as {
    finance: { cashbook: Array<{ id: string; receiptId?: string }> };
  };
  assert.equal(recoveredPayload.finance.cashbook.length, 1);
  assert.ok(recoveredPayload.finance.cashbook[0]?.receiptId);

  const entryId = recoveredPayload.finance.cashbook[0]!.id;
  const deleted = await request(`/api/finance/cashbook/${encodeURIComponent(entryId)}`, { method: "DELETE", headers });
  assert.equal(deleted.status, 200);
  const deletedPayload = await deleted.json() as {
    finance: {
      cashbook: unknown[];
      sepay: {
        receipts: unknown[];
        payments: Array<{ status: string }>;
        receivables: Array<{ amountPaid: number; balanceDue: number; status: string }>;
      };
    };
    students: Array<{ id: string; sessionBalances?: Record<string, number> }>;
  };
  assert.equal(deletedPayload.finance.cashbook.length, 0);
  assert.equal(deletedPayload.finance.sepay.receipts.length, 0);
  assert.equal(deletedPayload.finance.sepay.payments[0]?.status, "VOIDED");
  assert.equal(deletedPayload.finance.sepay.receivables[0]?.amountPaid, 0);
  assert.equal(deletedPayload.finance.sepay.receivables[0]?.balanceDue, 2_400_000);
  assert.equal(deletedPayload.finance.sepay.receivables[0]?.status, "OPEN");
  // Phiếu thu khóa 1 về OPEN = học viên chưa đóng → số dư trở về 0, không còn
  // mặc định "đã đóng khóa" như lớp cũ trước SePay.
  assert.equal(deletedPayload.students.find((row) => row.id === "student-fee")?.sessionBalances?.["class-fee"], 0);

  const afterDelete = await request("/api/finance", { headers });
  const afterDeletePayload = await afterDelete.json() as { finance: { cashbook: unknown[]; sepay: { receipts: unknown[] } } };
  assert.equal(afterDeletePayload.finance.cashbook.length, 0);
  assert.equal(afterDeletePayload.finance.sepay.receipts.length, 0);

  const collectedAgain = await request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "collect", studentId: "student-fee", classId: "class-fee", method: "TRANSFER" }),
  });
  assert.equal(collectedAgain.status, 200);
  const collectedAgainPayload = await collectedAgain.json() as {
    finance: { cashbook: Array<{ receiptId?: string }>; sepay: Record<string, unknown> };
  };
  const legacyDeletedReceiptId = collectedAgainPayload.finance.cashbook[0]?.receiptId;
  assert.ok(legacyDeletedReceiptId);
  const legacyDeletedFinance = {
    ...collectedAgainPayload.finance,
    cashbook: [],
    cashbookSkippedReceiptIds: [legacyDeletedReceiptId],
  };
  assert.equal((await request("/api/finance", { method: "PUT", headers, body: JSON.stringify(legacyDeletedFinance) })).status, 200);

  const repaired = await request("/api/finance", { headers });
  const repairedPayload = await repaired.json() as {
    finance: { cashbook: unknown[]; sepay: { receipts: unknown[]; receivables: Array<{ status: string }> } };
  };
  assert.equal(repairedPayload.finance.cashbook.length, 0);
  assert.equal(repairedPayload.finance.sepay.receipts.length, 0);
  assert.equal(repairedPayload.finance.sepay.receivables[0]?.status, "OPEN");
  const repairedStudents = await (await request("/api/students", { headers })).json() as {
    items: Array<{ id: string; sessionBalances?: Record<string, number> }>;
  };
  assert.equal(repairedStudents.items.find((row) => row.id === "student-fee")?.sessionBalances?.["class-fee"], 24);
});

test("S28 new 24-session course migrates start date to 10/09/2026 once", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify([{
    id: "class-import-s28",
    code: "S28",
    name: "S28- 5.3-2016",
    status: "ACTIVE",
    teacherId: "teacher-vps",
    studentIds: [],
    billingMode: "COURSE",
    sessionPrice: 69_000,
    courseSessions: 24,
    courseStartDate: "2026-09-08",
    schedules: [
      { weekday: 4, periodId: "thu", startTime: "17:15", endTime: "19:15" },
      { weekday: 0, periodId: "sun", startTime: "09:00", endTime: "11:00" },
    ],
  }]));

  const first = await request("/api/classes", { headers: { Cookie: cookie } });
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { items: Array<{ code: string; billingMode?: string; courseStartDate?: string; courseSessions?: number }> };
  assert.deepEqual(firstPayload.items.map((item) => ({
    code: item.code,
    mode: item.billingMode,
    start: item.courseStartDate,
    sessions: item.courseSessions,
  })), [
    { code: "S28", mode: "COURSE", start: "2026-09-10", sessions: 24 },
  ]);

  const flag = await env.STEPS_LMS_DATA.get<string>("migration:s28-course-start-2026-09-10", "json");
  assert.ok(flag);

  const bootstrap = await request("/api/bootstrap", { headers: { Cookie: cookie } });
  assert.equal(bootstrap.status, 200);
  const boot = await bootstrap.json() as { classes: Array<{ code: string; courseStartDate?: string }> };
  assert.equal(boot.classes.find((item) => item.code === "S28")?.courseStartDate, "2026-09-10");
});

test("periodic reports persist one four-skill record per student and period", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const item = {
    id: "periodic-1",
    classId: "class-demo-starters-a",
    studentId: "student-demo-1",
    periodType: "COURSE",
    periodKey: "2026-09-01_2026-11-23",
    periodLabel: "Khóa 01/09/2026 – 23/11/2026",
    fromDate: "2026-09-01",
    toDate: "2026-11-23",
    scores: { listening: 8, speaking: 7.5, reading: 9, writing: 8.5 },
    comment: "Tiến bộ tốt.",
  };

  const saved = await request("/api/periodic-reports/upsert", { method: "POST", headers, body: JSON.stringify({ item }) });
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json() as { item: { scores: { speaking: number }; updatedBy: string }; items: unknown[] };
  assert.equal(savedPayload.item.scores.speaking, 7.5);
  assert.equal(savedPayload.item.updatedBy, "Quản trị STEPS");
  assert.equal(savedPayload.items.length, 1);

  const updated = await request("/api/periodic-reports/upsert", {
    method: "POST",
    headers,
    body: JSON.stringify({ item: { ...item, id: "different-client-id", scores: { ...item.scores, speaking: 9 }, comment: "Đã tự tin hơn." } }),
  });
  const updatedPayload = await updated.json() as { item: { id: string; scores: { speaking: number } }; items: unknown[] };
  assert.equal(updatedPayload.item.id, "periodic-1");
  assert.equal(updatedPayload.item.scores.speaking, 9);
  assert.equal(updatedPayload.items.length, 1);

  const bootstrap = await request("/api/bootstrap", { headers: { Cookie: cookie } });
  const data = await bootstrap.json() as { periodicReports: Array<{ id: string; comment: string }> };
  assert.deepEqual(data.periodicReports.map((report) => ({ id: report.id, comment: report.comment })), [{ id: "periodic-1", comment: "Đã tự tin hơn." }]);
});

test("SePay webhook rejects a request without a valid signature, even with an empty secret, and logs the rejection", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const rejected = await request("/api/webhooks/sepay", {
    method: "POST",
    body: JSON.stringify({ id: "tx-unsigned", content: "HP8F4K92", transferAmount: 2000 }),
  });
  assert.equal(rejected.status, 401);

  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const finance = await (await request("/api/finance", { headers: { Cookie: cookie! } })).json() as {
    finance: { sepay: { webhookLogs: Array<{ signatureValid: boolean; processingStatus: string }>; receivables: Array<{ status: string }> } };
  };
  assert.equal(finance.finance.sepay.webhookLogs[0]?.processingStatus, "REJECTED");
  assert.equal(finance.finance.sepay.webhookLogs[0]?.signatureValid, false);
  assert.ok(finance.finance.sepay.receivables.every((row) => row.status !== "PAID"), "an unsigned webhook must not allocate any receivable");
});

test("SePay webhook allocates a correctly signed transaction once and treats a repeated provider id as a duplicate", async () => {
  const secret = "whsec-vps-test";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  // studentId không thuộc lớp demo nào nên syncTuitionReceivables không đụng vào khoản này.
  const created = await request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "create-receivable", studentId: "student-webhook-1", studentName: "Học viên Webhook", amountDue: 2000, billingPeriod: "Tháng 09/2026" }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json() as { finance: { sepay: { receivables: Array<{ studentId: string; receivableCode: string; amountDue: number }> } } };
  const receivable = createdPayload.finance.sepay.receivables.find((row) => row.studentId === "student-webhook-1");
  assert.ok(receivable, "khoản phải thu vừa tạo phải tồn tại");
  const paymentCode = receivable!.receivableCode;

  const body = JSON.stringify({ id: "tx-signed-1", content: paymentCode, transferAmount: receivable!.amountDue });
  // Mặc định chưa cấu hình qua UI là API_KEY (Q2 đã chốt SePay của trung tâm dùng token
  // webhook, không dùng HMAC), nên env.SEPAY_WEBHOOK_SECRET đóng vai trò token này.
  const apiKeyHeaders = { Authorization: `Apikey ${secret}` };

  const first = await request("/api/webhooks/sepay", { method: "POST", headers: apiKeyHeaders, body });
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { ok: boolean; duplicate?: boolean };
  assert.equal(firstPayload.ok, true);
  assert.equal(firstPayload.duplicate, undefined);

  const second = await request("/api/webhooks/sepay", { method: "POST", headers: apiKeyHeaders, body });
  assert.equal(second.status, 200);
  const secondPayload = await second.json() as { duplicate?: boolean };
  assert.equal(secondPayload.duplicate, true);

  const finance = await (await request("/api/finance", { headers })).json() as {
    finance: { sepay: { receivables: Array<{ receivableCode: string; status: string }>; receipts: unknown[]; bankTransactions: Array<{ providerTransactionId: string; status: string; reviewReason?: string }> } };
  };
  assert.equal(finance.finance.sepay.receivables.find((row) => row.receivableCode === paymentCode)?.status, "PAID");
  assert.equal(finance.finance.sepay.receipts.length, 1);
  const matchedTx = finance.finance.sepay.bankTransactions.filter((row) => row.providerTransactionId === "tx-signed-1");
  assert.equal(matchedTx.length, 1);
  // Khoản này dựng bằng create-receivable (không gắn lớp), nên Phase 5 không kích hoạt
  // được buổi học — đúng ý: tiền vẫn ghi nhận PAID, nhưng giao dịch cần kế toán xem lại.
  assert.equal(matchedTx[0]!.status, "NEEDS_REVIEW");
  assert.equal(matchedTx[0]!.reviewReason, "INVALID_RECEIVABLE");
});

test("SePay's own 'gửi thử' test webhook (id: 0, no content match, only referenceCode) is accepted instead of 400", async () => {
  const secret = "whsec-vps-test-ping";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const apiKeyHeaders = { Authorization: `Apikey ${secret}` };

  // Payload thật SePay gửi khi bấm "Gửi thử" trong dashboard của họ: id đặt là 0, không có
  // content khớp mã nào, định danh giao dịch chỉ nằm ở referenceCode (camelCase).
  const testPingBody = JSON.stringify({
    id: 0,
    gateway: "Vietcombank",
    transactionDate: "2026-09-22 22:00:00",
    accountNumber: "0451000355",
    code: null,
    content: "SePay test",
    transferType: "in",
    transferAmount: 0,
    accumulated: 0,
    subAccount: null,
    referenceCode: "SEPAYTEST123",
    description: "",
  });

  const response = await request("/api/webhooks/sepay", { method: "POST", headers: apiKeyHeaders, body: testPingBody });
  assert.equal(response.status, 200, "id: 0 phải rơi về referenceCode thay vì bị coi là thiếu mã giao dịch");
  const payload = await response.json() as { ok: boolean };
  assert.equal(payload.ok, true);
});

test("a webhook allocation and a concurrent manual tuition collection do not lose each other's receipts", async () => {
  const secret = "whsec-concurrent";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "student-concurrent", code: "HV0777", fullName: "Học viên đồng thời", status: "STUDYING", sessionBalances: {} }] }),
  });
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-concurrent", code: "K77", name: "Lớp đồng thời", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: ["student-concurrent"], billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24,
        courseStartDate: "2026-12-01", schedules: [],
      }],
    }),
  });

  // studentId riêng, không thuộc lớp nào, để syncTuitionReceivables không đụng vào khoản webhook này.
  const created = await request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "create-receivable", studentId: "student-webhook-concurrent", studentName: "Học viên Webhook đồng thời", amountDue: 2000, billingPeriod: "Tháng 09/2026" }),
  });
  const createdPayload = await created.json() as { finance: { sepay: { receivables: Array<{ studentId: string; receivableCode: string; amountDue: number }> } } };
  const receivable = createdPayload.finance.sepay.receivables.find((row) => row.studentId === "student-webhook-concurrent");
  assert.ok(receivable, "khoản phải thu vừa tạo phải tồn tại");
  const paymentCode = receivable!.receivableCode;

  const webhookBody = JSON.stringify({ id: "tx-concurrent-1", content: paymentCode, transferAmount: receivable!.amountDue });

  const [webhookResponse, collectResponse] = await Promise.all([
    request("/api/webhooks/sepay", { method: "POST", headers: { Authorization: `Apikey ${secret}` }, body: webhookBody }),
    request("/api/finance/sepay", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "collect", studentId: "student-concurrent", classId: "class-concurrent", method: "TRANSFER" }),
    }),
  ]);
  assert.equal(webhookResponse.status, 200);
  assert.equal(collectResponse.status, 200);

  const finance = await (await request("/api/finance", { headers })).json() as {
    finance: { sepay: { receivables: Array<{ receivableCode: string; status: string }> }; cashbook: Array<{ studentName?: string; source: string }> };
  };
  assert.equal(finance.finance.sepay.receivables.find((row) => row.receivableCode === paymentCode)?.status, "PAID");
  assert.ok(finance.finance.cashbook.some((row) => row.source === "TUITION" && row.studentName === "Học viên đồng thời"), "the concurrent manual collection receipt must survive the webhook write");
});

test("công cụ demo simulate và fail-invoice đã bị gỡ: dù bật demo, gọi vào cũng không tạo giao dịch hay đổi hóa đơn", async () => {
  const demoEnv = testEnv({ ALLOW_DEMO_LOGIN: "true" });
  const demoRequest = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), demoEnv as never);
  const login = await demoRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  const readSepay = async () => ((await (await demoRequest("/api/finance", { headers })).json()) as {
    finance: { sepay: { bankTransactions: unknown[]; invoices: unknown[] } };
  }).finance.sepay;
  const before = await readSepay();

  for (const action of ["simulate", "fail-invoice"]) {
    await demoRequest("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action, kind: "exact", invoiceId: "inv-x" }) });
  }

  const after = await readSepay();
  assert.equal(after.bankTransactions.length, before.bankTransactions.length);
  assert.equal(JSON.stringify(after.invoices), JSON.stringify(before.invoices));
});

function integrationPatch(overrides: Record<string, unknown> = {}) {
  return {
    sepay: { webhookMode: "HMAC_BODY", webhookSecret: "" },
    misa: { enabled: false, baseUrl: "", clientId: "", clientSecret: "", taxCode: "", username: "", password: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
    zalo: { enabled: false, appId: "", appSecret: "", oaId: "", refreshToken: "", templateIdPaymentRequest: "", templateIdInvoiceIssued: "" },
    ...overrides,
  };
}

test("PUT /api/integrations không echo bí mật, và webhook chuyển sang dùng đúng bí mật vừa lưu qua UI", async () => {
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: "whsec-env-fallback" });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  const saved = await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify(integrationPatch({ sepay: { webhookMode: "HMAC_BODY", webhookSecret: "whsec-from-ui-config" } })),
  });
  assert.equal(saved.status, 200);
  const savedText = await saved.text();
  assert.equal(savedText.includes("whsec-from-ui-config"), false, "response PUT không được lộ bí mật vừa lưu");
  assert.equal(savedText.includes("Encrypted"), false, "response không được chứa key *Encrypted");
  const savedPayload = JSON.parse(savedText) as { settings: { sepay: { webhookSecretHint?: string } } };
  assert.equal(savedPayload.settings.sepay.webhookSecretHint, "nfig");

  const fetched = await request("/api/integrations", { headers });
  const fetchedText = await fetched.text();
  assert.equal(fetchedText.includes("whsec-from-ui-config"), false, "response GET không được lộ bí mật");
  assert.equal(fetchedText.includes("Encrypted"), false);

  const bodyMatchingUiSecret = JSON.stringify({ id: "tx-ui-secret" });
  const signedWithUiSecret = crypto.createHmac("sha256", "whsec-from-ui-config").update(bodyMatchingUiSecret).digest("hex");
  const okWithUiSecret = await request("/api/webhooks/sepay", { method: "POST", headers: { "x-sepay-signature": signedWithUiSecret }, body: bodyMatchingUiSecret });
  assert.equal(okWithUiSecret.status, 200, "webhook phải chấp nhận chữ ký ký bằng bí mật lưu qua UI");

  const signedWithOldEnvSecret = crypto.createHmac("sha256", "whsec-env-fallback").update(bodyMatchingUiSecret).digest("hex");
  const rejectedWithOldSecret = await request("/api/webhooks/sepay", { method: "POST", headers: { "x-sepay-signature": signedWithOldEnvSecret }, body: JSON.stringify({ id: "tx-ui-secret-2" }) });
  assert.equal(rejectedWithOldSecret.status, 401, "một khi đã cấu hình qua UI, bí mật .env cũ không còn dùng được");
});

test("lưu lại cấu hình tích hợp với ô bí mật để trống không xoá mất bí mật webhook đã lưu", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify(integrationPatch({ sepay: { webhookMode: "HMAC_BODY", webhookSecret: "whsec-keep-me" } })),
  });
  const secondSave = await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify(integrationPatch({ sepay: { webhookMode: "HMAC_TIMESTAMP_BODY", webhookSecret: "" } })),
  });
  assert.equal(secondSave.status, 200);

  const body = JSON.stringify({ id: "tx-kept-secret" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", "whsec-keep-me").update(`${timestamp}.${body}`).digest("hex");
  const webhookResult = await request("/api/webhooks/sepay", {
    method: "POST",
    headers: { "x-sepay-signature": signature, "x-sepay-timestamp": String(timestamp) },
    body,
  });
  assert.equal(webhookResult.status, 200, "chế độ đổi sang HMAC_TIMESTAMP_BODY nhưng bí mật lần lưu đầu phải còn nguyên");
});

test("chỉ ADMIN gọi được GET/PUT /api/integrations, vai trò khác đều nhận 403", async () => {
  const env = testEnv({ ALLOW_DEMO_LOGIN: "true" });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const cookieFor = async (email: string, password?: string, demo?: boolean) => {
    const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email, password, demo }) });
    assert.equal(login.status, 200, `đăng nhập ${email} phải thành công để chạy được test`);
    return login.headers.get("set-cookie")!.split(";", 1)[0]!;
  };

  const accountantCookie = await cookieFor("accountant@steps.edu.vn", undefined, true);
  const teacherCookie = await cookieFor("trinhthixuanquynh", "strong-test-password");
  const studentCookie = await cookieFor("student@steps.edu.vn", undefined, true);

  for (const cookie of [accountantCookie, teacherCookie, studentCookie]) {
    const getResult = await request("/api/integrations", { headers: { Cookie: cookie } });
    assert.equal(getResult.status, 403);
    const putResult = await request("/api/integrations", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(integrationPatch()),
    });
    assert.equal(putResult.status, 403);
  }
});

test("hai admin lưu cấu hình tích hợp cùng lúc: một lượt thành công, lượt kia nhận 409", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  const [first, second] = await Promise.all([
    request("/api/integrations", { method: "PUT", headers, body: JSON.stringify(integrationPatch({ misa: { ...integrationPatch().misa, baseUrl: "https://a.example", clientSecret: "concurrent-secret-a" } })) }),
    request("/api/integrations", { method: "PUT", headers, body: JSON.stringify(integrationPatch({ misa: { ...integrationPatch().misa, baseUrl: "https://b.example", clientSecret: "concurrent-secret-b" } })) }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409], "đúng một lượt ghi thành công, lượt còn lại phải bị từ chối vì xung đột");
});

test("audit log cho cấu hình tích hợp chỉ liệt kê tên nhóm, không chứa giá trị bí mật", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify(integrationPatch({ sepay: { webhookMode: "HMAC_BODY", webhookSecret: "whsec-must-not-leak-into-audit" } })),
  });
  const bootstrap = await request("/api/bootstrap", { headers: { Cookie: cookie! } });
  const data = await bootstrap.json() as { auditLogs: Array<{ entity: string; entityId: string; summary: string }> };
  const entry = data.auditLogs.find((row) => row.entity === "Settings" && row.entityId === "integrations");
  assert.ok(entry, "phải có một dòng audit cho lượt lưu cấu hình tích hợp");
  assert.equal(entry!.summary.includes("whsec-must-not-leak-into-audit"), false);
  assert.match(entry!.summary, /SePay/);
});

test("Gửi yêu cầu thanh toán chốt đúng mã và số tiền, webhook đối soát ALLOCATED, và trang thanh toán công khai hoạt động đúng đặc tả", async () => {
  const secret = "whsec-phase4";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{
      id: "student-phase4", code: "HV0501", fullName: "Học viên Phase 4", status: "STUDYING",
      phone: "0909000000", parentPhone1: "0909111111", loginEmail: "phase4@example.com", address: "12 Láng Hạ, Hà Nội",
      sessionBalances: {},
    }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-phase4", code: "P4", name: "Lớp Phase 4", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: ["student-phase4"], billingMode: "COURSE", sessionPrice: 150_000, courseSessions: 24,
        // Khai giảng sau mốc dùng hệ thống: khóa 1 là khóa đang nợ (khóa trước mốc coi như thu ngoài hệ thống).
        courseStartDate: "2026-09-01", schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
      }],
    }),
  });

  const requested = await request("/api/finance/sepay", {
    method: "POST", headers,
    body: JSON.stringify({ action: "request-payment", studentId: "student-phase4", classId: "class-phase4" }),
  });
  assert.equal(requested.status, 200);
  const requestedPayload = await requested.json() as {
    receivable: { id: string; amountDue: number; publicToken: string; billingPeriod: string; studentName: string; frozenAt?: string; paymentOrderId: string };
    finance: { sepay: { paymentOrders: Array<{ id: string; paymentCode: string }> } };
  };
  const receivable = requestedPayload.receivable;
  assert.ok(receivable.frozenAt, "khoản phải thu phải được chốt cứng (frozenAt) sau khi gửi yêu cầu");
  assert.equal(receivable.publicToken.length, 32, "token công khai phải dài 32 ký tự");
  const order = requestedPayload.finance.sepay.paymentOrders.find((item) => item.id === receivable.paymentOrderId);
  assert.ok(order, "phải có đơn thanh toán gắn với khoản phải thu vừa chốt");
  const paymentCode = order!.paymentCode;

  // #5, #6, #8 — trang công khai mở được khi chưa đăng nhập, sai token bị từ chối, không lộ dữ liệu cá nhân.
  const publicPath = `/api/public/payment/${receivable.id}/${receivable.publicToken}`;
  const publicResponse = await request(publicPath);
  assert.equal(publicResponse.status, 200, "phải mở được khi không có cookie phiên");
  const publicText = await publicResponse.text();
  assert.equal(publicText.includes("0909111111"), false, "không được lộ parentPhone1");
  assert.equal(publicText.includes("0909000000"), false, "không được lộ phone");
  assert.equal(publicText.includes("phase4@example.com"), false, "không được lộ loginEmail");
  assert.equal(publicText.includes("Láng Hạ"), false, "không được lộ address");
  const publicPayload = JSON.parse(publicText) as { studentName: string; amount: number; paymentCode: string; paid: boolean };
  assert.equal(publicPayload.studentName, "Học viên Phase 4");
  assert.equal(publicPayload.paymentCode, paymentCode);
  assert.equal(publicPayload.amount, receivable.amountDue);
  assert.equal(publicPayload.paid, false, "chưa có giao dịch nào nên chưa thanh toán");

  const wrongToken = `${receivable.publicToken.slice(0, -1)}${receivable.publicToken.at(-1) === "0" ? "1" : "0"}`;
  const wrongTokenResponse = await request(`/api/public/payment/${receivable.id}/${wrongToken}`);
  assert.equal(wrongTokenResponse.status, 404, "sai token phải bị từ chối");

  // #7 — QR công khai mang đúng mã: so khớp byte-for-byte với vietQrSvg dựng từ đúng tham số.
  const qrResponse = await request(`/api/public/payment-qr/${receivable.id}/${receivable.publicToken}`);
  assert.equal(qrResponse.status, 200);
  assert.equal(qrResponse.headers.get("content-type")?.includes("image/svg+xml"), true);
  const svgText = await qrResponse.text();
  const expectedSvg = vietQrSvg({
    bankId: defaultSepaySettings.bank,
    accountNumber: defaultSepaySettings.accountNumber,
    accountName: defaultSepaySettings.accountName,
    amount: receivable.amountDue,
    addInfo: paymentCode,
  });
  assert.equal(svgText, expectedSvg, "SVG trả về phải mang đúng mã thanh toán và số tiền của khoản phải thu");
  const wrongTokenQr = await request(`/api/public/payment-qr/${receivable.id}/${wrongToken}`);
  assert.equal(wrongTokenQr.status, 404);

  // #1 — chuỗi thật (mã do request-payment sinh ra) đối soát được qua webhook, không rơi vào UNMATCHED.
  // Mặc định chưa cấu hình qua UI là API_KEY (Q2), nên env.SEPAY_WEBHOOK_SECRET đóng vai trò token.
  const webhookBody = JSON.stringify({ id: "tx-phase4-1", content: `CK hoc phi ${paymentCode} thang 9`, transferAmount: receivable.amountDue });
  const webhookResponse = await request("/api/webhooks/sepay", { method: "POST", headers: { Authorization: `Apikey ${secret}` }, body: webhookBody });
  assert.equal(webhookResponse.status, 200);
  const finance = await (await request("/api/finance", { headers })).json() as {
    finance: { sepay: { bankTransactions: Array<{ providerTransactionId: string; status: string }>; receivables: Array<{ id: string; status: string }> } };
  };
  const tx = finance.finance.sepay.bankTransactions.find((row) => row.providerTransactionId === "tx-phase4-1");
  assert.equal(tx?.status, "ALLOCATED", "giao dịch phải khớp ALLOCATED, tuyệt đối không phải UNMATCHED (Đ1)");
  assert.equal(finance.finance.sepay.receivables.find((row) => row.id === receivable.id)?.status, "PAID");

  // Token cũ vẫn mở được sau khi đã thanh toán, chỉ đổi trạng thái hiển thị.
  const afterPaidResponse = await request(publicPath);
  assert.equal(afterPaidResponse.status, 200, "mở lại link cũ sau khi đã thanh toán vẫn phải ra trang, không lỗi");
  const afterPaidPayload = await afterPaidResponse.json() as { paid: boolean };
  assert.equal(afterPaidPayload.paid, true);
});

test("Phase 5: webhook khớp tiền kích hoạt buổi học ngay trong lượt đó, và bắn lặp 3 lần không cộng buổi lần hai", async () => {
  const secret = "whsec-activate";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{ id: "student-activate", code: "HV0601", fullName: "Học viên Kích hoạt", status: "STUDYING", sessionBalances: {} }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({
      syncFinance: false,
      // courseStartDate trong tương lai so với thời điểm chạy test, để chargedCourseSessions
      // luôn bằng 0 — kết quả không phụ thuộc vào ngày chạy test thật.
      items: [{
        id: "class-activate", code: "ACT", name: "Lớp kích hoạt", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: ["student-activate"], billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 24,
        courseStartDate: "2027-06-01", schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
      }],
    }),
  });

  const requested = await request("/api/finance/sepay", {
    method: "POST", headers,
    body: JSON.stringify({ action: "request-payment", studentId: "student-activate", classId: "class-activate" }),
  });
  assert.equal(requested.status, 200);
  const requestedPayload = await requested.json() as {
    receivable: { id: string; amountDue: number; paymentOrderId: string };
    finance: { sepay: { paymentOrders: Array<{ id: string; paymentCode: string }> } };
  };
  const receivable = requestedPayload.receivable;
  const order = requestedPayload.finance.sepay.paymentOrders.find((item) => item.id === receivable.paymentOrderId);
  assert.ok(order);
  assert.equal(receivable.amountDue, 24 * 100_000, "24 buổi của khóa, đúng bằng tuitionCollectionCharge");

  const webhookBody = JSON.stringify({ id: "tx-activate-1", content: order!.paymentCode, transferAmount: receivable.amountDue });
  const authHeaders = { Authorization: `Apikey ${secret}` };

  const first = await request("/api/webhooks/sepay", { method: "POST", headers: authHeaders, body: webhookBody });
  assert.equal(first.status, 200);

  const studentsAfterFirst = await (await request("/api/students", { headers })).json() as { items: Array<{ id: string; sessionBalances?: Record<string, number> }> };
  assert.equal(studentsAfterFirst.items.find((row) => row.id === "student-activate")?.sessionBalances?.["class-activate"], 24, "sessionBalances phải đúng ngay trong lượt webhook đó, không cần tải lại trang");

  const financeAfterFirst = await (await request("/api/finance", { headers })).json() as {
    finance: { sepay: { bankTransactions: Array<{ providerTransactionId: string; status: string }>; receipts: Array<{ id: string; paymentId: string; studentId: string; classId?: string; billingMode?: string; materialsAmount?: number }>; invoices: Array<{ paymentId: string; status: string }> } };
  };
  const tx = financeAfterFirst.finance.sepay.bankTransactions.find((row) => row.providerTransactionId === "tx-activate-1");
  assert.equal(tx?.status, "ALLOCATED");
  const receipts = financeAfterFirst.finance.sepay.receipts.filter((row) => row.studentId === "student-activate");
  assert.equal(receipts.length, 1, "đúng một biên lai");
  assert.equal(receipts[0]?.classId, "class-activate", "biên lai webhook phải mang classId — dấu hiệu đã kích hoạt xong");
  assert.equal(receipts[0]?.billingMode, "COURSE");
  assert.equal(receipts[0]?.materialsAmount, 0);

  const invoiceForReceipt = financeAfterFirst.finance.sepay.invoices.find((row) => row.paymentId === receipts[0]?.paymentId);
  assert.equal(invoiceForReceipt?.status, "PENDING", "webhook chỉ xếp hàng đợi HĐĐT (PENDING), không tự xuất hóa đơn — outbox xử lý riêng, ngoài đường webhook");

  const auditAfterFirst = await (await request("/api/bootstrap", { headers })).json() as { auditLogs: Array<{ summary: string }> };
  assert.ok(auditAfterFirst.auditLogs.some((row) => row.summary.includes("Webhook SePay tự kích hoạt")), "phải có audit riêng cho lượt webhook tự kích hoạt");

  const second = await request("/api/webhooks/sepay", { method: "POST", headers: authHeaders, body: webhookBody });
  const third = await request("/api/webhooks/sepay", { method: "POST", headers: authHeaders, body: webhookBody });
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  const secondPayload = await second.json() as { duplicate?: boolean };
  assert.equal(secondPayload.duplicate, true, "SePay gửi lại cùng providerTransactionId phải bị nhận diện trùng");

  const studentsAfterReplay = await (await request("/api/students", { headers })).json() as { items: Array<{ id: string; sessionBalances?: Record<string, number> }> };
  assert.equal(studentsAfterReplay.items.find((row) => row.id === "student-activate")?.sessionBalances?.["class-activate"], 24, "bắn lặp 3 lần không được cộng buổi lần hai");

  const financeAfterReplay = await (await request("/api/finance", { headers })).json() as {
    finance: { sepay: { receipts: Array<{ studentId: string }> } };
  };
  assert.equal(financeAfterReplay.finance.sepay.receipts.filter((row) => row.studentId === "student-activate").length, 1, "vẫn chỉ một biên lai sau khi bắn lặp 3 lần");
});

test("Phase 7: gửi yêu cầu thanh toán xếp đúng một tin Zalo QUEUED, webhook callback cần chữ ký hợp lệ, retry chỉ áp cho dòng FAILED", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  const zaloAppSecret = "zalo-app-secret-phase7";
  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify({
      sepay: { webhookMode: "API_KEY", webhookSecret: "" },
      misa: { enabled: false, baseUrl: "", clientId: "", clientSecret: "", taxCode: "", username: "", password: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
      zalo: {
        enabled: true, appId: "app-phase7", appSecret: zaloAppSecret, oaId: "oa-phase7", refreshToken: "refresh-token-phase7",
        templateIdPaymentRequest: "tpl-payment-request", templateIdInvoiceIssued: "tpl-invoice-issued",
      },
    }),
  });

  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{
      id: "student-phase7", code: "HV0701", fullName: "Học viên Phase 7", status: "STUDYING",
      parentPhone1: "0912345678", sessionBalances: {},
    }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({
      syncFinance: false,
      items: [{
        id: "class-phase7", code: "P7", name: "Lớp Phase 7", status: "ACTIVE", teacherId: "teacher-vps",
        studentIds: ["student-phase7"], billingMode: "COURSE", sessionPrice: 120_000, courseSessions: 24,
        courseStartDate: "2026-09-02", schedules: [{ weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" }],
      }],
    }),
  });

  // Chặn hẳn mọi lệnh gọi mạng thật ra ngoài cho tới cuối test — hàng chờ Zalo được bắn
  // "rồi quên" (không await) ngay sau khi ghi khối tài chính, nên có thể còn chạy nền
  // trong lúc các bước sau của test này đang chạy; giữ mock tới hết test để không có
  // lệnh gọi mạng thật nào lọt ra được dù thứ tự thực thi bất định.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("không gọi mạng thật trong test"); }) as typeof fetch;
  try {
    const requested = await request("/api/finance/sepay", {
      method: "POST", headers,
      body: JSON.stringify({ action: "request-payment", studentId: "student-phase7", classId: "class-phase7" }),
    });
    assert.equal(requested.status, 200, "luồng chốt khoản phải thu không được vỡ dù hàng chờ Zalo gọi mạng lỗi");

    const listed = await (await request("/api/zalo-messages", { headers })).json() as { logs: Array<{ id: string; kind: string; status: string; templateId: string; phone: string }> };
    assert.equal(listed.logs.length, 1, "đúng một dòng được xếp cho một lần gửi yêu cầu thanh toán");
    const queuedLog = listed.logs[0]!;
    assert.equal(queuedLog.kind, "PAYMENT_REQUEST");
    assert.equal(queuedLog.templateId, "tpl-payment-request");
    assert.equal(queuedLog.phone, "84912345678");

    // Callback không chữ ký phải bị từ chối 401, không cập nhật gì.
    const badCallback = await request("/api/webhooks/zalo", { method: "POST", body: JSON.stringify({ msg_id: "msg-khong-lien-quan" }) });
    assert.equal(badCallback.status, 401);

    // Retry chỉ áp dụng cho dòng đang FAILED. Ghi thẳng một dòng SENT (trạng thái ổn định,
    // hàng chờ nền không đụng vào nữa) để kiểm chứng lớp bảo vệ này không phụ thuộc vào
    // thời điểm hàng chờ nền (bắn "rồi quên" ở request-payment) đã chạy xong hay chưa.
    await env.STEPS_LMS_DATA.put("zalo-messages:steps-demo", JSON.stringify([{ ...queuedLog, status: "SENT" }]));
    const retryOnSent = await request("/api/zalo-messages", { method: "POST", headers, body: JSON.stringify({ action: "retry", id: queuedLog.id }) });
    assert.equal(retryOnSent.status, 400, "chỉ dòng FAILED mới gửi lại được");

    // Webhook đúng chữ ký: đánh dấu DELIVERED và giữ lại nội dung gốc để xem ở Nhật ký Zalo.
    await env.STEPS_LMS_DATA.put("zalo-messages:steps-demo", JSON.stringify([{ ...queuedLog, status: "SENT", providerMsgId: "msg-webhook-1" }]));
    const webhookBody = JSON.stringify({ event_name: "user_received_message", msg_id: "msg-webhook-1" });
    const timestamp = String(Date.now());
    const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(zaloAppSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`app-phase7${webhookBody}${timestamp}`));
    const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const goodCallback = await request("/api/webhooks/zalo", { method: "POST", headers: { "x-zevent-signature": signature, "x-zevent-timestamp": timestamp }, body: webhookBody });
    assert.equal(goodCallback.status, 200);
    const delivered = (await (await request("/api/zalo-messages", { headers })).json() as { logs: Array<{ status: string; webhookAt?: string; webhookPayload?: string; deliveredAt?: string }> }).logs[0]!;
    assert.equal(delivered.status, "DELIVERED");
    assert.equal(delivered.webhookPayload, webhookBody);
    assert.ok(delivered.webhookAt && delivered.deliveredAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("thu tay chuyển khoản lập hóa đơn PENDING và xếp tin Zalo đã thanh toán; tiền mặt thì không", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify({
      sepay: { webhookMode: "API_KEY", webhookSecret: "" },
      misa: { enabled: false, baseUrl: "", clientId: "", clientSecret: "", taxCode: "", username: "", password: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
      zalo: { enabled: true, appId: "app-manual", appSecret: "secret-manual", oaId: "oa-manual", refreshToken: "refresh-manual", templateIdPaymentRequest: "tpl-payment-request", templateIdInvoiceIssued: "tpl-invoice-issued" },
    }),
  });
  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [
      { id: "student-manual-a", code: "HV0801", fullName: "Học viên CK", status: "STUDYING", parentPhone1: "0912345678", sessionBalances: {} },
      { id: "student-manual-b", code: "HV0802", fullName: "Học viên tiền mặt", status: "STUDYING", parentPhone1: "0912345679", sessionBalances: {} },
    ] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ syncFinance: false, items: [{
      id: "class-manual", code: "M1", name: "Lớp thu tay", status: "ACTIVE", teacherId: "teacher-vps",
      studentIds: ["student-manual-a", "student-manual-b"], billingMode: "COURSE", sessionPrice: 120_000, courseSessions: 24,
      courseStartDate: "2026-09-02", schedules: [{ weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("không gọi mạng thật trong test"); }) as typeof fetch;
  try {
    const transfer = await request("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action: "collect", studentId: "student-manual-a", classId: "class-manual", method: "TRANSFER" }) });
    assert.equal(transfer.status, 200);
    const transferBody = await transfer.json() as { finance: { sepay: { invoices: Array<{ studentId: string; status: string; buyerName: string }> } }; zaloMessage?: { queued: boolean } };
    assert.equal(transferBody.finance.sepay.invoices.filter((row) => row.studentId === "student-manual-a").length, 1);
    assert.equal(transferBody.finance.sepay.invoices[0]?.buyerName, "Học viên CK");
    assert.equal(transferBody.zaloMessage?.queued, true);

    const cash = await request("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action: "collect", studentId: "student-manual-b", classId: "class-manual", method: "CASH" }) });
    assert.equal(cash.status, 200);
    const cashBody = await cash.json() as { finance: { sepay: { invoices: Array<{ studentId: string }> } }; zaloMessage?: unknown };
    assert.equal(cashBody.finance.sepay.invoices.filter((row) => row.studentId === "student-manual-b").length, 0);
    assert.equal(cashBody.zaloMessage, undefined);

    const listed = await (await request("/api/zalo-messages", { headers })).json() as { logs: Array<{ kind: string; studentId: string }> };
    assert.deepEqual(listed.logs.map((row) => [row.kind, row.studentId]), [["INVOICE_ISSUED", "student-manual-a"]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("thu tay chuyển khoản: gửi Zalo rồi tự dựng bản nháp MISA, hóa đơn vẫn chờ duyệt (chưa phát hành)", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify({
      sepay: { webhookMode: "API_KEY", webhookSecret: "" },
      misa: {
        enabled: true, issueEnabled: true, baseUrl: "https://testapi.meinvoice.vn", clientId: "app-draft", clientSecret: "misa-secret-draft",
        taxCode: "0312345678", username: "steps-api", password: "misa-password-draft", invSeries: "1C26TYY", invTemplateNo: "1", taxRateLabel: "KCT",
      },
      zalo: { enabled: true, appId: "app-draft", appSecret: "secret-draft", oaId: "oa-draft", refreshToken: "refresh-draft", templateIdPaymentRequest: "tpl-payment-request", templateIdInvoiceIssued: "tpl-invoice-issued" },
    }),
  });
  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{ id: "student-draft", code: "HV0951", fullName: "Học viên Nháp", parentName: "Phụ huynh Nháp", status: "STUDYING", parentPhone1: "0912345671", sessionBalances: {} }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ syncFinance: false, items: [{
      id: "class-draft", code: "ND", name: "Lớp nháp", status: "ACTIVE", teacherId: "teacher-vps",
      studentIds: ["student-draft"], billingMode: "COURSE", sessionPrice: 120_000, courseSessions: 24,
      courseStartDate: "2026-09-02", schedules: [{ weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const target = String(url);
    calls.push(target.includes("oauth.zaloapp.com") ? "zalo-token" : target.includes("openapi.zalo.me") ? "zalo-send" : target.replace("https://testapi.meinvoice.vn", "misa:"));
    if (target.includes("oauth.zaloapp.com")) return new Response(JSON.stringify({ access_token: "acc", refresh_token: "refresh-draft", expires_in: 3600 }), { status: 200 });
    if (target.includes("openapi.zalo.me")) return new Response(JSON.stringify({ error: 0, message: "Success", data: { msg_id: "msg-draft", sent_time: "1700000000000" } }), { status: 200 });
    if (target.endsWith("/invoice/token")) return new Response(JSON.stringify({ Success: true, Data: "jwt-draft" }), { status: 200 });
    if (target.endsWith("/invoice/unpublishview")) return new Response(JSON.stringify({ Success: true, Data: "https://misa.test/preview/draft" }), { status: 200 });
    throw new Error(`không được gọi ${target}`);
  }) as typeof fetch;
  try {
    const collected = await request("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action: "collect", studentId: "student-draft", classId: "class-draft", method: "TRANSFER" }) });
    assert.equal(collected.status, 200);

    type Invoice = { studentId: string; status: string; approvedAt?: string; previewHash?: string };
    const readInvoice = async () => ((await (await request("/api/finance", { headers })).json()) as { finance: { sepay: { invoices: Invoice[] } } }).finance.sepay.invoices.find((row) => row.studentId === "student-draft");
    // Nháp dựng ở nền sau khi Zalo gửi xong: chờ tới khi có previewHash.
    let saved = await readInvoice();
    for (let attempt = 0; attempt < 40 && !saved?.previewHash; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      saved = await readInvoice();
    }
    assert.match(saved?.previewHash || "", /^[0-9a-f]{64}$/, "bản nháp phải được tự dựng ngay sau khi thu tiền");
    assert.equal(saved?.status, "PENDING");
    assert.equal(saved?.approvedAt, undefined, "chưa có kế toán bấm xuất thì không được duyệt/phát hành");
    assert.ok(calls.indexOf("zalo-send") !== -1 && calls.indexOf("zalo-send") < calls.indexOf("misa:/invoice/unpublishview"), "Zalo gửi trước, nháp MISA sau");
    assert.ok(!calls.includes("misa:/invoice/publish"), "không có lệnh phát hành thật");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webhook SePay khớp đủ tiền luôn xếp tin Zalo \"đã thanh toán\", kể cả khi MISA tắt", async () => {
  const secret = "whsec-paid-notice";
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: secret });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/integrations", {
    method: "PUT", headers,
    body: JSON.stringify({
      sepay: { webhookMode: "API_KEY", webhookSecret: "" },
      misa: { enabled: false, baseUrl: "", clientId: "", clientSecret: "", taxCode: "", username: "", password: "", invSeries: "", invTemplateNo: "", taxRateLabel: "" },
      zalo: { enabled: true, appId: "app-paid", appSecret: "secret-paid", oaId: "oa-paid", refreshToken: "refresh-paid", templateIdPaymentRequest: "tpl-payment-request", templateIdInvoiceIssued: "tpl-invoice-issued" },
    }),
  });
  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{ id: "student-paid", code: "HV0901", fullName: "Học viên SePay", status: "STUDYING", parentPhone1: "0912345670", sessionBalances: {} }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ syncFinance: false, items: [{
      id: "class-paid", code: "SP", name: "Lớp SePay", status: "ACTIVE", teacherId: "teacher-vps",
      studentIds: ["student-paid"], billingMode: "COURSE", sessionPrice: 120_000, courseSessions: 24,
      courseStartDate: "2026-09-02", schedules: [{ weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("không gọi mạng thật trong test"); }) as typeof fetch;
  try {
    const requested = await (await request("/api/finance/sepay", {
      method: "POST", headers, body: JSON.stringify({ action: "request-payment", studentId: "student-paid", classId: "class-paid" }),
    })).json() as { receivable: { amountDue: number; paymentOrderId: string }; finance: { sepay: { paymentOrders: Array<{ id: string; paymentCode: string }> } } };
    const paymentCode = requested.finance.sepay.paymentOrders.find((row) => row.id === requested.receivable.paymentOrderId)!.paymentCode;
    const webhook = await request("/api/webhooks/sepay", {
      method: "POST", headers: { Authorization: `Apikey ${secret}` },
      body: JSON.stringify({ id: "tx-paid-1", content: `CK ${paymentCode}`, transferAmount: requested.receivable.amountDue }),
    });
    assert.equal(webhook.status, 200);
    const listed = await (await request("/api/zalo-messages", { headers })).json() as { logs: Array<{ kind: string; studentId: string; templateId: string }> };
    const paid = listed.logs.filter((row) => row.kind === "INVOICE_ISSUED" && row.studentId === "student-paid");
    assert.equal(paid.length, 1, "đúng một tin \"đã thanh toán\" cho giao dịch vừa khớp");
    assert.equal(paid[0]!.templateId, "tpl-invoice-issued");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("thêm học viên vào lớp stamp classJoinedAt; lưu lại lớp không ghi đè ngày", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const today = new Date().toISOString().slice(0, 10);

  await request("/api/students", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [
      { id: "student-join", code: "HV9001", fullName: "Vào Lớp Muộn", status: "STUDYING" },
      { id: "student-old", code: "HV9002", fullName: "Học Viên Cũ", status: "STUDYING", classJoinedAt: { "class-join": "2026-09-01" } },
    ] }),
  });
  // Tạo lớp mới với student-old → stamp; thêm student-join sau → cũng stamp.
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{
      id: "class-join", code: "J1", name: "Lớp stamp ngày", status: "ACTIVE",
      studentIds: ["student-old"], billingMode: "MONTHLY", sessionPrice: 50_000, courseSessions: 24,
      schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{
      id: "class-join", code: "J1", name: "Lớp stamp ngày", status: "ACTIVE",
      studentIds: ["student-old", "student-join"], billingMode: "MONTHLY", sessionPrice: 50_000, courseSessions: 24,
      schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });

  let students = (await (await request("/api/students", { headers })).json()) as {
    items: Array<{ id: string; classJoinedAt?: Record<string, string> }>;
  };
  // student-old đã có joinDate từ seed — không bị ghi đè bởi lần tạo lớp.
  assert.equal(students.items.find((s) => s.id === "student-old")?.classJoinedAt?.["class-join"], today,
    "id mới vào studentIds phải được stamp hôm nay (ghi đè mốc seed vì đây là lần đầu vào lớp này)");
  assert.equal(students.items.find((s) => s.id === "student-join")?.classJoinedAt?.["class-join"], today);

  // Lưu lại lớp lần nữa (không đổi studentIds) → joinDate giữ nguyên.
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [{
      id: "class-join", code: "J1", name: "Lớp stamp ngày đổi tên", status: "ACTIVE",
      studentIds: ["student-old", "student-join"], billingMode: "MONTHLY", sessionPrice: 50_000, courseSessions: 24,
      schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
    }] }),
  });
  students = (await (await request("/api/students", { headers })).json()) as typeof students;
  assert.equal(students.items.find((s) => s.id === "student-join")?.classJoinedAt?.["class-join"], today);

  // Chuyển lớp stamp ngày vào lớp đích.
  await request("/api/classes", {
    method: "PUT", headers,
    body: JSON.stringify({ items: [
      {
        id: "class-join", code: "J1", name: "Lớp stamp ngày đổi tên", status: "ACTIVE",
        studentIds: ["student-old", "student-join"], billingMode: "MONTHLY", sessionPrice: 50_000, courseSessions: 24,
        schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
      },
      {
        id: "class-target", code: "J2", name: "Lớp đích", status: "ACTIVE",
        studentIds: [], billingMode: "MONTHLY", sessionPrice: 50_000, courseSessions: 24,
        schedules: [{ weekday: 5, periodId: "fri", startTime: "17:00", endTime: "19:00" }],
      },
    ] }),
  });
  const moved = await request("/api/classes/transfer-student", {
    method: "POST", headers,
    body: JSON.stringify({ sourceClassId: "class-join", targetClassId: "class-target", studentId: "student-join" }),
  });
  assert.equal(moved.status, 200);
  students = (await (await request("/api/students", { headers })).json()) as typeof students;
  const joinStudent = students.items.find((s) => s.id === "student-join");
  assert.equal(joinStudent?.classJoinedAt?.["class-target"], today, "chuyển lớp phải stamp lớp đích");
});

test("accountant views all operational data but can only write attendance", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`http://vps.test${path}`, init),
    env as never,
  );
  const adminLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const adminCookie = adminLogin.headers.get("set-cookie")?.split(";", 1)[0];
  const adminHeaders = { Cookie: adminCookie!, "Content-Type": "application/json" };

  const seeded = await request("/api/accountants", {
    method: "PUT", headers: adminHeaders,
    body: JSON.stringify({ items: [
      { id: "accountant-1", code: "KT0001", fullName: "Nguyen Van Ke Toan", phone: "0900000000", address: "", email: "ketoan@steps.edu.vn" },
    ] }),
  });
  assert.equal(seeded.status, 200);
  await request("/api/classes", {
    method: "PUT", headers: adminHeaders,
    body: JSON.stringify({ items: [
      {
        id: "class-acc", code: "ACC", name: "Lớp kế toán điểm danh", status: "ACTIVE",
        studentIds: ["student-acc"], billingMode: "COURSE", sessionPrice: 0, courseSessions: 24, billingEnabled: false,
        schedules: [{ weekday: 3, periodId: "wed", startTime: "17:00", endTime: "19:00" }],
      },
    ] }),
  });
  await request("/api/students", {
    method: "PUT", headers: adminHeaders,
    body: JSON.stringify({ items: [
      { id: "student-acc", code: "HV9901", fullName: "Học viên kế toán", status: "STUDYING" },
    ] }),
  });

  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "nguyenvanketoan", password: "123456789" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  const bootstrap = await request("/api/bootstrap", { headers });
  const bootstrapData = await bootstrap.json() as { user: { role: string } };
  assert.equal(bootstrapData.user.role, "ACCOUNTANT");

  // Xem toàn bộ dữ liệu vận hành và tài chính.
  for (const path of ["/api/students", "/api/classes", "/api/teachers", "/api/lesson-sessions", "/api/finance"]) {
    assert.equal((await request(path, { headers })).status, 200, `GET ${path}`);
  }

  // Điểm danh thay giáo viên: upsert buổi học được phép và lưu thật.
  const session = {
    id: "session-acc", classId: "class-acc", date: "2026-09-16", startTime: "17:00", endTime: "19:00",
    teacherId: "teacher-acc", status: "COMPLETED", recurrenceKey: "class-acc|2026-09-16|17:00",
    attendance: [{ studentId: "student-acc", status: "PRESENT" }],
  };
  const upsert = await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: session }) });
  assert.equal(upsert.status, 200);
  // Kế toán điểm danh thay giáo viên nên bị chặn tạo nghỉ học vụ giống giáo viên.
  const adminOff = await request("/api/lesson-sessions/upsert", {
    method: "POST", headers,
    body: JSON.stringify({ item: { ...session, id: "session-acc-off", isOff: true, offSource: "ADMIN" } }),
  });
  assert.equal(adminOff.status, 403);
  const reread = await request("/api/lesson-sessions", { headers });
  const sessions = await reread.json() as { items: Array<{ id: string; attendance: Array<{ status: string | null }> }> };
  assert.equal(sessions.items.find((row) => row.id === "session-acc")?.attendance[0]?.status, "PRESENT");

  // Mọi thao tác ghi vận hành khác đều bị chặn.
  const deniedWrites: Array<[string, unknown]> = [
    ["/api/students", { items: [] }],
    ["/api/teachers", { items: [] }],
    ["/api/accountants", { items: [] }],
    ["/api/assistants", { items: [] }],
    ["/api/classes", { items: [] }],
    ["/api/lesson-sessions", { items: [] }],
    ["/api/settings", { items: [] }],
  ];
  for (const [path, body] of deniedWrites) {
    assert.equal(
      (await request(path, { method: "PUT", headers, body: JSON.stringify(body) })).status,
      403,
      `PUT ${path}`,
    );
  }
  assert.equal(
    (await request("/api/classes/transfer-student", {
      method: "POST", headers,
      body: JSON.stringify({ sourceClassId: "class-acc", targetClassId: "class-acc", studentId: "student-acc" }),
    })).status,
    403,
  );
  assert.equal(
    (await request("/api/periodic-reports/upsert", { method: "POST", headers, body: JSON.stringify({ item: {} }) })).status,
    403,
  );
  assert.equal((await request("/api/audit-logs", { headers })).status, 403);

  // Kế toán vẫn làm việc được trên dữ liệu tài chính.
  const sepayUpdate = await request("/api/finance/sepay", {
    method: "POST", headers,
    body: JSON.stringify({ action: "update-settings", bank: "MB", accountNumber: "0123456789", accountName: "STEPS", qrImageDataUrl: "" }),
  });
  assert.equal(sepayUpdate.status, 200);
});

test("Lớp khóa: Gửi yêu cầu thanh toán gửi phiếu KHÓA HIỆN TẠI, số tiền cộng dồn nợ khóa cũ", async () => {
  const env = testEnv({ SEPAY_WEBHOOK_SECRET: "whsec-course-bundle" });
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0], "Content-Type": "application/json" };
  // Khóa 4 buổi, học thứ 3 hằng tuần, bắt đầu 6 tuần trước (sau mốc dùng hệ thống) → đang ở khóa 2.
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 42, 12);
  while (start.getDay() !== 2) start.setDate(start.getDate() + 1);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ syncFinance: false, items: [{
    id: "class-bundle", code: "B1", name: "Lớp gộp", status: "ACTIVE", teacherId: "teacher-vps", studentIds: ["st-bundle"], billingMode: "COURSE",
    sessionPrice: 100_000, courseSessions: 4, courseStartDate: startKey, schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
  }] }) });
  // Học viên học từ khóa 1 (mốc vào lớp = ngày khai giảng).
  await request("/api/students", { method: "PUT", headers, body: JSON.stringify({ items: [{ id: "st-bundle", code: "HV0777", fullName: "Gộp Khóa", status: "STUDYING", parentPhone1: "0909222333", sessionBalances: {}, classJoinedAt: { "class-bundle": startKey } }] }) });
  const requested = await request("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action: "request-payment", studentId: "st-bundle", classId: "class-bundle" }) });
  assert.equal(requested.status, 200);
  const payload = await requested.json() as { receivable: { id: string; billKey: string; publicToken: string; balanceDue: number }; finance: { sepay: { receivables: Array<{ billKey: string; frozenAt?: string; status: string; studentId: string }> } } };
  assert.equal(payload.receivable.billKey, "course|class-bundle|2", "gửi phiếu khóa hiện tại, không phải khóa 1");
  assert.equal(payload.receivable.balanceDue, 400_000, "phiếu khóa 2 vẫn là phiếu riêng 400k");
  const k1 = payload.finance.sepay.receivables.find((row) => row.studentId === "st-bundle" && row.billKey === "course|class-bundle" && row.status !== "CANCELLED");
  assert.ok(k1?.frozenAt, "phiếu khóa 1 còn nợ được chốt cùng yêu cầu");
  const publicPayload = await (await request(`/api/public/payment/${payload.receivable.id}/${payload.receivable.publicToken}`)).json() as { amount: number };
  assert.equal(publicPayload.amount, 800_000, "số cần chuyển = khóa 2 + nợ khóa 1");
});

test("Gửi lại yêu cầu thanh toán: phiếu đã chốt (đã gửi) giữ nguyên số đã chốt, không tính lại theo giá mới", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/students", { method: "PUT", headers, body: JSON.stringify({ items: [{ id: "st-resend", code: "HV0777", fullName: "Gửi Lại", status: "STUDYING", sessionBalances: {} }] }) });
  const classItem = (price: number) => ({
    id: "class-resend", code: "RS", name: "Lớp gửi lại", status: "ACTIVE", teacherId: "teacher-vps", studentIds: ["st-resend"],
    billingMode: "COURSE", sessionPrice: price, courseSessions: 24, courseStartDate: "2026-09-01",
    schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }],
  });
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ syncFinance: false, items: [classItem(150_000)] }) });
  const send = async () => {
    const response = await request("/api/finance/sepay", { method: "POST", headers, body: JSON.stringify({ action: "request-payment", studentId: "st-resend", classId: "class-resend" }) });
    assert.equal(response.status, 200);
    return (await response.json() as { receivable: { id: string; amountDue: number; balanceDue: number } }).receivable;
  };
  const first = await send();
  assert.ok(first.amountDue > 0);
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ syncFinance: false, items: [classItem(200_000)] }) });
  const again = await send();
  assert.equal(again.id, first.id);
  assert.equal(again.amountDue, first.amountDue, "phiếu đã gửi giữ số đã chốt");
  assert.equal(again.balanceDue, first.amountDue);
});

test("kế toán sửa được hồ sơ học viên nhưng không đổi miễn học phí, không tạo mới, không xoá", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const adminLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const admin = { Cookie: adminLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/accountants", { method: "PUT", headers: admin, body: JSON.stringify({ items: [{ id: "acc-1", code: "KT0001", fullName: "Bùi Thị Hiền", phone: "", address: "", email: "" }] }) });
  const created = await request("/api/students", { method: "PATCH", headers: admin, body: JSON.stringify({ item: { id: "st-1", code: "HV0001", fullName: "Khánh An", status: "STUDYING", tuitionExempt: false, note: "" } }) });
  assert.equal(created.status, 200);
  const accLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "buithihien", password: "123456789" }) });
  assert.equal(accLogin.status, 200);
  const acc = { Cookie: accLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const edited = await request("/api/students", { method: "PATCH", headers: acc, body: JSON.stringify({ item: { id: "st-1", code: "HV0001", fullName: "Khánh An Nguyễn", status: "STUDYING", tuitionExempt: true, note: "Đã gọi phụ huynh" } }) });
  assert.equal(edited.status, 200);
  const saved = ((await edited.json()) as { item: { fullName: string; note: string; tuitionExempt?: boolean } }).item;
  assert.equal(saved.fullName, "Khánh An Nguyễn");
  assert.equal(saved.note, "Đã gọi phụ huynh");
  assert.ok(!saved.tuitionExempt, "kế toán không bật được miễn học phí");
  const create = await request("/api/students", { method: "PATCH", headers: acc, body: JSON.stringify({ item: { id: "st-new", code: "HV0002", fullName: "Mới", status: "STUDYING" } }) });
  assert.equal(create.status, 403);
  const wipe = await request("/api/students", { method: "PUT", headers: acc, body: JSON.stringify({ items: [] }) });
  assert.equal(wipe.status, 403);
});

test("trợ giảng không xoá được cột điểm giáo viên đã lưu, vẫn nhập được điểm", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/lesson-sessions", { method: "PUT", headers, body: JSON.stringify({ items: [] }) });
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ syncFinance: false, items: [
    { id: "class-a", code: "A", name: "Lớp A", status: "ACTIVE", teacherId: "teacher-a", studentIds: ["student-a"], schedules: [], billingMode: "COURSE", sessionPrice: 0, courseSessions: 24, billingEnabled: false },
  ] }) });
  await request("/api/assistants", { method: "PUT", headers, body: JSON.stringify({ items: [{ id: "as-1", code: "TG01", fullName: "Trợ Giảng Một", phone: "", address: "", email: "" }] }) });
  const session = {
    id: "session-a", classId: "class-a", date: "2026-11-10", startTime: "17:00", endTime: "19:00", teacherId: "teacher-a", status: "COMPLETED", recurrenceKey: "class-a|2026-11-10|17:00",
    assessmentColumns: [{ id: "speaking", name: "Speaking" }],
    attendance: [{ studentId: "student-a", status: "PRESENT", vocabularyScore: null, assessmentScores: { speaking: "9" } }],
  };
  assert.equal((await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: session }) })).status, 200);
  const asLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "trogiangmot", password: "strong-test-password" }) });
  assert.equal(asLogin.status, 200);
  const asHeaders = { Cookie: asLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const saved = await request("/api/lesson-sessions/upsert", { method: "POST", headers: asHeaders, body: JSON.stringify({
    item: { ...session, assessmentColumns: [], attendance: [{ studentId: "student-a", status: "PRESENT", vocabularyScore: "18/20", assessmentScores: {} }] },
    removedAssessmentColumnIds: ["speaking"],
  }) });
  assert.equal(saved.status, 200);
  const payload = await (await request("/api/lesson-sessions", { headers })).json() as { items: Array<{ assessmentColumns?: Array<{ id: string }>; attendance: Array<{ vocabularyScore?: string | null; assessmentScores?: Record<string, string> }> }> };
  assert.deepEqual(payload.items[0]?.assessmentColumns?.map((column) => column.id), ["speaking"]);
  assert.equal(payload.items[0]?.attendance[0]?.assessmentScores?.speaking, "9");
  assert.equal(payload.items[0]?.attendance[0]?.vocabularyScore, "18/20");
});

test("Hành chính sửa được thông tin trung tâm / chi nhánh, không đổi gói học phí; kế toán thường bị chặn", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = async (email: string, password: string) => {
    const res = await request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 200, email);
    return { Cookie: res.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  };
  const admin = await login("admin@steps.vn", "strong-test-password");
  await request("/api/accountants", { method: "PUT", headers: admin, body: JSON.stringify({ items: [
    { id: "acc-hc", code: "KT01", fullName: "Nguyễn Thị Bích Liễu", phone: "", address: "", email: "" },
    { id: "acc-kt", code: "KT02", fullName: "Bùi Thị Hiền", phone: "", address: "", email: "" },
  ] }) });
  const current = ((await (await request("/api/settings", { headers: admin })).json()) as { settings: Record<string, any> }).settings;
  const classTypeId = current.classTypes[0].id;
  const base = { ...current, tuitionPackages: [{ id: "pkg-1", classTypeId, name: "Khoá 24", sessions: 24, amount: 2_400_000 }] };
  assert.equal((await request("/api/settings", { method: "PUT", headers: admin, body: JSON.stringify(base) })).status, 200);
  const hc = await login("nguyenthibichlieu", "123456789");
  const edited = await request("/api/settings", { method: "PUT", headers: hc, body: JSON.stringify({
    ...base, center: { ...base.center, phone: "0999 000 111" }, branches: [...base.branches, { id: "branch-new", name: "Chi nhánh mới" }], tuitionPackages: [],
  }) });
  assert.equal(edited.status, 200);
  const saved = ((await edited.json()) as { settings: Record<string, any> }).settings;
  assert.equal(saved.center.phone, "0999 000 111");
  assert.ok(saved.branches.some((row: { id: string }) => row.id === "branch-new"));
  assert.deepEqual(saved.tuitionPackages.map((row: { id: string }) => row.id), ["pkg-1"]);
  const kt = await login("buithihien", "123456789");
  assert.equal((await request("/api/settings", { method: "PUT", headers: kt, body: JSON.stringify(base) })).status, 403);
});

test("Trương Đức Nhật (hành chính) đăng nhập có toàn quyền admin", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const adminLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const admin = { Cookie: adminLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  await request("/api/accountants", { method: "PUT", headers: admin, body: JSON.stringify({ items: [
    { id: "accountant-d92ed31c-dfda-4183-a0a0-3f300ec92fe4", code: "KT0003", fullName: "Trương Đức Nhật", phone: "", address: "", email: "" },
    { id: "acc-kt", code: "KT0002", fullName: "Bùi Thị Hiền", phone: "", address: "", email: "" },
  ] }) });
  const nhat = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "truongducnhat", password: "123456789" }) });
  assert.equal(nhat.status, 200);
  assert.equal(((await nhat.json()) as { user: { role: string } }).user.role, "ADMIN");
  const headers = { Cookie: nhat.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  const boot = (await (await request("/api/bootstrap", { headers })).json()) as { user: { role: string; auditor: boolean } };
  assert.equal(boot.user.role, "ADMIN");
  assert.equal(boot.user.auditor, false);
  const hien = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "buithihien", password: "123456789" }) });
  assert.equal(((await hien.json()) as { user: { role: string } }).user.role, "ACCOUNTANT");
});
