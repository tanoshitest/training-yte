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

test("thu học phí lần lượt 3 học viên thì nhật ký thu chi có đủ 3 dòng", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);

  for (const studentId of STUDENT_IDS) {
    const response = await collectRequest(request, headers, studentId);
    assert.equal(response.status, 200, `thu học phí ${studentId} phải thành công`);
  }

  const finance = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  assert.equal(receiptCount(finance.finance), 3, "phải có 3 biên lai");
  assert.deepEqual(collectedNames(finance.finance), ["Học viên 1", "Học viên 2", "Học viên 3"]);

  // Bootstrap chạy lại đồng bộ tài chính, không được làm mất biên lai hay dòng nhật ký.
  const after = (await (await request("/api/bootstrap", { headers })).json()) as { finance: DemoFinance; students: DemoStudent[] };
  assert.equal(receiptCount(after.finance), 3, "bootstrap không được xoá biên lai");
  assert.deepEqual(collectedNames(after.finance), ["Học viên 1", "Học viên 2", "Học viên 3"], "bootstrap không được xoá dòng nhật ký");
});

test("thu học phí 3 học viên cùng lúc vẫn giữ đủ biên lai và dòng nhật ký", async () => {
  const { request, headers } = await adminSession(testEnv());
  await seedClassAndStudents(request, headers);

  const responses = await Promise.all(STUDENT_IDS.map((studentId) => collectRequest(request, headers, studentId)));
  for (const response of responses) assert.equal(response.status, 200);

  const finance = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  assert.deepEqual(collectedNames(finance.finance), ["Học viên 1", "Học viên 2", "Học viên 3"]);
  assert.equal(receiptCount(finance.finance), 3, "phải có 3 biên lai");

  // Số buổi tồn của cả 3 phải như nhau: cùng lớp, cùng vừa đóng đủ tháng.
  const students = (await (await request("/api/bootstrap", { headers })).json()) as { students: DemoStudent[] };
  const paid = students.students.filter((row) => STUDENT_IDS.includes(row.id)).map((row) => row.tuitionPaidThrough?.["class-monthly"]);
  assert.deepEqual(paid, [paid[0], paid[0], paid[0]], "cả 3 học viên phải được ghi nhận đã đóng");
});

test("mở trang xem thu chi không được ghi đè khối tài chính", async () => {
  const writes: string[] = [];
  const { request, headers } = await adminSession(testEnv(undefined, writes));
  await seedClassAndStudents(request, headers);
  await collectRequest(request, headers, "student-a");

  writes.length = 0;
  await request("/api/finance", { headers });
  await request("/api/bootstrap", { headers });
  assert.deepEqual(writes.filter((key) => key === "finance:steps-demo"), [], "endpoint chỉ đọc không được ghi");
});

test("mốc đã đóng còn treo lại từ phiếu bị mất thì thu lại được và hiện ở nhật ký", async () => {
  const env = testEnv();
  const { request, headers } = await adminSession(env);
  await seedClassAndStudents(request, headers);
  const collectedRes = await collectRequest(request, headers, "student-a");
  assert.equal(collectedRes.status, 200, await collectedRes.clone().text());

  // Bản cũ ghi đè khối tài chính nên mất biên lai, còn mốc "đã đóng tới tháng"
  // của học viên nằm ở khối khác nên vẫn nằm lại.
  const stored = (await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo"))!;
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify({
    ...stored,
    cashbook: stored.cashbook.filter((row) => row.source !== "TUITION"),
    sepay: { ...stored.sepay, receipts: [], payments: [] },
  }));
  const boot = (await (await request("/api/bootstrap", { headers })).json()) as { students: DemoStudent[] };
  assert.equal(
    boot.students.find((row) => row.id === "student-a")?.tuitionPaidThrough?.["class-monthly"],
    undefined,
    "mốc đã đóng không có biên lai phải được bỏ để hiện đúng là còn công nợ",
  );

  const again = await collectRequest(request, headers, "student-a");
  assert.equal(again.status, 200, "phải thu lại được chứ không báo đã thanh toán");
  const finance = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  assert.equal(receiptCount(finance.finance), 1, "phải có biên lai của lần thu lại");
  assert.deepEqual(collectedNames(finance.finance), ["Học viên 1"], "nhật ký thu chi phải hiện phiếu vừa thu");
});

test("mở trang lúc đang thu học phí thì biên lai không bị ghi đè", async () => {
  const gate = writeGate();
  const { request, headers } = await adminSession(testEnv(gate));
  await seedClassAndStudents(request, headers);

  // Request lưu sổ thu chi đọc xong dữ liệu rồi bị treo; kế toán thu học phí
  // trong lúc đó, nên lần ghi sau của nó mang dữ liệu đã cũ.
  gate.armRead("finance:steps-demo", 1);
  const saving = request("/api/finance", {
    method: "PUT",
    headers,
    body: JSON.stringify({ forecasts: [] }),
  });
  await gate.held();
  const collected = await collectRequest(request, headers, "student-a");
  assert.equal(collected.status, 200, "lần thu học phí phải thành công");
  gate.open();
  assert.equal((await saving).status, 409, "request cũ phải bị chặn, không được ghi đè");

  const finance = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  assert.equal(receiptCount(finance.finance), 1, "biên lai vừa thu không được mất");
  assert.deepEqual(collectedNames(finance.finance), ["Học viên 1"], "dòng nhật ký thu chi không được mất");
});

test("thu phần còn lại của phiếu thì sổ quỹ ghi đúng số tiền phiếu thu, không ghi cả phiếu", async () => {
  const env = testEnv();
  const { request, headers } = await adminSession(env);
  await seedClassAndStudents(request, headers);
  const requested = await request("/api/finance/sepay", {
    method: "POST", headers,
    body: JSON.stringify({ action: "request", studentId: "student-a", classId: "class-monthly" }),
  });
  assert.equal(requested.status, 200, await requested.clone().text());
  // Phụ huynh đã trả trước một phần (vd chuyển 1 phần, tín dụng) → phiếu chỉ còn 50.000đ.
  const stored = (await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo"))!;
  const receivable = stored.sepay!.receivables.find((row) => row.studentId === "student-a")!;
  assert.ok(receivable.amountDue > 50_000);
  receivable.amountPaid = receivable.amountDue - 50_000;
  receivable.balanceDue = 50_000;
  receivable.status = "PARTIALLY_PAID";
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(stored));

  const collectedRes = await collectRequest(request, headers, "student-a");
  assert.equal(collectedRes.status, 200, await collectedRes.clone().text());
  const finance = (await (await request("/api/finance", { headers })).json()) as { finance: DemoFinance };
  const receipt = finance.finance.sepay!.receipts.find((row) => row.studentId === "student-a")!;
  assert.equal(receipt.amount, 50_000);
  const entry = finance.finance.cashbook.find((row) => row.receiptId === receipt.id)!;
  assert.equal(entry.amount, 50_000, "sổ quỹ = tiền thực thu trên phiếu thu");
});
