/**
 * Hàng chờ gửi tin Zalo ZBS Template Message, theo đúng khuôn `invoice-outbox.ts` (Phase
 * 6): đọc/khoá bằng compareAndPut, gọi mạng ngoài mọi cửa sổ ghi, rồi áp kết quả.
 *
 * Khác MISA ở một điểm quan trọng: mỗi dòng log chỉ được GỬI TỰ ĐỘNG một lần (chọn lô
 * chỉ lấy `QUEUED`, không lấy `FAILED`) — tin nhắn ZBS tính phí mỗi lần gửi, nên gửi lại
 * tự động không giới hạn là rủi ro chi phí (R14 của plan). Dòng `FAILED` chỉ gửi lại khi
 * nhân viên bấm nút "Gửi lại" trên màn hình nhật ký (đặt `status` về `QUEUED` bằng tay).
 */
import {
  readEffectiveIntegrationSettings, readFinanceSnapshot, readZaloMessageLogs,
  persistZaloMessageLogsIfUnchanged, rotateZaloRefreshToken, type FinanceKvEnv,
} from "./finance-storage";
import { createZaloClient } from "./zalo-zbs-client";
import { toZaloPhone } from "./phone-format";
import { syncTuitionCashbook } from "./finance-types";
import { mergeSepayLedger, type SepayLedger } from "./sepay-engine";
import type { ZaloMessageLog } from "./storage/zalo-message-repository";
import type { DemoStudent } from "./people-types";
import type { DemoClass, DemoLessonSession } from "./operations-types";
import { tuitionKindLabel } from "./zalo-tuition-label";
import { billPaymentCode, receivableRequestAmount } from "./tuition-billing";

const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 10;

/** `dd/MM/yyyy` theo múi giờ Asia/Ho_Chi_Minh — đúng định dạng ví dụ mẫu ZBS khai cho tham số `date`. */
function formatVnDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export interface ProcessZaloOutboxResult {
  processed: number;
  sent: number;
  failed: number;
}

export interface EnqueueZaloMessageInput {
  kind: "PAYMENT_REQUEST" | "INVOICE_ISSUED";
  receivableId?: string;
  invoiceId?: string;
  studentId: string;
  /** Số thô lấy từ hồ sơ học viên (`parentPhone1`, D3), chưa chuẩn hoá. */
  rawPhone: string;
  /** Email nhân viên thao tác; bỏ trống khi hệ thống tự xếp tin (ví dụ sau khi phát hành hóa đơn). */
  requestedBy?: string;
  /**
   * Nhân viên chủ động bấm gửi lại: dòng đã có (đã gửi/lỗi/đã nhận) được đưa về `QUEUED`
   * để gửi thêm một tin nữa, thay vì trả DUPLICATE. Dòng đang chờ/đang gửi vẫn giữ nguyên.
   * Vẫn dùng lại đúng dòng cũ (không tạo dòng thứ hai) vì khoá duy nhất ở tầng DB.
   */
  resend?: boolean;
}

/**
 * Kết quả xếp hàng, để nơi gọi (API `request-payment`) báo đúng cho người dùng thay vì
 * luôn báo "đã gửi" bất kể có tạo/gửi được tin hay không.
 * - `queued: true` → vừa tạo dòng mới (`status` là `QUEUED` hoặc `FAILED` nếu số điện
 *   thoại không hợp lệ).
 * - `queued: false, reason: "DUPLICATE"` → đã có sẵn dòng cùng `kind` + `receivableId` +
 *   `invoiceId` từ trước (kèm trạng thái/lỗi của dòng đó), không tạo/gửi gì thêm.
 * - `queued: false, reason: "DISABLED" | "NO_TEMPLATE"` → tắt tích hợp hoặc chưa cấu hình
 *   mẫu tin, không tạo dòng nào.
 * - `queued: false, reason: "CONFLICT"` → ghi đè lạc quan xung đột liên tục (hiếm gặp).
 */
