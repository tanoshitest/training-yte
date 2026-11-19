import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker";
import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";

const TOKEN = "test-readonly-token-0123456789abcdef";
const NOW = new Date();

function seed() {
  const student: DemoStudent = {
    id: "stu-1", code: "HV0001", fullName: "Nguyễn Minh Anh", phone: "0901234567", address: "Q1", school: "TH A",
    parentZalo: "", parentName: "Nguyễn Thị Lan", parentPhone1: "0901234567", status: "STUDYING",
    loginEmail: "hv0001@steps.vn", loginPassword: "mat-khau-bi-mat", nationalId: "001200000000",
  } as DemoStudent;
  const cls: DemoClass = {
    id: "class-1", code: "T1", name: "Lớp T1", classTypeId: "x", branchId: "b1", teacherId: "t1", roomId: "", syllabusId: "",
    status: "ACTIVE", studentIds: [student.id], schedules: [{ weekday: 1, periodId: "p", startTime: "17:00", endTime: "18:30" }],
    note: "", billingMode: "MONTHLY", sessionPrice: 100_000,
  } as DemoClass;
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], NOW);
  return new Map<string, unknown>([
    ["students:steps-demo", [student]],
    ["classes:steps-demo", [cls]],
    ["sessions:steps-demo", []],
    ["teachers:steps-demo", [{ id: "t1", code: "GV0001", fullName: "Cô Quỳnh", phone: "0919", address: "", email: "q@steps.vn", assignedClasses: [] }]],
    ["finance:steps-demo", { debts: [], cashbook: [{ id: "c1", date: "2026-10-20", kind: "IN", source: "MANUAL", category: "Khác", description: "Thu khác", amount: 50_000, method: "Tiền mặt" }], recon: [], reconEntries: [], payroll: [{ net: 99 }], forecasts: [], sepay: ledger }],
    ["settings:steps-demo", { branches: [{ id: "b1", name: "Chi nhánh 1" }] }],
    ["accountants:steps-demo", [{ email: "kt@steps.vn", password: "secret" }]],
  ]);
}

function env(token: string | null = TOKEN) {
  const values = seed();
  const writes: string[] = [];
  const reads: string[] = [];
  return {
    writes,
    reads,
    env: {
      ASSETS: { fetch: async () => new Response("asset") },
      STEPS_LMS_DATA: {
        get: async (key: string) => { reads.push(key); return structuredClone(values.get(key) ?? null); },
        put: async (key: string) => { writes.push(key); },
        delete: async (key: string) => { writes.push(`delete:${key}`); },
        compareAndPut: async (key: string) => { writes.push(key); return true; },
      },
      AUTH_SECRET: "auth-secret-for-tests-only-123456",
      DEMO_PASSWORD: "",
      LMS_READONLY_API_TOKEN: token ?? undefined,
    },
  };
}

