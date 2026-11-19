import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";

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
    AUTH_SECRET: "class-transfer-test-secret-at-least-32-characters",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
}

test("admin transfers a student and preserves the remaining session balance", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };

  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "student-1", code: "HV0001", fullName: "Học sinh 1", status: "STUDYING", sessionBalances: { "class-a": 6 } }] }),
  });
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [
      { id: "class-a", code: "A", name: "Lớp A", status: "ACTIVE", studentIds: ["student-1"], courseSessions: 24 },
      { id: "class-b", code: "B", name: "Lớp B", status: "ACTIVE", studentIds: [], courseSessions: 24 },
    ] }),
  });

  const response = await request("/api/classes/transfer-student", {
    method: "POST",
    headers,
    body: JSON.stringify({ sourceClassId: "class-a", targetClassId: "class-b", studentId: "student-1" }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as {
    items: Array<{ id: string; studentIds: string[] }>;
    students: Array<{ id: string; sessionBalances?: Record<string, number> }>;
  };
  assert.deepEqual(result.items.find((row) => row.id === "class-a")?.studentIds, []);
  assert.deepEqual(result.items.find((row) => row.id === "class-b")?.studentIds, ["student-1"]);
  assert.deepEqual(result.students.find((row) => row.id === "student-1")?.sessionBalances, { "class-b": 6 });
});

test("xếp lại từ Lớp chờ vào đúng lớp cũ: không lập phiếu chênh lệch, giữ mốc vào lớp, trạng thái Đang học", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  const headers = { Cookie: cookie!, "Content-Type": "application/json" };
  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [{ id: "student-1", code: "HV0001", fullName: "Thúy", status: "STUDYING" }] }),
  });
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items: [
      { id: "class-a", code: "T2", name: "T2", status: "ACTIVE", billingMode: "MONTHLY", sessionPrice: 50_000, branchId: "b", studentIds: ["student-1"],
        schedules: [{ weekday: 5, startTime: "17:00", endTime: "18:30" }, { weekday: 0, startTime: "17:00", endTime: "18:30" }] },
      { id: "class-c", code: "T3", name: "T3", status: "ACTIVE", billingMode: "MONTHLY", sessionPrice: 100_000, branchId: "b", studentIds: [] },
    ] }),
  });
  const studentsBefore = await (await request("/api/students", { headers })).json() as { items: Array<{ id: string; classJoinedAt?: Record<string, string> }> };
  const joinedBefore = studentsBefore.items.find((row) => row.id === "student-1")?.classJoinedAt?.["class-a"];
  // Phiếu tháng đang chạy của lớp cũ — bạn đã được báo học phí tháng này.
  const month = new Date().toISOString().slice(0, 7);
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify({
    sepay: { settings: {}, receivables: [{ id: "recv-1", receivableCode: "HPT2HV0001", studentId: "student-1", studentName: "Thúy", classId: "class-a",
      billKey: `month|class-a|${month}`, billingPeriod: "Tháng này · T2", issueDate: `${month}-01`, dueDate: `${month}-01`,
      amountDue: 350_000, amountPaid: 0, balanceDue: 350_000, currency: "VND", status: "OPEN", paymentOrderId: "" }],
    paymentOrders: [], bankTransactions: [], payments: [], receipts: [], invoices: [], credits: [], webhookLogs: [] },
  }));

  const removed = await request("/api/classes/remove-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-a", studentId: "student-1" }) });
  assert.equal(removed.status, 200);
  const back = await request("/api/classes/transfer-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-waiting", targetClassId: "class-a", studentId: "student-1" }) });
  assert.equal(back.status, 200);
  const result = await back.json() as { finance: { sepay: { receivables: Array<{ billKey?: string; status: string }> } } };
  assert.equal(result.finance.sepay.receivables.filter((row) => String(row.billKey || "").startsWith("transfer|")).length, 0, "không lập phiếu chênh lệch Lớp chờ → lớp");

  const stored = (await (await request("/api/students", { headers })).json() as { items: Array<{ id: string; status: string; classJoinedAt?: Record<string, string> }> })
    .items.find((row) => row.id === "student-1");
  assert.equal(stored?.status, "STUDYING", "trạng thái Đang học được lưu");
  assert.equal(stored?.classJoinedAt?.["class-a"], joinedBefore, "giữ mốc vào lớp cũ — học phí như các bạn cùng lớp");
  assert.equal(stored?.classJoinedAt?.["class-waiting"], undefined, "bỏ mốc ngày về Lớp chờ");

  // Vào lớp MỚI từ Lớp chờ: không có chênh lệch chuyển lớp, mốc vào lớp = hôm nay.
  await request("/api/classes/remove-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-a", studentId: "student-1" }) });
  const fresh = await request("/api/classes/transfer-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-waiting", targetClassId: "class-c", studentId: "student-1" }) });
  const freshResult = await fresh.json() as { finance: { sepay: { receivables: Array<{ billKey?: string }> } }; students: Array<{ id: string; classJoinedAt?: Record<string, string> }> };
  assert.equal(freshResult.finance.sepay.receivables.filter((row) => String(row.billKey || "").startsWith("transfer|")).length, 0);
  assert.equal(freshResult.students.find((row) => row.id === "student-1")?.classJoinedAt?.["class-c"], new Date().toISOString().slice(0, 10));
});

