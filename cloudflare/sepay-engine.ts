const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type ReceivableStatus = "DRAFT" | "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | "CANCELLED" | "REFUNDED";
export type PaymentOrderStatus = "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED";
export type BankTxStatus = "RECEIVED" | "MATCHED" | "UNMATCHED" | "ALLOCATED" | "DUPLICATE" | "IGNORED" | "REVERSED" | "NEEDS_REVIEW";
export type LedgerPaymentStatus = "PENDING" | "COMPLETED" | "PARTIAL" | "OVERPAID" | "REFUNDED" | "VOIDED";
export type InvoiceStatus = "PENDING" | "PROCESSING" | "ISSUED" | "FAILED" | "CANCELLED" | "ADJUSTED" | "REPLACED";
export type ReviewReason =
  | "NO_PAYMENT_CODE"
  | "UNKNOWN_PAYMENT_CODE"
  | "PARTIAL_PAYMENT"
  | "OVERPAYMENT"
  | "ALREADY_PAID"
  | "INVALID_RECEIVABLE"
  | "INVOICE_ERROR"
  | "REFUND_REQUIRED"
  /** Tiền đã khớp nhưng số tiền đã phân bổ lệch tuitionCollectionCharge — không kích hoạt buổi học (Phase 5, R5). */
  | "AMOUNT_MISMATCH"
  /** Học viên chuyển sang miễn học phí giữa lúc chốt khoản phải thu và lúc tiền về. */
  | "TUITION_EXEMPT"
  /** Mã trong nội dung CK chỉ học viên A nhưng phiếu được khớp thuộc học viên khác. */
  | "CODE_STUDENT_MISMATCH"
  /** Nội dung CK có mã của nhiều học viên khác nhau (hoặc mã HV trùng nhiều người). */
  | "AMBIGUOUS_STUDENT"
  /** Mã/học viên đúng nhưng không còn phiếu đang mở để ghi. */
  | "NO_OPEN_BILL"
  /** Dòng sao kê cần kế toán xem tay (lý do chi tiết ở reviewNote). */
  | "MANUAL_CHECK";

export interface SepaySettings {
  bank: string;
  accountNumber: string;
  accountName: string;
  /** Ảnh QR PNG/JPG tĩnh do trung tâm tải lên; được ưu tiên hơn QR VietQR tự sinh. */
  qrImageDataUrl?: string;
  autoMatchExact: boolean;
  autoPartial: boolean;
  autoOverpayment: boolean;
  autoInvoiceExact: boolean;
  autoInvoicePartial: boolean;
  autoInvoiceOverpayment: boolean;
}

export interface SepayReceivable {
  id: string;
  receivableCode: string;
  studentId: string;
  studentName: string;
  billingPeriod: string;
  issueDate: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  balanceDue: number;
  currency: string;
  status: ReceivableStatus;
  paymentOrderId: string;
  classId?: string;
  billKey?: string;
  /** ISO — có giá trị khi nhân viên đã bấm "Gửi yêu cầu thanh toán" (Phase 4). */
  frozenAt?: string;
  /** Token 32 ký tự cho trang thanh toán công khai /thanh-toan/<id>/<token>. */
  publicToken?: string;
  /** Email người bấm "Gửi yêu cầu thanh toán". */
  requestedBy?: string;
  /** Tiền bảo lưu/tín dụng đã trừ vào phiếu này — amountDue đã là số sau trừ. */
  appliedCredits?: { creditId: string; amount: number }[];
  /** Số tiền phiếu lúc xuất, trước khi trừ phần chưa học khi học viên rời lớp. */
  issuedAmount?: number;
  /** Phiếu kỳ đang chạy đã trừ phần buổi chưa học lúc học viên rời lớp (xoá khỏi lớp / về Lớp chờ). */
  leftClass?: {
    at: string;
    billedSessions: number;
    consumedSessions: number;
    deductionSessions: number;
    deductionAmount: number;
    /** Tiền phần đã học + nợ cũ còn nợ lúc về Lớp chờ — cộng vào phiếu khi học viên quay lại. */
    carryAmount?: number;
    /** Tiền hoàn cho phần chưa học của phiếu đã đóng (phiếu chi tự tạo). */
    refundAmount?: number;
    refundedAt?: string;
    /** Doanh số giữ lại theo buổi thực học — dòng "Giảm doanh số" đã chốt lúc rời lớp. */
    revenue?: { billed: number; consumed: number; actual: number; reduction: number };
    /** Khoản mang sang đã gắn vào phiếu của lớp/kỳ nào. */
    carryTarget?: { classId: string; month?: string; courseIndex?: number };
  };
}

export interface SepayPaymentOrder {
  id: string;
  receivableId: string;
  studentId: string;
  paymentCode: string;
  amount: number;
  qrUrl: string;
  status: PaymentOrderStatus;
  createdAt: string;
}

