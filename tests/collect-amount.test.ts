import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
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
    AUTH_SECRET: "cashbook-repro-test-secret-at-least-32-characters",
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

// ---- Thu theo số tiền thực thu (25/10/2026): thiếu → truy thu kỳ sau, dư → thu trước kỳ sau ----
function collectAmount(request: (path: string, init?: RequestInit) => Promise<Response>, headers: Record<string, string>, studentId: string, amount: number) {
  return request("/api/finance/sepay", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "collect", studentId, classId: "class-monthly", method: "CASH", note: "", amount }),
  });
}

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthRows = (finance: DemoFinance, studentId: string) => (finance.sepay?.receivables || [])
  .filter((row: any) => row.studentId === studentId && row.status !== "CANCELLED" && String(row.billKey || "").startsWith("month"));

test("thu thiếu: phiếu tháng đã thu một phần, số thiếu còn nợ; thu lần sau truy thu đúng phần thiếu", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  const studentId = STUDENT_IDS[0];
  const first = await collectAmount(request, headers, studentId, 100_000);
  assert.equal(first.status, 200, await first.clone().text());
  let finance = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const current = monthRows(finance, studentId).find((row: any) => String(row.billKey).includes(thisMonth())) as any;
  assert.ok(current, "có phiếu tháng hiện tại");
  assert.equal(current.status, "PARTIALLY_PAID");
  assert.equal(current.amountPaid, 100_000);
  const shortfall = current.balanceDue;
  assert.ok(shortfall > 0);
  const cash = finance.cashbook.filter((row) => row.studentName === "Học viên 1").reduce((sum, row) => sum + row.amount, 0);
  assert.equal(cash, 100_000, "sổ thu chi ghi đúng số thực thu");
  // Thu lần hai đúng phần thiếu → phiếu đủ, không lập phiếu mới thu lại cả tháng.
  const second = await collectAmount(request, headers, studentId, shortfall);
  assert.equal(second.status, 200, await second.clone().text());
  finance = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const after = monthRows(finance, studentId).find((row: any) => row.id === current.id) as any;
  assert.equal(after.status, "PAID");
  assert.equal(after.amountPaid, current.amountDue);
  assert.equal(monthRows(finance, studentId).filter((row: any) => String(row.billKey).includes(thisMonth())).length, 1);
  // Xoá phiếu thu lần hai → phiếu quay về "đã thu một phần" đúng số lần đầu.
  const secondEntry = finance.cashbook.find((row) => row.studentName === "Học viên 1" && row.amount === shortfall)!;
  const removed = await request(`/api/finance/cashbook/${encodeURIComponent(secondEntry.id)}`, { method: "DELETE", headers });
  assert.equal(removed.status, 200, await removed.clone().text());
  finance = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const reverted = monthRows(finance, studentId).find((row: any) => row.id === current.id) as any;
  assert.equal(reverted.status, "PARTIALLY_PAID");
  assert.equal(reverted.amountPaid, 100_000);
  assert.equal(reverted.balanceDue, shortfall);
});

test("thu dư: phần dư ghi thu trước tháng sau (phiếu tháng sau đã thu một phần), vượt quá thì báo lỗi", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  const studentId = STUDENT_IDS[1];
  const due = (((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance.sepay?.receivables || [])
    .filter((row: any) => row.studentId === studentId && String(row.billKey || "").includes(thisMonth()) && row.status !== "CANCELLED")
    .reduce((sum: number, row: any) => sum + row.balanceDue, 0);
  assert.ok(due > 0, "có học phí tháng này");
  const tooMuch = await collectAmount(request, headers, studentId, 50_000_000);
  assert.equal(tooMuch.status, 400);
  assert.match(((await tooMuch.json()) as any).error, /vượt quá học phí có thể thu/);
  const response = await collectAmount(request, headers, studentId, due + 100_000);
  assert.equal(response.status, 200, await response.clone().text());
  const finance = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const rows = monthRows(finance, studentId) as any[];
  const current = rows.find((row) => String(row.billKey).includes(thisMonth()));
  assert.equal(current.status, "PAID");
  const next = rows.find((row) => String(row.billKey).split("|")[2] > thisMonth());
  assert.ok(next, "có phiếu tháng sau");
  assert.equal(next.amountPaid, 100_000, "phần dư là đã thu trước của tháng sau");
  assert.equal(next.balanceDue, next.amountDue - 100_000, "tháng sau chỉ còn phải nộp phần chênh (khấu trừ)");
  const cash = finance.cashbook.filter((row) => row.studentName === "Học viên 2").reduce((sum, row) => sum + row.amount, 0);
  assert.equal(cash, due + 100_000, "sổ thu chi ghi đủ số tiền thực thu");
});

test("sao kê chuyển thiếu: phiếu đã thu một phần, biên lai gắn lớp (tính buổi) như thu tay", async () => {
  const XLSX = await import("xlsx");
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);
  const studentId = STUDENT_IDS[2];
  const before = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const receivable = (before.sepay?.receivables || []).find((row: any) => row.studentId === studentId && String(row.billKey || "").includes(thisMonth()) && row.status !== "CANCELLED") as any;
  const code = (before.sepay?.paymentOrders || []).find((row: any) => row.id === receivable.paymentOrderId)!.paymentCode;
  const today = new Date();
  const dmy = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  const sheet = XLSX.utils.aoa_to_sheet([["STT", "Ngày", "", "Ghi có", "", "Nội dung"], [1, dmy, "", 100000, "", `CK ${code} hoc phi`]]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "SaoKe");
  const fileBase64 = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" })).toString("base64");
  const response = await request("/api/finance/bank-statement", { method: "POST", headers, body: JSON.stringify({ fileName: "sk.xlsx", fileBase64, mode: "apply" }) });
  assert.equal(response.status, 200, await response.clone().text());
  const finance = ((await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance }).finance;
  const after = (finance.sepay?.receivables || []).find((row: any) => row.id === receivable.id) as any;
  assert.equal(after.status, "PARTIALLY_PAID");
  assert.equal(after.amountPaid, 100000);
  const receipt = (finance.sepay?.receipts || []).find((row: any) => row.studentId === studentId) as any;
  assert.equal(receipt.classId, "class-monthly", "biên lai đã kích hoạt (gắn lớp, kỳ)");
  assert.match(String(receipt.billingPeriod), /Tháng/);
  assert.equal(finance.cashbook.filter((row) => row.receiptId === receipt.id).reduce((sum, row) => sum + row.amount, 0), 100000);
});
