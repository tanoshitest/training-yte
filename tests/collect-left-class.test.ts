import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
import { restoreLeftClassReceivables } from "../cloudflare/tuition-billing";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";
import type { DemoFinance } from "../cloudflare/finance-types";
import type { DemoStudent } from "../cloudflare/people-types";

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

/**
 * Chốt treo một request lại giữa lúc nó đã đọc dữ liệu nhưng chưa lưu, mô phỏng
 * VPS chậm: kế toán thu tiền xong thì request cũ mới ghi xuống.
 */
function writeGate() {
  let release: (() => void) | undefined;
  let announceCapture: (() => void) | undefined;
  let captured: Promise<void> | undefined;
  let armedFor = "";
  let skip = 0;
  return {
    /** Treo lần đọc thứ (skip + 1) của key này, rồi tự tháo chốt. */
    armRead(key: string, skipFirst = 0) {
      armedFor = key;
      skip = skipFirst;
      captured = new Promise<void>((resolve) => { announceCapture = resolve; });
    },
    /**
     * Chờ tới lúc request đó đang bị treo, để test chắc chắn đúng thứ tự. Quá hạn
     * nghĩa là chỗ ghi không còn đọc lại để kiểm tra, tức lỗi ghi đè đã quay lại.
     */
    async held() {
      const timer = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Chỗ ghi tài chính không đọc lại dữ liệu trước khi lưu.")), 2_000).unref?.();
      });
      await Promise.race([captured ?? Promise.resolve(), timer]);
    },
    async wait(key: string) {
      if (key !== armedFor) return;
      if (skip > 0) { skip -= 1; return; }
      armedFor = "";
      await new Promise<void>((resolve) => {
        release = resolve;
        announceCapture?.();
      });
    },
    open() { release?.(); release = undefined; },
  };
}

function testEnv(gate?: ReturnType<typeof writeGate>, writes?: string[]) {
  const kvStorage = new MemoryStorage();
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string) => {
        await gate?.wait(key);
        return (kvStorage.values.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => {
        writes?.push(key);
        kvStorage.values.set(key, JSON.parse(value));
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
    AUTH_SECRET: "left-class-collect-test-secret-at-least-32-chars",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
}

const STUDENT_IDS = ["student-a", "student-b", "student-c"];
const STUDENT_NAMES = new Set(["Học viên 1", "Học viên 2", "Học viên 3"]);

function receiptCount(finance: DemoFinance) {
  return (finance.sepay?.receipts || []).length;
}

/** Bỏ qua các dòng thu chi mẫu của bản demo, chỉ giữ dòng của 3 học viên vừa thu. */
function collectedNames(finance: DemoFinance) {
  return finance.cashbook
    .filter((row) => row.source === "TUITION" && STUDENT_NAMES.has(String(row.studentName)))
    .map((row) => String(row.studentName))
    .sort();
}

async function seedClassAndStudents(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  headers: Record<string, string>,
) {
  // Tạo lớp trước khi có học viên để PUT /api/classes không stamp ngày vào
  // lớp = hôm nay (vào sau ngày 5 thì tháng này không lập phiếu, không thu được).
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: [{
        id: "class-monthly",
        code: "S1",
        name: "S1-9.1-2012",
        status: "ACTIVE",
        studentIds: STUDENT_IDS,
        billingMode: "MONTHLY",
        sessionPrice: 65_000,
        courseSessions: 24,
        schedules: [
          { weekday: 2, periodId: "period-tue", startTime: "17:00", endTime: "19:00" },
          { weekday: 5, periodId: "period-fri", startTime: "17:00", endTime: "19:00" },
        ],
      }],
    }),
  });
  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: STUDENT_IDS.map((id, index) => ({
        id,
        code: `HV000${index + 1}`,
        fullName: `Học viên ${index + 1}`,
        status: "STUDYING",
        // Học viên đã ở lớp từ tháng trước → phiếu tháng hiện tại thu bình thường.
        classJoinedAt: { "class-monthly": "2026-09-01" },
      })),
    }),
  });
  await request("/api/bootstrap", { headers });
}

async function adminSession(env: ReturnType<typeof testEnv>) {
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://vps.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  return { request, headers: { Cookie: cookie!, "Content-Type": "application/json" } };
}