export interface SepayBankTransaction {
  id: string;
  /** SEPAY = webhook SePay; BANK_IMPORT = dòng sao kê BIDV tải tay qua trang Quản lý học phí. */
  provider: "SEPAY" | "BANK_IMPORT";
  providerTransactionId: string;
  accountNumber: string;
  transactionDate: string;
  transferType: "IN" | "OUT";
  transferAmount: number;
  content: string;
  status: BankTxStatus;
  reviewReason?: ReviewReason;
  /** Diễn giải lý do lệch cho kế toán (dòng sao kê đưa vào hàng đợi Giao dịch lệch). */
  reviewNote?: string;
  /** Kế toán xử lý tay: ai, lúc nào, làm gì (gán phiếu / đã thu thủ công / bỏ qua). */
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface SepayLedgerPayment {
  id: string;
  paymentCode: string;
  studentId: string;
  bankTransactionId: string;
  receivableId: string;
  amount: number;
  allocatedAmount: number;
  excessAmount: number;
  status: LedgerPaymentStatus;
  paidAt: string;
  method?: string;
  note?: string;
}

export interface SepayReceipt {
  id: string;
  receiptNumber: string;
  paymentId: string;
  studentId: string;
  amount: number;
  issuedAt: string;
  /** ISSUED = phiếu thu đã nhập sổ thu chi; UNRECORDED = khoản đã thu ghi nhận
   * nội bộ (vẫn tính buổi đã đóng/công nợ) nhưng chưa xuất phiếu thu — không
   * sinh dòng sổ quỹ. */
  status: "ISSUED" | "UNRECORDED";
  method?: string;
  note?: string;
  classId?: string;
  className?: string;
  billingPeriod?: string;
  billingMode?: "COURSE" | "MONTHLY";
  studentName?: string;
  studentCode?: string;
  /** Số buổi tín dụng đã dùng để giảm kỳ thu này; hoàn lại khi xoá phiếu thu. */
  creditSessionsUsed?: number;
  /** Tiền học liệu nằm trong phiếu; phải trừ ra khi quy tiền đã thu thành số buổi. */
  materialsAmount?: number;
  /** Mốc tháng đã đóng trước giao dịch, dùng để hoàn tác chính xác. */
  paidThroughBefore?: string;
}

export interface SepayInvoice {
  id: string;
  studentId: string;
  paymentId: string;
  receivableId: string;
  provider: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  amount: number;
  buyerName: string;
  lookupCode?: string;
  status: InvoiceStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  issuedAt?: string;
  /** Các field dưới đây phục vụ phát hành hóa đơn thật qua MISA meInvoice (Phase 6). */
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  providerInvoiceId?: string;
  taxAuthorityCode?: string;
  /** ISO — đặt khi hàng chờ khoá hóa đơn để gọi MISA; dùng để cứu hóa đơn kẹt PROCESSING quá 10 phút. */
  processingAt?: string;
  /** Dấu vân tay nội dung hóa đơn đã được xem trước ở MISA; xuất thật chỉ được khi khớp nội dung hiện tại. */
  previewHash?: string;
  /** ISO — kế toán đã xem trước và bấm xuất; hàng chờ chỉ phát hành hóa đơn có mốc này. */
  approvedAt?: string;
}

export interface SepayCredit {
  id: string;
  studentId: string;
  sourcePaymentId: string;
  amount: number;
  remainingAmount: number;
  reason: string;
  status: "OPEN" | "USED";
  createdAt: string;
  /** Lớp nguồn sinh ra khoản bảo lưu — credit PRESERVED không tự áp ngược vào lớp này. */
  sourceClassId?: string;
}

export interface SepayWebhookLog {
  id: string;
  requestId: string;
  signatureValid: boolean;
  processingStatus: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  providerTransactionId?: string;
  createdAt: string;
}

export interface SepayLedger {
  settings: SepaySettings;
  receivables: SepayReceivable[];
  paymentOrders: SepayPaymentOrder[];
  bankTransactions: SepayBankTransaction[];
  payments: SepayLedgerPayment[];
  receipts: SepayReceipt[];
  invoices: SepayInvoice[];
  credits: SepayCredit[];
  webhookLogs: SepayWebhookLog[];
}

export const DEMO_BILL_AMOUNT = 2000;

const VIETQR_BANK_BINS: Record<string, string> = {
  VCB: "970436",
  VIETCOMBANK: "970436",
  MB: "970422",
  MBB: "970422",
  MBBANK: "970422",
  TCB: "970407",
  TECHCOMBANK: "970407",
  ACB: "970416",
  VPB: "970432",
  VPBANK: "970432",
  BIDV: "970418",
  ICB: "970415",
  VTB: "970415",
  VIETIN: "970415",
  VIETINBANK: "970415",
  MSB: "970426",
  TPB: "970423",
  TPBANK: "970423",
  OCB: "970448",
  SHB: "970443",
  HDB: "970437",
  HDBANK: "970437",
  VIB: "970441",
};

export function vietQrBankId(bank: string): string {
  const key = String(bank || "").trim().toUpperCase().replace(/[\s-]+/g, "");
  if (/^\d{6}$/.test(key)) return key;
  return VIETQR_BANK_BINS[key] || key;
}

export const STEPS_TUITION_ACCOUNT = {
  bank: "970418",
  accountNumber: "8686838888",
  accountName: "CONG TY TNHH DAU TU GIAO DUC STEPS",
} as const;

export const defaultSepaySettings: SepaySettings = {
  ...STEPS_TUITION_ACCOUNT,
  autoMatchExact: true,
  autoPartial: true,
  autoOverpayment: false,
  autoInvoiceExact: true,
  autoInvoicePartial: false,
  autoInvoiceOverpayment: false,
};

export function generatePaymentCode(used: Iterable<string>): string {
  const taken = new Set([...used].map((code) => code.toUpperCase()));
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "HP";
    for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
  return `HP${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export function extractPaymentCode(content: string): string | null {
  const match = String(content || "").toUpperCase().match(/\bHP[A-Z0-9]{6,16}\b/);
  return match?.[0] ?? null;
}

/**
 * Mã CK gắn học viên + lớp + kỳ (chốt với anh Vũ 28/10/2026): HP{lớp}{kỳ}{HV} — kỳ là
 * T{tháng} (phiếu tháng; phiếu nợ cũ riêng = T9) hoặc K{khóa} (phiếu khóa).
 * Ví dụ HPT1T11HV0111 = lớp T1, tháng 11, HV0111; HPS42K2HV0536 = lớp S42, khóa 2.
 */
const PERIOD_TAG_RE = /^(T(?:1[0-2]|[1-9])|K\d{1,2})$/;
export function billPeriodTag(billKey?: string | null): string {
  const parts = String(billKey || "").split("|");
  if (parts[0] === "month" || parts[0] === "months" || parts[0] === "olddebt") {
    const last = String(parts[2] || "").split(",").filter((key) => /^\d{4}-\d{2}$/.test(key)).sort().at(-1);
    return last ? `T${Number(last.slice(5, 7))}` : "";
  }
  if (parts[0] === "course") return `K${Math.max(1, Math.round(Number(parts[2]) || 1))}`;
  return "";
}
const codePart = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function billPaymentCode(cls: { code?: string } | null | undefined, student: { code?: string } | null | undefined, billKey?: string | null): string | undefined {
  const clsPart = codePart(cls?.code);
  const stuPart = codePart(student?.code);
  if (!clsPart || !stuPart) return undefined;
  return `HP${clsPart}${billPeriodTag(billKey)}${stuPart}`;
}
/** Giải mã HP{lớp}[{kỳ}]{HV}: học viên, lớp (nếu khớp mã lớp) và kỳ (nếu có). */
export function parseStudentPaymentCode<C extends { id: string; code?: string; studentIds?: string[] }, S extends { id: string; code?: string }>(
  code: string,
  classes: C[],
  students: S[],
): { student: S; cls?: C; tag: string } | undefined {
  const match = /^HP([A-Z0-9]+?)(HV\d{3,})$/.exec(String(code || "").toUpperCase());
  if (!match) return undefined;
  const [, middle, studentPart] = match;
  const student = students.find((row) => codePart(row.code) === studentPart);
  if (!student) return undefined;
  const byCode = (part: string) => classes.filter((row) => codePart(row.code) === part);
  const prefer = (list: C[]) => list.find((row) => (row.studentIds || []).includes(student.id)) || list[0];
  const candidates: Array<{ cls: C; tag: string; member: boolean }> = [];
  for (const cls of byCode(middle)) candidates.push({ cls, tag: "", member: (cls.studentIds || []).includes(student.id) });
  for (let i = 1; i < middle.length; i += 1) {
    const tag = middle.slice(i);
    if (!PERIOD_TAG_RE.test(tag)) continue;
    for (const cls of byCode(middle.slice(0, i))) candidates.push({ cls, tag, member: (cls.studentIds || []).includes(student.id) });
  }
  const best = candidates.find((item) => item.member) || candidates[0];
  if (best) return { student, cls: best.cls, tag: best.tag };
  return { student, cls: prefer([]), tag: "" };
}

/**
 * Các học viên mà nội dung CK "chỉ đích danh": mã HP{lớp}{HV} (giải mã HV), mã HV…
 * đứng riêng, hoặc mã phiếu ngẫu nhiên HPxxxxxx (chủ phiếu). Mã HV trùng nhiều học
 * viên thì trả về tất cả — caller coi là mơ hồ. Dùng làm chốt chặn: tiền chỉ được ghi
 * cho người mà nội dung CK nêu tên, không bao giờ cho người khác.
 */
export function contentNamedStudentIds(
  content: string,
  ledger: Pick<SepayLedger, "paymentOrders" | "receivables">,
  students: { id: string; code?: string }[],
): string[] {
  const up = String(content || "").toUpperCase();
  const ids = new Set<string>();
  const byCode = (code: string) => students.filter((row) => String(row.code || "").toUpperCase() === code);
  for (const match of up.matchAll(/\bHP[A-Z0-9]{6,16}\b/g)) {
    const token = match[0];
    const friendly = /^HP([A-Z0-9]+?)(HV\d{3,})$/.exec(token);
    const decoded = friendly ? byCode(friendly[2]) : [];
    if (decoded.length) {
      decoded.forEach((row) => ids.add(row.id));
      continue;
    }
    for (const order of ledger.paymentOrders) {
      if (String(order.paymentCode || "").toUpperCase() !== token) continue;
      const owner = ledger.receivables.find((row) => row.id === order.receivableId)?.studentId || order.studentId;
      if (owner) ids.add(owner);
    }
  }
  for (const match of up.matchAll(/\bHV\d{3,}\b/g)) byCode(match[0]).forEach((row) => ids.add(row.id));
  return [...ids];
}

/**
 * Chốt chặn cuối trước khi ghi tiền: nội dung CK nêu học viên nào thì phiếu được khớp
 * phải là của đúng học viên đó; nêu nhiều học viên → để kế toán xem; học viên của
 * phiếu không còn trên hệ thống → để kế toán xem. Không nêu ai (gán tay) thì giữ nguyên.
 */
export function guardContentStudent(
  result: MatchApplyResult,
  named: string[],
  knownStudentIds?: Set<string>,
): MatchApplyResult {
  if (result.transaction.status !== "ALLOCATED") return result;
  const payee = result.receivable?.studentId || "";
  const review = (reviewReason: ReviewReason): MatchApplyResult => ({
    transaction: { ...result.transaction, status: "NEEDS_REVIEW", reviewReason, processedAt: new Date().toISOString() },
  });
  if (named.length > 1) return review("AMBIGUOUS_STUDENT");
  if (named.length === 1 && named[0] !== payee) return review("CODE_STUDENT_MISMATCH");
  if (knownStudentIds && payee && !knownStudentIds.has(payee)) return review("INVALID_RECEIVABLE");
  return result;
}

export function vietQrUrl(settings: SepaySettings, amount: number, paymentCode: string): string {
  const bankId = vietQrBankId(settings.bank);
  const accountNumber = String(settings.accountNumber || "").replace(/\s+/g, "");
  const accountName = String(settings.accountName || "").trim().toUpperCase();
  return `https://img.vietqr.io/image/${bankId}-${encodeURIComponent(accountNumber)}-compact2.png?amount=${Math.max(0, Math.round(amount))}&addInfo=${encodeURIComponent(paymentCode)}&accountName=${encodeURIComponent(accountName)}`;
}

export function cleanQrImageDataUrl(value: unknown): string | undefined {
  const dataUrl = typeof value === "string" ? value.trim() : "";
  if (!dataUrl || dataUrl.length > 1_500_000) return undefined;
  const match = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) return undefined;
  const payload = match[2].replace(/\s+/g, "");
  if (match[1].toLowerCase() === "png" && !payload.startsWith("iVBORw0KGgo")) return undefined;
  if (/^jpe?g$/i.test(match[1]) && !payload.startsWith("/9j/")) return undefined;
  return dataUrl;
}

