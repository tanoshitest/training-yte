import assert from "node:assert/strict";
import test from "node:test";

import worker, { scheduleBootstrapPrewarm } from "../cloudflare/worker";
import { onDataGenerationBump } from "../cloudflare/data-generation";
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
  const request = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://boot.test${path}`, init), env as never);
  const response = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) });
  const admin = { Cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!, "Content-Type": "application/json" };
  return { env, values, request, admin };
}

test("bootstrap dùng bản dựng sẵn khi dữ liệu chưa đổi, dựng lại ngay sau lượt ghi", async () => {
  const { request, admin } = await setup();
  const first = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  const again = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  assert.deepEqual(again.finance.cashbook, first.finance.cashbook);
  assert.equal(first.user.email, "admin@steps.vn");
  // Ghi qua API (thêm phiếu thu tay vào sổ thu chi) → lần mở web sau phải thấy ngay.
  const cashbook = [...first.finance.cashbook, { id: "cash-2", date: "2026-09-18", kind: "IN", source: "MANUAL", category: "Khác", description: "Thu khác", amount: 100_000, method: "Tiền mặt" }];
  const saved = await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify({ ...first.finance, cashbook }) });
  assert.ok(saved.status < 300, `ghi sổ thu chi: ${saved.status}`);
  const after = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  assert.ok(after.finance.cashbook.some((row: any) => row.id === "cash-2"), "bootstrap sau lượt ghi có dòng mới");
});

test("bootstrap: hai môi trường dữ liệu khác nhau không dùng chung bản dựng sẵn", async () => {
  const a = await setup();
  const b = await setup();
  b.values.set("finance:steps-demo", { ...financeFixture(), cashbook: [] });
  const bootA = await (await a.request("/api/bootstrap", { headers: a.admin })).json() as any;
  const bootB = await (await b.request("/api/bootstrap", { headers: b.admin })).json() as any;
  assert.equal(bootA.finance.cashbook.length, 1);
  assert.equal(bootB.finance.cashbook.length, 0);
});

/** Đếm số lần đọc khối học phí — chỉ phần dựng core đọc khối này. */
/** Lần dựng đầu chạy các bước sửa dữ liệu một lần (ghi cờ) — mở web vài lần cho dữ liệu ổn định. */
async function settle(request: (path: string, init?: RequestInit) => Promise<Response>, admin: Record<string, string>) {
  for (let i = 0; i < 3; i += 1) await (await request("/api/bootstrap", { headers: admin })).json();
}

function countFinanceReads(env: any) {
  const counter = { reads: 0 };
  const get = env.STEPS_LMS_DATA.get;
  env.STEPS_LMS_DATA.get = async (key: string, type: "json") => { if (key === "finance:steps-demo") counter.reads += 1; return get(key, type); };
  return counter;
}

test("bootstrap: sau lượt ghi, máy chủ tự dựng sẵn — người mở web sau không phải chờ dựng", async () => {
  const { env, request, admin } = await setup();
  const stop = onDataGenerationBump(() => scheduleBootstrapPrewarm(env as never));
  try {
    await settle(request, admin);
    await (await request("/api/bootstrap?split=1", { headers: admin })).json();
    await new Promise((resolve) => setTimeout(resolve, 3_500));
    const first = await (await request("/api/bootstrap", { headers: admin })).json() as any;
    const cashbook = [...first.finance.cashbook, { id: "cash-3", date: "2026-09-19", kind: "IN", source: "MANUAL", category: "Khác", description: "Thu khác", amount: 50_000, method: "Tiền mặt" }];
    const saved = await request("/api/finance", { method: "PUT", headers: admin, body: JSON.stringify({ ...first.finance, cashbook }) });
    assert.ok(saved.status < 300);
    // Chờ hết khoảng nghỉ giữa hai lần dựng sẵn (10 giây) + 2 giây dữ liệu yên.
    await new Promise((resolve) => setTimeout(resolve, 13_000));
    const counter = countFinanceReads(env);
    const lite = await (await request("/api/bootstrap?split=1", { headers: admin })).json() as any;
    assert.equal(counter.reads, 0, "đã dựng sẵn — không dựng lại lúc mở web");
    const after = await (await request(`/api/bootstrap/rest?token=${lite.bootstrapRest.token}`, { headers: admin })).json() as any;
    assert.ok(after.values["finance.cashbook"].some((row: any) => row.id === "cash-3"), "bản dựng sẵn có dữ liệu mới");
  } finally {
    stop();
  }
});

test("bootstrap: quá 60 giây thì hỏi phiên bản dữ liệu — script ghi từ tiến trình khác vẫn được nhận ra", async (t) => {
  const { env, values, request, admin } = await setup();
  const versions: Record<string, number> = { "finance:steps-demo": 1, "students:steps-demo": 1 };
  (env.STEPS_LMS_DATA as any).versions = async (keys: string[]) => Object.fromEntries(keys.filter((key) => key in versions).map((key) => [key, versions[key]]));
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  await settle(request, admin);
  const first = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  assert.equal(first.finance.cashbook.length, 1);
  const counter = countFinanceReads(env);
  now += 5 * 60_000; // 5 phút, chưa ai ghi → dùng tiếp, không dựng lại
  await (await request("/api/bootstrap", { headers: admin })).json();
  assert.equal(counter.reads, 0);
  // Script ngoài tiến trình ghi thẳng database (không qua trackKvWrites) → phiên bản đổi.
  values.set("finance:steps-demo", { ...financeFixture(), cashbook: [] });
  versions["finance:steps-demo"] = 2;
  now += 61_000;
  const after = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  assert.equal(after.finance.cashbook.length, 0, "nhận dữ liệu script vừa ghi");
});


test("bootstrap ?split=1: bản nhẹ + phần tải sau ghép lại đúng bằng bản đầy đủ; token không dùng được cho vai trò khác", async () => {
  const { request, admin } = await setup();
  await settle(request, admin);
  const full = await (await request("/api/bootstrap", { headers: admin })).json() as any;
  const lite = await (await request("/api/bootstrap?split=1", { headers: admin })).json() as any;
  const meta = lite.bootstrapRest;
  assert.ok(meta?.token);
  assert.ok(meta.paths.includes("finance.cashbook"));
  assert.equal(lite.finance.cashbook, null);
  const rest = await (await request(`/api/bootstrap/rest?token=${meta.token}`, { headers: admin })).json() as any;
  delete lite.bootstrapRest;
  for (const path of meta.paths) {
    const parts = path.split(".");
    const key = parts.pop();
    const holder = parts.reduce((node: any, part: string) => node[part], lite);
    holder[key] = rest.values[path];
  }
  assert.equal(JSON.stringify(lite), JSON.stringify(full));
  const anonymous = await request(`/api/bootstrap/rest?token=${meta.token}`);
  assert.equal(anonymous.status, 401);
  const wrong = await request(`/api/bootstrap/rest?token=khong-co`, { headers: admin });
  assert.equal(wrong.status, 409);
});
