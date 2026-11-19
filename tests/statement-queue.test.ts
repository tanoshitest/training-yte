/**
 * Nhập sao kê 28/10/2026: dòng khớp mã ghi học phí; dòng tiền vào không khớp vào hàng đợi
 * Giao dịch lệch (chống trùng khi tải lại); gán tay / đánh dấu đã xử lý; API thao tác cho
 * trợ lý (xem trước → xác nhận, dữ liệu đổi thì phải xem lại).
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import worker from "../cloudflare/worker";
import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger, mergeSepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";
import { extractStatementRows, processBankStatement } from "../cloudflare/bank-statement";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";
import { _resetOpsPreviews } from "../cloudflare/ops-api";

const OPS_TOKEN = "ops-test-token-0123456789abcdef";

function student(id: string, code: string, fullName: string, parentName = ""): DemoStudent {
  return { id, code, fullName, parentName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING", sessionBalances: { "class-test": 10 } } as DemoStudent;
}

function monthlyClass(studentIds: string[]): DemoClass {
  return {
    id: "class-test", code: "TEST", name: "Lớp kiểm thử", classTypeId: "class-standard", branchId: "branch-test",
    teacherId: "teacher-test", roomId: "", syllabusId: "", status: "ACTIVE", studentIds,
    schedules: [
      { weekday: 1, periodId: "period-monday", startTime: "17:00", endTime: "19:00" },
      { weekday: 3, periodId: "period-wednesday", startTime: "14:30", endTime: "16:30" },
    ],
    note: "", billingMode: "MONTHLY", sessionPrice: 100_000, courseSessions: 24,
  } as DemoClass;
}

const a = student("stu-a", "HV0001", "Nguyễn Văn An", "Trần Thị Dung");
const b = student("stu-b", "HV0002", "Lê Thị Bình", "Phạm Văn Cường");
const cls = monthlyClass([a.id, b.id]);
const NOW = new Date();

function seedLedger() {
  return syncTuitionReceivables(emptySepayLedger(), [cls], [a, b], [], NOW);
}
const billOf = (ledger: any, s: DemoStudent) => ledger.receivables.find((r: any) => r.studentId === s.id && r.status === "OPEN");

function statementSheet(rows: Array<[string, number, string]>, header = true) {
  const body = rows.map(([date, amount, content], i) => [i + 1, date, "", amount, "", content]);
  return header ? [["STT", "Ngày giao dịch", "Ghi nợ", "Ghi có", "Số dư", "Nội dung"], ...body] : body;
}

test("processBankStatement: khớp mã thì ghi, tiền vào không khớp vào hàng đợi, tiền ra bỏ qua, tải lại không nhân đôi", () => {
  const ledger = seedLedger();
  const due = billOf(ledger, a).balanceDue;
  const rows = extractStatementRows(statementSheet([
    ["20/10/2026 08:00:00", due, "PH nop HPTESTHV0001"],          // khớp
    ["20/10/2026 09:00:00", 777_000, "chuyen tien hoc"],           // không mã → hàng đợi
    ["20/10/2026 10:00:00", 123_000, "HPTESTHV0002 thieu"],         // sai số tiền (chuyển thiếu được ghi một phần nếu autoPartial) hoặc lệch
    ["20/10/2026 11:00:00", 0, "phi chuyen tien"],                  // tiền ra
  ], false));
  const out = processBankStatement(ledger, [a, b], rows, NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true });
  assert.equal(out.rows.length, rows.length);
  assert.equal(out.rows[0].result, "APPLIED");
  assert.equal(out.rows[1].queued, true);
  assert.equal(out.rows[3].queued, undefined, "tiền ra không vào hàng đợi");
  const queued = out.ledger.bankTransactions.filter((tx) => ["UNMATCHED", "NEEDS_REVIEW"].includes(tx.status));
  assert.ok(queued.some((tx) => tx.transferAmount === 777_000 && tx.reviewReason === "NO_PAYMENT_CODE" && tx.status === "UNMATCHED"));
  assert.ok(queued.every((tx) => tx.provider === "BANK_IMPORT" && tx.reviewNote !== undefined));

  // Tải lại đúng file: không ghi thêm, không thêm hàng đợi.
  const again = processBankStatement(out.ledger, [a, b], rows, NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true });
  assert.equal(again.completed.length, 0);
  assert.equal(again.rows.filter((row) => row.queued).length, 0);
  assert.equal(again.ledger.bankTransactions.length, out.ledger.bankTransactions.length);
});

test("mã của phiếu đã thu đủ (trả trùng) → vào hàng đợi với lý do Đã thu", () => {
  // A chỉ còn đúng 1 phiếu mở để lần chuyển thứ hai là trả trùng.
  const seeded = seedLedger();
  const keep = billOf(seeded, a).id;
  const ledger = { ...seeded, receivables: seeded.receivables.map((r: any) => r.studentId === a.id && r.id !== keep ? { ...r, status: "PAID", amountPaid: r.amountDue, balanceDue: 0 } : r) };
  const due = billOf(ledger, a).balanceDue;
  const first = processBankStatement(ledger, [a, b], extractStatementRows(statementSheet([["20/10/2026 08:00:00", due, "HPTESTHV0001"]], false)), NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true });
  const second = processBankStatement(first.ledger, [a, b], extractStatementRows(statementSheet([["21/10/2026 08:00:00", due, "HPTESTHV0001 lan 2"]], false)), NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true });
  assert.equal(second.completed.length, 0);
  assert.equal(second.rows[0].queued, true);
  const tx = second.ledger.bankTransactions.find((row) => row.content === "HPTESTHV0001 lan 2");
  assert.ok(tx && ["ALREADY_PAID", "NO_OPEN_BILL"].includes(String(tx.reviewReason)), String(tx?.reviewReason));
});

test("không bật queueUnmatched → giữ hành vi cũ (không lưu dòng lệch)", () => {
  const ledger = seedLedger();
  const out = processBankStatement(ledger, [a, b], extractStatementRows(statementSheet([["20/10/2026 09:00:00", 777_000, "chuyen tien hoc"]], false)), NOW, []);
  assert.equal(out.ledger.bankTransactions.length, ledger.bankTransactions.length);
});

// ---------- qua worker: web + API thao tác ----------
class MemoryStorage {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

function testEnv(opsToken: string | null = OPS_TOKEN) {
  const kv = new Map<string, unknown>();
  kv.set("students:steps-demo", [a, b]);
  kv.set("classes:steps-demo", [cls]);
  kv.set("sessions:steps-demo", []);
  kv.set("finance:steps-demo", { debts: [], cashbook: [], recon: [], reconEntries: [], payroll: [], forecasts: [], sepay: seedLedger() });
  const catalogs = new Map<string, SyllabusCatalog>();
  const documents = new Map<string, SyllabusDocumentObject>();
  return {
    kv,
    env: {
      ASSETS: { fetch: async () => new Response("asset") },
      STEPS_LMS_DATA: {
        get: async (key: string) => structuredClone(kv.get(key) ?? null),
        put: async (key: string, value: string) => { kv.set(key, JSON.parse(value)); },
        compareAndPut: async (key: string, expected: string, value: string) => {
          if (JSON.stringify(kv.get(key) ?? null) !== expected) return false;
          kv.set(key, JSON.parse(value));
          return true;
        },
      },
      SYLLABUS_CATALOG: { getByName(name: string) { let v = catalogs.get(name); if (!v) { v = new SyllabusCatalog({ storage: new MemoryStorage() } as never, {}); catalogs.set(name, v); } return v; } },
      SYLLABUS_DOCUMENT: { getByName(name: string) { let v = documents.get(name); if (!v) { v = new SyllabusDocumentObject({ storage: new MemoryStorage() } as never, {}); documents.set(name, v); } return v; } },
      AUTH_SECRET: "statement-queue-test-secret-at-least-32-chars",
      DEMO_PASSWORD: "",
      SEED_ADMIN_EMAIL: "admin@steps.vn",
      SEED_ADMIN_PASSWORD: "strong-test-password",
      SEED_ADMIN_NAME: "Quản trị STEPS",
      ALLOW_DEMO_LOGIN: "false",
      LMS_OPS_API_TOKEN: opsToken ?? undefined,
    },
  };
}

function fileBase64(rows: Array<[string, number, string]>) {
  const sheet = XLSX.utils.aoa_to_sheet(statementSheet(rows));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return Buffer.from(XLSX.write(book, { type: "array", bookType: "xlsx" })).toString("base64");
}

const ops = (env: unknown, path: string, body?: unknown, token: string | null = OPS_TOKEN, method = "POST") => worker.fetch(
  new Request(`http://lms.test/api/v1/ops${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }),
  env as never,
);

test("API thao tác: không token / sai token → 401; chưa cấu hình → 401; GET chỉ trả mô tả; method khác → 405", async () => {
  _resetOpsPreviews();
  const { env } = testEnv();
  assert.equal((await ops(env, "/bank-statement/preview", {}, null)).status, 401);
  assert.equal((await ops(env, "/bank-statement/preview", {}, "sai-token-123456789")).status, 401);
  assert.equal((await ops(testEnv(null).env, "/bank-statement/preview", {})).status, 401);
  assert.equal((await ops(env, "", undefined, OPS_TOKEN, "GET")).status, 200);
  assert.equal((await ops(env, "/bank-statement/preview", undefined, OPS_TOKEN, "GET")).status, 405);
  // token chỉ đọc không mở được API thao tác và ngược lại
  assert.equal((await worker.fetch(new Request("http://lms.test/api/v1/readonly/summary", { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }), env as never)).status, 401);
});

test("API thao tác: xem trước không ghi gì; xác nhận ghi khớp + đưa dòng lệch vào hàng đợi; previewId dùng một lần", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), a).balanceDue;
  const before = JSON.stringify(kv.get("finance:steps-demo"));
  const preview = await ops(env, "/bank-statement/preview", { fileName: "sk.xlsx", fileBase64: fileBase64([
    ["20/10/2026 08:00:00", due, "PH nop HPTESTHV0001"],
    ["20/10/2026 09:00:00", 777_000, "chuyen tien hoc"],
  ]) });
  assert.equal(preview.status, 200);
  const p = await preview.json() as any;
  assert.equal(p.summary.applied, 1);
  assert.equal(p.summary.queued, 1);
  assert.match(p.message, /1 giao dịch khớp mã .* 1 giao dịch lệch/);
  assert.equal(p.unmatched[0].amount, 777_000);
  assert.equal(JSON.stringify(kv.get("finance:steps-demo")), before, "xem trước không được ghi");

  const commit = await ops(env, "/bank-statement/commit", { previewId: p.previewId });
  assert.equal(commit.status, 200);
  const c = await commit.json() as any;
  assert.equal(c.summary.applied, 1);
  const ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  assert.equal(ledger.receipts.length, 1);
  assert.ok(ledger.bankTransactions.some((tx) => tx.transferAmount === 777_000 && tx.status === "UNMATCHED"));
  const audit = kv.get("audit:steps-demo") as any[];
  assert.ok(audit.some((row) => /Muse/.test(String(row.userName || row.user || JSON.stringify(row))) && /Nhập sao kê/.test(row.summary)));

  assert.equal((await ops(env, "/bank-statement/commit", { previewId: p.previewId })).status, 410, "previewId chỉ dùng một lần");
});

test("API thao tác: dữ liệu đổi sau khi xem trước → 409, không ghi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), a).balanceDue;
  const p = await (await ops(env, "/bank-statement/preview", { fileName: "sk.xlsx", fileBase64: fileBase64([["20/10/2026 08:00:00", due, "HPTESTHV0001"]]) })).json() as any;
  const finance = kv.get("finance:steps-demo") as any;
  kv.set("finance:steps-demo", { ...finance, cashbook: [{ id: "c-x", date: "2026-10-20", kind: "OUT", source: "MANUAL", category: "Khác", description: "chi", amount: 1000, method: "Tiền mặt" }] });
  const changed = JSON.stringify(kv.get("finance:steps-demo"));
  const res = await ops(env, "/bank-statement/commit", { previewId: p.previewId });
  assert.equal(res.status, 409);
  assert.equal((await res.json() as any).code, "STALE_PREVIEW");
  assert.equal(JSON.stringify(kv.get("finance:steps-demo")), changed);
});

async function login(env: unknown) {
  const res = await worker.fetch(new Request("http://lms.test/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) }), env as never);
  return res.headers.get("set-cookie")!.split(";", 1)[0];
}

test("hàng đợi: Gán cho phiếu ghi thu đúng học viên; tiền lớn hơn nợ bị từ chối; Bỏ qua / Đã thu thủ công gỡ khỏi hàng đợi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const cookie = await login(env);
  const web = (body: unknown) => worker.fetch(new Request("http://lms.test/api/finance/sepay", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env as never);
  const due = billOf(seedLedger(), b).balanceDue;
  // Đưa 3 dòng lệch vào hàng đợi qua nút nhập sao kê trên web.
  const imp = await worker.fetch(new Request("http://lms.test/api/finance/bank-statement", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ fileName: "sk.xlsx", mode: "apply", fileBase64: fileBase64([
    ["22/10/2026 08:00:00", due, "Le Thi Binh nop hoc phi"],
    ["22/10/2026 09:00:00", due + 999_000, "chuyen tien"],
    ["22/10/2026 10:00:00", 50_000, "tien nuoc"],
  ]) }) }), env as never);
  assert.equal(imp.status, 200);
  const sum = (await imp.json() as any).summary;
  assert.equal(sum.queued, 3);
  let ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  const [q1, q2, q3] = ["Le Thi Binh nop hoc phi", "chuyen tien", "tien nuoc"].map((content) => ledger.bankTransactions.find((tx) => tx.content === content)!);
  const billB = billOf(ledger, b);

  const tooMuch = await web({ action: "assign-review", transactionId: q2.id, receivableId: billB.id });
  assert.equal(tooMuch.status, 400);
  assert.match((await tooMuch.json() as any).error, /lớn hơn số còn nợ/);

  const ok = await web({ action: "assign-review", transactionId: q1.id, receivableId: billB.id });
  assert.equal(ok.status, 200);
  ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  assert.equal(ledger.receivables.find((r) => r.id === billB.id)!.status, "PAID");
  assert.ok(ledger.payments.some((p) => p.studentId === b.id && p.bankTransactionId === q1.id));
  const assigned = ledger.bankTransactions.find((tx) => tx.id === q1.id)!;
  assert.equal(assigned.status, "ALLOCATED");
  assert.equal(assigned.content, "Le Thi Binh nop hoc phi", "giữ nguyên nội dung sao kê gốc");
  assert.match(String(assigned.resolution), /Lê Thị Bình/);
  const cash = (kv.get("finance:steps-demo") as any).cashbook;
  assert.ok(cash.some((row: any) => row.receiptId && row.amount === due), "có dòng sổ thu chi");

  assert.equal((await web({ action: "resolve-review", transactionId: q3.id, resolution: "NOT_TUITION", note: "tiền nước" })).status, 200);
  assert.equal((await web({ action: "resolve-review", transactionId: q2.id, resolution: "MANUAL_COLLECTED" })).status, 200);
  ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  assert.equal(ledger.bankTransactions.filter((tx) => ["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(tx.status)).length, 0);
  assert.match(String(ledger.bankTransactions.find((tx) => tx.id === q3.id)!.resolution), /Không phải học phí.*tiền nước/);
  assert.equal((await web({ action: "resolve-review", transactionId: q3.id, resolution: "NOT_TUITION" })).status, 400, "đã xử lý thì không còn trong hàng đợi");
});

test("API thao tác nhận các dòng trợ lý đọc từ sao kê (ngày, số tiền, nội dung) — ghi khớp vào thu chi, lệch vào hàng đợi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), a).balanceDue;
  const p = await (await ops(env, "/bank-statement/preview", { fileName: "muse-26-10", rows: [
    { date: "26/10/2026 07:20", amount: due, content: "TKThe :9999| tai Techcombank. HPTESTHV0001 FT2629" },
    { date: "2026-10-26 09:15", amount: "777.000", content: "chuyen tien hoc" },
    { date: "26/10/2026 10:00", amount: -50_000, content: "phi dich vu" },
  ] })).json() as any;
  assert.equal(p.summary.applied, 1);
  assert.equal(p.summary.queued, 1, "tiền ra (âm) không bao giờ thành tiền vào");
  assert.equal((await ops(env, "/bank-statement/commit", { previewId: p.previewId })).status, 200);
  const finance = kv.get("finance:steps-demo") as any;
  assert.ok(finance.cashbook.some((row: any) => row.amount === due && row.receiptId), "khớp → có dòng thu chi");
  assert.ok(mergeSepayLedger(finance.sepay).bankTransactions.some((tx) => tx.transferAmount === 777_000 && tx.status === "UNMATCHED"), "lệch → hàng đợi");
});

test("dòng sai dạng ngày / thiếu nội dung → báo lỗi rõ số dòng, không ghi", async () => {
  _resetOpsPreviews();
  const { env } = testEnv();
  const bad = await ops(env, "/bank-statement/preview", { rows: [{ date: "hôm qua", amount: 1, content: "x" }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json() as any).error, /Dòng 1/);
  assert.equal((await ops(env, "/bank-statement/preview", { rows: [{ date: "26/10/2026", amount: 1, content: "" }] })).status, 400);
});

test("cùng một sao kê: trợ lý gửi từng dòng (ngày thiếu giây) rồi tải file lên web → không ghi trùng", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), a).balanceDue;
  const p = await (await ops(env, "/bank-statement/preview", { rows: [
    { date: "26/10/2026 07:20", amount: due, content: "HPTESTHV0001 FT2629" },
    { date: "26/10/2026 09:15", amount: 777_000, content: "chuyen tien hoc" },
  ] })).json() as any;
  await ops(env, "/bank-statement/commit", { previewId: p.previewId });
  const before = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  const rows = extractStatementRows(statementSheet([
    ["26/10/2026 07:20:41", due, "HPTESTHV0001 FT2629"],
    ["26/10/2026 09:15:03", 777_000, "chuyen  tien  hoc"],
  ]));
  const out = processBankStatement(before, [a, b], rows, NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true });
  assert.equal(out.completed.length, 0);
  assert.equal(out.rows.filter((row) => row.queued).length, 0);
  assert.ok(out.rows.filter((row) => row.amount > 0).every((row) => row.result === "DUPLICATE"));
});

// ---------- trợ lý xử lý Giao dịch lệch theo lệnh anh Vũ ----------
async function queueViaOps(env: unknown, rows: Array<{ date: string; amount: number; content: string }>) {
  const p = await (await ops(env, "/bank-statement/preview", { fileName: "muse", rows })).json() as any;
  assert.equal((await ops(env, "/bank-statement/commit", { previewId: p.previewId })).status, 200);
}
const queueOf = (kv: Map<string, unknown>) => mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay).bankTransactions
  .filter((tx) => ["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(tx.status));

test("trợ lý: xem hàng đợi → xem trước thu cho HV (không ghi) → xác nhận thu, gỡ khỏi hàng đợi, ngày chứng từ = ngày CK", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), b).balanceDue;
  await queueViaOps(env, [{ date: "26/10/2026 08:30", amount: due, content: "Le Thi Binh nop hoc phi" }]);

  const queue = await (await ops(env, "/review-queue", undefined, OPS_TOKEN, "GET")).json() as any;
  assert.equal(queue.count, 1);
  const item = queue.items[0];
  assert.equal(item.amount, due);
  assert.equal(item.date, "26/10/2026 08:30");
  assert.equal(item.reason, "Không CK theo mã QR");

  const before = JSON.stringify(kv.get("finance:steps-demo"));
  const pre = await ops(env, "/review/preview", { transactionId: item.transactionId, action: "collect", studentCode: "hv0002", classCode: "test" });
  assert.equal(pre.status, 200);
  const p = await pre.json() as any;
  assert.match(p.message, /Lê Thị Bình \(HV0002\) lớp TEST/);
  assert.equal(p.preview.total, due);
  assert.ok(p.previewId);
  assert.equal(JSON.stringify(kv.get("finance:steps-demo")), before, "xem trước không ghi");
  assert.equal((await ops(env, "/bank-statement/commit", { previewId: p.previewId })).status, 410, "previewId thu lệch không dùng cho nhập sao kê");

  const p2 = await (await ops(env, "/review/preview", { transactionId: item.transactionId, action: "collect", studentCode: "HV0002" })).json() as any;
  const commit = await ops(env, "/review/commit", { previewId: p2.previewId });
  assert.equal(commit.status, 200);
  assert.match((await commit.json() as any).message, /Đã thu/);
  const finance = kv.get("finance:steps-demo") as any;
  const ledger = mergeSepayLedger(finance.sepay);
  assert.ok(ledger.receipts.some((r: any) => r.studentId === b.id && r.amount === due));
  const tx = ledger.bankTransactions.find((row) => row.id === item.transactionId)!;
  assert.equal(tx.status, "IGNORED");
  assert.match(String(tx.resolution), /Đã thu thủ công: Lê Thị Bình \(HV0002\)/);
  assert.equal(tx.resolvedBy, "Muse (trợ lý AI)");
  const cash = finance.cashbook.find((row: any) => row.amount === due && row.receiptId);
  assert.equal(cash.voucherDate, tx.transactionDate, "ngày chứng từ = ngày chuyển khoản");
  assert.equal(queueOf(kv).length, 0);
  assert.equal((await ops(env, "/review/commit", { previewId: p2.previewId })).status, 410, "dùng một lần");
});

test("trợ lý: sai lớp / sai mã HV / thiếu action → 400 rõ lý do, không ghi; bỏ qua (không phải học phí) gỡ khỏi hàng đợi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  await queueViaOps(env, [{ date: "26/10/2026 09:00", amount: 50_000, content: "tien nuoc" }]);
  const id = queueOf(kv)[0].id;
  const before = JSON.stringify(kv.get("finance:steps-demo"));
  const wrongClass = await ops(env, "/review/preview", { transactionId: id, action: "collect", studentCode: "HV0001", classCode: "S99" });
  assert.equal(wrongClass.status, 400);
  const wc = await wrongClass.json() as any;
  assert.equal(wc.code, "CLASS_MISMATCH");
  assert.match(wc.error, /không học lớp S99.*TEST/);
  assert.equal((await (await ops(env, "/review/preview", { transactionId: id, action: "collect", studentCode: "HV9999" })).json() as any).code, "STUDENT_NOT_FOUND");
  assert.equal((await ops(env, "/review/preview", { transactionId: id, action: "xoa" })).status, 400);
  assert.equal((await ops(env, "/review/preview", { transactionId: "khong-co", action: "ignore" })).status, 404);
  assert.equal(JSON.stringify(kv.get("finance:steps-demo")), before);

  const p = await (await ops(env, "/review/preview", { transactionId: id, action: "ignore", note: "tiền nước" })).json() as any;
  assert.match(p.message, /Bỏ qua giao dịch 50\.000đ/);
  assert.equal((await ops(env, "/review/commit", { previewId: p.previewId })).status, 200);
  const tx = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay).bankTransactions.find((row) => row.id === id)!;
  assert.equal(tx.status, "IGNORED");
  assert.match(String(tx.resolution), /Không phải học phí.*tiền nước/);
  assert.equal(mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay).receipts.length, 0, "bỏ qua không ghi tiền");
});

test("trợ lý: dữ liệu học phí đổi sau khi xem trước → 409 STALE_PREVIEW, không ghi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const due = billOf(seedLedger(), b).balanceDue;
  await queueViaOps(env, [{ date: "26/10/2026 08:30", amount: due, content: "Le Thi Binh nop hoc phi" }]);
  const id = queueOf(kv)[0].id;
  const p = await (await ops(env, "/review/preview", { transactionId: id, action: "collect", studentCode: "HV0002" })).json() as any;
  const finance = kv.get("finance:steps-demo") as any;
  kv.set("finance:steps-demo", { ...finance, cashbook: [{ id: "c-x", date: "2026-10-20", kind: "OUT", source: "MANUAL", category: "Khác", description: "chi", amount: 1000, method: "Tiền mặt" }, ...finance.cashbook] });
  const changed = JSON.stringify(kv.get("finance:steps-demo"));
  const res = await ops(env, "/review/commit", { previewId: p.previewId });
  assert.equal(res.status, 409);
  assert.equal((await res.json() as any).code, "STALE_PREVIEW");
  assert.equal(JSON.stringify(kv.get("finance:steps-demo")), changed);
});

test("web: Thu thủ công từ hàng đợi gửi kèm mã giao dịch — sai số tiền bị chặn; đúng thì thu và gỡ khỏi hàng đợi trong cùng lượt ghi", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const cookie = await login(env);
  const web = (body: unknown) => worker.fetch(new Request("http://lms.test/api/finance/sepay", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env as never);
  const due = billOf(seedLedger(), b).balanceDue;
  await queueViaOps(env, [{ date: "26/10/2026 08:30", amount: due, content: "Le Thi Binh nop hoc phi" }]);
  const id = queueOf(kv)[0].id;
  const wrong = await web({ action: "collect", studentId: b.id, classId: cls.id, method: "TRANSFER", amount: due - 1000, reviewTransactionId: id });
  assert.equal(wrong.status, 400);
  assert.match((await wrong.json() as any).error, /đúng số tiền giao dịch/);
  const ok = await web({ action: "collect", studentId: b.id, classId: cls.id, method: "TRANSFER", amount: due, reviewTransactionId: id });
  assert.equal(ok.status, 200);
  assert.equal(queueOf(kv).length, 0);
  assert.ok(mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay).receipts.some((r: any) => r.studentId === b.id));
});

test("thu tay (tiền mặt / chuyển khoản bấm tay): ngày chứng từ = hôm trước ngày cập nhật", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  const cookie = await login(env);
  const web = (body: unknown) => worker.fetch(new Request("http://lms.test/api/finance/sepay", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env as never);
  const res = await web({ action: "collect", studentId: a.id, classId: cls.id, method: "CASH" });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const row = (kv.get("finance:steps-demo") as any).cashbook.find((r: any) => r.receiptId);
  assert.equal(row.date, today);
  assert.equal(row.voucherDate, yesterday);
  await web({ action: "collect", studentId: b.id, classId: cls.id, method: "TRANSFER" });
  const transfer = (kv.get("finance:steps-demo") as any).cashbook.find((r: any) => r.receiptId && r.studentName === b.fullName);
  assert.equal(transfer.voucherDate, yesterday);
});

test("webhook SePay: CK theo mã HP{lớp}{HV} đúng số tiền phiếu tháng sau → ghi đúng phiếu tháng sau, không rơi vào phiếu tháng này", async () => {
  _resetOpsPreviews();
  const { env, kv } = testEnv();
  (env as any).SEPAY_WEBHOOK_SECRET = "webhook-secret-0123456789";
  const ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  const open = ledger.receivables.filter((r: any) => r.studentId === a.id && r.status === "OPEN" && String(r.billKey).startsWith("month|"))
    .sort((x: any, y: any) => String(x.billKey).localeCompare(String(y.billKey)));
  if (open.length < 2 || open[0].balanceDue === open[1].balanceDue) return; // cần 2 phiếu khác số tiền
  const [current, next] = open;
  const res = await worker.fetch(new Request("http://lms.test/api/webhooks/sepay", {
    method: "POST", headers: { Authorization: "Apikey webhook-secret-0123456789", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "tx-next-month", content: "PH chuyen HPTESTHV0001", transferAmount: next.balanceDue, transferType: "in" }),
  }), env as never);
  assert.equal(res.status, 200);
  const after = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  assert.equal(after.receivables.find((r: any) => r.id === next.id)!.status, "PAID");
  assert.equal(after.receivables.find((r: any) => r.id === current.id)!.status, "OPEN");
});