const call = (e: unknown, path: string, init: RequestInit = {}, token: string | null = TOKEN) => worker.fetch(
  new Request(`http://lms.test${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } }),
  e as never,
);

test("thiếu token, sai token, hoặc server chưa cấu hình token → 401", async () => {
  const { env: e } = env();
  assert.equal((await call(e, "/api/v1/readonly/summary", {}, null)).status, 401);
  assert.equal((await call(e, "/api/v1/readonly/summary", {}, "sai-token")).status, 401);
  assert.equal((await call(e, "/api/v1/readonly/summary", { headers: { Authorization: `Basic ${TOKEN}` } }, null)).status, 401);
  const { env: off } = env(null);
  assert.equal((await call(off, "/api/v1/readonly/summary")).status, 401);
  const { env: blank } = env("");
  assert.equal((await call(blank, "/api/v1/readonly/summary", {}, "")).status, 401);
});

test("chỉ GET: POST/PUT/PATCH/DELETE → 405, không ghi gì", async () => {
  const { env: e, writes } = env();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await call(e, "/api/v1/readonly/students", { method, body: method === "DELETE" ? undefined : "{}" });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "GET");
  }
  assert.deepEqual(writes, []);
});

test("mọi endpoint GET đều trả 200, không ghi dữ liệu, không đặt cookie", async () => {
  const { env: e, writes } = env();
  const paths = [
    "/api/v1/readonly", "/api/v1/readonly/summary", "/api/v1/readonly/students", "/api/v1/readonly/students/HV0001",
    "/api/v1/readonly/classes", "/api/v1/readonly/classes/T1", "/api/v1/readonly/teachers",
    "/api/v1/readonly/sessions?from=2026-10-01&to=2026-10-31&attendance=1", "/api/v1/readonly/periodic-reports",
    "/api/v1/readonly/finance/debts", "/api/v1/readonly/finance/receipts", "/api/v1/readonly/finance/cashbook?from=2026-10-01&to=2026-10-31",
    "/api/v1/readonly/finance/bank-transactions", "/api/v1/readonly/finance/recon",
  ];
  for (const path of paths) {
    const res = await call(e, path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("set-cookie"), null, path);
    assert.equal(res.headers.get("cache-control"), "no-store", path);
  }
  assert.deepEqual(writes, [], "API chỉ đọc không được ghi bất kỳ khóa nào");
});

test("không lộ mật khẩu, email đăng nhập, CCCD, tài khoản nhân viên, lương", async () => {
  const { env: e, reads } = env();
  const body = await (await call(e, "/api/v1/readonly/students/HV0001")).text();
  assert.ok(body.includes("Nguyễn Minh Anh"));
  for (const secret of ["mat-khau-bi-mat", "hv0001@steps.vn", "001200000000", "loginPassword", "nationalId"]) assert.ok(!body.includes(secret), secret);
  assert.ok(!reads.includes("accountants:steps-demo"));
  const summary = await (await call(e, "/api/v1/readonly/summary")).text();
  assert.ok(!summary.includes("payroll"));
});

test("dữ liệu đúng: học phí lớp tháng, sổ thu chi, lọc, 404, khoảng ngày sai", async () => {
  const { env: e } = env();
  const student = await (await call(e, "/api/v1/readonly/students/hv0001")).json() as any;
  assert.equal(student.profile.code, "HV0001");
  assert.equal(student.classes[0].code, "T1");
  assert.equal(student.tuition[0].classCode, "T1");
  assert.equal(typeof student.tuition[0].debt, "number");
  assert.equal(student.debtSource, "Như màn hình Quản lý học phí", "công nợ phải tính bằng đúng hàm của app (worker thread)");
  const list = await (await call(e, "/api/v1/readonly/students?q=minh%20anh")).json() as any;
  assert.equal(list.total, 1);
  const cash = await (await call(e, "/api/v1/readonly/finance/cashbook?from=2026-10-01&to=2026-10-31")).json() as any;
  assert.equal(cash.totals.inCash, 50_000);
  assert.equal((await call(e, "/api/v1/readonly/students/HV9999")).status, 404);
  assert.equal((await call(e, "/api/v1/readonly/khong-co")).status, 404);
  assert.equal((await call(e, "/api/v1/readonly/sessions?from=2026-01-01&to=2026-12-31")).status, 400);
  assert.equal((await call(e, "/api/v1/readonly/sessions?from=hom-qua")).status, 400);
});

test("các API cũ không bị ảnh hưởng: token chỉ đọc không mở được API thường", async () => {
  const { env: e } = env();
  const res = await call(e, "/api/finance");
  assert.equal(res.status, 401);
});

test("401 có chẩn đoán an toàn: nhận ra mã tham chiếu hsurr:, không lộ token trong body hay log", async () => {
  const { env: e } = env();
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  try {
    const ref = await call(e, "/api/v1/readonly/summary", {}, "hsurr:abc123-secret-ref");
    assert.equal(ref.status, 401);
    const body = await ref.json() as any;
    assert.equal(body.reason, "TOKEN_MISMATCH");
    assert.equal(body.received.startsWithHsurr, true);
    assert.equal(body.received.length, "hsurr:abc123-secret-ref".length);
    assert.match(body.hint, /hsurr/);
    const missing = await (await call(e, "/api/v1/readonly/summary", {}, null)).json() as any;
    assert.equal(missing.reason, "MISSING_HEADER");
    const basic = await (await call(e, "/api/v1/readonly/summary", { headers: { Authorization: `Token ${TOKEN}` } }, null)).json() as any;
    assert.equal(basic.reason, "NOT_BEARER");
    const wrong = await (await call(e, "/api/v1/readonly/summary", {}, "sai-token-1234567890")).json() as any;
    assert.match(wrong.received.sha256_8, /^[0-9a-f]{8}$/);
    const ok = await call(e, "/api/v1/readonly/students");
    assert.equal(ok.status, 200);
  } finally {
    console.log = original;
  }
  const all = logs.join("\n");
  assert.ok(logs.some((l) => /readonly-api.*-> 401 reason=TOKEN_MISMATCH len=\d+ hsurr=yes recvSha8=[0-9a-f]{8} envSha8=[0-9a-f]{8}/.test(l)), all);
  assert.ok(logs.some((l) => /GET \/api\/v1\/readonly\/students -> 200$/.test(l)), all);
  assert.ok(!all.includes(TOKEN), "log không được chứa token thật");
  assert.ok(!all.includes("abc123-secret-ref"), "log không được chứa chuỗi header nhận được");
});
