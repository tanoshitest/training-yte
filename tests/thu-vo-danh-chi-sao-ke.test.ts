/**
 * Giao dịch lệch "Thu vô danh" (ghi thu vào sổ quỹ khi chưa dò ra học viên) và nhập sao kê
 * ghi luôn khoản chi (ghi nợ) vào Quản lý thu chi từ 05/11/2026 — anh Vũ 04/11/2026.
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import worker from "../cloudflare/worker";
import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger, mergeSepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";
import { extractStatementRows, processBankStatement, remapStatementColumns } from "../cloudflare/bank-statement";
import { SyllabusCatalog, SyllabusDocumentObject } from "../cloudflare/syllabus-storage";

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

/** Dòng sao kê: số dương = ghi có (tiền vào), số âm = ghi nợ (tiền ra, ghi vào cột Ghi nợ). */
function statementSheet(rows: Array<[string, number, string]>, header = true) {
  const body = rows.map(([date, amount, content], i) => [i + 1, date, amount < 0 ? -amount : "", amount > 0 ? amount : "", "", content]);
  return header ? [["STT", "Ngày giao dịch", "Ghi nợ", "Ghi có", "Số dư", "Nội dung"], ...body] : body;
}

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


async function login(env: unknown) {
  const res = await worker.fetch(new Request("http://lms.test/api/login", { method: "POST", body: JSON.stringify({ email: "admin@steps.vn", password: "strong-test-password" }) }), env as never);
  return res.headers.get("set-cookie")!.split(";", 1)[0];
}

const rowsOf = (rows: Array<[string, number, string]>) => {
  const remapped = remapStatementColumns(statementSheet(rows));
  return extractStatementRows(remapped.rows, Boolean(remapped.columns && remapped.columns.debit >= 0));
};

test("sao kê: dòng ghi nợ từ 05/11/2026 thành khoản chi, trước đó bỏ qua; tải lại không nhân đôi", () => {
  const ledger = seedLedger();
  const rows = rowsOf([
    ["04/11/2026 10:00:00", -300_000, "chi tien dien thang 10"],
    ["05/11/2026 09:30:00", -1_200_000, "chuyen tien thue nha"],
    ["05/11/2026 10:00:00", 777_000, "chuyen tien hoc"],
  ]);
  assert.deepEqual(rows.map((row) => row.amount), [-300_000, -1_200_000, 777_000]);
  const out = processBankStatement(ledger, [a, b], rows, NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true, recordExpenses: true });
  assert.equal(out.rows[0].result, "NO_CODE", "tiền ra trước 05/11 bỏ qua");
  assert.equal(out.rows[1].result, "EXPENSE");
  assert.equal(out.rows[2].queued, true, "tiền vào lệch vẫn vào hàng đợi");
  assert.equal(out.expenses.length, 1);
  assert.equal(out.expenses[0].transferType, "OUT");
  assert.equal(out.expenses[0].transferAmount, 1_200_000);
  const again = processBankStatement(out.ledger, [a, b], rows, NOW, [{ id: cls.id, code: cls.code }], { queueUnmatched: true, recordExpenses: true });
  assert.equal(again.expenses.length, 0, "tải lại không ghi chi lần nữa");
  assert.equal(again.rows[1].result, "DUPLICATE");
});

test("nhập sao kê trên web: khoản chi ghi vào Quản lý thu chi (CHI, chuyển khoản, ngày chứng từ = ngày GD)", async () => {
  const { env, kv } = testEnv();
  const cookie = await login(env);
  const post = (mode: string) => worker.fetch(new Request("http://lms.test/api/finance/bank-statement", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ fileName: "sk.xlsx", mode, fileBase64: fileBase64([
    ["05/11/2026 09:30:00", -1_200_000, "chuyen tien thue nha"],
  ]) }) }), env as never);
  const preview = await (await post("preview")).json() as any;
  assert.equal(preview.summary.expense, 1);
  assert.equal(preview.summary.expenseAmount, 1_200_000);
  assert.equal(((kv.get("finance:steps-demo") as any).cashbook || []).length, 0, "xem trước không ghi");
  const applied = await post("apply");
  assert.equal(applied.status, 200);
  const cash = (kv.get("finance:steps-demo") as any).cashbook;
  const entry = cash.find((row: any) => row.kind === "OUT");
  assert.ok(entry, "có dòng chi");
  assert.equal(entry.amount, 1_200_000);
  assert.equal(entry.method, "Chuyển khoản");
  assert.equal(entry.source, "MANUAL");
  assert.match(entry.description, /thue nha/);
  assert.match(String(entry.voucherDate), /^2026-11-05T02:30/);
  assert.ok(entry.bankTransactionId);
  await post("apply");
  assert.equal((kv.get("finance:steps-demo") as any).cashbook.filter((row: any) => row.kind === "OUT").length, 1, "nhập lại file không nhân đôi khoản chi");
});

test("Giao dịch lệch › Thu vô danh: ghi THU vào sổ quỹ hôm nay, chưa gắn học viên, gỡ khỏi hàng đợi", async () => {
  const { env, kv } = testEnv();
  const cookie = await login(env);
  await worker.fetch(new Request("http://lms.test/api/finance/bank-statement", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ fileName: "sk.xlsx", mode: "apply", fileBase64: fileBase64([
    ["03/11/2026 17:39:00", 500_000, "LE THI TUYET chuyen tien"],
  ]) }) }), env as never);
  let ledger = mergeSepayLedger((kv.get("finance:steps-demo") as any).sepay);
  const tx = ledger.bankTransactions.find((row) => row.content === "LE THI TUYET chuyen tien")!;
  assert.equal(tx.status, "UNMATCHED");
  const web = (body: unknown) => worker.fetch(new Request("http://lms.test/api/finance/sepay", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env as never);
  const res = await web({ action: "collect-anonymous", transactionId: tx.id, note: "chờ dò tên" });
  assert.equal(res.status, 200);
  const finance = kv.get("finance:steps-demo") as any;
  const entry = finance.cashbook.find((row: any) => row.bankTransactionId === tx.id);
  assert.ok(entry);
  assert.equal(entry.kind, "IN");
  assert.equal(entry.amount, 500_000);
  assert.equal(entry.category, "Thu vô danh");
  assert.equal(entry.studentName, undefined, "chưa gắn học viên");
  assert.equal(entry.receiptId, undefined, "không tạo biên lai học phí");
  assert.match(entry.description, /chờ dò tên/);
  ledger = mergeSepayLedger(finance.sepay);
  const done = ledger.bankTransactions.find((row) => row.id === tx.id)!;
  assert.equal(done.status, "IGNORED");
  assert.match(String(done.resolution), /Thu vô danh/);
  assert.equal(ledger.receipts.length, 0, "không đụng học phí");
  assert.equal((await web({ action: "collect-anonymous", transactionId: tx.id })).status, 400, "không thu vô danh 2 lần");
  const audit = kv.get("audit:steps-demo") as any[];
  assert.ok(audit.some((row) => /Thu vô danh 500\.000đ/.test(row.summary)));
});
