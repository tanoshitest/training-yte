import type {
  DemoCashEntry,
  DemoFinance,
  DemoFinanceForecast,
  DemoPayrollRow,
  DemoReconDay,
  DemoReconEntry,
  DemoTuitionDebt,
} from "../finance-types";
import type {
  SepayBankTransaction,
  SepayCredit,
  SepayInvoice,
  SepayLedgerPayment,
  SepayPaymentOrder,
  SepayReceipt,
  SepayReceivable,
  SepaySettings,
  SepayWebhookLog,
} from "../sepay-engine";
import type { BlockRepository } from "./block-repository";
import { rowsOf } from "./relational-read";
import { syncTables, withOptional, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

/** Sổ SePay là một khối duy nhất nên cấu hình chỉ có một dòng, khóa cố định. */
const SEPAY_ROW_ID = "sepay";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function amount(value: unknown) {
  return Math.round(Number(value) || 0);
}

function optionalAmount(value: unknown) {
  return value === null || value === undefined ? null : Math.round(Number(value) || 0);
}

function optionalCount(value: unknown) {
  return value === null || value === undefined ? null : Math.round(Number(value) || 0);
}

/**
 * Dòng đọc từ database có đúng tên trường như đối tượng nghiệp vụ, khác ở chỗ trường
 * tùy chọn là NULL thay vì vắng mặt. `K` liệt kê các trường tùy chọn đó.
 */
type RowOf<T, K extends keyof T = never> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> | null };

type TuitionDebtRow = RowOf<DemoTuitionDebt>;
type CashEntryRow = RowOf<DemoCashEntry, "voucherDate" | "branchId" | "studentName" | "tuitionId" | "receiptId">;
type ReconDayRow = RowOf<DemoReconDay>;
type ReconEntryRow = RowOf<DemoReconEntry, "approvedAt" | "approvedBy">;
type PayrollRow = RowOf<DemoPayrollRow>;
type ForecastRow = RowOf<DemoFinanceForecast, "branchId" | "createdAt" | "updatedAt" | "settledAt">;
type SepaySettingsRow = RowOf<SepaySettings, "qrImageDataUrl">;
/** appliedCredits lưu dạng chuỗi JSON (cột TEXT) — bộ đồng bộ so sánh cột theo chuỗi. */
function parseAppliedCredits(value: string | null | undefined): SepayReceivable["appliedCredits"] {
  if (!value) return undefined;
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows)) return undefined;
    const out = rows.map((item) => ({ creditId: String(item?.creditId || ""), amount: Math.round(Number(item?.amount) || 0) })).filter((item) => item.creditId && item.amount > 0);
    return out.length ? out : undefined;
  } catch { return undefined; }
}

function serializeAppliedCredits(value: SepayReceivable["appliedCredits"]): string | null {
  const rows = (value || []).map((item) => ({ creditId: String(item.creditId || ""), amount: Math.round(Number(item.amount) || 0) })).filter((item) => item.creditId && item.amount > 0);
  return rows.length ? JSON.stringify(rows) : null;
}

