/**
 * API hóa đơn điện tử MISA ngoài luồng webhook tự động:
 *   - Xem trước hóa đơn của một phiếu thu (kế toán/ADMIN) — gọi MISA `unpublishview`, lưu dấu vân tay
 *     nội dung; bắt buộc trước khi xuất, cho cả phiếu thủ công lẫn hóa đơn webhook đang chờ duyệt.
 *   - Xuất hóa đơn thủ công — chỉ khi nội dung khớp bản đã xem trước; đặt `approvedAt` rồi chạy hàng
 *     chờ ngay để trả kết quả trong cùng lượt bấm.
 *   - Tải PDF hóa đơn đã phát hành (proxy /invoice/Download của MISA, không lưu file).
 *   - Công cụ thử nghiệm ở thẻ cấu hình MISA (chỉ ADMIN): lấy mẫu hóa đơn, xem trước,
 *     phát hành thử, tra trạng thái — dùng để kiểm với môi trường sandbox trước khi chạy thật.
 * Không gọi MISA bên trong cửa sổ đọc–ghi khối tài chính (R1): lưu hóa đơn xong mới
 * để `processInvoiceOutbox` gọi mạng.
 */
import { readEffectiveIntegrationSettings, readFinanceSnapshot, persistFinanceIfUnchanged, type FinanceKvEnv } from "./finance-storage";
import { syncTuitionCashbook, type DemoFinance } from "./finance-types";
import { processInvoiceOutbox } from "./invoice-outbox";
import { DRAFT_ERROR_PREFIX } from "./misa-invoice-draft";
import { createMisaClient, type MisaInvoiceInput } from "./misa-invoice-client";
import { normalizeCitizenId, type MisaInvoiceFields } from "./misa-invoice-fields";
import { buildMisaInvoiceInput, hashMisaInvoiceInput } from "./misa-invoice-input";
import type { DemoStudent } from "./people-types";
import { mergeSepayLedger, type SepayInvoice } from "./sepay-engine";

type Role = "ADMIN" | "TEACHER" | "STUDENT" | "ACCOUNTANT" | "ASSISTANT";

export interface MisaRouteHelpers {
  json(data: unknown, status?: number): Response;
  audit(summary: string, entityId: string): Promise<void>;
}

interface BuyerBody {
  buyerName?: unknown;
  buyerTaxCode?: unknown;
  buyerAddress?: unknown;
  buyerEmail?: unknown;
}

const clean = (value: unknown, max = 255) => String(value ?? "").trim().slice(0, max);

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