function collectRequest(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  headers: Record<string, string>,
  studentId: string,
) {
  return request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "collect", studentId, classId: "class-monthly", method: "TRANSFER", note: "" }),
  });
}


async function seedAttendance(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  headers: Record<string, string>,
  studentId: string,
) {
  // Hai buổi đã học trước ngày rời lớp (3 & 6/11) — phần đã học còn nợ sẽ mang sang.
  const rows = ["2026-11-03", "2026-11-06"].map((date, index) => ({
    id: `session-${index}`,
    classId: "class-monthly",
    teacherId: "teacher-demo-1",
    date,
    startTime: "17:00",
    endTime: "19:00",
    status: "COMPLETED",
    attendance: [{ studentId, status: "PRESENT", pronunciationVideoDone: false, vocabularyScore: null, assessmentScores: {}, note: "" }],
  }));
  const response = await request("/api/lesson-sessions", { method: "PUT", headers, body: JSON.stringify({ items: rows }) });
  assert.equal(response.status, 200);
}

test("học viên về Lớp chờ: ngắt phiếu còn nợ, mang khoản đã học sang, không thu lại ở lớp cũ", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  await seedAttendance(request, headers, "student-a");
  const before = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const open = (before.finance.sepay?.receivables || []).filter((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN");
  assert.ok(open.length > 0, "phải có phiếu còn nợ trước khi rời lớp");
  const bill = open.find((row: any) => String(row.billKey).includes("class-monthly"));
  assert.ok(bill);

  const removed = await request("/api/classes/remove-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-monthly", studentId: "student-a" }) });
  assert.equal(removed.status, 200);
  const mid = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const parked = (mid.finance.sepay?.receivables || []).find((row: any) => row.id === bill.id);
  assert.equal(parked?.status, "CANCELLED", "phiếu còn nợ bị ngắt");
  assert.equal(parked?.balanceDue, 0);
  assert.ok(parked?.leftClass?.carryAmount > 0, "phần đã học + nợ cũ được mang sang");
  assert.equal(parked?.leftClass?.consumedSessions, 2);
  const nextMonth = (mid.finance.sepay?.receivables || []).find((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN");
  assert.equal(nextMonth, undefined, "không còn phiếu mở nào ở lớp cũ");

  // Thu lại ở lớp cũ sẽ lập lại công nợ vừa hủy — phải chặn.
  const response = await collectRequest(request, headers, "student-a");
  const result = await response.json() as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(result.error, "Học viên không thuộc lớp này.");
  assert.equal(receiptCount(mid.finance), 0);
});

test("quay lại lớp: phiếu về số đã xuất và bỏ chốt frozenAt cũ", () => {
  const row = {
    id: "recv-1", receivableCode: "HP1", studentId: "student-a", studentName: "Học viên 1",
    billingPeriod: "Tháng 11/2026", issueDate: "2026-11-01", dueDate: "2026-11-10",
    amountDue: 130_000, amountPaid: 0, balanceDue: 130_000, currency: "VND", status: "OPEN",
    paymentOrderId: "", classId: "class-monthly", billKey: "month|class-monthly|2026-11",
    frozenAt: "2026-11-02T03:00:00.000Z",
    issuedAmount: 585_000,
    leftClass: { at: "2026-11-05T03:00:00.000Z", billedSessions: 9, consumedSessions: 2, deductionSessions: 7, deductionAmount: 455_000 },
  };
  const ledger = {
    settings: {}, receivables: [row], paymentOrders: [], bankTransactions: [],
    payments: [], receipts: [], invoices: [], credits: [], webhookLogs: [],
  } as never;
  const { ledger: next, restored } = restoreLeftClassReceivables(ledger, [{ studentId: "student-a", classId: "class-monthly" }], new Date("2026-11-08T00:00:00Z"));
  assert.equal(restored, 1);
  const fixed = (next as { receivables: typeof row[] }).receivables[0];
  assert.equal(fixed.amountDue, 585_000);
  assert.equal(fixed.balanceDue, 585_000);
  assert.equal(fixed.issuedAmount, undefined);
  assert.equal(fixed.leftClass, undefined);
  assert.equal(fixed.frozenAt, undefined);
});