/** QR data-URL của settings — chuẩn hóa một lần mỗi object settings thay vì
 * chạy regex base64 lặp lại cho từng payment order (~2500 lần/request). */
const qrImageCache = new WeakMap<SepaySettings, string | undefined>();
function settingsQrImage(settings: SepaySettings): string | undefined {
  if (!qrImageCache.has(settings)) qrImageCache.set(settings, cleanQrImageDataUrl(settings.qrImageDataUrl));
  return qrImageCache.get(settings);
}

export function decodeQrImageDataUrl(value: unknown): { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" } | undefined {
  const dataUrl = cleanQrImageDataUrl(value);
  if (!dataUrl) return undefined;
  try {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (isPng) return { bytes, mimeType: "image/png" };
    if (isJpeg) return { bytes, mimeType: "image/jpeg" };
    return undefined;
  } catch {
    return undefined;
  }
}

export function createReceivable(input: {
  studentId: string;
  studentName: string;
  billingPeriod: string;
  amountDue: number;
  usedCodes?: Iterable<string>;
  paymentCode?: string;
  now?: string;
}): { receivable: SepayReceivable; order: SepayPaymentOrder } {
  const now = input.now || new Date().toISOString();
  const paymentCode = input.paymentCode || generatePaymentCode(input.usedCodes || []);
  const receivableId = `recv-${crypto.randomUUID()}`;
  const orderId = `po-${crypto.randomUUID()}`;
  const settings = defaultSepaySettings;
  const order: SepayPaymentOrder = {
    id: orderId,
    receivableId,
    studentId: input.studentId,
    paymentCode,
    amount: input.amountDue,
    qrUrl: vietQrUrl(settings, input.amountDue, paymentCode),
    status: "ACTIVE",
    createdAt: now,
  };
  const receivable: SepayReceivable = {
    id: receivableId,
    receivableCode: paymentCode,
    studentId: input.studentId,
    studentName: input.studentName,
    billingPeriod: input.billingPeriod,
    issueDate: now.slice(0, 10),
    dueDate: now.slice(0, 10),
    amountDue: input.amountDue,
    amountPaid: 0,
    balanceDue: input.amountDue,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: orderId,
  };
  return { receivable, order };
}