function pdfResponse(base64: string, filename: string): Response {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Trả `null` nếu request không thuộc nhóm route này để worker xử lý tiếp. */
export async function handleMisaInvoiceApi(
  request: Request,
  url: URL,
  env: FinanceKvEnv,
  session: { role: Role },
  helpers: MisaRouteHelpers,
): Promise<Response | null> {
  const { json } = helpers;
  const isAdmin = session.role === "ADMIN";
  const canFinance = isAdmin || session.role === "ACCOUNTANT";

  if (url.pathname === "/api/finance/invoices/issue" && request.method === "POST") {
    if (!canFinance) return json({ error: "FORBIDDEN" }, 403);
    return issueInvoiceForReceipt(request, env, helpers);
  }

  if (url.pathname === "/api/finance/invoices/import" && request.method === "POST") {
    if (!canFinance) return json({ error: "FORBIDDEN" }, 403);
    return importInvoices(request, env, helpers);
  }

  if (url.pathname === "/api/finance/invoices/preview" && request.method === "POST") {
    if (!canFinance) return json({ error: "FORBIDDEN" }, 403);
    return previewInvoiceForReceipt(request, env, helpers);
  }

  if (url.pathname === "/api/misa/invoice-pdf" && request.method === "GET") {
    const invoiceId = url.searchParams.get("invoiceId") || "";
    const directTransactionId = url.searchParams.get("transactionId") || "";
    if (invoiceId ? !canFinance : !isAdmin) return json({ error: "FORBIDDEN" }, 403);
    let transactionId = directTransactionId;
    let filename = `hoa-don-${directTransactionId}.pdf`;
    if (invoiceId) {
      const invoice = mergeSepayLedger(syncTuitionCashbook((await readFinanceSnapshot(env)).finance).sepay).invoices.find((row) => row.id === invoiceId);
      if (!invoice || invoice.status !== "ISSUED") return json({ error: "Hóa đơn chưa phát hành, chưa tải được PDF." }, 404);
      transactionId = invoice.providerInvoiceId || invoice.lookupCode || "";
      filename = `hoa-don-${invoice.invoiceSeries || ""}-${invoice.invoiceNumber || transactionId}.pdf`;
    }
    if (!transactionId) return json({ error: "Thiếu mã tra cứu (TransactionID) của hóa đơn." }, 400);
    const effective = await readEffectiveIntegrationSettings(env);
    const result = await createMisaClient(effective.misa).downloadInvoice(transactionId);
    if (!result.ok) return json({ error: `${result.code}: ${result.message}` }, 502);
    return pdfResponse(result.base64, filename);
  }

  if (!url.pathname.startsWith("/api/integrations/misa/")) return null;
  if (!isAdmin) return json({ error: "FORBIDDEN" }, 403);
  const effective = await readEffectiveIntegrationSettings(env);
  if (!effective.misa.enabled) return json({ ok: false, message: "MISA đang tắt — bật công tắc rồi lưu trước khi thử." });
  const client = createMisaClient(effective.misa);

  if (url.pathname === "/api/integrations/misa/templates" && request.method === "POST") {
    const result = await client.getTemplates();
    return json(result.ok ? { ok: true, templates: result.templates } : { ok: false, message: `${result.code}: ${result.message}` });
  }

  if (url.pathname === "/api/integrations/misa/test-invoice" && request.method === "POST") {
    const body = await readJson<BuyerBody & { mode?: unknown; itemName?: unknown; amount?: unknown; buyerIdNumber?: unknown }>(request) ?? {};
    const input: MisaInvoiceInput = {
      refId: `test-${crypto.randomUUID()}`,
      buyer: { fullName: clean(body.buyerName), taxCode: clean(body.buyerTaxCode, 20), address: clean(body.buyerAddress, 400), email: clean(body.buyerEmail), idNumber: normalizeCitizenId(clean(body.buyerIdNumber, 20)) },
      itemName: clean(body.itemName, 500) || "Học phí (hóa đơn thử nghiệm)",
      amount: Math.round(Number(body.amount) || 0),
    };
    if (body.mode === "publish") {
      const result = await client.publishInvoice(input);
      if (!result.ok) return json({ ok: false, message: `${result.code}: ${result.message}` });
      await helpers.audit(`Phát hành hóa đơn MISA thử nghiệm ${result.invoiceSeries} số ${result.invoiceNumber || "(chưa cấp)"} — TransactionID ${result.lookupCode}`, result.lookupCode);
      return json({ ok: true, refId: input.refId, result });
    }
    const preview = await client.previewInvoice(input);
    return json(preview.ok ? { ok: true, link: preview.link } : { ok: false, message: `${preview.code}: ${preview.message}` });
  }

  if (url.pathname === "/api/integrations/misa/status" && request.method === "POST") {
    const body = await readJson<{ transactionId?: unknown }>(request) ?? {};
    const transactionId = clean(body.transactionId, 100);
    if (!transactionId) return json({ ok: false, message: "Thiếu TransactionID." });
    const result = await client.getInvoiceStatus([transactionId]);
    return json(result.ok ? { ok: true, statuses: result.statuses } : { ok: false, message: `${result.code}: ${result.message}` });
  }

  return json({ error: "NOT_FOUND" }, 404);
}

type InvoiceBuyer = { buyerName: string; buyerTaxCode?: string; buyerAddress?: string; buyerEmail?: string };
type ReceiptInvoiceError = { error: string; status: number };
type SepayLedger = ReturnType<typeof mergeSepayLedger>;
type CheckedReceipt = { sepay: SepayLedger; receipt: SepayLedger["receipts"][number]; existing?: SepayInvoice };
type CheckedReceivable = { sepay: SepayLedger; receivable: SepayLedger["receivables"][number]; existing?: SepayInvoice };

/** Đọc + kiểm tra thông tin người mua từ body; trả `Response` lỗi nếu thiếu/sai. */
async function readIssueRequest(
  request: Request, env: FinanceKvEnv, helpers: MisaRouteHelpers,
): Promise<{ receiptId: string; receivableId: string; buyer: InvoiceBuyer; effective: Awaited<ReturnType<typeof readEffectiveIntegrationSettings>> } | Response> {
  const { json } = helpers;
  const body = await readJson<BuyerBody & { receiptId?: unknown; receivableId?: unknown }>(request) ?? {};
  const receiptId = clean(body.receiptId, 100);
  const receivableId = clean(body.receivableId, 100);
  const buyerName = clean(body.buyerName);
  if (!receiptId && !receivableId) return json({ error: "Thiếu phiếu thu hoặc phiếu phải thu cần xuất hóa đơn." }, 400);
  if (!buyerName) return json({ error: "Nhập tên người mua trên hóa đơn." }, 400);
  const effective = await readEffectiveIntegrationSettings(env);
  if (!effective.misa.issueEnabled) {
    return json({ error: "Tính năng xuất hóa đơn thật đang tắt (hệ thống đang phát triển). Bật ở Cài đặt → Tích hợp → MISA meInvoice." }, 403);
  }
  if (!effective.misa.enabled) return json({ error: "MISA đang tắt — bật tích hợp ở Cài đặt → Tích hợp trước khi xuất hóa đơn." }, 400);
  const buyer: InvoiceBuyer = {
    buyerName,
    buyerTaxCode: clean(body.buyerTaxCode, 20) || undefined,
    buyerAddress: clean(body.buyerAddress, 400) || undefined,
    buyerEmail: clean(body.buyerEmail) || undefined,
  };
  if (buyer.buyerTaxCode && !buyer.buyerAddress) return json({ error: "Có mã số thuế thì phải nhập địa chỉ người mua." }, 400);
  return { receiptId, receivableId, buyer, effective };
}

/**
 * Tìm hóa đơn hiện có của phiếu thu và kiểm tra có được xem trước/xuất hay không. Chỉ ISSUED và hóa đơn
 * đang phát hành (PROCESSING, hoặc PENDING đã duyệt) bị chặn; PENDING chưa duyệt (webhook tự tạo) và
 * FAILED vẫn được xem trước lại.
 */
function checkReceiptInvoice(finance: DemoFinance, receiptId: string): ReceiptInvoiceError | CheckedReceipt {
  const sepay = mergeSepayLedger(finance.sepay);
  const receipt = sepay.receipts.find((row) => row.id === receiptId);
  if (!receipt) return { error: "Không tìm thấy phiếu thu.", status: 404 };
  const existing = sepay.invoices.find((row) => row.paymentId === receipt.paymentId && row.status !== "CANCELLED");
  if (existing?.status === "ISSUED") return { error: "Phiếu thu này đã có hóa đơn.", status: 400 };
  if (existing && (existing.status === "PROCESSING" || (existing.status === "PENDING" && existing.approvedAt))) {
    return { error: "Hóa đơn của phiếu thu này đang được phát hành, chờ ít phút.", status: 400 };
  }
  return { sepay, receipt, existing };
}

/** Hóa đơn "ứng viên" với thông tin người mua mới: sửa lên bản hiện có, hoặc dựng bản mới khi phiếu thu chưa có. */
function candidateInvoice(checked: CheckedReceipt, buyer: InvoiceBuyer, invoiceId: string): SepayInvoice {
  const { sepay, receipt, existing } = checked;
  if (existing) return { ...existing, ...buyer };
  const payment = sepay.payments.find((row) => row.id === receipt.paymentId);
  return {
    id: invoiceId, studentId: receipt.studentId, paymentId: receipt.paymentId, receivableId: payment?.receivableId || "",
    provider: "MISA", amount: receipt.amount, ...buyer, status: "PENDING", retryCount: 0, createdAt: new Date().toISOString(),
  };
}

/**
 * Hóa đơn xuất theo phiếu phải thu (chưa cần phiếu thu): công nợ và hóa đơn tách riêng — học viên
 * chưa đóng tiền vẫn phát hành được, invoice gắn `receivableId`, `paymentId` để trống.
 */
function checkReceivableInvoice(finance: DemoFinance, receivableId: string): ReceiptInvoiceError | CheckedReceivable {
  const sepay = mergeSepayLedger(finance.sepay);
  const receivable = sepay.receivables.find((row) => row.id === receivableId);
  if (!receivable) return { error: "Không tìm thấy phiếu phải thu.", status: 404 };
  if (receivable.status === "CANCELLED") return { error: "Phiếu phải thu này đã bị hủy.", status: 400 };
  const paymentIds = new Set(sepay.payments.filter((row) => row.receivableId === receivable.id).map((row) => row.id));
  const existing = sepay.invoices.find((row) => row.status !== "CANCELLED"
    && (row.receivableId === receivable.id || (row.paymentId && paymentIds.has(row.paymentId))));
  if (existing?.status === "ISSUED") return { error: "Phiếu này đã có hóa đơn.", status: 400 };
  if (existing && (existing.status === "PROCESSING" || (existing.status === "PENDING" && existing.approvedAt))) {
    return { error: "Hóa đơn của phiếu này đang được phát hành, chờ ít phút.", status: 400 };
  }
  return { sepay, receivable, existing };
}

function candidateInvoiceForReceivable(checked: CheckedReceivable, buyer: InvoiceBuyer, invoiceId: string): SepayInvoice {
  const { receivable, existing } = checked;
  if (existing) return { ...existing, ...buyer, receivableId: existing.receivableId || receivable.id };
  return {
    id: invoiceId, studentId: receivable.studentId, paymentId: "", receivableId: receivable.id,
    provider: "MISA", amount: Number(receivable.amountDue) || 0, ...buyer, status: "PENDING", retryCount: 0, createdAt: new Date().toISOString(),
  };
}

/** Dựng đúng dữ liệu sẽ gửi MISA cho phiếu thu với thông tin người mua đang nhập. */
async function buildInputForReceipt(env: FinanceKvEnv, checked: CheckedReceipt, buyer: InvoiceBuyer, fields: MisaInvoiceFields, refId: string) {
  const draft = candidateInvoice(checked, buyer, checked.existing?.id || "draft");
  const students = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? [];
  return buildMisaInvoiceInput({ refId, invoice: draft, ledger: checked.sepay, student: students.find((row) => row.id === draft.studentId), fields });
}

/** Như buildInputForReceipt nhưng cho phiếu phải thu; bổ sung tên lớp + hình thức thu từ lớp học. */
async function buildInputForReceivable(env: FinanceKvEnv, checked: CheckedReceivable, buyer: InvoiceBuyer, fields: MisaInvoiceFields, refId: string) {
  const draft = candidateInvoiceForReceivable(checked, buyer, checked.existing?.id || "draft");
  const students = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? [];
  const classes = (await env.STEPS_LMS_DATA.get<{ id?: string; name?: string; billingMode?: string }[]>("classes:steps-demo", "json")) ?? [];
  const cls = classes.find((row) => row.id === checked.receivable.classId);
  return buildMisaInvoiceInput({
    refId, invoice: draft, ledger: checked.sepay, fields,
    student: students.find((row) => row.id === draft.studentId),
    hints: { className: cls?.name || "", billingMode: cls?.billingMode === "MONTHLY" ? "MONTHLY" : "COURSE" },
  });
}

/**
 * Ghi thông tin người mua lên hóa đơn của phiếu thu (tạo mới nếu chưa có), kiểm tra lại trạng thái trong
 * từng lượt ghi. `previewHash` lưu dấu vân tay bản xem trước; `approveHash` (xuất thật) chỉ thành công
 * khi khớp dấu vân tay đã lưu, rồi đặt `approvedAt` để hàng chờ phát hành.
 */
async function saveInvoiceForReceipt(
  env: FinanceKvEnv, receiptId: string, buyer: InvoiceBuyer, mode: { previewHash: string } | { approveHash: string },
): Promise<ReceiptInvoiceError | { invoiceId: string }> {
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const checked = checkReceiptInvoice(current, receiptId);
    if ("error" in checked) return checked;
    const { sepay, existing } = checked;
    if ("approveHash" in mode && existing?.previewHash !== mode.approveHash) {
      return { error: "Thông tin hóa đơn đã thay đổi so với bản xem trước. Bấm Xem trước lại rồi xuất.", status: 400 };
    }
    const invoiceId = existing?.id || `inv-${crypto.randomUUID()}`;
    const draft = candidateInvoice(checked, buyer, invoiceId);
    const patched: SepayInvoice = "approveHash" in mode
      ? { ...draft, status: "PENDING", retryCount: 0, lastError: undefined, processingAt: undefined, approvedAt: new Date().toISOString() }
      // Xem trước thành công thì lỗi của bản nháp tự dựng không còn đúng nữa; lỗi phát hành cũ vẫn giữ.
      : { ...draft, previewHash: mode.previewHash, approvedAt: undefined, lastError: draft.lastError?.startsWith(DRAFT_ERROR_PREFIX) ? undefined : draft.lastError };
    const invoices = existing ? sepay.invoices.map((row) => (row.id === existing.id ? patched : row)) : [...sepay.invoices, patched];
    const next: DemoFinance = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices } });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) return { invoiceId };
    snapshot = await readFinanceSnapshot(env);
  }
  return { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị thử lại giúp em.", status: 409 };
}

