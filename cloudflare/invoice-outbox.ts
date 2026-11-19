/**
 * Hàng chờ phát hành hóa đơn MISA — tuân thủ tuyệt đối R1: không lệnh gọi mạng nào
 * nằm giữa lượt đọc và lượt ghi khối tài chính. Ba giai đoạn tách rời:
 *   1. Đọc, chọn lô, đánh dấu PROCESSING (một lượt compareAndPut ngắn) — đóng cửa sổ ghi.
 *   2. Ngoài mọi transaction: gọi MISA lần lượt cho từng hóa đơn trong lô.
 *   3. Đọc lại, áp kết quả, ghi lại — chỉ sửa đúng các hóa đơn trong lô.
 */
import { readEffectiveIntegrationSettings, readFinanceSnapshot, persistFinanceIfUnchanged, type FinanceKvEnv } from "./finance-storage";
import { createMisaClient } from "./misa-invoice-client";
import { buildMisaInvoiceInput } from "./misa-invoice-input";
import { syncTuitionCashbook } from "./finance-types";
import { mergeSepayLedger, type SepayInvoice } from "./sepay-engine";
import type { DemoStudent } from "./people-types";

const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RETRY_COUNT = 5;
const DEFAULT_BATCH_LIMIT = 10;

export interface ProcessInvoiceOutboxResult {
  processed: number;
  issued: number;
  failed: number;
}

/** Cờ "đang chạy" cấp module: bỏ qua lượt mới khi lượt cũ (setInterval hoặc gọi sau webhook) chưa xong. */
let outboxRunning = false;

export async function processInvoiceOutbox(env: FinanceKvEnv, opts: { limit?: number } = {}): Promise<ProcessInvoiceOutboxResult> {
  if (outboxRunning) return { processed: 0, issued: 0, failed: 0 };
  outboxRunning = true;
  try {
    return await runOutboxOnce(env, Math.max(1, opts.limit ?? DEFAULT_BATCH_LIMIT));
  } finally {
    outboxRunning = false;
  }
}

async function runOutboxOnce(env: FinanceKvEnv, limit: number): Promise<ProcessInvoiceOutboxResult> {
  const effective = await readEffectiveIntegrationSettings(env);
  // `issueEnabled` là công tắc riêng "cho phép xuất hóa đơn thật" (khác `enabled` = tích hợp đã
  // cấu hình) — route thủ công (`issueInvoiceForReceipt`) đã tôn trọng công tắc này, hàng chờ tự
  // động sau webhook phải tôn trọng như nhau, nếu không hóa đơn PENDING vẫn bị tự phát hành thật
  // dù nhân viên đã tắt tính năng này khi hệ thống còn đang phát triển.
  if (!effective.misa.enabled || !effective.misa.issueEnabled) return { processed: 0, issued: 0, failed: 0 };

  // Chỉ phát hành hóa đơn đã được kế toán xem trước và duyệt (có `approvedAt`); hóa đơn webhook tự
  // tạo nằm chờ duyệt cho tới khi có người xem bản nháp ở MISA rồi bấm xuất.
  // Giai đoạn 1 — chọn lô, khoá bằng PROCESSING, đóng cửa sổ ghi lại ngay.
  const batchIds = await claimBatch(env, limit);
  if (!batchIds.length) return { processed: 0, issued: 0, failed: 0 };

  // Giai đoạn 2 — NGOÀI mọi transaction: gọi MISA lần lượt.
  const students = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? [];
  const client = createMisaClient(effective.misa);

  const claimedSnapshot = await readFinanceSnapshot(env);
  const claimedLedger = mergeSepayLedger(syncTuitionCashbook(claimedSnapshot.finance).sepay);
  const targets = claimedLedger.invoices.filter((invoice) => batchIds.includes(invoice.id));

  const results = new Map<string, { status: "ISSUED" | "FAILED"; patch: Partial<SepayInvoice> }>();
  for (const invoice of targets) {
    const student = students.find((row) => row.id === invoice.studentId);
    const result = await client.publishInvoice(buildMisaInvoiceInput({
      refId: invoice.id, invoice, ledger: claimedLedger, student, fields: effective.misa.invoiceFields,
    }));
    results.set(invoice.id, result.ok
      ? {
        status: "ISSUED",
        patch: {
          provider: "MISA", invoiceNumber: result.invoiceNumber, invoiceSeries: result.invoiceSeries, lookupCode: result.lookupCode,
          providerInvoiceId: result.providerInvoiceId, taxAuthorityCode: result.taxAuthorityCode,
          issuedAt: new Date().toISOString(), lastError: undefined,
        },
      }
      // Lỗi dữ liệu/cấu hình (không retryable) thì dừng tự thử ngay — kế toán sửa rồi bấm
      // "Phát hành lại"; lỗi mạng/hệ thống MISA thì để hàng chờ tự thử tiếp.
      : { status: "FAILED", patch: { lastError: `${result.code}: ${result.message}`, ...(result.retryable ? {} : { retryCount: MAX_RETRY_COUNT }) } });
  }

  // Giai đoạn 3 — đọc lại, áp kết quả, ghi lại. Chỉ sửa đúng các hóa đơn trong lô.
  const applied = await applyResults(env, batchIds, results);
  // Phát hành xong không gửi Zalo: hóa đơn có email thì MISA tự gửi email cho người mua.
  return applied;
}