export type EnqueueZaloMessageResult =
  | { queued: true; status: "QUEUED" | "FAILED"; errorCode?: string; errorMessage?: string }
  | { queued: false; reason: "DUPLICATE"; existingStatus: ZaloMessageLog["status"]; errorCode?: string; errorMessage?: string }
  | { queued: false; reason: "DISABLED" | "NO_TEMPLATE" | "CONFLICT" };

/**
 * Xếp một dòng vào hàng chờ. Không throw — lỗi cấu hình hay số điện thoại không hợp lệ
 * không được chặn luồng thu tiền hay phát hành hóa đơn đang chạy (tiêu chí #13).
 *
 * - `zalo.enabled = false` → không tạo dòng nào (tiêu chí #6).
 * - Chưa cấu hình `templateId` cho loại tin này → không tạo dòng (mẫu tin phụ thuộc
 *   Phase 0, chưa duyệt thì chưa gửi được).
 * - Số điện thoại không chuẩn hoá được → vẫn tạo dòng nhưng `FAILED` ngay với
 *   `errorCode: "INVALID_PHONE"`, để màn hình nhật ký cho nhân viên thấy mà gửi tay.
 * - Đã có dòng cùng `kind` + `receivableId` + `invoiceId` → bỏ qua (chống gửi trùng ở
 *   tầng mã; khoá `@@unique` ở tầng DB là hàng rào cuối).
 */
export async function enqueueZaloMessage(env: FinanceKvEnv, input: EnqueueZaloMessageInput): Promise<EnqueueZaloMessageResult> {
  const effective = await readEffectiveIntegrationSettings(env);
  if (!effective.zalo.enabled) return { queued: false, reason: "DISABLED" };
  const templateId = input.kind === "PAYMENT_REQUEST" ? effective.zalo.templateIdPaymentRequest : effective.zalo.templateIdInvoiceIssued;
  if (!templateId) return { queued: false, reason: "NO_TEMPLATE" };

  const phone = toZaloPhone(input.rawPhone);
  let snapshot = await readZaloMessageLogs(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = snapshot.logs.find((log) => (
      log.kind === input.kind && (log.receivableId ?? null) === (input.receivableId ?? null) && (log.invoiceId ?? null) === (input.invoiceId ?? null)
    ));
    if (existing && input.resend && existing.status !== "QUEUED" && existing.status !== "PROCESSING") {
      const reset: ZaloMessageLog = {
        ...existing,
        phone: phone ?? "",
        rawPhone: input.rawPhone,
        requestedBy: input.requestedBy,
        templateId,
        status: phone ? "QUEUED" : "FAILED",
        errorCode: phone ? undefined : "INVALID_PHONE",
        errorMessage: phone ? undefined : "Số điện thoại phụ huynh không hợp lệ, không gửi được tin Zalo.",
        processingAt: undefined,
        providerMsgId: undefined,
        providerSentTime: undefined,
        sentAt: undefined,
        deliveredAt: undefined,
        webhookAt: undefined,
        webhookPayload: undefined,
      };
      if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, snapshot.logs.map((log) => (log.id === existing.id ? reset : log)))) {
        return { queued: true, status: reset.status as "QUEUED" | "FAILED", errorCode: reset.errorCode, errorMessage: reset.errorMessage };
      }
      snapshot = await readZaloMessageLogs(env);
      continue;
    }
    if (existing) {
      return { queued: false, reason: "DUPLICATE", existingStatus: existing.status, errorCode: existing.errorCode, errorMessage: existing.errorMessage };
    }
    const next: ZaloMessageLog = {
      id: `zmsg-${crypto.randomUUID()}`,
      kind: input.kind,
      receivableId: input.receivableId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
      phone: phone ?? "",
      rawPhone: input.rawPhone,
      requestedBy: input.requestedBy,
      templateId,
      status: phone ? "QUEUED" : "FAILED",
      errorCode: phone ? undefined : "INVALID_PHONE",
      errorMessage: phone ? undefined : "Số điện thoại phụ huynh không hợp lệ, không gửi được tin Zalo.",
      createdAt: new Date().toISOString(),
    };
    if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, [next, ...snapshot.logs])) {
      return { queued: true, status: next.status, errorCode: next.errorCode, errorMessage: next.errorMessage };
    }
    snapshot = await readZaloMessageLogs(env);
  }
  return { queued: false, reason: "CONFLICT" };
}