/** Như saveInvoiceForReceipt nhưng target là phiếu phải thu — xuất HĐ không cần phiếu thu trước. */
async function saveInvoiceForReceivable(
  env: FinanceKvEnv, receivableId: string, buyer: InvoiceBuyer, mode: { previewHash: string } | { approveHash: string },
): Promise<ReceiptInvoiceError | { invoiceId: string }> {
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const checked = checkReceivableInvoice(current, receivableId);
    if ("error" in checked) return checked;
    const { sepay, existing } = checked;
    if ("approveHash" in mode && existing?.previewHash !== mode.approveHash) {
      return { error: "Thông tin hóa đơn đã thay đổi so với bản xem trước. Bấm Xem trước lại rồi xuất.", status: 400 };
    }
    const invoiceId = existing?.id || `inv-${crypto.randomUUID()}`;
    const draft = candidateInvoiceForReceivable(checked, buyer, invoiceId);
    const patched: SepayInvoice = "approveHash" in mode
      ? { ...draft, status: "PENDING", retryCount: 0, lastError: undefined, processingAt: undefined, approvedAt: new Date().toISOString() }
      : { ...draft, previewHash: mode.previewHash, approvedAt: undefined, lastError: draft.lastError?.startsWith(DRAFT_ERROR_PREFIX) ? undefined : draft.lastError };
    const invoices = existing ? sepay.invoices.map((row) => (row.id === existing.id ? patched : row)) : [...sepay.invoices, patched];
    const next: DemoFinance = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices } });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) return { invoiceId };
    snapshot = await readFinanceSnapshot(env);
  }
  return { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị thử lại giúp em.", status: 409 };
}

