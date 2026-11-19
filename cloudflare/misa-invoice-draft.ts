/**
 * Tự dựng bản nháp hóa đơn MISA ngay sau khi thu tay bằng chuyển khoản, để kế toán mở ra là có
 * sẵn bản nháp, chỉ việc xem và bấm xuất.
 *
 * "Nháp" ở đây là lời gọi xem trước `unpublishview` của MISA: không tạo hóa đơn, không có số, không
 * gửi thuế. Bước này làm hai việc: báo sớm lỗi cấu hình/dữ liệu từ MISA, và lưu dấu vân tay nội dung
 * (`previewHash`) lên hóa đơn để lần xuất thật so khớp. Không đặt `approvedAt` — phát hành thật luôn
 * cần kế toán bấm xuất.
 *
 * Gọi mạng nằm ngoài cửa sổ đọc–ghi khối tài chính (R1): đọc → gọi MISA → đọc lại rồi ghi kết quả.
 */
import { readEffectiveIntegrationSettings, readFinanceSnapshot, persistFinanceIfUnchanged, type FinanceKvEnv } from "./finance-storage";
import { syncTuitionCashbook } from "./finance-types";
import { createMisaClient } from "./misa-invoice-client";
import { buildMisaInvoiceInput, hashMisaInvoiceInput } from "./misa-invoice-input";
import type { DemoStudent } from "./people-types";
import { mergeSepayLedger } from "./sepay-engine";

/** Tiền tố lỗi của bản nháp tự dựng, để lần xem trước thủ công thành công về sau biết mà xoá đúng lỗi này. */
export const DRAFT_ERROR_PREFIX = "Nháp MISA: ";

export type InvoiceDraftResult =
  | { status: "READY" }
  | { status: "FAILED"; message: string }
  | { status: "SKIPPED" };

export async function prepareInvoiceDraft(env: FinanceKvEnv, invoiceId: string): Promise<InvoiceDraftResult> {
  const effective = await readEffectiveIntegrationSettings(env);
  // Cùng điều kiện với route xem trước: công tắc xuất hóa đơn tắt thì nháp cũng không dựng.
  if (!effective.misa.enabled || !effective.misa.issueEnabled) return { status: "SKIPPED" };

  const snapshot = await readFinanceSnapshot(env);
  const ledger = mergeSepayLedger(syncTuitionCashbook(snapshot.finance).sepay);
  const invoice = ledger.invoices.find((row) => row.id === invoiceId);
  if (!invoice || invoice.status !== "PENDING" || invoice.approvedAt) return { status: "SKIPPED" };

  const students = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? [];
  const input = buildMisaInvoiceInput({
    refId: `preview-${crypto.randomUUID()}`,
    invoice,
    ledger,
    student: students.find((row) => row.id === invoice.studentId),
    fields: effective.misa.invoiceFields,
  });
  const previewHash = await hashMisaInvoiceInput(input);
  const preview = await createMisaClient(effective.misa).previewInvoice(input);

  let latest = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(latest.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const target = sepay.invoices.find((row) => row.id === invoiceId);
    // Trong lúc chờ MISA, kế toán đã xem trước/xuất tay hoặc hóa đơn đã đổi: không ghi đè.
    if (!target || target.status !== "PENDING" || target.approvedAt || target.previewHash !== invoice.previewHash) return { status: "SKIPPED" };

    const patched = preview.ok
      ? { ...target, previewHash, lastError: target.lastError?.startsWith(DRAFT_ERROR_PREFIX) ? undefined : target.lastError }
      : { ...target, lastError: `${DRAFT_ERROR_PREFIX}${preview.code}: ${preview.message}` };
    const next = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices: sepay.invoices.map((row) => (row.id === invoiceId ? patched : row)) } });
    if (await persistFinanceIfUnchanged(env, latest.stored, next)) {
      return preview.ok ? { status: "READY" } : { status: "FAILED", message: `${preview.code}: ${preview.message}` };
    }
    latest = await readFinanceSnapshot(env);
  }
  return { status: "SKIPPED" };
}
