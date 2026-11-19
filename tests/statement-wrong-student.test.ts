/**
 * Chốt chặn "mã của học viên A nhưng ghi tiền cho học viên B" (27/10/2026).
 * Nội dung CK nêu đích danh học viên nào (mã HP{lớp}{HV}, mã HV, mã phiếu) thì tiền
 * chỉ được ghi cho đúng học viên đó — ở cả nhập sao kê, webhook và file "Tải kết quả".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { contentNamedStudentIds, emptySepayLedger, guardContentStudent, processBankTransaction } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";
import { extractStatementRows, processBankStatement } from "../cloudflare/bank-statement";

const NOW = new Date("2026-10-20T12:00:00Z");

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

/** Hai học viên A (HV0001) và B (HV0002) cùng lớp, mỗi em một phiếu T10 cùng số tiền. */
function setup() {
  const a = student("stu-a", "HV0001", "Nguyễn Văn An", "Trần Thị Dung");
  const b = student("stu-b", "HV0002", "Lê Thị Bình", "Trần Thị Dung");
  const cls = monthlyClass([a.id, b.id]);
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [a, b], [], NOW);
  const bill = (s: DemoStudent) => ledger.receivables.find((row) => row.studentId === s.id && row.billKey === `month|${cls.id}|2026-10`)!;
  const code = (s: DemoStudent) => ledger.paymentOrders.find((row) => row.id === bill(s).paymentOrderId)!.paymentCode;
  return { a, b, cls, ledger, bill, code };
}

const row = (amount: number, content: string) => extractStatementRows([["", "20/10/2026 10:00:00", "", amount, "", content]]);
const paidTo = (ledger: any) => ledger.payments.map((p: any) => p.studentId);

test("mã HP của A + mã phiếu của B chèn lên đầu (file tải kết quả cũ) → không ghi cho ai, báo kiểm tra", () => {
  const { a, b, ledger, bill, code } = setup();
  assert.equal(code(a), "HPTESTT10HV0001");
  const outcome = processBankStatement(ledger, [a, b], row(bill(b).balanceDue, `${code(b)} PH chuyen HPTESTHV0001`), NOW, [{ id: "class-test", code: "TEST" }]);
  assert.equal(outcome.rows[0].result, "REVIEW");
  assert.match(outcome.rows[0].detail || "", /nhiều học viên/);
  assert.deepEqual(paidTo(outcome.ledger), []);
});

test("mã HP{lớp}{HV} của A, A đã hết nợ, mã cũ đang nằm ở phiếu mở của B → không ghi sang B", () => {
  const { a, b, ledger, bill } = setup();
  // Mô phỏng mã HV bị dùng lại: phiếu đang mở của B mang mã HPTESTHV0002 cũ; nay HV0002
  // là mã của A (đã đóng hết) — trước đây khớp theo mã phiếu → tiền vào B.
  const aNow = { ...a, code: "HV0002" };
  const bNow = { ...b, code: "HV0009" };
  const paidA = { ...ledger, receivables: ledger.receivables.map((r) => r.studentId === a.id ? { ...r, status: "PAID" as const, amountPaid: r.amountDue, balanceDue: 0 } : r) };
  const outcome = processBankStatement(paidA, [aNow, bNow], row(bill(b).balanceDue, "PH nop HPTESTHV0002"), NOW, [{ id: "class-test", code: "TEST" }]);
  assert.notEqual(outcome.rows[0].result, "APPLIED");
  assert.deepEqual(paidTo(outcome.ledger), []);
});

test("nội dung có mã HV của hai học viên khác nhau → không ghi", () => {
  const { a, b, ledger, bill } = setup();
  const outcome = processBankStatement(ledger, [a, b], row(bill(a).balanceDue, "hoc phi HV0001 va HV0002"), NOW);
  assert.equal(outcome.rows[0].result, "REVIEW");
  assert.deepEqual(paidTo(outcome.ledger), []);
});

test("mã HV trùng hai học viên → không đoán, báo kiểm tra", () => {
  const { a, b, ledger, bill } = setup();
  const twin = { ...b, code: "HV0001" };
  const outcome = processBankStatement(ledger, [a, twin], row(bill(a).balanceDue, "PH nop HPTESTHV0001"), NOW, [{ id: "class-test", code: "TEST" }]);
  assert.equal(outcome.rows[0].result, "REVIEW");
  assert.deepEqual(paidTo(outcome.ledger), []);
});

test("phiếu của học viên đã bị xoá khỏi hệ thống → không ghi", () => {
  const { a, b, ledger, bill, code } = setup();
  const outcome = processBankStatement(ledger, [a], row(bill(b).balanceDue, `PH nop ${code(b)}`), NOW, [{ id: "class-test", code: "TEST" }]);
  assert.notEqual(outcome.rows[0].result, "APPLIED");
  assert.deepEqual(paidTo(outcome.ledger), []);
});