export function nextReceiptNumber(existing: SepayReceipt[], now = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Số lớn nhất + 1 (không đếm số phiếu): xoá một biên lai không được làm số mới trùng biên lai đã có.
  let max = 0;
  let count = 0;
  for (const row of existing) {
    if (!String(row.receiptNumber || "").includes(stamp)) continue;
    count += 1;
    const m = /^PT-\d{6}-(\d+)$/.exec(String(row.receiptNumber));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const seq = String(Math.max(max, count) + 1).padStart(6, "0");
  return `PT-${stamp}-${seq}`;
}

export interface MatchApplyResult {
  transaction: SepayBankTransaction;
  receivable?: SepayReceivable;
  order?: SepayPaymentOrder;
  payment?: SepayLedgerPayment;
  receipt?: SepayReceipt;
  credit?: SepayCredit;
  invoice?: SepayInvoice;
  event?: "TuitionPaymentCompleted";
}

/**
 * Mã friendly "HP" + mã lớp + mã HV (vd HPS43HV0961) là mã phiếu báo gửi phụ
 * huynh; order trên hệ thống có thể mang mã ngẫu nhiên khác khi mã friendly bị
 * trùng lúc lập phiếu. Giải mã lớp+HV rồi quy về paymentCode của order ACTIVE
 * trên phiếu đang mở của đúng học viên đó — phụ huynh vẫn ghi đúng mã trên
 * phiếu báo là khớp được.
 */
export function friendlyPaymentOrderCode(
  ledger: SepayLedger,
  code: string,
  classes: { id: string; code?: string; studentIds?: string[] }[],
  students: { id: string; code?: string }[],
  amount?: number,
): string | undefined {
  const parsed = parseStudentPaymentCode(code, classes, students);
  if (!parsed) return undefined;
  const { student, cls, tag } = parsed;
  // Mã cũ không có kỳ (HP{lớp}{HV}) mà phiếu mang đúng chuỗi mã đó ĐÃ THU XONG: phụ huynh dùng lại QR
  // tháng cũ để chuyển tháng mới → không tự gạch sang phiếu khác, để vào Giao dịch lệch cho kế toán kiểm
  // tay (anh Vũ 9/11/2026). Mã cũ của phiếu còn đang mở vẫn quy như trước (chia nợ cũ + kỳ, khóa cũ trước).
  if (!tag) {
    const upper = String(code || "").toUpperCase();
    const owners = ledger.paymentOrders.filter((item) => String(item.paymentCode || "").toUpperCase() === upper);
    if (owners.length && !owners.some((item) => item.status === "ACTIVE")) return undefined;
  }
  const withOrder = ledger.receivables
    .filter((row) => (
      row.studentId === student.id
      && (row.status === "OPEN" || row.status === "PARTIALLY_PAID")
      && row.balanceDue > 0
      && (!cls || row.classId === cls.id)
    ))
    .map((receivable) => ({
      receivable,
      order: ledger.paymentOrders.find((item) => item.receivableId === receivable.id && item.status === "ACTIVE"),
    }))
    .filter((item): item is { receivable: SepayReceivable; order: SepayPaymentOrder } => Boolean(item.order));
  // Lớp khóa: khóa cũ trước; lớp tháng: phiếu cũ trước (nợ cũ T9 → tháng sớm nhất).
  const courseRank = (row: SepayReceivable) => {
    const parts = String(row.billKey || "").split("|");
    if (parts[0] === "course") return `c${String(Math.max(1, Math.round(Number(parts[2]) || 1))).padStart(4, "0")}`;
    if (parts[0] === "month" || parts[0] === "months" || parts[0] === "olddebt") return `m${String(parts[2] || "").split(",")[0]}`;
    return "a";
  };
  const ordered = [...withOrder].sort((a, b) => courseRank(a.receivable).localeCompare(courseRank(b.receivable)));
  // Mã có kỳ (HP{lớp}{kỳ}{HV}): phiếu của kỳ đó + nợ cũ trước kỳ đó (phiếu báo in kèm nợ cũ),
  // cũ trước; khớp đúng số tiền một phiếu thì vào phiếu đó. Không bao giờ sang kỳ SAU kỳ trên mã.
  let pool = ordered;
  if (tag) {
    const tagged = ledger.receivables.filter((row) => row.studentId === student.id && (!cls || row.classId === cls.id)
      && row.status !== "CANCELLED" && billPeriodTag(row.billKey) === tag);
    const limit = tagged.map((row) => courseRank(row)).sort().at(-1);
    pool = limit ? ordered.filter((item) => courseRank(item.receivable) <= limit && courseRank(item.receivable)[0] === limit[0]) : [];
  }
  if (tag && !pool.length) return undefined;
  const pick = (Number.isFinite(amount) ? pool.find((item) => item.receivable.balanceDue === amount) : undefined) || pool[0];
  return pick?.order.paymentCode;
}

export function processBankTransaction(
  ledger: SepayLedger,
  raw: SepayBankTransaction,
  resolveCode?: (code: string) => string | undefined,
): MatchApplyResult {
  const settings = ledger.settings || defaultSepaySettings;
  if (raw.transferType !== "IN") {
    return { transaction: { ...raw, status: "IGNORED", processedAt: new Date().toISOString() } };
  }

  const code = extractPaymentCode(raw.content);
  if (!code) {
    return { transaction: { ...raw, status: "UNMATCHED", reviewReason: "NO_PAYMENT_CODE", processedAt: new Date().toISOString() } };
  }

  // Mã friendly (phiếu báo) mà order lại mang mã khác: quy về mã order thật của
  // phiếu đang mở trước khi báo không khớp.
  const resolvedCode = resolveCode?.(code);
  const order = ledger.paymentOrders.find((item) => item.paymentCode === code && item.status === "ACTIVE")
    || (resolvedCode ? ledger.paymentOrders.find((item) => item.paymentCode === resolvedCode && item.status === "ACTIVE") : undefined);
  if (!order) {
    const used = ledger.paymentOrders.find((item) => item.paymentCode === code);
    return {
      transaction: {
        ...raw,
        status: used ? "NEEDS_REVIEW" : "UNMATCHED",
        reviewReason: used ? "ALREADY_PAID" : "UNKNOWN_PAYMENT_CODE",
        processedAt: new Date().toISOString(),
      },
    };
  }

  const receivable = ledger.receivables.find((item) => item.id === order.receivableId);
  if (!receivable || receivable.status === "CANCELLED") {
    return { transaction: { ...raw, status: "NEEDS_REVIEW", reviewReason: "INVALID_RECEIVABLE", processedAt: new Date().toISOString() } };
  }
  if (receivable.status === "PAID" || receivable.status === "OVERPAID") {
    return { transaction: { ...raw, status: "DUPLICATE", reviewReason: "ALREADY_PAID", processedAt: new Date().toISOString() } };
  }

  const amount = raw.transferAmount;
  const due = receivable.balanceDue;
  const exact = amount === due;
  const partial = amount > 0 && amount < due;
  const over = amount > due;

  if (partial && !settings.autoPartial) {
    return { transaction: { ...raw, status: "NEEDS_REVIEW", reviewReason: "PARTIAL_PAYMENT", processedAt: new Date().toISOString() } };
  }
  if (over && !settings.autoOverpayment) {
    return { transaction: { ...raw, status: "NEEDS_REVIEW", reviewReason: "OVERPAYMENT", processedAt: new Date().toISOString() } };
  }

  const allocated = Math.min(amount, due);
  const excess = Math.max(0, amount - due);
  const nextPaid = receivable.amountPaid + allocated;
  const nextBalance = Math.max(0, receivable.amountDue - nextPaid);
  const nextStatus: ReceivableStatus = nextBalance === 0 ? (excess ? "OVERPAID" : "PAID") : "PARTIALLY_PAID";
  const paymentStatus: LedgerPaymentStatus = exact ? "COMPLETED" : over ? "OVERPAID" : "PARTIAL";
  const now = new Date().toISOString();
  const payment: SepayLedgerPayment = {
    id: `pay-${crypto.randomUUID()}`,
    paymentCode: order.paymentCode,
    studentId: receivable.studentId,
    bankTransactionId: raw.id,
    receivableId: receivable.id,
    amount,
    allocatedAmount: allocated,
    excessAmount: excess,
    status: paymentStatus,
    paidAt: now,
  };
  const nextReceivable: SepayReceivable = { ...receivable, amountPaid: nextPaid, balanceDue: nextBalance, status: nextStatus };
  const nextOrder: SepayPaymentOrder = { ...order, status: nextStatus === "PAID" || nextStatus === "OVERPAID" ? "PAID" : "ACTIVE" };
  const receipt: SepayReceipt = {
    id: `rcpt-${crypto.randomUUID()}`,
    receiptNumber: nextReceiptNumber(ledger.receipts),
    paymentId: payment.id,
    studentId: receivable.studentId,
    amount: allocated,
    issuedAt: now,
    status: "ISSUED",
  };
  const credit = excess
    ? {
        id: `cred-${crypto.randomUUID()}`,
        studentId: receivable.studentId,
        sourcePaymentId: payment.id,
        amount: excess,
        remainingAmount: excess,
        reason: "OVERPAYMENT",
        status: "OPEN" as const,
        createdAt: now,
      }
    : undefined;
  const shouldInvoice =
    (exact && settings.autoInvoiceExact) ||
    (partial && settings.autoInvoicePartial) ||
    (over && settings.autoInvoiceOverpayment);
  const invoice = shouldInvoice
    ? {
        id: `inv-${crypto.randomUUID()}`,
        studentId: receivable.studentId,
        paymentId: payment.id,
        receivableId: receivable.id,
        provider: "MISA",
        amount: allocated,
        buyerName: receivable.studentName,
        status: "PENDING" as InvoiceStatus,
        retryCount: 0,
        createdAt: now,
      }
    : undefined;

  return {
    transaction: { ...raw, status: "ALLOCATED", processedAt: now },
    receivable: nextReceivable,
    order: nextOrder,
    payment,
    receipt,
    credit,
    invoice,
    event: paymentStatus === "COMPLETED" ? "TuitionPaymentCompleted" : undefined,
  };
}

export function applyMatch(ledger: SepayLedger, result: MatchApplyResult): SepayLedger {
  const upsert = <T extends { id: string }>(rows: T[], row?: T) => row ? [...rows.filter((item) => item.id !== row.id), row] : rows;
  return {
    ...ledger,
    bankTransactions: upsert(ledger.bankTransactions, result.transaction),
    receivables: upsert(ledger.receivables, result.receivable),
    paymentOrders: upsert(ledger.paymentOrders, result.order),
    payments: upsert(ledger.payments, result.payment),
    receipts: upsert(ledger.receipts, result.receipt),
    invoices: upsert(ledger.invoices, result.invoice),
    credits: upsert(ledger.credits, result.credit),
  };
}

export function defaultSepayLedger(): SepayLedger {
  const settings = defaultSepaySettings;
  const first = createReceivable({
    studentId: "student-demo-1",
    studentName: "Nguyễn Minh Anh",
    billingPeriod: "Tháng 09/2026",
    amountDue: DEMO_BILL_AMOUNT,
    paymentCode: "HP8F4K92",
    now: "2026-09-01T00:00:00.000Z",
  });
  const second = createReceivable({
    studentId: "student-demo-2",
    studentName: "Trần Gia Hân",
    billingPeriod: "Tháng 09/2026",
    amountDue: DEMO_BILL_AMOUNT,
    paymentCode: "HP9K2M18",
    now: "2026-09-01T00:00:00.000Z",
  });
  return {
    settings,
    receivables: [first.receivable, second.receivable],
    paymentOrders: [
      { ...first.order, qrUrl: vietQrUrl(settings, first.order.amount, first.order.paymentCode) },
      { ...second.order, qrUrl: vietQrUrl(settings, second.order.amount, second.order.paymentCode) },
    ],
    bankTransactions: [
      {
        id: "btx-unmatched-1",
        provider: "SEPAY",
        providerTransactionId: "sepay-demo-unmatched",
        accountNumber: settings.accountNumber,
        transactionDate: "2026-09-04T09:12:00.000Z",
        transferType: "IN",
        transferAmount: 500000,
        content: "CK hoc phi thang 9",
        status: "UNMATCHED",
        reviewReason: "NO_PAYMENT_CODE",
        receivedAt: "2026-09-04T09:12:01.000Z",
        processedAt: "2026-09-04T09:12:01.000Z",
      },
    ],
    payments: [],
    receipts: [],
    invoices: [],
    credits: [],
    webhookLogs: [],
  };
}

export function emptySepayLedger(): SepayLedger {
  return {
    settings: defaultSepaySettings,
    receivables: [],
    paymentOrders: [],
    bankTransactions: [],
    payments: [],
    receipts: [],
    invoices: [],
    credits: [],
    webhookLogs: [],
  };
}

export function refreshOrderQr(order: SepayPaymentOrder, settings: SepaySettings, amount = order.amount): SepayPaymentOrder {
  return {
    ...order,
    amount,
    // Không nhúng ảnh QR base64 (hàng chục KB) vào từng order — trỏ về endpoint
    // ảnh chung; khi không có ảnh tải lên thì dùng URL VietQR sinh theo order.
    qrUrl: settingsQrImage(settings) ? "/api/finance/qr-image" : vietQrUrl(settings, amount, order.paymentCode),
  };
}

export function applySepayAccount(ledger: SepayLedger, patch: Partial<SepaySettings>): SepayLedger {
  const settings = {
    ...ledger.settings,
    ...patch,
    bank: vietQrBankId(String(patch.bank || ledger.settings.bank)),
    accountNumber: String(patch.accountNumber || ledger.settings.accountNumber).replace(/\s+/g, ""),
    accountName: String(patch.accountName || ledger.settings.accountName).trim().toUpperCase(),
    qrImageDataUrl: Object.prototype.hasOwnProperty.call(patch, "qrImageDataUrl")
      ? cleanQrImageDataUrl(patch.qrImageDataUrl)
      : cleanQrImageDataUrl(ledger.settings.qrImageDataUrl),
  };
  return {
    ...ledger,
    settings,
    paymentOrders: ledger.paymentOrders.map((order) => refreshOrderQr(order, settings, order.amount)),
  };
}

export function scaleDemoBills(ledger: SepayLedger, amount = DEMO_BILL_AMOUNT): SepayLedger {
  const settings = { ...ledger.settings, bank: vietQrBankId(ledger.settings.bank) };
  ledger = { ...ledger, settings };
  const stale = ledger.receivables.some((row) => row.amountDue !== amount);
  const receivables = stale
    ? ledger.receivables.map((row) => ({
        ...row,
        amountDue: amount,
        amountPaid: 0,
        balanceDue: amount,
        status: "OPEN" as const,
      }))
    : ledger.receivables;
  const paymentOrders = ledger.paymentOrders.map((order) => ({
    ...refreshOrderQr(order, ledger.settings, amount),
    status: stale ? "ACTIVE" as const : order.status,
  }));
  return { ...ledger, receivables, paymentOrders };
}

export function mergeSepayLedger(value?: Partial<SepayLedger> | null): SepayLedger {
  const seed = defaultSepayLedger();
  if (!value) return seed;
  const storedSettings = { ...seed.settings, ...value.settings, qrImageDataUrl: cleanQrImageDataUrl(value.settings?.qrImageDataUrl) };
  const legacyAccounts = new Set(["105800030300", "123456789", "868683888"]);
  const settings = legacyAccounts.has(String(storedSettings.accountNumber || "").replace(/\s+/g, ""))
    ? { ...storedSettings, ...STEPS_TUITION_ACCOUNT }
    : storedSettings;
  const paymentOrders = (value.paymentOrders ?? seed.paymentOrders)
    .map((order) => refreshOrderQr(order, settings, order.amount));
  return {
    settings,
    receivables: value.receivables ?? seed.receivables,
    paymentOrders,
    bankTransactions: value.bankTransactions ?? seed.bankTransactions,
    payments: value.payments ?? [],
    receipts: value.receipts ?? [],
    invoices: value.invoices ?? [],
    credits: value.credits ?? [],
    webhookLogs: value.webhookLogs ?? [],
  };
}

export async function verifySepaySignature(rawBody: string, signature: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret) return true;
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return expected === signature.replace(/^sha256=/i, "").toLowerCase();
}