/** Khấu trừ buổi chưa học lúc rời lớp — đọc kèm số tiền phiếu lúc xuất. */
function parseLeftClass(value: string | null | undefined): Pick<SepayReceivable, "leftClass" | "issuedAmount"> {
  if (!value) return {};
  try {
    const row = JSON.parse(value);
    if (!row || typeof row !== "object") return {};
    const sessions = (key: string) => Math.max(0, Math.round(Number(row[key]) || 0));
    const leftClass: NonNullable<SepayReceivable["leftClass"]> = {
      at: String(row.at || ""),
      billedSessions: sessions("billedSessions"),
      consumedSessions: sessions("consumedSessions"),
      deductionSessions: sessions("deductionSessions"),
      deductionAmount: sessions("deductionAmount"),
    };
    const carryAmount = sessions("carryAmount");
    if (carryAmount) leftClass.carryAmount = carryAmount;
    const refundAmount = sessions("refundAmount");
    if (refundAmount) {
      leftClass.refundAmount = refundAmount;
      if (row.refundedAt) leftClass.refundedAt = String(row.refundedAt);
    }
    if (row.revenue && typeof row.revenue === "object") {
      leftClass.revenue = {
        billed: Math.max(0, Math.round(Number(row.revenue.billed) || 0)),
        consumed: Math.max(0, Math.round(Number(row.revenue.consumed) || 0)),
        actual: Math.max(0, Math.round(Number(row.revenue.actual) || 0)),
        reduction: Math.max(0, Math.round(Number(row.revenue.reduction) || 0)),
      };
    }
    if (row.carryTarget && typeof row.carryTarget === "object" && row.carryTarget.classId) {
      leftClass.carryTarget = {
        classId: String(row.carryTarget.classId),
        ...(row.carryTarget.month ? { month: String(row.carryTarget.month) } : {}),
        ...(Number(row.carryTarget.courseIndex) ? { courseIndex: Math.round(Number(row.carryTarget.courseIndex)) } : {}),
      };
    }
    // Phiếu ngắt công nợ / hoàn tiền không còn buổi khấu trừ nhưng vẫn phải giữ
    // metadata để mang khoản sang lớp mới và hiện "Giảm doanh số".
    if (!leftClass.at || (!leftClass.deductionSessions && !carryAmount && !leftClass.refundAmount && !leftClass.revenue)) return {};
    const issuedAmount = sessions("issuedAmount");
    return issuedAmount ? { leftClass, issuedAmount } : { leftClass };
  } catch { return {}; }
}

function serializeLeftClass(row: SepayReceivable): string | null {
  if (!row.leftClass) return null;
  return JSON.stringify({ ...row.leftClass, issuedAmount: Math.round(Number(row.issuedAmount) || 0) });
}

type ReceivableRow = RowOf<Omit<SepayReceivable, "appliedCredits" | "leftClass" | "issuedAmount">, "classId" | "billKey" | "frozenAt" | "publicToken" | "requestedBy"> & { appliedCredits: string | null; leftClass: string | null };
type PaymentOrderRow = RowOf<SepayPaymentOrder>;
type BankTransactionRow = RowOf<SepayBankTransaction, "reviewReason" | "processedAt">;
type PaymentRow = RowOf<SepayLedgerPayment, "method" | "note">;
type ReceiptRow = RowOf<SepayReceipt,
  "method" | "note" | "classId" | "className" | "billingPeriod" | "billingMode"
  | "studentName" | "studentCode" | "creditSessionsUsed" | "materialsAmount" | "paidThroughBefore">;
type InvoiceRow = RowOf<SepayInvoice,
  "invoiceNumber" | "invoiceSeries" | "lookupCode" | "lastError" | "issuedAt"
  | "buyerTaxCode" | "buyerAddress" | "buyerEmail" | "pdfUrl" | "xmlUrl" | "providerInvoiceId" | "taxAuthorityCode" | "processingAt"
  | "approvedAt" | "previewHash">;
type CreditRow = RowOf<SepayCredit>;
type WebhookLogRow = RowOf<SepayWebhookLog, "providerTransactionId">;

interface FinanceQuery {
  debts: TuitionDebtRow[] | null;
  cashbook: CashEntryRow[] | null;
  recon: ReconDayRow[] | null;
  reconEntries: ReconEntryRow[] | null;
  payroll: PayrollRow[] | null;
  forecasts: ForecastRow[] | null;
  skipped: { receiptId: string }[] | null;
  settings: SepaySettingsRow | null;
  receivables: ReceivableRow[] | null;
  paymentOrders: PaymentOrderRow[] | null;
  bankTransactions: BankTransactionRow[] | null;
  payments: PaymentRow[] | null;
  receipts: ReceiptRow[] | null;
  invoices: InvoiceRow[] | null;
  credits: CreditRow[] | null;
  webhookLogs: WebhookLogRow[] | null;
}