test("xếp lại từ Lớp chờ vào đúng lớp: khoản đã học mang sang vào phiếu tháng mới", async () => {
  const { request, headers } = await adminSession(testEnv());
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: [{
        id: "class-monthly",
        code: "S1",
        name: "S1-9.1-2012",
        status: "ACTIVE",
        studentIds: STUDENT_IDS,
        billingMode: "MONTHLY",
        sessionPrice: 65_000,
        courseSessions: 24,
        schedules: [
          { weekday: 2, periodId: "period-tue", startTime: "17:00", endTime: "19:00" },
          { weekday: 5, periodId: "period-fri", startTime: "17:00", endTime: "19:00" },
        ],
      }],
    }),
  });
  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: STUDENT_IDS.map((id, index) => ({
        id,
        code: `HV000${index + 1}`,
        fullName: `Học viên ${index + 1}`,
        status: "STUDYING",
        // Vào lớp đầu tháng 11 → phiếu hiện tại là một tháng 11 duy nhất.
        classJoinedAt: { "class-monthly": "2026-11-01" },
      })),
    }),
  });
  await request("/api/bootstrap", { headers });
  await seedAttendance(request, headers, "student-a");

  const before = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const bill = (before.finance.sepay?.receivables || []).find((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN");
  assert.ok(bill, "phải có phiếu tháng 11 trước khi nghỉ");
  assert.equal(bill.billKey, "month|class-monthly|2026-11");
  assert.equal(bill.amountDue, 8 * 65_000);

  assert.equal((await request("/api/classes/remove-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-monthly", studentId: "student-a" }) })).status, 200);
  const mid = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const left = (mid.finance.sepay?.receivables || []).find((row: any) => row.id === bill.id);
  assert.equal(left?.status, "CANCELLED");
  assert.equal(left?.leftClass?.carryAmount, 2 * 65_000, "2 buổi đã học còn nợ mang sang");

  const moved = await request("/api/classes/transfer-student", {
    method: "POST",
    headers,
    body: JSON.stringify({ sourceClassId: "class-waiting", targetClassId: "class-monthly", studentId: "student-a" }),
  });
  assert.equal(moved.status, 200);
  const result = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const carried = (result.finance.sepay?.receivables || []).find((row: any) => row.id === bill.id);
  assert.equal(carried?.leftClass?.carryTarget?.classId, "class-monthly", "khoản mang sang gắn vào lớp quay lại");
  const reopened = (result.finance.sepay?.receivables || []).filter((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN" && row.billKey === "month|class-monthly|2026-11");
  assert.equal(reopened.length, 1, "chỉ một phiếu mới, không lập lại phiếu cũ");
  // 6 buổi còn lại của tháng 11 sau ngày vào + 2 buổi đã học trước khi nghỉ.
  assert.equal(reopened[0].amountDue, 6 * 65_000 + 2 * 65_000);
});

test("về Lớp chờ khi đã đóng tiền: hoàn phần chưa học bằng phiếu chi và giảm doanh số", async () => {
  const { request, headers } = await adminSession(testEnv());
  await request("/api/classes", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: [{
        id: "class-monthly",
        code: "S1",
        name: "S1-9.1-2012",
        status: "ACTIVE",
        studentIds: STUDENT_IDS,
        billingMode: "MONTHLY",
        sessionPrice: 65_000,
        courseSessions: 24,
        schedules: [
          { weekday: 2, periodId: "period-tue", startTime: "17:00", endTime: "19:00" },
          { weekday: 5, periodId: "period-fri", startTime: "17:00", endTime: "19:00" },
        ],
      }],
    }),
  });
  await request("/api/students", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      items: STUDENT_IDS.map((id, index) => ({
        id,
        code: `HV000${index + 1}`,
        fullName: `Học viên ${index + 1}`,
        status: "STUDYING",
        classJoinedAt: { "class-monthly": "2026-11-01" },
      })),
    }),
  });
  await request("/api/bootstrap", { headers });
  await seedAttendance(request, headers, "student-a");

  const paid = await collectRequest(request, headers, "student-a");
  assert.equal(paid.status, 200);
  const after = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const bill = (after.finance.sepay?.receivables || []).find((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "PAID");
  assert.ok(bill, "phiếu tháng 11 đã thu đủ");

  assert.equal((await request("/api/classes/remove-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-monthly", studentId: "student-a" }) })).status, 200);
  const mid = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const kept = (mid.finance.sepay?.receivables || []).find((row: any) => row.id === bill.id);
  assert.equal(kept?.status, "PAID", "phiếu đã đóng giữ nguyên");
  assert.equal(kept?.leftClass?.refundAmount, 6 * 65_000);
  assert.equal(kept?.leftClass?.revenue?.reduction, 6 * 65_000);
  const refund = mid.finance.cashbook.find((row) => row.id === `cash-refund-${bill.id}`);
  assert.ok(refund, "phải tự tạo phiếu chi hoàn");
  assert.equal(refund?.kind, "OUT");
  assert.equal(refund?.amount, 6 * 65_000);
  assert.equal(refund?.category, "Hoàn học phí");
});