test("bình thường vẫn ghi đúng: mã HP+HV, mã phiếu chèn đúng của chính học viên đó, mã HV riêng", () => {
  const { a, b, ledger, bill, code } = setup();
  const classes = [{ id: "class-test", code: "TEST" }];
  const one = processBankStatement(ledger, [a, b], row(bill(b).balanceDue, "MBVCB.123.HPTESTHV0002.CT tu ..."), NOW, classes);
  assert.equal(one.rows[0].result, "APPLIED");
  assert.deepEqual(paidTo(one.ledger), [b.id]);
  const two = processBankStatement(ledger, [a, b], row(bill(a).balanceDue, `${code(a)} PH chuyen HPTESTHV0001`), NOW, classes);
  assert.equal(two.rows[0].result, "APPLIED");
  assert.deepEqual(paidTo(two.ledger), [a.id]);
  const three = processBankStatement(ledger, [a, b], row(bill(a).balanceDue, "chuyen tien HPTEST HV0001"), NOW, classes);
  assert.equal(three.rows[0].result, "APPLIED");
  assert.deepEqual(paidTo(three.ledger), [a.id]);
});

test("webhook: chốt chặn guardContentStudent chặn khớp sang học viên khác", () => {
  const { a, b, ledger, code } = setup();
  const tx = { id: "btx-1", provider: "SEPAY" as const, providerTransactionId: "1", accountNumber: "", transactionDate: NOW.toISOString(), transferType: "IN" as const, transferAmount: 0, content: "", status: "RECEIVED" as const, receivedAt: NOW.toISOString() };
  const bBill = ledger.receivables.find((r) => r.studentId === b.id)!;
  const content = `${code(b)} con HV0001`;
  const named = contentNamedStudentIds(content, ledger, [a, b]);
  assert.deepEqual(named.sort(), [a.id, b.id].sort());
  const raw = processBankTransaction(ledger, { ...tx, content, transferAmount: bBill.balanceDue });
  assert.equal(raw.transaction.status, "ALLOCATED");
  const guarded = guardContentStudent(raw, named, new Set([a.id, b.id]));
  assert.equal(guarded.transaction.status, "NEEDS_REVIEW");
  assert.equal(guarded.payment, undefined);
  const onlyB = guardContentStudent(raw, contentNamedStudentIds(code(b), ledger, [a, b]), new Set([a.id, b.id]));
  assert.equal(onlyB.transaction.status, "ALLOCATED");
});

function loadApp(captured: string[]) {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, exportBankStatementResult };\n");
  class FakeURL extends URL { static createObjectURL() { return "blob:x"; } static revokeObjectURL() {} }
  class FakeBlob { constructor(parts: string[]) { captured.push(parts.join("")); } }
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ click() {} }) }, window: { addEventListener: () => {} },
    location: { pathname: "/" }, history: { pushState: () => {}, replaceState: () => {} }, Blob: FakeBlob,
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL: FakeURL, URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as any).__t;
}

test("Tải kết quả: dòng có mã của A không bao giờ bị chèn mã của B (dù trùng tên phụ huynh, đúng số tiền B)", () => {
  const { a, b, cls, ledger, bill, code } = setup();
  const captured: string[] = [];
  const t = loadApp(captured);
  const paidA = { ...ledger, receivables: ledger.receivables.map((r) => r.studentId === a.id ? { ...r, status: "PAID", balanceDue: 0 } : r) };
  t.state.data = { students: [a, b], classes: [cls], finance: { sepay: paidA } };
  t.state.financeModal = { kind: "bank-import", preview: { rows: [
    // Mã của A (A đã hết nợ) + tên PH chung với B + số tiền đúng phiếu B → trước đây chèn mã B.
    { line: 1, date: "20/10/2026 10:00", amount: bill(b).balanceDue, content: "TRAN THI DUNG chuyen HPTESTHV0001", result: "NO_CODE", detail: "" },
    // Không có mã nào, đoán theo tên PH, đúng số tiền một phiếu → chèn nhưng tô vàng cảnh báo.
    { line: 2, date: "20/10/2026 10:05", amount: bill(b).balanceDue, content: "TRAN THI DUNG chuyen tien", result: "NO_CODE", detail: "" },
    // Mã đã thu trước đó → không chèn gì.
    { line: 3, date: "20/10/2026 10:06", amount: bill(b).balanceDue, content: "HPTESTHV0001", result: "DUPLICATE", detail: "Mã đã thanh toán trước đó" },
  ] } };
  t.exportBankStatementResult();
  const html = captured[0];
  const lines = html.split("<tr").slice(2);
  assert.ok(!lines[0].includes(code(b)), "dòng 1 không được chèn mã của B");
  assert.ok(lines[1].includes(code(b)) && lines[1].includes("#ffeb9c") && lines[1].includes("KIỂM TRA"), "dòng 2 chèn mã đoán theo tên, tô vàng");
  assert.ok(!lines[2].includes(code(b)), "dòng 3 không chèn");
});