async function claimBatch(env: FinanceKvEnv, limit: number): Promise<string[]> {
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const now = Date.now();
    // Hóa đơn kẹt PROCESSING quá 10 phút (tiến trình chết giữa chừng) — cứu về PENDING trước.
    const recovered = sepay.invoices.map((invoice): SepayInvoice => {
      if (invoice.status !== "PROCESSING") return invoice;
      const stuckSince = invoice.processingAt ? Date.parse(invoice.processingAt) : NaN;
      if (Number.isFinite(stuckSince) && now - stuckSince <= PROCESSING_TIMEOUT_MS) return invoice;
      return { ...invoice, status: "PENDING", processingAt: undefined };
    });
    const eligible = recovered.filter((invoice) => (invoice.status === "PENDING" || invoice.status === "FAILED") && invoice.approvedAt && invoice.retryCount < MAX_RETRY_COUNT).slice(0, limit);
    if (!eligible.length) {
      if (JSON.stringify(recovered) !== JSON.stringify(sepay.invoices)) {
        const next = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices: recovered } });
        await persistFinanceIfUnchanged(env, snapshot.stored, next);
      }
      return [];
    }
    const claimedIds = new Set(eligible.map((invoice) => invoice.id));
    const nowIso = new Date().toISOString();
    const marked = recovered.map((invoice) => (claimedIds.has(invoice.id) ? { ...invoice, status: "PROCESSING" as const, processingAt: nowIso } : invoice));
    const next = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices: marked } });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) return [...claimedIds];
    snapshot = await readFinanceSnapshot(env);
  }
  return [];
}

async function applyResults(
  env: FinanceKvEnv,
  batchIds: string[],
  results: Map<string, { status: "ISSUED" | "FAILED"; patch: Partial<SepayInvoice> }>,
): Promise<ProcessInvoiceOutboxResult> {
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const nextInvoices = sepay.invoices.map((invoice) => {
      const result = results.get(invoice.id);
      if (!result) return invoice;
      return {
        ...invoice,
        ...result.patch,
        status: result.status,
        retryCount: result.status === "FAILED" ? Math.max(invoice.retryCount + 1, result.patch.retryCount ?? 0) : invoice.retryCount,
        processingAt: undefined,
      };
    });
    const next = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices: nextInvoices } });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
      const issued = [...results.values()].filter((row) => row.status === "ISSUED").length;
      const failed = [...results.values()].filter((row) => row.status === "FAILED").length;
      return { processed: batchIds.length, issued, failed };
    }
    snapshot = await readFinanceSnapshot(env);
  }
  return { processed: 0, issued: 0, failed: 0 };
}