test("đổi giáo viên một buổi trên Lịch dạy (upsert): giữ nguyên điểm danh, không còn ô Dạy thay", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0], "Content-Type": "application/json" };
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: [{ id: "class-a", code: "S9", name: "S9", status: "ACTIVE", teacherId: "teacher-chinh", studentIds: [] }] }) });
  const stored = { id: "session-1", classId: "class-a", date: "2026-10-21", startTime: "17:15", endTime: "19:15", teacherId: "teacher-chinh", status: "COMPLETED", isExtra: false,
    recurrenceKey: "class-a|2026-10-21|17:15", note: "", isOff: false, attendance: [{ studentId: "s1", status: "PRESENT" }] };
  await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: stored }) });
  const response = await request("/api/lesson-sessions/upsert", { method: "POST", headers, body: JSON.stringify({ item: { ...stored, teacherId: "teacher-thay", attendance: [] } }) });
  assert.equal(response.status, 200);
  const result = await response.json() as { item: { teacherId: string; attendance: Array<{ studentId: string; status: string }> } };
  assert.equal(result.item.teacherId, "teacher-thay");
  assert.deepEqual(result.item.attendance.map((row) => [row.studentId, row.status]), [["s1", "PRESENT"]], "điểm danh cũ giữ nguyên");

  const fs = await import("node:fs");
  const app = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /name="isSubstitute"/, "đã bỏ ô tick Dạy thay");
  assert.doesNotMatch(app, /refreshData\(/, "không gọi hàm không tồn tại sau khi lưu");
});

test("học viên mới (thêm tay / nhập Excel) vào Lớp chờ; tick nhiều bạn xếp vào lớp → rời Lớp chờ, Đang học", async () => {
  const env = testEnv();
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0], "Content-Type": "application/json" };
  await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: [
    { id: "class-k", code: "K", name: "Lớp K", status: "ACTIVE", studentIds: [], billingMode: "COURSE", courseSessions: 24, sessionPrice: 100000 },
  ] }) });
  const added = await (await request("/api/students", { method: "PATCH", headers, body: JSON.stringify({ item: { id: "s-new", code: "HV0001", fullName: "Bé Mới", status: "UNASSIGNED" } }) })).json() as any;
  const before = added.classes.find((row: any) => row.id === "class-waiting").studentIds;
  assert.ok(before.includes("s-new"));
  const html = `<table><tr><th>STT</th><th>Mã HV</th><th>Tên học viên</th><th>Số điện thoại</th></tr><tr><td>1</td><td></td><td>Bé Excel</td><td>0911222333</td></tr></table>`;
  const imported = await (await request("/api/students/import", { method: "POST", headers, body: JSON.stringify({ fileBase64: Buffer.from(html).toString("base64"), mode: "apply" }) })).json() as any;
  assert.equal(imported.created.length, 1);
  const waiting = imported.classes.find((row: any) => row.id === "class-waiting");
  assert.equal(waiting.studentIds.length, before.length + 1);
  const picked = ["s-new", imported.created[0].code && waiting.studentIds.at(-1)];
  // Xếp 2 bạn mới từ Lớp chờ vào lớp K (luồng tick nhiều bạn = PUT roster lớp đích).
  const classes = imported.classes.map((row: any) => row.id === "class-k" ? { ...row, studentIds: picked } : row);
  const put = await (await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: classes }) })).json() as any;
  const after = put.items.find((row: any) => row.id === "class-waiting").studentIds;
  assert.ok(picked.every((id) => !after.includes(id)), "rời Lớp chờ");
  assert.deepEqual(put.items.find((row: any) => row.id === "class-k").studentIds, picked);
  const students = (await (await request("/api/students", { headers })).json() as any).items;
  for (const id of picked) assert.equal(students.find((row: any) => row.id === id).status, "STUDYING");
  // Chuyển lớp từ Lớp chờ sang lớp thu khóa không bị chặn bởi "cùng loại thu phí".
  await request("/api/students", { method: "PATCH", headers, body: JSON.stringify({ item: { id: "s-3", code: "HV0009", fullName: "Bé Ba", status: "UNASSIGNED" } }) });
  const moved = await request("/api/classes/transfer-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-waiting", targetClassId: "class-k", studentId: "s-3" }) });
  assert.equal(moved.status, 200, await moved.clone().text());
});
