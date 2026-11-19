/**
 * Lớp thu tháng: tách nợ cũ T9 ra khỏi phiếu tháng 10 thành phiếu riêng (28/10/2026).
 * Bất biến: tổng nợ, số buổi tồn, tổng tiền đã thu giữ nguyên; thu tiền / nhập sao kê trả
 * nợ cũ trước rồi mới tới tháng 10.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  activateSessionsForPayment, collectTuitionAmount, hasOldDebtBill, monthlyCarryReceivables, monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";
import { splitMonthlyOldDebtBills } from "../cloudflare/old-debt-split";
import { extractStatementRows, processBankStatement } from "../cloudflare/bank-statement";

const NOW = new Date("2026-10-20T05:00:00Z");
const CLS_ID = "class-import-s8";

function student(id: string, code: string, fullName: string): DemoStudent {
  return { id, code, fullName, parentName: "", phone: "", address: "", school: "", parentZalo: "", status: "STUDYING", sessionBalances: {}, classJoinedAt: { [CLS_ID]: "2026-09-01" } } as unknown as DemoStudent;
}
const a = student("stu-a", "HV0108", "Gia Phong");
const b = student("stu-b", "HV0100", "Bạn B");
const cls = {
  id: CLS_ID, code: "S8", name: "S8-6.2-2015", classTypeId: "class-standard", branchId: "branch-test", teacherId: "t", roomId: "", syllabusId: "",
  status: "ACTIVE", studentIds: [a.id, b.id], note: "", billingMode: "MONTHLY", sessionPrice: 65_000, courseSessions: 24,
  schedules: [{ weekday: 6, periodId: "p", startTime: "09:00", endTime: "11:00" }, { weekday: 3, periodId: "p2", startTime: "17:00", endTime: "19:00" }],
} as unknown as DemoClass;
const students = [a, b];

function seed() {
  return syncTuitionReceivables(emptySepayLedger(), [cls], students, [], NOW);
}
const t10Of = (ledger: any, s: DemoStudent) => ledger.receivables.find((r: any) => r.studentId === s.id && r.billKey === `month|${CLS_ID}|2026-10` && r.status !== "CANCELLED");
const odOf = (ledger: any, s: DemoStudent) => ledger.receivables.find((r: any) => r.studentId === s.id && String(r.billKey).startsWith("olddebt|"));
const openDebt = (ledger: any, s: DemoStudent) => ledger.receivables
  .filter((r: any) => r.studentId === s.id && ["OPEN", "PARTIALLY_PAID"].includes(r.status) && String(r.billKey).split("|")[2] <= "2026-10")
  .reduce((sum: number, r: any) => sum + r.balanceDue, 0);

test("chưa đóng: tách phiếu nợ cũ 455k + phiếu T10 = học phí tháng; báo giá không cộng nợ cũ nữa; tồn giữ nguyên", () => {
  const ledger = seed();
  const t10 = t10Of(ledger, a);
  const quoteBefore = tuitionCollectionCharge(a, cls, [], ledger, NOW);
  assert.equal(quoteBefore.oldDebtAmount, 455_000);
  assert.equal(t10.amountDue, quoteBefore.amount);
  const remainingBefore = monthlyRemainingSessions(a, cls, [], ledger, NOW);

  const out = splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW });
  assert.equal(out.rows.length, 2);
  assert.equal(out.skipped.length, 0);
  const synced = syncTuitionReceivables(out.ledger, [cls], students, [], NOW);
  assert.ok(hasOldDebtBill(synced, a.id, cls.id));
  assert.equal(odOf(synced, a).amountDue, 455_000);
  assert.equal(odOf(synced, a).status, "OPEN");
  assert.equal(t10Of(synced, a).amountDue, t10.amountDue - 455_000, "đồng bộ không cộng nợ cũ lại vào T10");
  const quoteAfter = tuitionCollectionCharge(a, cls, [], synced, NOW);
  assert.equal(quoteAfter.oldDebtAmount, 0);
  assert.equal(openDebt(synced, a), openDebt(ledger, a), "tổng nợ không đổi");
  assert.equal(monthlyRemainingSessions(a, cls, [], synced, NOW), remainingBefore, "tồn không đổi");
  assert.equal(monthlyCarryReceivables(synced, a.id, cls.id)[0].id, odOf(synced, a).id, "nợ cũ là khoản truy thu đầu tiên");
  // Tách lại lần hai: không tạo thêm.
  assert.equal(splitMonthlyOldDebtBills({ ledger: synced, cashbook: [], students, classes: [cls], now: NOW }).rows.length, 0);
});

test("thu tiền sau khi tách: trả nợ cũ trước rồi T10; tồn sau khi thu y như thu phiếu gộp cũ", () => {
  const ledger = seed();
  const total = t10Of(ledger, a).amountDue;
  const unsplit = collectTuitionAmount({ ledger, student: a, cls, sessions: [], method: "TRANSFER", amount: total, now: NOW });
  assert.ok(!("error" in unsplit));
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW }).ledger, [cls], students, [], NOW);
  const collected = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: total, now: NOW });
  assert.ok(!("error" in collected));
  if ("error" in collected || "error" in unsplit) return;
  assert.deepEqual(collected.steps.map((s) => [s.kind, s.payment.allocatedAmount]), [["CARRY", 455_000], ["DUE", total - 455_000]]);
  assert.equal(odOf(collected.ledger, a).status, "PAID");
  assert.equal(t10Of(collected.ledger, a).status, "PAID");
  assert.match(String(collected.steps[0].receipt.billingPeriod), /^Nợ cũ T9\/2026/);
  assert.equal(collected.remainingAfter, unsplit.remainingAfter, "tồn sau khi thu không đổi so với phiếu gộp");
  assert.equal(openDebt(collected.ledger, a), 0);
});

test("đã đóng phiếu gộp trước khi tách: biên lai chia đôi (nợ cũ / T10), tổng tiền + tồn + sổ thu chi giữ nguyên", () => {
  const ledger = seed();
  const total = t10Of(ledger, a).amountDue;
  const paid = collectTuitionAmount({ ledger, student: a, cls, sessions: [], method: "TRANSFER", amount: total, now: NOW });
  if ("error" in paid) throw new Error(paid.error);
  const receipt = paid.steps[0].receipt;
  const cashbook = [{ id: "c1", date: "2026-10-20", kind: "IN" as const, source: "TUITION" as const, category: "Học phí", description: "Thu học phí", amount: total, method: "Chuyển khoản", receiptId: receipt.id, tuitionId: paid.steps[0].receivable.id }];
  const remainingBefore = monthlyRemainingSessions(a, cls, [], paid.ledger, NOW);
  const out = splitMonthlyOldDebtBills({ ledger: paid.ledger, cashbook, students, classes: [cls], now: NOW });
  const row = out.rows.find((r) => r.studentCode === "HV0108")!;
  assert.equal(row.oldDebtPaid, 455_000);
  assert.equal(row.splitReceipts.length, 1);
  const synced = syncTuitionReceivables(out.ledger, [cls], students, [], NOW);
  assert.equal(odOf(synced, a).status, "PAID");
  assert.equal(t10Of(synced, a).status, "PAID");
  assert.equal(t10Of(synced, a).amountDue, total - 455_000);
  const receipts = synced.receipts.filter((r) => r.studentId === a.id);
  assert.equal(receipts.reduce((s, r) => s + r.amount, 0), total);
  assert.equal(out.cashbook.reduce((s, r) => s + r.amount, 0), total);
  assert.equal(out.cashbook.length, 2);
  assert.ok(out.cashbook.every((r) => r.date === "2026-10-20"));
  assert.equal(monthlyRemainingSessions(a, cls, [], synced, NOW), remainingBefore, "tồn không đổi");
  assert.equal(openDebt(synced, a), 0);
});

test("nhập sao kê: CK đúng tổng (nợ cũ + T10) theo mã HP lớp+HV chia đúng hai phiếu; CK 455k vào phiếu nợ cũ", () => {
  const ledger = seed();
  const total = t10Of(ledger, a).amountDue;
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW }).ledger, [cls], students, [], NOW);
  const rows = extractStatementRows([["", "20/10/2026 10:00:00", "", total, "", "PH Gia Phong HPS8HV0108"], ["", "20/10/2026 11:00:00", "", 455_000, "", "HPS8HV0100 no cu"]]);
  const out = processBankStatement(split, students, rows, NOW, [{ id: CLS_ID, code: "S8" }]);
  assert.equal(out.rows[0].result, "APPLIED", out.rows[0].detail);
  assert.equal(out.rows[1].result, "APPLIED", out.rows[1].detail);
  assert.equal(odOf(out.ledger, a).status, "PAID");
  assert.equal(t10Of(out.ledger, a).status, "PAID");
  assert.equal(odOf(out.ledger, b).status, "PAID");
  assert.equal(t10Of(out.ledger, b).status, "OPEN");
  // Kích hoạt (như webhook / nút Xác nhận): biên lai phiếu nợ cũ ghi theo chính phiếu, không báo lệch tiền.
  let book: any = out.ledger;
  for (const match of out.completed) {
    const res = activateSessionsForPayment({ ledger: book, receivable: match.receivable!, payment: match.payment!, students, classes: [cls], sessions: [], now: NOW });
    assert.ok(res.status === "OK", `${match.receivable?.billingPeriod}: ${res.status === "ERROR" ? res.error : res.status}`);
    if (res.status === "OK") book = res.ledger;
  }
  const odReceipts = book.receipts.filter((r: any) => /^Nợ cũ T9\/2026/.test(String(r.billingPeriod)));
  assert.equal(odReceipts.length, 2);
  assert.ok(odReceipts.every((r: any) => r.classId === CLS_ID && r.amount === 455_000));
});

test("xoá biên lai nợ cũ (hoàn tác thu) mở lại đúng phiếu nợ cũ, phiếu T10 giữ nguyên đã thu", async () => {
  const { reverseTuitionReceipt } = await import("../cloudflare/tuition-billing");
  const ledger = seed();
  const total = t10Of(ledger, a).amountDue;
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW }).ledger, [cls], students, [], NOW);
  const collected = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: total, now: NOW });
  if ("error" in collected) throw new Error(collected.error);
  const odReceipt = collected.steps[0].receipt;
  const reversed: any = reverseTuitionReceipt({ ledger: collected.ledger, receiptId: odReceipt.id, students, classes: [cls], sessions: [], now: NOW } as any);
  assert.ok(!reversed.error, reversed.error);
  assert.equal(odOf(reversed.ledger, a).status, "OPEN");
  assert.equal(odOf(reversed.ledger, a).balanceDue, 455_000);
  assert.equal(t10Of(reversed.ledger, a).status, "PAID");
});

test("chọn tháng nào thu tháng đó: chọn T10 không trừ nợ cũ; thiếu thì T10 còn nợ; chọn T9 thì dư trừ sang T10", () => {
  const ledger = seed();
  const t10Total = t10Of(ledger, a).amountDue - 455_000;
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW }).ledger, [cls], students, [], NOW);
  // Chọn T10, đóng đủ T10: nợ cũ T9 giữ nguyên.
  const t10Only = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: t10Total, now: NOW, startMonth: "2026-10" });
  if ("error" in t10Only) throw new Error(t10Only.error);
  assert.deepEqual(t10Only.steps.map((s) => s.kind), ["DUE"]);
  assert.equal(t10Of(t10Only.ledger, a).status, "PAID");
  assert.equal(odOf(t10Only.ledger, a).balanceDue, 455_000, "nợ cũ giữ nguyên");
  // Chọn T10, đóng thiếu 145k: T10 còn nợ phần thiếu, nợ cũ giữ nguyên.
  const short = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: 145_000, now: NOW, startMonth: "2026-10" });
  if ("error" in short) throw new Error(short.error);
  assert.equal(t10Of(short.ledger, a).balanceDue, t10Total - 145_000);
  assert.equal(odOf(short.ledger, a).balanceDue, 455_000);
  // Chọn T9 (nợ cũ), đóng 455k + 100k: nợ cũ hết, 100k trừ vào T10.
  const t9 = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: 555_000, now: NOW, startMonth: "2026-09" });
  if ("error" in t9) throw new Error(t9.error);
  assert.deepEqual(t9.steps.map((s) => [s.kind, s.payment.allocatedAmount]), [["CARRY", 455_000], ["DUE", 100_000]]);
  assert.equal(odOf(t9.ledger, a).status, "PAID");
  assert.equal(t10Of(t9.ledger, a).balanceDue, t10Total - 100_000);
  // Tháng chưa tới: báo lỗi rõ.
  const future = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: 100_000, now: NOW, startMonth: "2026-12" });
  assert.ok("error" in future);
});

test("đóng thiếu tháng trước thì tháng sau truy thu cùng; tháng trước chưa đóng đồng nào thì giữ nguyên", () => {
  const ledger = seed();
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOW }).ledger, [cls], students, [], NOW);
  const t10Total = t10Of(split, a).amountDue;
  const short = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: 145_000, now: NOW, startMonth: "2026-10" });
  if ("error" in short) throw new Error(short.error);
  // Sang tháng 11: chọn T11 → truy thu phần thiếu T10 trước, nợ cũ T9 (chưa đóng) giữ nguyên.
  const NOV = new Date("2026-11-20T05:00:00Z");
  const nov = syncTuitionReceivables(short.ledger, [cls], students, [], NOV);
  const pay = collectTuitionAmount({ ledger: nov, student: a, cls, sessions: [], method: "TRANSFER", amount: t10Total - 145_000, now: NOV, startMonth: "2026-11" });
  if ("error" in pay) throw new Error(pay.error);
  assert.deepEqual(pay.steps.map((s) => s.kind), ["CARRY"]);
  assert.equal(t10Of(pay.ledger, a).status, "PAID");
  assert.equal(odOf(pay.ledger, a).balanceDue, 455_000, "nợ cũ chưa đóng giữ nguyên");
});

test("tín dụng đóng dư trừ vào phiếu tháng sau lập sẵn và giữ nguyên qua các lần đồng bộ", () => {
  const ledger = seed();
  const nov = ledger.receivables.find((r: any) => r.studentId === a.id && r.billKey === `month|${CLS_ID}|2026-11`);
  if (!nov) return;
  const gross = nov.amountDue;
  // Tháng 10 đã đóng đủ → tín dụng dồn sang phiếu tháng 11.
  const paidOct = { ...ledger, receivables: ledger.receivables.map((r: any) => r.studentId === a.id && r.billKey === `month|${CLS_ID}|2026-10` ? { ...r, amountPaid: r.amountDue, balanceDue: 0, status: "PAID" } : r) };
  const withCredit = { ...paidOct, credits: [{ id: "cred-x", studentId: a.id, sourcePaymentId: "pay-x", amount: 100_000, remainingAmount: 100_000, reason: "OVERPAYMENT", status: "OPEN" as const, createdAt: NOW.toISOString() }] };
  let synced = syncTuitionReceivables(withCredit, [cls], students, [], NOW);
  synced = syncTuitionReceivables(synced, [cls], students, [], NOW);
  synced = syncTuitionReceivables(synced, [cls], students, [], NOW);
  const after = synced.receivables.find((r: any) => r.id === nov.id)!;
  assert.equal(after.amountDue, gross - 100_000);
  assert.equal(after.balanceDue, gross - 100_000);
});

test("tháng sau: chọn tháng 11 đóng đúng tổng phiếu báo (T11 + nợ cũ T10) → trả cả hai, không thu trước tháng 12", () => {
  const NOV = new Date("2026-11-20T05:00:00Z");
  const ledger = syncTuitionReceivables(seed(), [cls], students, [], NOV);
  const t10 = t10Of(ledger, a);
  const t11 = ledger.receivables.find((r: any) => r.studentId === a.id && r.billKey === `month|${CLS_ID}|2026-11`);
  if (!t11) return;
  const split = syncTuitionReceivables(splitMonthlyOldDebtBills({ ledger, cashbook: [], students, classes: [cls], now: NOV }).ledger, [cls], students, [], NOV);
  const od = odOf(split, a);
  const total = t11.balanceDue + t10Of(split, a).balanceDue + (od?.balanceDue || 0);
  const res = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: total, now: NOV, startMonth: "2026-11" });
  if ("error" in res) throw new Error(res.error);
  assert.ok(res.steps.every((s) => s.kind !== "PREPAY"), JSON.stringify(res.steps.map((s) => s.kind)));
  assert.equal(res.ledger.receivables.find((r: any) => r.id === t10.id)!.status, "PAID");
  assert.equal(res.ledger.receivables.find((r: any) => r.id === t11.id)!.status, "PAID");
  // Chỉ đóng đúng T11: nợ cũ giữ nguyên.
  const only = collectTuitionAmount({ ledger: split, student: a, cls, sessions: [], method: "TRANSFER", amount: t11.balanceDue, now: NOV, startMonth: "2026-11" });
  if ("error" in only) throw new Error(only.error);
  assert.equal(only.ledger.receivables.find((r: any) => r.id === t10.id)!.status, "OPEN");
});