/** Cờ "đang chạy" cấp module, cùng khuôn với `invoice-outbox.ts`. */
let outboxRunning = false;

export async function processZaloOutbox(env: FinanceKvEnv, opts: { limit?: number } = {}): Promise<ProcessZaloOutboxResult> {
  if (outboxRunning) return { processed: 0, sent: 0, failed: 0 };
  outboxRunning = true;
  try {
    return await runOutboxOnce(env, Math.max(1, opts.limit ?? DEFAULT_BATCH_LIMIT));
  } finally {
    outboxRunning = false;
  }
}

async function runOutboxOnce(env: FinanceKvEnv, limit: number): Promise<ProcessZaloOutboxResult> {
  const effective = await readEffectiveIntegrationSettings(env);
  if (!effective.zalo.enabled) return { processed: 0, sent: 0, failed: 0 };

  // Giai đoạn 1 — chọn lô, khoá bằng PROCESSING, đóng cửa sổ ghi lại ngay.
  const batchIds = await claimBatch(env, limit);
  if (!batchIds.length) return { processed: 0, sent: 0, failed: 0 };

  // Giai đoạn 2 — NGOÀI mọi transaction: dựng dữ liệu mẫu tin từ trạng thái hiện tại rồi gửi.
  // Tên người nhận lấy nguyên từ receivable.studentName/invoice.buyerName — không cần tra lại students.
  const [financeSnapshot, claimedLogs, classesRaw, studentsRaw, sessionsRaw, settingsRaw] = await Promise.all([
    readFinanceSnapshot(env),
    readZaloMessageLogs(env),
    env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<{ branches?: { id: string; name: string }[] }>("settings:steps-demo", "json"),
  ]);
  const ledger = mergeSepayLedger(syncTuitionCashbook(financeSnapshot.finance).sepay);
  const targets = claimedLogs.logs.filter((log) => batchIds.includes(log.id));
  const ctx: TemplateContext = {
    ledger,
    classById: new Map((classesRaw || []).map((row) => [row.id, row])),
    studentById: new Map((studentsRaw || []).map((row) => [row.id, row])),
    branchNameById: new Map((settingsRaw?.branches || []).map((row) => [row.id, row.name])),
    sessions: sessionsRaw || [],
  };

  const client = createZaloClient({
    appId: effective.zalo.appId,
    appSecret: effective.zalo.appSecret,
    refreshToken: effective.zalo.refreshToken,
    onTokenRotated: (next) => rotateZaloRefreshToken(env, next),
  });

  const results = new Map<string, { status: "SENT" | "FAILED"; patch: Partial<ZaloMessageLog> }>();
  for (const log of targets) {
    const built = buildTemplateData(log, ctx);
    if (!built.ok) {
      results.set(log.id, { status: "FAILED", patch: { errorCode: built.code, errorMessage: built.message } });
      continue;
    }
    // Lưu đúng dữ liệu đã đưa cho Zalo, kể cả khi gửi lỗi, để nhật ký xem lại được tin định gửi.
    const attemptPatch: Partial<ZaloMessageLog> = {
      templateData: JSON.stringify(built.templateData),
      studentName: built.snapshot.studentName,
      studentCode: built.snapshot.studentCode,
      className: built.snapshot.className,
      attemptCount: (log.attemptCount ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    };
    const sent = await client.sendTemplate({ phone: log.phone, templateId: log.templateId, templateData: built.templateData });
    results.set(log.id, sent.ok
      ? { status: "SENT", patch: { ...attemptPatch, providerMsgId: sent.msgId, providerSentTime: sent.sentTime || undefined, sentAt: new Date().toISOString(), errorCode: undefined, errorMessage: undefined } }
      : { status: "FAILED", patch: { ...attemptPatch, errorCode: sent.code, errorMessage: sent.message } });
  }

  // Giai đoạn 3 — đọc lại, áp kết quả, ghi lại. Chỉ sửa đúng các dòng trong lô.
  return applyResults(env, batchIds, results);
}

/** Thông tin người nhận chụp lại lúc gửi, ghi vào log để màn hình nhật ký không phải tra lại hồ sơ. */
interface TemplateSnapshot {
  studentName: string;
  studentCode: string;
  className: string;
}

interface TemplateContext {
  ledger: SepayLedger;
  classById: Map<string, DemoClass>;
  studentById: Map<string, DemoStudent>;
  branchNameById: Map<string, string>;
  sessions: DemoLessonSession[];
}

/**
 * Tham số động phải khớp đúng tên đã khai khi tạo mẫu ZBS (xem docs/DEPLOY.md):
 * - Yêu cầu thanh toán: order_code, ma_hoc_vien, transfer_amount, loai_hoc_phi, ten_hoc_vien.
 * - Thông báo đã thanh toán: date, ma_hoc_vien, loai_hoc_phi, paid_fee, lop, chi_nhanh, ten_hoc_vien.
 * Tên lớp/chi nhánh gửi riêng từng tham số, không ghép chung (giới hạn độ dài từng tham số).
 */
function buildTemplateData(
  log: ZaloMessageLog,
  ctx: TemplateContext,
): { ok: true; templateData: Record<string, string>; snapshot: TemplateSnapshot } | { ok: false; code: string; message: string } {
  const { ledger, classById, studentById, branchNameById, sessions } = ctx;
  if (log.kind === "PAYMENT_REQUEST") {
    const receivable = ledger.receivables.find((row) => row.id === log.receivableId);
    if (!receivable) return { ok: false, code: "RECEIVABLE_NOT_FOUND", message: "Khoản phải thu không còn tồn tại." };
    const order = ledger.paymentOrders.find((row) => row.id === receivable.paymentOrderId);
    const cls = receivable.classId ? classById.get(receivable.classId) : undefined;
    // order_code phải đúng bằng "Nội dung chuyển khoản" đang hiện trên phiếu/QR của học
    // viên ("HP" + mã lớp + mã học viên, cùng hàm với giao diện) để nhân viên đối chiếu
    // sao kê. Chỉ khi thiếu mã lớp/mã học viên mới lùi về mã của lệnh thanh toán.
    const paymentCode = billPaymentCode(cls || {}, studentById.get(receivable.studentId) || {}, receivable.billKey)
      || order?.paymentCode || receivable.receivableCode || "";
    const studentCode = studentById.get(receivable.studentId)?.code || "";
    return {
      ok: true,
      templateData: {
        order_code: paymentCode,
        ma_hoc_vien: studentCode,
        // Số phụ huynh cần chuyển: lớp khóa cộng dồn nợ các khóa trước; phiếu đã thu
        // một phần chỉ hỏi phần còn lại.
        transfer_amount: String(receivableRequestAmount(ledger, receivable)),
        loai_hoc_phi: tuitionKindLabel({ receivable, cls, sessions }),
        ten_hoc_vien: receivable.studentName,
      },
      snapshot: { studentName: receivable.studentName, studentCode, className: cls?.name || "" },
    };
  }
  // SePay khớp đủ tiền nhưng không lập hóa đơn: tin gắn theo khoản phải thu, lấy lượt thanh toán mới nhất.
  if (!log.invoiceId && log.receivableId) {
    const receivable = ledger.receivables.find((row) => row.id === log.receivableId);
    if (!receivable) return { ok: false, code: "RECEIVABLE_NOT_FOUND", message: "Khoản phải thu không còn tồn tại." };
    const payment = ledger.payments.filter((row) => row.receivableId === receivable.id)
      .sort((left, right) => String(right.paidAt || "").localeCompare(String(left.paidAt || "")))[0];
    const receipt = payment ? ledger.receipts.find((row) => row.paymentId === payment.id) : undefined;
    const cls = receivable.classId ? classById.get(receivable.classId) : undefined;
    return {
      ok: true,
      templateData: {
        date: formatVnDate(payment?.paidAt || log.createdAt),
        ma_hoc_vien: receipt?.studentCode || studentById.get(receivable.studentId)?.code || "",
        loai_hoc_phi: tuitionKindLabel({ receivable, receipt, cls, sessions }),
        paid_fee: String(payment?.amount ?? receivable.amountDue),
        lop: cls?.name || receipt?.className || "",
        chi_nhanh: (cls && branchNameById.get(cls.branchId)) || "",
        ten_hoc_vien: receivable.studentName,
      },
    };
  }
  const invoice = ledger.invoices.find((row) => row.id === log.invoiceId);
  if (!invoice) return { ok: false, code: "INVOICE_NOT_FOUND", message: "Hóa đơn không còn tồn tại." };
  const receivable = ledger.receivables.find((row) => row.id === invoice.receivableId);
  const payment = ledger.payments.find((row) => row.id === invoice.paymentId);
  const receipt = ledger.receipts.find((row) => row.paymentId === invoice.paymentId);
  const student = studentById.get(invoice.studentId);
  const cls = (receivable?.classId || receipt?.classId) ? classById.get(receivable?.classId || receipt?.classId || "") : undefined;
  const studentCode = receipt?.studentCode || student?.code || "";
  const className = cls?.name || receipt?.className || "";
  return {
    ok: true,
    templateData: {
      date: formatVnDate(payment?.paidAt || invoice.issuedAt || invoice.createdAt),
      ma_hoc_vien: studentCode,
      loai_hoc_phi: tuitionKindLabel({ receivable, receipt, cls, sessions }),
      paid_fee: String(invoice.amount),
      lop: className,
      chi_nhanh: (cls && branchNameById.get(cls.branchId)) || "",
      ten_hoc_vien: invoice.buyerName,
    },
    snapshot: { studentName: student?.fullName || invoice.buyerName, studentCode, className },
  };
}

async function claimBatch(env: FinanceKvEnv, limit: number): Promise<string[]> {
  let snapshot = await readZaloMessageLogs(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now();
    // Dòng kẹt PROCESSING quá 10 phút (tiến trình chết giữa chừng) — cứu về QUEUED trước.
    const recovered = snapshot.logs.map((log): ZaloMessageLog => {
      if (log.status !== "PROCESSING") return log;
      const stuckSince = log.processingAt ? Date.parse(log.processingAt) : NaN;
      if (Number.isFinite(stuckSince) && now - stuckSince <= PROCESSING_TIMEOUT_MS) return log;
      return { ...log, status: "QUEUED", processingAt: undefined };
    });
    const eligible = recovered.filter((log) => log.status === "QUEUED").slice(0, limit);
    if (!eligible.length) {
      if (JSON.stringify(recovered) !== JSON.stringify(snapshot.logs)) {
        await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, recovered);
      }
      return [];
    }
    const claimedIds = new Set(eligible.map((log) => log.id));
    const nowIso = new Date().toISOString();
    const marked = recovered.map((log) => (claimedIds.has(log.id) ? { ...log, status: "PROCESSING" as const, processingAt: nowIso } : log));
    if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, marked)) return [...claimedIds];
    snapshot = await readZaloMessageLogs(env);
  }
  return [];
}

async function applyResults(
  env: FinanceKvEnv,
  batchIds: string[],
  results: Map<string, { status: "SENT" | "FAILED"; patch: Partial<ZaloMessageLog> }>,
): Promise<ProcessZaloOutboxResult> {
  let snapshot = await readZaloMessageLogs(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextLogs = snapshot.logs.map((log) => {
      const result = results.get(log.id);
      if (!result) return log;
      return { ...log, ...result.patch, status: result.status, processingAt: undefined };
    });
    if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, nextLogs)) {
      const sent = [...results.values()].filter((row) => row.status === "SENT").length;
      const failed = [...results.values()].filter((row) => row.status === "FAILED").length;
      return { processed: batchIds.length, sent, failed };
    }
    snapshot = await readZaloMessageLogs(env);
  }
  return { processed: 0, sent: 0, failed: 0 };
}
