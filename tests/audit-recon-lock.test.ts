import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";
import type { DemoFinance } from "../cloudflare/finance-types";
import { emptySepayLedger, mergeSepayLedger } from "../cloudflare/sepay-engine";

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

function testEnv(finance: DemoFinance) {
  const values = new Map<string, unknown>([["finance:steps-demo", structuredClone(finance)]]);
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    STEPS_LMS_DATA: {
      get: async <T>(key: string, type: "json") => {
        if (type !== "json") throw new Error("Chỉ hỗ trợ JSON.");
        return (values.get(key) as T | undefined) ?? null;
      },
      put: async (key: string, value: string) => { values.set(key, JSON.parse(value)); },
      compareAndPut: async (key: string, expected: string, value: string) => {
        if (JSON.stringify(values.get(key) ?? null) !== expected) return false;
        values.set(key, JSON.parse(value));
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
    AUTH_SECRET: "audit-lock-test-auth-secret-at-least-32-chars",
    DEMO_PASSWORD: "",
    SEED_ADMIN_EMAIL: "admin@steps.vn",
    SEED_ADMIN_PASSWORD: "strong-test-password",
    SEED_ADMIN_NAME: "Quản trị STEPS",
    ALLOW_DEMO_LOGIN: "false",
  };
  return { env, values };
}

function financeFixture(): DemoFinance {
  return {
    debts: [],
    cashbook: [{
      id: "cash-1",
      date: "2026-09-17",
      kind: "IN",
      source: "TUITION",
      category: "Học phí",
      description: "Thu học phí tháng 9",
      amount: 515_000,
      method: "Chuyển khoản",
    }],
    recon: [],
    reconEntries: [],
    payroll: [],
    forecasts: [],
  };
}


async function setup() {
  const { env, values } = testEnv(financeFixture());
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://audit.test${path}`, init), env as never);
  const login = async (email: string, password: string) => {
    const response = await request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200, `Đăng nhập ${email}`);
    return { Cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  };
  const admin = await login("admin@steps.vn", "strong-test-password");
  const created = await request("/api/audits", { method: "PUT", headers: admin, body: JSON.stringify({ items: [{ id: "audit-1", code: "", fullName: "Trần Thị Kiểm", phone: "", address: "", email: "" }] }) });
  assert.equal(created.status, 200);
  const audit = await login("tranthikiem", "123456789");
  return { env, values, request, admin, audit };
}

test("Audit đăng nhập như kế toán, có quyền admin nhưng không sửa tài khoản / cấu hình", async () => {
  const { request, admin, audit } = await setup();
  const boot = await (await request("/api/bootstrap", { headers: audit })).json() as any;
  assert.equal(boot.user.role, "ADMIN");
  assert.equal(boot.user.auditor, true);
  const adminBoot = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  assert.equal(adminBoot.user.auditor, false);
  assert.equal(adminBoot.audits[0].code, "AU0001");
  for (const path of ["/api/teachers", "/api/accountants", "/api/assistants", "/api/audits"]) {
    const response = await request(path, { method: "PUT", headers: audit, body: JSON.stringify({ items: [] }) });
    assert.equal(response.status, 403, path);
  }
  assert.equal((await request("/api/settings", { method: "PUT", headers: audit, body: "{}" })).status, 403);
  const wrong = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "tranthikiem", password: "strong-test-password" }) });
  assert.equal(wrong.status, 401);
});