test("chuyển thẳng lớp tháng → Lớp chờ: ngắt phiếu và mang khoản đã học sang", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  await seedAttendance(request, headers, "student-a");
  const listed = (await (await request("/api/classes", { headers })).json()) as { items: Array<{ id: string; studentIds?: string[] }> };
  assert.ok(listed.items.some((row) => row.id === "class-waiting"));
  assert.equal((await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: listed.items, syncFinance: false }) })).status, 200);

  const before = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const bill = (before.finance.sepay?.receivables || []).find((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN");
  assert.ok(bill);

  const moved = await request("/api/classes/transfer-student", { method: "POST", headers, body: JSON.stringify({ sourceClassId: "class-monthly", targetClassId: "class-waiting", studentId: "student-a" }) });
  assert.equal(moved.status, 200);
  const mid = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const parked = (mid.finance.sepay?.receivables || []).find((row: any) => row.id === bill.id);
  assert.equal(parked?.status, "CANCELLED");
  // Phiếu gộp T9–T11 (26 buổi): bỏ 6 buổi chưa học của T11, mang sang phần còn lại.
  assert.equal(parked?.leftClass?.carryAmount, 26 * 65_000 - 6 * 65_000);
});

test("sửa roster hàng loạt: gỡ về Lớp chờ rồi xếp lại trong cùng một lượt lưu", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  await seedAttendance(request, headers, "student-a");
  const listed = (await (await request("/api/classes", { headers })).json()) as { items: Array<{ id: string; studentIds?: string[] }> };
  const waiting = listed.items.find((row) => row.id === "class-waiting");
  const monthly = listed.items.find((row) => row.id === "class-monthly");
  assert.ok(waiting && monthly);

  // Gỡ khỏi lớp qua sửa roster → về Lớp chờ, phiếu còn nợ bị ngắt.
  const removedItems = listed.items.map((row) => row.id === "class-monthly"
    ? { ...row, studentIds: (row.studentIds || []).filter((id) => id !== "student-a") }
    : row);
  assert.equal((await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: removedItems }) })).status, 200);
  const mid = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const carryRow = (mid.finance.sepay?.receivables || []).find((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.leftClass?.carryAmount);
  assert.ok(carryRow, "phiếu bị ngắt mang khoản sang");
  assert.equal(carryRow?.status, "CANCELLED");

  // Xếp lại vào lớp: khoản mang sang vào phiếu tháng 11, mốc vào lớp tính lại từ hôm nay.
  const afterRemoval = (await (await request("/api/classes", { headers })).json()) as { items: Array<{ id: string; studentIds?: string[] }> };
  const rejoinedItems = afterRemoval.items.map((row) => row.id === "class-monthly"
    ? { ...row, studentIds: [...(row.studentIds || []), "student-a"] }
    : row);
  const saved = await request("/api/classes", { method: "PUT", headers, body: JSON.stringify({ items: rejoinedItems }) });
  assert.equal(saved.status, 200);
  const result = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const reopened = (result.finance.sepay?.receivables || []).filter((row: any) => row.studentId === "student-a" && row.classId === "class-monthly" && row.status === "OPEN" && row.billKey === "month|class-monthly|2026-11");
  assert.equal(reopened.length, 1);
  // 6 buổi còn lại của T11 + khoản mang sang (T9–T10 + 2 buổi đã học T11).
  assert.equal(reopened[0].amountDue, 6 * 65_000 + (26 * 65_000 - 6 * 65_000));
  const attached = (result.finance.sepay?.receivables || []).find((row: any) => row.id === carryRow?.id);
  assert.equal(attached?.leftClass?.carryTarget?.classId, "class-monthly");
});
