/**
 * Tách nợ cũ (trước tháng 10/2026) của lớp thu tháng ra khỏi phiếu tháng 10 thành phiếu
 * riêng "olddebt|lớp|2026-09" — như phiếu khóa 1 của lớp khóa (chốt với anh Vũ 28/10/2026).
 * Hàm thuần: không đọc/ghi kho. Tổng nợ, tổng đã thu, sổ thu chi theo ngày giữ nguyên:
 *  - phiếu T10 giảm đúng số nợ cũ; phiếu nợ cũ mới = số nợ cũ;
 *  - tiền đã thu trên phiếu T10 trả nợ cũ trước: khoản thu nằm trọn trong phần nợ cũ chuyển
 *    sang phiếu nợ cũ; khoản vắt ngang được chia đôi (thêm 1 khoản thu + 1 biên lai + 1 dòng
 *    sổ thu chi cùng ngày, cùng phương thức; dòng gốc giảm đúng phần chia ra).
 */
import type { DemoCashEntry } from "./finance-types";
import type { DemoClass } from "./operations-types";
import type { DemoStudent } from "./people-types";
import { createReceivable, refreshOrderQr, type SepayLedger, type SepayLedgerPayment, type SepayReceipt, type SepayReceivable } from "./sepay-engine";
import { classBillingMode, hasOldDebtBill, oldDebtBillKey, studentOldDebtAmount } from "./tuition-billing";

export const OLD_DEBT_ANCHOR_MONTH = "2026-10";

export interface OldDebtSplitRow {
  studentCode: string;
  studentName: string;
  classCode: string;
  oldDebt: number;
  t10Before: { amountDue: number; amountPaid: number; status: string };
  t10After: { amountDue: number; amountPaid: number; status: string };
  oldDebtPaid: number;
  movedReceipts: string[];
  splitReceipts: Array<{ from: string; to: string; fromId: string; toId: string; amount: number }>;
}

export interface OldDebtSplitSkip { studentCode: string; classCode: string; oldDebt: number; reason: string }

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const isLive = (p: SepayLedgerPayment) => p.status !== "VOIDED" && p.status !== "REFUNDED";

function statusOf(amountDue: number, amountPaid: number): SepayReceivable["status"] {
  const balance = Math.max(0, amountDue - amountPaid);
  if (amountDue > 0 && balance === 0) return "PAID";
  return amountPaid > 0 ? "PARTIALLY_PAID" : "OPEN";
}

function receiptSeqFactory(receipts: SepayReceipt[]) {
  const maxByStamp = new Map<string, number>();
  for (const r of receipts) {
    const m = /^PT-(\d{6})-(\d+)$/.exec(String(r.receiptNumber || ""));
    if (m) maxByStamp.set(m[1], Math.max(maxByStamp.get(m[1]) || 0, Number(m[2])));
  }
  return (issuedAt: string) => {
    const d = new Date(issuedAt);
    const stamp = Number.isNaN(d.getTime()) ? "202610" : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const next = (maxByStamp.get(stamp) || 0) + 1;
    maxByStamp.set(stamp, next);
    return `PT-${stamp}-${String(next).padStart(6, "0")}`;
  };
}