/**
 * Xem trước (nháp) hóa đơn của một phiếu thu hoặc phiếu phải thu: dựng đúng dữ liệu sẽ phát hành,
 * gọi MISA `unpublishview` lấy link xem (hóa đơn chưa có số, chưa gửi thuế) rồi lưu dấu vân tay
 * nội dung lên hóa đơn. Bước này bắt buộc trước khi xuất thật.
 */
async function previewInvoiceForReceipt(request: Request, env: FinanceKvEnv, helpers: MisaRouteHelpers): Promise<Response> {
  const { json } = helpers;
  const parsed = await readIssueRequest(request, env, helpers);
  if (parsed instanceof Response) return parsed;
  const { receiptId, receivableId, buyer, effective } = parsed;

  if (receivableId && !receiptId) {
    const checked = checkReceivableInvoice(syncTuitionCashbook((await readFinanceSnapshot(env)).finance), receivableId);
    if ("error" in checked) return json({ error: checked.error }, checked.status);
    const input = await buildInputForReceivable(env, checked, buyer, effective.misa.invoiceFields, `preview-${crypto.randomUUID()}`);
    const preview = await createMisaClient(effective.misa).previewInvoice(input);
    if (!preview.ok) return json({ error: `MISA báo lỗi: ${preview.code}: ${preview.message}` }, 502);
    const saved = await saveInvoiceForReceivable(env, receivableId, buyer, { previewHash: await hashMisaInvoiceInput(input) });
    if ("error" in saved) return json({ error: saved.error }, saved.status);
    await helpers.audit(`Xem trước hóa đơn điện tử cho phiếu phải thu ${receivableId}`, saved.invoiceId);
    return json({ ok: true, link: preview.link, finance: syncTuitionCashbook((await readFinanceSnapshot(env)).finance) });
  }

  const checked = checkReceiptInvoice(syncTuitionCashbook((await readFinanceSnapshot(env)).finance), receiptId);
  if ("error" in checked) return json({ error: checked.error }, checked.status);
  const input = await buildInputForReceipt(env, checked, buyer, effective.misa.invoiceFields, `preview-${crypto.randomUUID()}`);
  const preview = await createMisaClient(effective.misa).previewInvoice(input);
  if (!preview.ok) return json({ error: `MISA báo lỗi: ${preview.code}: ${preview.message}` }, 502);

  const saved = await saveInvoiceForReceipt(env, receiptId, buyer, { previewHash: await hashMisaInvoiceInput(input) });
  if ("error" in saved) return json({ error: saved.error }, saved.status);
  await helpers.audit(`Xem trước hóa đơn điện tử cho phiếu thu ${receiptId}`, saved.invoiceId);
  return json({ ok: true, link: preview.link, finance: syncTuitionCashbook((await readFinanceSnapshot(env)).finance) });
}

