import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

class FixedDate extends Date {
  constructor(...args: any[]) { if (!args.length) super("2026-11-08T12:00:00"); else super(...(args as [any])); }
  static now() { return new Date("2026-11-08T12:00:00").getTime(); }
}

function load() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, tuitionNoticeDetails, tuitionEffectiveDebt, collectTuitionModal, collectAmountHint, parseAmountInput, formatAmountInput };\n");
  const context = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/ke-toan/hoc-phi" }, history: { pushState: () => {}, replaceState: () => {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date: FixedDate, URL, URLSearchParams });
  vm.runInContext(source, context);
  return (context as any).__t;
}

const receivable = (id: string, month: string, amountDue: number, amountPaid: number) => ({
  id, receivableCode: id.toUpperCase(), studentId: "s1", studentName: "Bé A", billingPeriod: `Tháng ${month.slice(5)}/${month.slice(0, 4)} · T1`,
  issueDate: `${month}-01`, dueDate: `${month}-10`, amountDue, amountPaid, balanceDue: amountDue - amountPaid, currency: "VND",
  status: amountPaid >= amountDue ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "OPEN", paymentOrderId: `po-${id}`, classId: "c1", billKey: `month|c1|${month}`,
});

function seed(t: any) {
  t.state.role = "ACCOUNTANT";
  t.state.data = {
    students: [{ id: "s1", code: "HV0001", fullName: "Bé A", status: "STUDYING", classJoinedAt: { c1: "2026-09-01" }, tuitionPaidThrough: { c1: "2026-10" } }],
    classes: [{ id: "c1", code: "T1", name: "T1", status: "ACTIVE", billingMode: "MONTHLY", sessionPrice: 65000, branchId: "b1", studentIds: ["s1"],
      schedules: [{ weekday: 1, periodId: "p", startTime: "17:00", endTime: "19:00" }] }],
    lessonSessions: [], teachers: [], settings: { branches: [{ id: "b1", name: "CN" }], rooms: [], lessonPeriods: [] },
    finance: { cashbook: [], sepay: {
      settings: { bank: "BIDV", accountNumber: "123", accountName: "STEPS" },
      receivables: [receivable("r10", "2026-10", 520000, 300000), receivable("r11", "2026-11", 585000, 0)],
      paymentOrders: [{ id: "po-r10", receivableId: "r10", studentId: "s1", paymentCode: "HPA", amount: 520000, qrUrl: "", status: "ACTIVE" }, { id: "po-r11", receivableId: "r11", studentId: "s1", paymentCode: "HPB", amount: 585000, qrUrl: "", status: "ACTIVE" }],
      bankTransactions: [], payments: [], invoices: [], credits: [], webhookLogs: [],
      receipts: [{ id: "rc1", receiptNumber: "1", paymentId: "p1", studentId: "s1", amount: 300000, issuedAt: "2026-10-20T00:00:00Z", status: "ISSUED", classId: "c1", billingPeriod: "Tháng 10/2026 · T1", billingMode: "MONTHLY" }],
    } },
  };
}

test("phiếu tháng sau in dòng truy thu phần thiếu tháng trước; công nợ = thiếu + tháng này", () => {
  const t = load(); seed(t);
  const student = t.state.data.students[0]; const cls = t.state.data.classes[0];
  const notice = t.tuitionNoticeDetails(student, cls, "2026-11");
  assert.equal(notice.carryDebtAmount, 220000);
  assert.match(notice.carryDebtPeriodLabel, /Tháng 10\/2026 còn thiếu/);
  assert.equal(notice.amount, 585000 + 220000);
  assert.equal(t.tuitionEffectiveDebt(student, cls), 805000);
  t.state.financeModal = { kind: "collect", studentId: "s1", classId: "c1" };
  const html = t.collectTuitionModal();
  assert.match(html, /Truy thu Tháng 10\/2026/);
  assert.match(html, /name="amount"[^>]*value="805\.000"/);
  assert.match(html, /data-due="805000"/);
});

test("phiếu đã thu trước một phần in dòng Đã thu trước và chỉ còn phần chênh", () => {
  const t = load(); seed(t);
  const rows = t.state.data.finance.sepay.receivables;
  rows[0] = receivable("r10", "2026-10", 520000, 520000);
  rows[1] = receivable("r11", "2026-11", 585000, 480000);
  const notice = t.tuitionNoticeDetails(t.state.data.students[0], t.state.data.classes[0], "2026-11");
  assert.equal(notice.priorPaidAmount, 480000);
  assert.equal(notice.carryDebtAmount, 0);
  assert.equal(notice.amount, 105000);
});

test("gợi ý số tiền thực thu: đủ / thiếu / dư", () => {
  const t = load(); seed(t);
  assert.match(t.collectAmountHint(500000, 500000, false), /Thu đủ/);
  assert.match(t.collectAmountHint(500000, 300000, false), /Thu thiếu 200\.000/);
  assert.match(t.collectAmountHint(500000, 600000, true), /Thu dư 100\.000.*khóa sau/);
  assert.equal(t.parseAmountInput("1.250.000 đ"), 1250000);
  assert.equal(t.formatAmountInput(1250000), "1.250.000");
});