test("Đối soát xong khoá thu chi ngày đó; chỉ superadmin gỡ được", async () => {
  const { values, request, admin, audit } = await setup();
  const lock = await request("/api/finance/recon-locks", { method: "POST", headers: audit, body: JSON.stringify({ date: "2026-09-17" }) });
  assert.equal(lock.status, 200);
  assert.equal(((await lock.json()) as any).items[0].lockedByName, "Trần Thị Kiểm");
  assert.equal((await request("/api/finance/recon-locks", { method: "POST", headers: audit, body: JSON.stringify({ date: "2026-09-17" }) })).status, 409);

  // Xoá phiếu, thêm phiếu cùng ngày, sửa số tiền: đều bị chặn — kể cả superadmin.
  for (const headers of [audit, admin]) {
    assert.equal((await request("/api/finance/cashbook/cash-1", { method: "DELETE", headers })).status, 409);
  }
  const book = structuredClone(values.get("finance:steps-demo") as DemoFinance);
  const addSameDay = { ...book, cashbook: [...book.cashbook, { id: "cash-2", date: "2026-09-17", kind: "OUT", source: "MANUAL", category: "Khác", description: "Chi", amount: 10_000, method: "Tiền mặt" }] };
  assert.equal((await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify(addSameDay) })).status, 409);
  const edited = { ...book, cashbook: book.cashbook.map((row) => ({ ...row, amount: 1 })) };
  assert.equal((await request("/api/finance", { method: "PUT", headers: audit, body: JSON.stringify(edited) })).status, 409);
  const otherDay = { ...book, cashbook: [...book.cashbook, { id: "cash-3", date: "2026-09-18", kind: "OUT", source: "MANUAL", category: "Khác", description: "Chi", amount: 10_000, method: "Tiền mặt" }] };
  assert.equal((await request("/api/finance", { method: "PUT", headers: audit, body: JSON.stringify(otherDay) })).status, 200);
  assert.equal((values.get("finance:steps-demo") as DemoFinance).cashbook.find((row) => row.id === "cash-1")?.amount, 515_000);

  assert.equal((await request("/api/finance/recon-locks", { method: "POST", headers: audit, body: JSON.stringify({ date: "2026-09-17", action: "unlock" }) })).status, 403);
  const unlock = await request("/api/finance/recon-locks", { method: "POST", headers: admin, body: JSON.stringify({ date: "2026-09-17", action: "unlock" }) });
  assert.equal(unlock.status, 200);
  assert.deepEqual(((await unlock.json()) as any).items, []);
  assert.equal((await request("/api/finance/cashbook/cash-1", { method: "DELETE", headers: admin })).status, 200);
});

test("Đối soát xong hôm nay (giờ VN) khoá toàn bộ thu chi, kể cả phiếu ngày khác", async () => {
  const { values, request, admin, audit } = await setup();
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  assert.equal((await request("/api/finance/recon-locks", { method: "POST", headers: audit, body: JSON.stringify({ date: today }) })).status, 200);
  const book = structuredClone(values.get("finance:steps-demo") as DemoFinance);
  const otherDay = { ...book, cashbook: [...book.cashbook, { id: "cash-x", date: "2026-09-18", kind: "OUT", source: "MANUAL", category: "Khác", description: "Chi", amount: 10_000, method: "Tiền mặt" }] };
  const blocked = await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify(otherDay) });
  assert.equal(blocked.status, 409);
  assert.match(((await blocked.json()) as any).error, /0h đêm nay/);
  assert.equal((await request("/api/finance/cashbook/cash-1", { method: "DELETE", headers: audit })).status, 409);
  // Gỡ đối soát hôm nay → thao tác lại được.
  assert.equal((await request("/api/finance/recon-locks", { method: "POST", headers: admin, body: JSON.stringify({ date: today, action: "unlock" }) })).status, 200);
  assert.equal((await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify(otherDay) })).status, 200);
});

test("Lưu phiếu thu chi không ghi đè sổ Sepay mà tab cũ gửi kèm", async () => {
  const { values, request, admin } = await setup();
  const stored = values.get("finance:steps-demo") as DemoFinance;
  stored.sepay = {
    ...emptySepayLedger(),
    receivables: [{
      id: "recv-server-1",
      position: 1,
      receivableCode: "PT-TEST",
      studentId: "student-test",
      studentName: "Học viên Test",
      billingPeriod: "Tháng 11/2026",
      issueDate: "2026-11-01",
      dueDate: "2026-11-10",
      amountDue: 400_000,
      amountPaid: 0,
      balanceDue: 400_000,
      currency: "VND",
      status: "OPEN",
      classId: "class-test",
      billKey: "month|class-test|2026-11",
    }],
  };
  // Trình duyệt mở từ trước khi phiếu được đồng bộ: gửi kèm sổ rỗng + phiếu chi mới.
  const staleBook = structuredClone(stored);
  staleBook.sepay = emptySepayLedger();
  staleBook.cashbook.push({ id: "cash-new", date: "2026-09-18", kind: "OUT", source: "MANUAL", category: "Khác", description: "Chi", amount: 10_000, method: "Tiền mặt" });
  const response = await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify(staleBook) });
  assert.equal(response.status, 200);
  const after = values.get("finance:steps-demo") as DemoFinance;
  assert.ok(mergeSepayLedger(after.sepay).receivables.some((row) => row.id === "recv-server-1"), "sổ Sepay của server phải được giữ");
  assert.ok(after.cashbook.some((row) => row.id === "cash-new"), "phiếu thu chi mới vẫn được lưu");
});