/**
 * Xuất hóa đơn cho phiếu thu chưa có hóa đơn (kể cả phiếu thu tay/tiền mặt và hóa đơn webhook đang chờ
 * duyệt), cho phiếu phải thu chưa thu tiền, hoặc phát hành lại hóa đơn lỗi với thông tin người mua đã
 * sửa. Chỉ xuất được khi nội dung hiện tại khớp bản đã xem trước. Hóa đơn đã phát hành / đang phát
 * hành bị từ chối.
 */
async function issueInvoiceForReceipt(request: Request, env: FinanceKvEnv, helpers: MisaRouteHelpers): Promise<Response> {
  const { json } = helpers;
  const parsed = await readIssueRequest(request, env, helpers);
  if (parsed instanceof Response) return parsed;
  const { receiptId, receivableId, buyer, effective } = parsed;

  if (receivableId && !receiptId) {
    const checked = checkReceivableInvoice(syncTuitionCashbook((await readFinanceSnapshot(env)).finance), receivableId);
    if ("error" in checked) return json({ error: checked.error }, checked.status);
    const hash = await hashMisaInvoiceInput(await buildInputForReceivable(env, checked, buyer, effective.misa.invoiceFields, "hash"));
    const saved = await saveInvoiceForReceivable(env, receivableId, buyer, { approveHash: hash });
    if ("error" in saved) return json({ error: saved.error }, saved.status);
    const invoiceId = saved.invoiceId;
    await helpers.audit(`Yêu cầu xuất hóa đơn điện tử cho phiếu phải thu ${receivableId}`, invoiceId);
    await processInvoiceOutbox(env);
    const finance = syncTuitionCashbook((await readFinanceSnapshot(env)).finance);
    const invoice = mergeSepayLedger(finance.sepay).invoices.find((row) => row.id === invoiceId);
    const message = invoice?.status === "ISSUED" ? `Đã phát hành hóa đơn số ${invoice.invoiceNumber || "(chờ cấp số)"}.`
      : invoice?.status === "FAILED" ? `MISA báo lỗi: ${invoice.lastError || "không rõ"}`
        : "Đã xếp hóa đơn vào hàng chờ, hệ thống sẽ phát hành trong ít phút.";
    return json({ ok: true, finance, invoice, message });
  }

  const checked = checkReceiptInvoice(syncTuitionCashbook((await readFinanceSnapshot(env)).finance), receiptId);
  if ("error" in checked) return json({ error: checked.error }, checked.status);
  const hash = await hashMisaInvoiceInput(await buildInputForReceipt(env, checked, buyer, effective.misa.invoiceFields, "hash"));

  const saved = await saveInvoiceForReceipt(env, receiptId, buyer, { approveHash: hash });
  if ("error" in saved) return json({ error: saved.error }, saved.status);
  const invoiceId = saved.invoiceId;
  await helpers.audit(`Yêu cầu xuất hóa đơn điện tử cho phiếu thu ${receiptId}`, invoiceId);

  await processInvoiceOutbox(env);
  const finance = syncTuitionCashbook((await readFinanceSnapshot(env)).finance);
  const invoice = mergeSepayLedger(finance.sepay).invoices.find((row) => row.id === invoiceId);
  const message = invoice?.status === "ISSUED" ? `Đã phát hành hóa đơn số ${invoice.invoiceNumber || "(chờ cấp số)"}.`
    : invoice?.status === "FAILED" ? `MISA báo lỗi: ${invoice.lastError || "không rõ"}`
      : "Đã xếp hóa đơn vào hàng chờ, hệ thống sẽ phát hành trong ít phút.";
  return json({ ok: true, finance, invoice, message });
}