export const financeRepository: BlockRepository<DemoFinance> = {
  key: "finance:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<FinanceQuery[]>`
      SELECT
        (SELECT json_agg(d ORDER BY d.position) FROM tuition_debts d) AS debts,
        (SELECT json_agg(c ORDER BY c.position) FROM cash_entries c) AS cashbook,
        (SELECT json_agg(r ORDER BY r.position) FROM recon_days r) AS recon,
        (SELECT json_agg(r ORDER BY r.position) FROM recon_entries r) AS "reconEntries",
        (SELECT json_agg(p ORDER BY p.position) FROM payroll_rows p) AS payroll,
        (SELECT json_agg(f ORDER BY f.position) FROM finance_forecasts f) AS forecasts,
        (SELECT json_agg(s ORDER BY s.position) FROM cashbook_skipped_receipts s) AS skipped,
        (SELECT row_to_json(s) FROM sepay_settings s WHERE s.id = ${SEPAY_ROW_ID}) AS settings,
        (SELECT json_agg(r ORDER BY r.position) FROM sepay_receivables r) AS receivables,
        (SELECT json_agg(o ORDER BY o.position) FROM sepay_payment_orders o) AS "paymentOrders",
        (SELECT json_agg(t ORDER BY t.position) FROM sepay_bank_transactions t) AS "bankTransactions",
        (SELECT json_agg(p ORDER BY p.position) FROM sepay_payments p) AS payments,
        (SELECT json_agg(r ORDER BY r.position) FROM sepay_receipts r) AS receipts,
        (SELECT json_agg(i ORDER BY i.position) FROM sepay_invoices i) AS invoices,
        (SELECT json_agg(c ORDER BY c.position) FROM sepay_credits c) AS credits,
        (SELECT json_agg(w ORDER BY w.position) FROM sepay_webhook_logs w) AS "webhookLogs"
    `;
    const settings = result.settings;

    return {
      debts: rowsOf<TuitionDebtRow>(result.debts).map((row): DemoTuitionDebt => ({
        id: row.id,
        studentId: row.studentId,
        studentCode: row.studentCode,
        studentName: row.studentName,
        classId: row.classId,
        className: row.className,
        packageName: row.packageName,
        totalAmount: row.totalAmount,
        paidAmount: row.paidAmount,
        remainingSessions: row.remainingSessions,
        status: row.status,
      })),
      cashbook: rowsOf<CashEntryRow>(result.cashbook).map((row): DemoCashEntry => withOptional({
        id: row.id,
        date: row.date,
        kind: row.kind,
        source: row.source,
        category: row.category,
        description: row.description,
        amount: row.amount,
        method: row.method,
      }, {
        voucherDate: row.voucherDate,
        branchId: row.branchId,
        studentName: row.studentName,
        tuitionId: row.tuitionId,
        receiptId: row.receiptId,
      })),
      recon: rowsOf<ReconDayRow>(result.recon).map((row): DemoReconDay => ({
        date: row.date,
        tuitionIn: row.tuitionIn,
        manualIn: row.manualIn,
        manualOut: row.manualOut,
        net: row.net,
        status: row.status,
        note: row.note,
      })),
      reconEntries: rowsOf<ReconEntryRow>(result.reconEntries).map((row): DemoReconEntry => withOptional({
        entryId: row.entryId,
        status: row.status,
        amount: row.amount,
        date: row.date,
      }, { approvedAt: row.approvedAt, approvedBy: row.approvedBy })),
      payroll: rowsOf<PayrollRow>(result.payroll).map((row): DemoPayrollRow => ({
        id: row.id,
        teacherId: row.teacherId,
        teacherCode: row.teacherCode,
        teacherName: row.teacherName,
        sessions: row.sessions,
        hours: row.hours,
        baseSalary: row.baseSalary,
        commission: row.commission,
        tax: row.tax,
        net: row.net,
      })),
      forecasts: rowsOf<ForecastRow>(result.forecasts).map((row): DemoFinanceForecast => withOptional({
        id: row.id,
        kind: row.kind,
        category: row.category,
        description: row.description,
        amount: row.amount,
        dueDate: row.dueDate,
        status: row.status,
      }, {
        branchId: row.branchId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        settledAt: row.settledAt,
      })),
      sepay: {
        settings: withOptional({
          bank: settings?.bank ?? "",
          accountNumber: settings?.accountNumber ?? "",
          accountName: settings?.accountName ?? "",
          autoMatchExact: settings?.autoMatchExact ?? false,
          autoPartial: settings?.autoPartial ?? false,
          autoOverpayment: settings?.autoOverpayment ?? false,
          autoInvoiceExact: settings?.autoInvoiceExact ?? false,
          autoInvoicePartial: settings?.autoInvoicePartial ?? false,
          autoInvoiceOverpayment: settings?.autoInvoiceOverpayment ?? false,
        }, { qrImageDataUrl: settings?.qrImageDataUrl ?? null }),
        receivables: rowsOf<ReceivableRow>(result.receivables).map((row): SepayReceivable => withOptional({
          id: row.id,
          receivableCode: row.receivableCode,
          studentId: row.studentId,
          studentName: row.studentName,
          billingPeriod: row.billingPeriod,
          issueDate: row.issueDate,
          dueDate: row.dueDate,
          amountDue: row.amountDue,
          amountPaid: row.amountPaid,
          balanceDue: row.balanceDue,
          currency: row.currency,
          status: row.status,
          paymentOrderId: row.paymentOrderId,
        }, { classId: row.classId, billKey: row.billKey, frozenAt: row.frozenAt, publicToken: row.publicToken, requestedBy: row.requestedBy, appliedCredits: parseAppliedCredits(row.appliedCredits), ...parseLeftClass(row.leftClass) })),
        paymentOrders: rowsOf<PaymentOrderRow>(result.paymentOrders).map((row): SepayPaymentOrder => ({
          id: row.id,
          receivableId: row.receivableId,
          studentId: row.studentId,
          paymentCode: row.paymentCode,
          amount: row.amount,
          qrUrl: row.qrUrl,
          status: row.status,
          createdAt: row.createdAt,
        })),
        bankTransactions: rowsOf<BankTransactionRow>(result.bankTransactions).map((row): SepayBankTransaction => withOptional({
          id: row.id,
          provider: row.provider,
          providerTransactionId: row.providerTransactionId,
          accountNumber: row.accountNumber,
          transactionDate: row.transactionDate,
          transferType: row.transferType,
          transferAmount: row.transferAmount,
          content: row.content,
          status: row.status,
          receivedAt: row.receivedAt,
        }, { reviewReason: row.reviewReason, processedAt: row.processedAt })),
        payments: rowsOf<PaymentRow>(result.payments).map((row): SepayLedgerPayment => withOptional({
          id: row.id,
          paymentCode: row.paymentCode,
          studentId: row.studentId,
          bankTransactionId: row.bankTransactionId,
          receivableId: row.receivableId,
          amount: row.amount,
          allocatedAmount: row.allocatedAmount,
          excessAmount: row.excessAmount,
          status: row.status,
          paidAt: row.paidAt,
        }, { method: row.method, note: row.note })),
        receipts: rowsOf<ReceiptRow>(result.receipts).map((row): SepayReceipt => withOptional({
          id: row.id,
          receiptNumber: row.receiptNumber,
          paymentId: row.paymentId,
          studentId: row.studentId,
          amount: row.amount,
          issuedAt: row.issuedAt,
          status: row.status,
        }, {
          method: row.method,
          note: row.note,
          classId: row.classId,
          className: row.className,
          billingPeriod: row.billingPeriod,
          billingMode: row.billingMode,
          studentName: row.studentName,
          studentCode: row.studentCode,
          creditSessionsUsed: row.creditSessionsUsed,
          materialsAmount: row.materialsAmount,
          paidThroughBefore: row.paidThroughBefore,
        })),
        invoices: rowsOf<InvoiceRow>(result.invoices).map((row): SepayInvoice => withOptional({
          id: row.id,
          studentId: row.studentId,
          paymentId: row.paymentId,
          receivableId: row.receivableId,
          provider: row.provider,
          amount: row.amount,
          buyerName: row.buyerName,
          status: row.status,
          retryCount: row.retryCount,
          createdAt: row.createdAt,
        }, {
          invoiceNumber: row.invoiceNumber,
          invoiceSeries: row.invoiceSeries,
          lookupCode: row.lookupCode,
          lastError: row.lastError,
          issuedAt: row.issuedAt,
          buyerTaxCode: row.buyerTaxCode,
          buyerAddress: row.buyerAddress,
          buyerEmail: row.buyerEmail,
          pdfUrl: row.pdfUrl,
          xmlUrl: row.xmlUrl,
          providerInvoiceId: row.providerInvoiceId,
          taxAuthorityCode: row.taxAuthorityCode,
          processingAt: row.processingAt,
          approvedAt: row.approvedAt,
          previewHash: row.previewHash,
        })),
        credits: rowsOf<CreditRow>(result.credits).map((row): SepayCredit => ({
          id: row.id,
          studentId: row.studentId,
          sourcePaymentId: row.sourcePaymentId,
          amount: row.amount,
          remainingAmount: row.remainingAmount,
          reason: row.reason,
          status: row.status,
          createdAt: row.createdAt,
          ...(row.sourceClassId ? { sourceClassId: row.sourceClassId } : {}),
        })),
        webhookLogs: rowsOf<WebhookLogRow>(result.webhookLogs).map((row): SepayWebhookLog => withOptional({
          id: row.id,
          requestId: row.requestId,
          signatureValid: row.signatureValid,
          processingStatus: row.processingStatus,
          createdAt: row.createdAt,
        }, { providerTransactionId: row.providerTransactionId })),
      },
      cashbookSkippedReceiptIds: rowsOf<{ receiptId: string }>(result.skipped).map((row) => row.receiptId),
    };
  },

  async write(tx: TxClient, value: DemoFinance) {
    const ledger = value.sepay;
    const settings = ledger?.settings;
    const settingsRow = {
      bank: text(settings?.bank),
      accountNumber: text(settings?.accountNumber),
      accountName: text(settings?.accountName),
      qrImageDataUrl: optionalText(settings?.qrImageDataUrl),
      autoMatchExact: settings?.autoMatchExact === true,
      autoPartial: settings?.autoPartial === true,
      autoOverpayment: settings?.autoOverpayment === true,
      autoInvoiceExact: settings?.autoInvoiceExact === true,
      autoInvoicePartial: settings?.autoInvoicePartial === true,
      autoInvoiceOverpayment: settings?.autoInvoiceOverpayment === true,
    };
    await tx.opsSepaySetting.upsert({
      where: { id: SEPAY_ROW_ID },
      create: { id: SEPAY_ROW_ID, ...settingsRow },
      update: settingsRow,
    });

    const debts: Row[] = (value.debts ?? []).map((row, position) => ({
      id: row.id,
      position,
      studentId: text(row.studentId),
      studentCode: text(row.studentCode),
      studentName: text(row.studentName),
      classId: text(row.classId),
      className: text(row.className),
      packageName: text(row.packageName),
      totalAmount: amount(row.totalAmount),
      paidAmount: amount(row.paidAmount),
      remainingSessions: Math.round(Number(row.remainingSessions) || 0),
      status: text(row.status),
    }));
    const cashbook: Row[] = (value.cashbook ?? []).map((row, position) => ({
      id: row.id,
      position,
      date: text(row.date),
      voucherDate: optionalText(row.voucherDate),
      kind: text(row.kind),
      source: text(row.source),
      category: text(row.category),
      description: text(row.description),
      amount: amount(row.amount),
      method: text(row.method),
      branchId: optionalText(row.branchId),
      studentName: optionalText(row.studentName),
      tuitionId: optionalText(row.tuitionId),
      receiptId: optionalText(row.receiptId),
    }));
    const recon: Row[] = (value.recon ?? []).map((row, position) => ({
      date: text(row.date),
      position,
      tuitionIn: amount(row.tuitionIn),
      manualIn: amount(row.manualIn),
      manualOut: amount(row.manualOut),
      net: amount(row.net),
      status: text(row.status),
      note: text(row.note),
    }));
    const reconEntries: Row[] = (value.reconEntries ?? []).map((row, position) => ({
      entryId: text(row.entryId),
      position,
      status: text(row.status),
      amount: amount(row.amount),
      date: text(row.date),
      approvedAt: optionalText(row.approvedAt),
      approvedBy: optionalText(row.approvedBy),
    }));
    const payroll: Row[] = (value.payroll ?? []).map((row, position) => ({
      id: row.id,
      position,
      teacherId: text(row.teacherId),
      teacherCode: text(row.teacherCode),
      teacherName: text(row.teacherName),
      sessions: Math.round(Number(row.sessions) || 0),
      hours: Number(row.hours) || 0,
      baseSalary: amount(row.baseSalary),
      commission: amount(row.commission),
      tax: amount(row.tax),
      net: amount(row.net),
    }));
    const forecasts: Row[] = (value.forecasts ?? []).map((row, position) => ({
      id: row.id,
      position,
      kind: text(row.kind),
      category: text(row.category),
      description: text(row.description),
      amount: amount(row.amount),
      dueDate: text(row.dueDate),
      status: text(row.status),
      branchId: optionalText(row.branchId),
      createdAt: optionalText(row.createdAt),
      updatedAt: optionalText(row.updatedAt),
      settledAt: optionalText(row.settledAt),
    }));
    const skipped: Row[] = (value.cashbookSkippedReceiptIds ?? []).map((receiptId, position) => ({
      receiptId: text(receiptId),
      position,
    }));

    const receivables: Row[] = (ledger?.receivables ?? []).map((row, position) => ({
      id: row.id,
      position,
      receivableCode: text(row.receivableCode),
      studentId: text(row.studentId),
      studentName: text(row.studentName),
      billingPeriod: text(row.billingPeriod),
      issueDate: text(row.issueDate),
      dueDate: text(row.dueDate),
      amountDue: amount(row.amountDue),
      amountPaid: amount(row.amountPaid),
      balanceDue: amount(row.balanceDue),
      currency: text(row.currency),
      status: text(row.status),
      paymentOrderId: text(row.paymentOrderId),
      classId: optionalText(row.classId),
      billKey: optionalText(row.billKey),
      frozenAt: optionalText(row.frozenAt),
      publicToken: optionalText(row.publicToken),
      requestedBy: optionalText(row.requestedBy),
      appliedCredits: serializeAppliedCredits(row.appliedCredits),
      leftClass: serializeLeftClass(row),
    }));
    const paymentOrders: Row[] = (ledger?.paymentOrders ?? []).map((row, position) => ({
      id: row.id,
      position,
      receivableId: text(row.receivableId),
      studentId: text(row.studentId),
      paymentCode: text(row.paymentCode),
      amount: amount(row.amount),
      qrUrl: text(row.qrUrl),
      status: text(row.status),
      createdAt: text(row.createdAt),
    }));
    const bankTransactions: Row[] = (ledger?.bankTransactions ?? []).map((row, position) => ({
      id: row.id,
      position,
      provider: text(row.provider),
      providerTransactionId: text(row.providerTransactionId),
      accountNumber: text(row.accountNumber),
      transactionDate: text(row.transactionDate),
      transferType: text(row.transferType),
      transferAmount: amount(row.transferAmount),
      content: text(row.content),
      status: text(row.status),
      reviewReason: optionalText(row.reviewReason),
      receivedAt: text(row.receivedAt),
      processedAt: optionalText(row.processedAt),
    }));
    const payments: Row[] = (ledger?.payments ?? []).map((row, position) => ({
      id: row.id,
      position,
      paymentCode: text(row.paymentCode),
      studentId: text(row.studentId),
      bankTransactionId: text(row.bankTransactionId),
      receivableId: text(row.receivableId),
      amount: amount(row.amount),
      allocatedAmount: amount(row.allocatedAmount),
      excessAmount: amount(row.excessAmount),
      status: text(row.status),
      paidAt: text(row.paidAt),
      method: optionalText(row.method),
      note: optionalText(row.note),
    }));
    const receipts: Row[] = (ledger?.receipts ?? []).map((row, position) => ({
      id: row.id,
      position,
      receiptNumber: text(row.receiptNumber),
      paymentId: text(row.paymentId),
      studentId: text(row.studentId),
      amount: amount(row.amount),
      issuedAt: text(row.issuedAt),
      status: text(row.status),
      method: optionalText(row.method),
      note: optionalText(row.note),
      classId: optionalText(row.classId),
      className: optionalText(row.className),
      billingPeriod: optionalText(row.billingPeriod),
      billingMode: optionalText(row.billingMode),
      studentName: optionalText(row.studentName),
      studentCode: optionalText(row.studentCode),
      creditSessionsUsed: optionalCount(row.creditSessionsUsed),
      materialsAmount: optionalAmount(row.materialsAmount),
      paidThroughBefore: optionalText(row.paidThroughBefore),
    }));
    const invoices: Row[] = (ledger?.invoices ?? []).map((row, position) => ({
      id: row.id,
      position,
      studentId: text(row.studentId),
      paymentId: text(row.paymentId),
      receivableId: text(row.receivableId),
      provider: text(row.provider),
      invoiceNumber: optionalText(row.invoiceNumber),
      invoiceSeries: optionalText(row.invoiceSeries),
      amount: amount(row.amount),
      buyerName: text(row.buyerName),
      lookupCode: optionalText(row.lookupCode),
      status: text(row.status),
      retryCount: Math.round(Number(row.retryCount) || 0),
      lastError: optionalText(row.lastError),
      createdAt: text(row.createdAt),
      issuedAt: optionalText(row.issuedAt),
      buyerTaxCode: optionalText(row.buyerTaxCode),
      buyerAddress: optionalText(row.buyerAddress),
      buyerEmail: optionalText(row.buyerEmail),
      pdfUrl: optionalText(row.pdfUrl),
      xmlUrl: optionalText(row.xmlUrl),
      providerInvoiceId: optionalText(row.providerInvoiceId),
      taxAuthorityCode: optionalText(row.taxAuthorityCode),
      processingAt: optionalText(row.processingAt),
      approvedAt: optionalText(row.approvedAt),
      previewHash: optionalText(row.previewHash),
    }));
    const credits: Row[] = (ledger?.credits ?? []).map((row, position) => ({
      id: row.id,
      position,
      studentId: text(row.studentId),
      sourcePaymentId: text(row.sourcePaymentId),
      amount: amount(row.amount),
      remainingAmount: amount(row.remainingAmount),
      reason: text(row.reason),
      status: text(row.status),
      createdAt: text(row.createdAt),
      sourceClassId: optionalText(row.sourceClassId),
    }));
    const webhookLogs: Row[] = (ledger?.webhookLogs ?? []).map((row, position) => ({
      id: row.id,
      position,
      requestId: text(row.requestId),
      signatureValid: row.signatureValid === true,
      processingStatus: text(row.processingStatus),
      providerTransactionId: optionalText(row.providerTransactionId),
      createdAt: text(row.createdAt),
    }));

    return syncTables(tx, [
      { name: "tuition_debts", delegate: tx.opsTuitionDebt as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: debts },
      { name: "cash_entries", delegate: tx.opsCashEntry as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: cashbook },
      { name: "recon_days", delegate: tx.opsReconDay as unknown as RowDelegate, keyFields: ["date"], orderField: "position", rows: recon },
      { name: "recon_entries", delegate: tx.opsReconEntry as unknown as RowDelegate, keyFields: ["entryId"], orderField: "position", rows: reconEntries },
      { name: "payroll_rows", delegate: tx.opsPayrollRow as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: payroll },
      { name: "finance_forecasts", delegate: tx.opsFinanceForecast as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: forecasts },
      { name: "cashbook_skipped_receipts", delegate: tx.opsCashbookSkippedReceipt as unknown as RowDelegate, keyFields: ["receiptId"], orderField: "position", rows: skipped },
      { name: "sepay_receivables", delegate: tx.opsSepayReceivable as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: receivables },
      { name: "sepay_payment_orders", delegate: tx.opsSepayPaymentOrder as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: paymentOrders },
      { name: "sepay_bank_transactions", delegate: tx.opsSepayBankTransaction as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: bankTransactions },
      { name: "sepay_payments", delegate: tx.opsSepayPayment as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: payments },
      { name: "sepay_receipts", delegate: tx.opsSepayReceipt as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: receipts },
      { name: "sepay_invoices", delegate: tx.opsSepayInvoice as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: invoices },
      { name: "sepay_credits", delegate: tx.opsSepayCredit as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: credits },
      { name: "sepay_webhook_logs", delegate: tx.opsSepayWebhookLog as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: webhookLogs },
    ]);
  },
};
