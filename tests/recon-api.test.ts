import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import type { DurableObjectStorageLike } from "../cloudflare/durable-object-base";
import type { DemoFinance } from "../cloudflare/finance-types";

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
    AUTH_SECRET: "recon-test-auth-secret-at-least-32-characters",
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

test("endpoint riêng duyệt và hoàn tác đúng một phiếu mà giữ nguyên cashbook", async () => {
  const original = financeFixture();
  const { env, values } = testEnv(original);
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://recon.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const headers = { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };

  const approve = await request("/api/finance/recon/cash-1", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ action: "APPROVE", expectedAmount: 515_000, expectedDate: "2026-09-17" }),
  });
  assert.equal(approve.status, 200);
  const approved = await approve.json() as { finance: DemoFinance };
  assert.deepEqual(approved.finance.cashbook, original.cashbook);
  assert.equal(approved.finance.reconEntries[0]?.status, "MATCHED");
  assert.equal(approved.finance.reconEntries[0]?.approvedBy, "Quản trị STEPS");

  const undo = await request("/api/finance/recon/cash-1", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ action: "UNDO", expectedAmount: 515_000, expectedDate: "2026-09-17" }),
  });
  assert.equal(undo.status, 200);
  const undone = await undo.json() as { finance: DemoFinance };
  assert.deepEqual(undone.finance.cashbook, original.cashbook);
  assert.equal(undone.finance.reconEntries[0]?.status, "PENDING");
  assert.deepEqual((values.get("finance:steps-demo") as DemoFinance).cashbook, original.cashbook);
});

test("endpoint từ chối thao tác từ màn hình cũ khi phiếu đã đổi", async () => {
  const changed = financeFixture();
  changed.cashbook[0]!.amount = 600_000;
  const { env, values } = testEnv(changed);
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://recon.test${path}`, init), env as never);
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }),
  });
  const response = await request("/api/finance/recon/cash-1", {
    method: "PATCH",
    headers: { Cookie: login.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "APPROVE", expectedAmount: 515_000, expectedDate: "2026-09-17" }),
  });
  assert.equal(response.status, 409);
  assert.equal((values.get("finance:steps-demo") as DemoFinance).cashbook[0]?.amount, 600_000);
  assert.deepEqual((values.get("finance:steps-demo") as DemoFinance).reconEntries, []);
});