export function splitMonthlyOldDebtBills(input: {
  ledger: SepayLedger;
  cashbook: DemoCashEntry[];
  students: DemoStudent[];
  classes: DemoClass[];
  now?: Date;
  onlyStudentCodes?: string[];
}): { ledger: SepayLedger; cashbook: DemoCashEntry[]; rows: OldDebtSplitRow[]; skipped: OldDebtSplitSkip[] } {
  const nowIso = (input.now || new Date()).toISOString();
  let ledger: SepayLedger = { ...input.ledger, receivables: [...input.ledger.receivables], paymentOrders: [...input.ledger.paymentOrders], payments: [...input.ledger.payments], receipts: [...input.ledger.receipts] };
  let cashbook = [...input.cashbook];
  const nextNumber = receiptSeqFactory(ledger.receipts);
  const rows: OldDebtSplitRow[] = [];
  const skipped: OldDebtSplitSkip[] = [];
  const only = input.onlyStudentCodes?.length ? new Set(input.onlyStudentCodes.map((c) => c.toUpperCase())) : null;

  for (const cls of input.classes) {
    if (classBillingMode(cls) !== "MONTHLY") continue;
    for (const studentId of cls.studentIds || []) {
      const student = input.students.find((row) => row.id === studentId);
      if (!student) continue;
      if (only && !only.has(String(student.code || "").toUpperCase())) continue;
      const debt = Math.round(studentOldDebtAmount(student, cls, [OLD_DEBT_ANCHOR_MONTH]) || 0);
      if (!(debt > 0)) continue;
      const base = { studentCode: student.code || "", classCode: cls.code || cls.name, oldDebt: debt };
      if (hasOldDebtBill(ledger, student.id, cls.id)) continue; // đã tách trước đó
      if (student.tuitionExempt) continue; // miễn học phí: không có công nợ
      // Ưu tiên đúng phiếu tháng 10; phiếu gộp nhiều tháng chỉ khi không có phiếu tháng 10 riêng.
      const live = ledger.receivables.filter((row) => row.studentId === student.id && row.classId === cls.id && row.status !== "CANCELLED");
      const t10 = live.find((row) => row.billKey === `month|${cls.id}|${OLD_DEBT_ANCHOR_MONTH}`)
        || live.find((row) => String(row.billKey || "").split("|")[0] === "months"
          && String(row.billKey || "").split("|")[2]?.split(",").includes(OLD_DEBT_ANCHOR_MONTH));
      if (!t10) { skipped.push({ ...base, reason: "không có phiếu tháng 10" }); continue; }
      if (String(t10.billKey).split("|")[0] === "months") { skipped.push({ ...base, reason: `phiếu gộp nhiều tháng (${t10.billingPeriod})` }); continue; }
      const due = Math.round(Number(t10.amountDue) || 0);
      const paid = Math.round(Number(t10.amountPaid) || 0);
      const credits = (t10.appliedCredits || []).reduce((sum, item) => sum + (Math.round(Number(item.amount)) || 0), 0);
      if (credits > 0) { skipped.push({ ...base, reason: "phiếu T10 đang trừ bảo lưu/tín dụng" }); continue; }
      if (due < debt) { skipped.push({ ...base, reason: `phiếu T10 ${vnd(due)} nhỏ hơn nợ cũ` }); continue; }
      const livePays = ledger.payments.filter((p) => p.receivableId === t10.id && isLive(p))
        .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)) || a.id.localeCompare(b.id));
      const livePaid = livePays.reduce((sum, p) => sum + Math.round(Number(p.allocatedAmount) || 0), 0);
      if (livePaid !== paid) { skipped.push({ ...base, reason: `số đã thu phiếu T10 (${vnd(paid)}) khác tổng khoản thu (${vnd(livePaid)})` }); continue; }

      // 1) Phiếu nợ cũ riêng.
      const created = createReceivable({
        studentId: student.id, studentName: student.fullName, billingPeriod: `Nợ cũ T9/2026 · ${cls.name}`, amountDue: debt,
        usedCodes: ledger.paymentOrders.map((o) => o.paymentCode), now: nowIso,
      });
      const debtPaid = Math.min(debt, paid);
      const oldDebtRow: SepayReceivable = {
        ...created.receivable, classId: cls.id, billKey: oldDebtBillKey(cls.id), frozenAt: nowIso,
        issueDate: t10.issueDate || created.receivable.issueDate, dueDate: t10.dueDate || created.receivable.dueDate,
        amountPaid: debtPaid, balanceDue: debt - debtPaid, status: statusOf(debt, debtPaid),
      };
      const oldDebtOrder = oldDebtRow.status === "PAID"
        ? { ...created.order, status: "PAID" as const }
        : refreshOrderQr(created.order, ledger.settings, oldDebtRow.balanceDue);

      // 2) Phiếu T10 giảm phần nợ cũ.
      const t10Due = due - debt;
      const t10Paid = paid - debtPaid;
      const t10After: SepayReceivable = { ...t10, amountDue: t10Due, amountPaid: t10Paid, balanceDue: Math.max(0, t10Due - t10Paid), status: statusOf(t10Due, t10Paid) };
      ledger = {
        ...ledger,
        receivables: [oldDebtRow, ...ledger.receivables.map((row) => row.id === t10.id ? t10After : row)],
        paymentOrders: [oldDebtOrder, ...ledger.paymentOrders.map((o) => {
          if (o.id !== t10.paymentOrderId) return o;
          if (t10After.status === "PAID") return { ...o, status: "PAID" as const };
          return o.status === "ACTIVE" ? refreshOrderQr(o, ledger.settings, t10After.balanceDue) : o;
        })],
      };

      // 3) Tiền đã thu: trả nợ cũ trước.
      let toMove = debtPaid;
      const moved: string[] = [];
      const splits: OldDebtSplitRow["splitReceipts"] = [];
      for (const pay of livePays) {
        if (toMove <= 0) break;
        const alloc = Math.round(Number(pay.allocatedAmount) || 0);
        const receipt = ledger.receipts.find((r) => r.paymentId === pay.id);
        if (alloc <= toMove) {
          ledger = {
            ...ledger,
            payments: ledger.payments.map((p) => p.id === pay.id ? { ...p, receivableId: oldDebtRow.id } : p),
            receipts: ledger.receipts.map((r) => r.id === receipt?.id ? { ...r, billingPeriod: oldDebtRow.billingPeriod, note: [r.note, "Tách sang phiếu nợ cũ T9 (28/10/2026)"].filter(Boolean).join(" · ") } : r),
            invoices: (ledger.invoices || []).map((i) => i.paymentId === pay.id ? { ...i, receivableId: oldDebtRow.id } : i),
          };
          cashbook = cashbook.map((c) => receipt && c.receiptId === receipt.id ? { ...c, tuitionId: oldDebtRow.id, description: `Thu ${oldDebtRow.billingPeriod}` } : c);
          if (receipt) moved.push(receipt.receiptNumber);
          toMove -= alloc;
          continue;
        }
        // Khoản vắt ngang: chia đôi.
        const part = toMove;
        const newPay: SepayLedgerPayment = {
          ...pay, id: `pay-${crypto.randomUUID()}`, receivableId: oldDebtRow.id, amount: part, allocatedAmount: part, excessAmount: 0,
          note: [pay.note, "Tách phần nợ cũ T9 (28/10/2026)"].filter(Boolean).join(" · "),
        };
        let newReceipt: SepayReceipt | undefined;
        if (receipt) {
          newReceipt = {
            ...receipt, id: `rcpt-${crypto.randomUUID()}`, receiptNumber: nextNumber(receipt.issuedAt), paymentId: newPay.id, amount: part,
            billingPeriod: oldDebtRow.billingPeriod, materialsAmount: 0, creditSessionsUsed: 0,
            note: [receipt.note, `Tách từ biên lai ${receipt.receiptNumber} (phần nợ cũ T9)`].filter(Boolean).join(" · "),
          };
          if (Math.round(Number(receipt.amount) || 0) - part < Math.round(Number(receipt.materialsAmount) || 0)) {
            throw new Error(`${student.code}: biên lai ${receipt.receiptNumber} không đủ tiền học phí để tách`);
          }
        }
        ledger = {
          ...ledger,
          payments: [newPay, ...ledger.payments.map((p) => p.id === pay.id ? { ...p, amount: Math.round(Number(p.amount) || 0) - part, allocatedAmount: alloc - part } : p)],
          receipts: newReceipt
            ? [newReceipt, ...ledger.receipts.map((r) => r.id === receipt!.id ? { ...r, amount: Math.round(Number(r.amount) || 0) - part } : r)]
            : ledger.receipts,
        };
        if (receipt && newReceipt) {
          const src = cashbook.filter((c) => c.receiptId === receipt.id);
          if (src.length > 1) throw new Error(`${student.code}: biên lai ${receipt.receiptNumber} có ${src.length} dòng thu chi — xem tay`);
          if (src.length === 1) {
            const row = src[0];
            const added: DemoCashEntry = { ...row, id: `cash-${crypto.randomUUID()}`, amount: part, receiptId: newReceipt.id, tuitionId: oldDebtRow.id, description: `Thu ${oldDebtRow.billingPeriod}` };
            const index = cashbook.indexOf(row);
            cashbook = [...cashbook.slice(0, index), { ...row, amount: Math.round(Number(row.amount) || 0) - part }, added, ...cashbook.slice(index + 1)];
          }
          splits.push({ from: receipt.receiptNumber, to: newReceipt.receiptNumber, fromId: receipt.id, toId: newReceipt.id, amount: part });
        }
        toMove = 0;
      }
      if (toMove > 0) throw new Error(`${student.code}: còn ${vnd(toMove)} chưa chuyển được sang phiếu nợ cũ`);
      rows.push({
        ...base, studentName: student.fullName,
        t10Before: { amountDue: due, amountPaid: paid, status: t10.status },
        t10After: { amountDue: t10After.amountDue, amountPaid: t10After.amountPaid, status: t10After.status },
        oldDebtPaid: debtPaid, movedReceipts: moved, splitReceipts: splits,
      });
    }
  }
  return { ledger, cashbook, rows, skipped };
}