const MAX_IMPORT_ROWS = 300;

/**
 * Import hàng loạt: kế toán tick các dòng doanh số rồi đẩy lên MISA một lượt. Mỗi dòng được đánh
 * dấu PENDING + approvedAt trong một lượt ghi duy nhất rồi hàng chờ `processInvoiceOutbox` gọi
 * MISA phát hành lần lượt — tái dùng đúng cơ chế retry/an toàn của luồng xuất từng phiếu.
 * Thông tin người mua tự lấy từ hồ sơ học viên (tên phụ huynh, CCCD/MST, địa chỉ, email) như
 * bản nháp tự dựng trước đây, không cần nhập lại từng dòng.
 */
async function importInvoices(request: Request, env: FinanceKvEnv, helpers: MisaRouteHelpers): Promise<Response> {
  const { json } = helpers;
  const body = await readJson<{ receivableIds?: unknown; receiptIds?: unknown }>(request) ?? {};
  const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map((row) => clean(row, 100)).filter(Boolean))].slice(0, MAX_IMPORT_ROWS);
  const receivableIds = ids(body.receivableIds);
  const receiptIds = ids(body.receiptIds);
  if (!receivableIds.length && !receiptIds.length) return json({ error: "Chưa chọn dòng doanh số nào để import." }, 400);
  const effective = await readEffectiveIntegrationSettings(env);
  if (!effective.misa.issueEnabled) {
    return json({ error: "Tính năng xuất hóa đơn thật đang tắt (hệ thống đang phát triển). Bật ở Cài đặt → Tích hợp → MISA meInvoice." }, 403);
  }
  if (!effective.misa.enabled) return json({ error: "MISA đang tắt — bật tích hợp ở Cài đặt → Tích hợp trước khi import." }, 400);

  const marked = await markInvoicesForImport(env, receivableIds, receiptIds);
  if ("error" in marked) return json({ error: marked.error }, marked.status);
  if (!marked.invoiceIds.length) {
    return json({ error: `Không import được dòng nào: ${marked.skipped[0]?.error || "tất cả đã có hóa đơn"}.` }, 400);
  }
  await helpers.audit(`Import ${marked.invoiceIds.length} hóa đơn lên MISA (bỏ qua ${marked.skipped.length} dòng)`, marked.invoiceIds[0]);
  await processInvoiceOutbox(env, { limit: marked.invoiceIds.length });

  const finance = syncTuitionCashbook((await readFinanceSnapshot(env)).finance);
  const byId = new Map(mergeSepayLedger(finance.sepay).invoices.map((row) => [row.id, row]));
  const issued = marked.invoiceIds.filter((id) => byId.get(id)?.status === "ISSUED").length;
  const failed = marked.invoiceIds.filter((id) => byId.get(id)?.status === "FAILED").length;
  const processing = marked.invoiceIds.length - issued - failed;
  const message = [
    `Đã import ${marked.invoiceIds.length} dòng lên MISA — ${issued} thành công${failed ? `, ${failed} lỗi` : ""}${processing ? `, ${processing} đang xử lý` : ""}.`,
    marked.skipped.length ? `Bỏ qua ${marked.skipped.length} dòng (${marked.skipped[0].error}${marked.skipped.length > 1 ? ", …" : ""}).` : "",
  ].filter(Boolean).join(" ");
  return json({ ok: true, finance, imported: marked.invoiceIds.length, skipped: marked.skipped, message });
}