/**
 * Áp tín dụng còn mở (bảo lưu học phí PRESERVED + tiền thừa OVERPAYMENT) vào các
 * phiếu học phí đang mở của chính học viên đó. Chạy idempotent mỗi lần đồng bộ:
 * nhả appliedCredits cũ của từng phiếu ra rồi phân bổ lại theo thứ tự phiếu cũ
 * nhất trước, tín dụng tạo sớm nhất trước. Credit PRESERVED không tự áp ngược
 * vào lớp nguồn của nó. Cập nhật lại remainingAmount/status của credit và QR
 * của payment order tương ứng.
 */
export function applyStudentCreditsToReceivables(ledger: SepayLedger): SepayLedger {
  const credits = (ledger.credits || []).map((row) => ({ ...row }));
  if (!credits.length) return ledger;
  const used = new Map<string, number>();
  const creditsByStudent = new Map<string, typeof credits>();
  for (const credit of credits) {
    const list = creditsByStudent.get(credit.studentId) || [];
    list.push(credit);
    creditsByStudent.set(credit.studentId, list);
  }
  const eligibleHeads = new Set(["month", "months", "course", "olddebt"]);
  const receivableById = new Map<string, SepayReceivable>();
  for (const row of ledger.receivables || []) {
    receivableById.set(row.id, { ...row, appliedCredits: (row.appliedCredits || []).map((item) => ({ ...item })) });
  }
  // Ưu tiên phiếu của kỳ đến hạn trước (tháng/khóa trong billKey), cùng kỳ thì
  // phiếu lập trước trước — credit phải trừ vào kỳ sớm nhất, không nhảy sang
  // phiếu tháng sau lập sẵn.
  const periodRank = (row: SepayReceivable) => {
    const parts = String(row.billKey || "").split("|");
    if (parts[0] === "month" || parts[0] === "months" || parts[0] === "olddebt") return `m${String(parts[2] || "").split(",")[0]}`;
    if (parts[0] === "course") return `c${String(Math.max(1, Number(parts[2]) || 1)).padStart(4, "0")}`;
    return "z";
  };
  const sorted = [...receivableById.values()].sort(
    (a, b) => periodRank(a).localeCompare(periodRank(b))
      || String(a.issueDate || "").localeCompare(String(b.issueDate || ""))
      || a.id.localeCompare(b.id),
  );
  const qrUpdates = new Map<string, number>();
  let changed = false;
  for (const row of sorted) {
    const head = String(row.billKey || "").split("|")[0];
    if (row.status === "CANCELLED" || !eligibleHeads.has(head)) {
      if (row.appliedCredits?.length) { row.appliedCredits = []; changed = true; }
      continue;
    }
    const ownApplied = (row.appliedCredits || []).reduce((sum, item) => sum + (Math.round(Number(item.amount)) || 0), 0);
    const gross = Math.max(0, Math.round(Number(row.amountDue) || 0) + ownApplied);
    if (gross <= 0) {
      if (ownApplied) { row.appliedCredits = []; changed = true; }
      continue;
    }
    // Phiếu đã tất toán hoàn toàn bằng tiền mặt/chuyển khoản (không nhờ credit)
    // thì không hút credit vào nữa.
    if (!ownApplied && Math.max(0, Math.round(Number(row.balanceDue) || 0)) <= 0) continue;
    // Pool derive live: kể cả credit đang cache USED — phần đã áp của nó trên
    // các phiếu khác trong cùng pass này đã được trừ vào `used`, nên chỉ phần
    // thật sự còn dư mới được tiếp tục phân bổ.
    const pool = (creditsByStudent.get(row.studentId) || [])
      .filter((credit) => (Math.round(Number(credit.amount)) || 0) > (used.get(credit.id) || 0)
        && (!credit.sourceClassId || credit.sourceClassId !== row.classId))
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.id.localeCompare(b.id));
    const applied: { creditId: string; amount: number }[] = [];
    let left = gross;
    for (const credit of pool) {
      const avail = (Math.round(Number(credit.amount)) || 0) - (used.get(credit.id) || 0);
      if (avail <= 0) continue;
      const use = Math.min(avail, left);
      applied.push({ creditId: credit.id, amount: use });
      used.set(credit.id, (used.get(credit.id) || 0) + use);
      left -= use;
      if (left <= 0) break;
    }
    const appliedTotal = applied.reduce((sum, item) => sum + item.amount, 0);
    const amountDue = Math.max(0, gross - appliedTotal);
    const paid = Math.max(0, Math.round(Number(row.amountPaid) || 0));
    const balanceDue = Math.max(0, amountDue - paid);
    const status: ReceivableStatus = balanceDue <= 0
      ? (paid > amountDue ? "OVERPAID" : "PAID")
      : (paid > 0 ? "PARTIALLY_PAID" : (row.status === "DRAFT" ? "DRAFT" : "OPEN"));
    const sameApplied = applied.length === (row.appliedCredits || []).length
      && applied.every((item, index) => row.appliedCredits?.[index]?.creditId === item.creditId && row.appliedCredits?.[index]?.amount === item.amount);
    if (!sameApplied || row.amountDue !== amountDue || row.balanceDue !== balanceDue || row.status !== status) {
      row.appliedCredits = applied;
      row.amountDue = amountDue;
      row.balanceDue = balanceDue;
      row.status = status;
      if (row.paymentOrderId) qrUpdates.set(row.paymentOrderId, amountDue);
      changed = true;
    }
  }
  const nextCredits = credits.map((credit) => {
    const remaining = Math.max(0, (Math.round(Number(credit.amount)) || 0) - (used.get(credit.id) || 0));
    const status = remaining <= 0 ? "USED" as const : "OPEN" as const;
    if (credit.remainingAmount === remaining && credit.status === status) return credit;
    changed = true;
    return { ...credit, remainingAmount: remaining, status };
  });
  if (!changed) return ledger;
  return {
    ...ledger,
    receivables: (ledger.receivables || []).map((row) => receivableById.get(row.id) || row),
    paymentOrders: (ledger.paymentOrders || []).map((order) => {
      const amount = qrUpdates.get(order.id);
      return amount === undefined || order.status !== "ACTIVE" ? order : refreshOrderQr(order, ledger.settings, amount);
    }),
    credits: nextCredits,
  };
}
