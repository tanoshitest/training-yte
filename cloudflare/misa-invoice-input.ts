/**
 * Dựng dữ liệu hóa đơn gửi MISA từ một hóa đơn trong sổ cái. Dùng chung cho bản xem trước
 * (route xuất tay) và bản phát hành thật (hàng chờ) để hai bên luôn cho ra cùng một nội dung —
 * và để dấu vân tay của bản đã xem trước khớp đúng với bản sẽ phát hành.
 */
import type { MisaInvoiceInput } from "./misa-invoice-client";
import { renderMisaItemName, resolveMisaBuyer, type MisaInvoiceFields } from "./misa-invoice-fields";
import type { DemoStudent } from "./people-types";
import type { mergeSepayLedger, SepayInvoice } from "./sepay-engine";

type SepayLedger = ReturnType<typeof mergeSepayLedger>;

export function buildMisaInvoiceInput(args: {
  refId: string;
  invoice: SepayInvoice;
  ledger: SepayLedger;
  student?: DemoStudent;
  fields: MisaInvoiceFields;
  /** Bổ sung khi hóa đơn xuất theo phiếu phải thu (chưa có phiếu thu): tên lớp + hình thức thu từ lớp. */
  hints?: { className?: string; billingMode?: "COURSE" | "MONTHLY" };
}): MisaInvoiceInput {
  const { invoice, ledger, student, fields, hints } = args;
  const receipt = ledger.receipts.find((row) => row.paymentId === invoice.paymentId);
  const receivable = ledger.receivables.find((row) => row.id === invoice.receivableId);
  const period = String(receipt?.billingPeriod || receivable?.billingPeriod || "").trim();
  const parentName = String(student?.parentName || "").trim();
  const billingMode = receipt?.billingMode || hints?.billingMode;
  return {
    refId: args.refId,
    buyer: resolveMisaBuyer({
      source: fields.buyerNameSource,
      invoice,
      student,
      studentNames: [student?.fullName || "", receipt?.studentName || "", receivable?.studentName || ""],
      studentCode: receipt?.studentCode || student?.code,
    }),
    itemName: renderMisaItemName(fields.itemNameTemplate, {
      period, studentName: student?.fullName || invoice.buyerName, studentCode: receipt?.studentCode || student?.code || "",
      parentName, className: receipt?.className || hints?.className || "",
    }),
    unitName: billingMode === "MONTHLY" ? fields.unitNameMonthly : fields.unitNameCourse,
    amount: invoice.amount,
  };
}

/** Dấu vân tay nội dung hóa đơn (bỏ `refId` vì mỗi lần xem trước một khác) để so bản đã xem với bản sắp phát hành. */
export async function hashMisaInvoiceInput(input: MisaInvoiceInput): Promise<string> {
  const { refId: _refId, ...content } = input;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(content)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