/** Đánh dấu một loạt phiếu phải thu/phiếu thu thành hóa đơn PENDING đã duyệt trong một lượt ghi. */
async function markInvoicesForImport(
  env: FinanceKvEnv, receivableIds: string[], receiptIds: string[],
): Promise<ReceiptInvoiceError | { invoiceIds: string[]; skipped: { id: string; error: string }[] }> {
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const now = new Date().toISOString();
    const invoiceIds: string[] = [];
    const skipped: { id: string; error: string }[] = [];
    const patches = new Map<string, SepayInvoice>();
    const mark = (checked: CheckedReceivable | CheckedReceipt, fallbackName: string, invoiceId: string) => {
      const existing = "existing" in checked ? checked.existing : undefined;
      const invoice: SepayInvoice = existing
        ? { ...existing, status: "PENDING", retryCount: 0, lastError: undefined, processingAt: undefined, approvedAt: now }
        : {
          ...("receivable" in checked
            ? candidateInvoiceForReceivable(checked, { buyerName: fallbackName }, invoiceId)
            : candidateInvoice(checked, { buyerName: fallbackName }, invoiceId)),
          approvedAt: now,
        };
      patches.set(invoice.id, invoice);
      invoiceIds.push(invoice.id);
    };
    for (const receivableId of receivableIds) {
      const checked = checkReceivableInvoice(current, receivableId);
      if ("error" in checked) skipped.push({ id: receivableId, error: checked.error });
      else mark(checked, checked.receivable.studentName || "", `inv-${crypto.randomUUID()}`);
    }
    for (const receiptId of receiptIds) {
      const checked = checkReceiptInvoice(current, receiptId);
      if ("error" in checked) skipped.push({ id: receiptId, error: checked.error });
      else mark(checked, checked.receipt.studentName || "", `inv-${crypto.randomUUID()}`);
    }
    const byId = new Map(sepay.invoices.map((row) => [row.id, row]));
    for (const invoice of patches.values()) byId.set(invoice.id, invoice);
    const next: DemoFinance = syncTuitionCashbook({ ...current, sepay: { ...sepay, invoices: [...byId.values()] } });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) return { invoiceIds, skipped };
    snapshot = await readFinanceSnapshot(env);
  }
  return { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị thử lại giúp em.", status: 409 };
}
