import type { DemoStudent } from "./people-types";
import {
  applyMatch,
  contentNamedStudentIds,
  extractPaymentCode,
  guardContentStudent,
  friendlyPaymentOrderCode,
  processBankTransaction,
  type MatchApplyResult,
  type SepayBankTransaction,
  type SepayLedger,
  type SepayPaymentOrder,
  type SepayReceivable,
  type ReviewReason,
} from "./sepay-engine";
import { courseRequestBundle } from "./tuition-billing";

/** Một dòng tiền vào trên sao kê BIDV: B = ngày giao dịch, D = ghi có, F = nội dung. */
export interface BankStatementRow {
  line: number;
  date: string;
  amount: number;
  content: string;
  fingerprint: string;
}

export type BankImportRowResult =
  | "APPLIED"
  | "DUPLICATE"
  | "NO_CODE"
  | "NO_STUDENT"
  | "NO_RECEIVABLE"
  | "AMOUNT_MISMATCH"
  | "REVIEW"
  /** Dòng ghi nợ (tiền ra) — đã ghi thành khoản chi trong Quản lý thu chi. */
  | "EXPENSE";

export interface BankImportRowOutcome {
  line: number;
  date: string;
  amount: number;
  content: string;
  result: BankImportRowResult;
  detail?: string;
  /** Dòng tiền vào không ghi được → đưa vào hàng đợi Giao dịch lệch để xử lý tay. */
  queued?: boolean;
}

export interface BankImportOutcome {
  rows: BankImportRowOutcome[];
  ledger: SepayLedger;
  /** Các lượt khớp đủ tiền — caller chạy activateSessionsForPayment cho từng cái. */
  completed: MatchApplyResult[];
  /** Giao dịch tiền ra (ghi nợ) mới — caller ghi thành dòng CHI trong sổ quỹ. */
  expenses: SepayBankTransaction[];
}

/** Từ ngày này (giờ VN), dòng ghi nợ trên sao kê được ghi thành khoản chi trong Quản lý thu chi
 * (anh Vũ 04/11/2026: "từ mai"). Dòng tiền ra trước ngày này vẫn bỏ qua như cũ — tránh nhân đôi
 * các khoản chi kế toán đã nhập tay trước đó khi tải lại sao kê cũ. */
export const STATEMENT_EXPENSE_FROM = "2026-11-05";

const CELL_DATE = 1;   // cột B — ngày giao dịch
const CELL_DEBIT = 2;  // cột C — ghi nợ (chỉ khi dò được tiêu đề cột)
const CELL_AMOUNT = 3; // cột D — ghi có
const CELL_CONTENT = 5;// cột F — nội dung

function parseAmountCell(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(Math.round(value));
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Ô ngày giao dịch: BIDV có file ghi text "16/09/2026 18:45:59", có file ghi
 * kiểu date thật (serial Excel) — chuẩn về dd/mm/yyyy hh:mm:ss cho cả hai. */
function normalizeDateCell(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    const ms = Math.round((value - 25569) * 86_400_000);
    const date = new Date(ms);
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
  return normalizeText(value);
}

/** dd/mm/yyyy hh:mm[:ss] giờ VN → ISO, phục vụ transactionDate của giao dịch nhập. */
export function statementDateIso(value: string): string | undefined {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [, day, month, year, hour, minute, second] = match;
  return new Date(Date.UTC(+year, +month - 1, +day, +hour - 7, +minute, +(second || 0))).toISOString();
}

/** Khoá trùng "lỏng": phút giao dịch (ISO) + số tiền + 50 ký tự chữ/số đầu của nội dung. */
export function looseStatementKey(isoMinute: string, amount: number, content: string, stripInjectedCode = false): string {
  let body = String(content || "").trim();
  // File "Tải kết quả" cũ chèn mã phiếu (HPxxxxxx) lên đầu nội dung rồi mới tải lại — chỉ bỏ
  // mã đó ở phía GIAO DỊCH ĐÃ NHẬP (dòng mới giữ nguyên, vì có ngân hàng đặt mã QR thật
  // của phụ huynh ở đầu nội dung: bỏ đi thì 2 anh em CK cùng phút sẽ bị coi là trùng).
  if (stripInjectedCode) body = body.replace(/^HP[A-Z0-9]{6,16}\s+(?=\S)/i, "");
  return `${isoMinute}|${Math.round(Number(amount) || 0)}|${body.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 50)}`;
}

/**
 * Dòng sao kê do trợ lý đọc từ file gửi lên (ngày, số tiền vào, nội dung) → cùng dạng
 * với dòng đọc từ file trên web. Ngày nhận dd/mm/yyyy[ hh:mm[:ss]] hoặc yyyy-mm-dd[ hh:mm[:ss]],
 * chuẩn về "dd/mm/yyyy hh:mm:ss" như sao kê BIDV. Dòng sai trả lỗi kèm số dòng.
 */
export function statementRowsFromJson(input: unknown): { rows: BankStatementRow[] } | { error: string } {
  if (!Array.isArray(input) || !input.length) return { error: "rows phải là mảng các dòng { date, amount, content }." };
  if (input.length > 2000) return { error: "Tối đa 2000 dòng mỗi lần." };
  const pad = (n: string | number) => String(n).padStart(2, "0");
  const rows: BankStatementRow[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = (input[index] || {}) as Record<string, unknown>;
    const raw = normalizeText(item.date);
    let date = "";
    let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) date = `${pad(m[1])}/${pad(m[2])}/${m[3]} ${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
    m = m ? null : raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) date = `${pad(m[3])}/${pad(m[2])}/${m[1]} ${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
    if (!date) return { error: `Dòng ${index + 1}: ngày "${raw}" không đúng dạng dd/mm/yyyy hh:mm.` };
    // Tiền ra (số âm) không bao giờ được hiểu thành tiền vào.
    const negative = (typeof item.amount === "number" && item.amount < 0) || /^\s*-/.test(String(item.amount ?? ""));
    const amount = negative ? 0 : parseAmountCell(item.amount);
    const content = normalizeText(item.content);
    if (!content) return { error: `Dòng ${index + 1}: thiếu nội dung chuyển khoản.` };
    rows.push({ line: Number(item.line) || index + 1, date, amount, content, fingerprint: statementFingerprint(date, amount, content) });
  }
  return { rows };
}

/** Vân tay một dòng sao kê: ngày + số tiền + nội dung — upload trùng thì bỏ qua. */
export function statementFingerprint(date: string, amount: number, content: string): string {
  return `BANKFILE|${date}|${amount}|${normalizeText(content).toUpperCase().slice(0, 90)}`;
}

/** Lọc các dòng từ sheet_to_json(header:1) — trả cả ghi có (amount > 0) và ghi nợ (amount <= 0)
 * để báo cáo chính xác số dòng Excel. Dòng thiếu date/content vẫn được đếm nhưng mark invalid. */
/** Bỏ dấu, chữ thường, gộp khoảng trắng — để so tên tiêu đề cột. */
function headerText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const DEBIT_HEADERS = [/\bso tien ghi no\b/, /\bghi no\b/, /\bphat sinh no\b/, /\bdebit\b/, /\btien ra\b/, /(^| )no$/];
const DATE_HEADERS = [/^ngay giao dich\b/, /^ngay gd\b/, /^ngay hieu luc\b/, /\btransaction date\b/, /^ngay\b/, /\bdate\b/];
const CREDIT_HEADERS = [/\bso tien ghi co\b/, /\bghi co\b/, /\bphat sinh co\b/, /\bcredit\b/, /\btien vao\b/, /(^| )co$/];
const CONTENT_HEADERS = [/\bnoi dung\b/, /\bmo ta\b/, /\bdien giai\b/, /\bdescription\b/, /\bchi tiet\b/];

/** Cột đầu tiên khớp mẫu theo thứ tự ưu tiên (mẫu trước thắng). */
function pickColumn(labels: string[], patterns: RegExp[], taken: number[] = []): number {
  for (const pattern of patterns) {
    const index = labels.findIndex((label, col) => !taken.includes(col) && pattern.test(label));
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Sao kê BIDV gốc (không cần xóa cột): dò dòng tiêu đề trong 40 dòng đầu, tìm cột
 * ngày giao dịch / ghi có (tiền vào) / nội dung theo TÊN cột (hỗ trợ tiêu đề 2 tầng
 * kiểu "Số tiền" → "Ghi nợ | Ghi có"), rồi đưa về đúng vị trí B/D/F mà phần đọc
 * dòng đang dùng. Không tìm đủ 3 cột → giữ nguyên (file đã sắp sẵn B/D/F như trước).
 * Giá trị ô không đổi nên vân tay dòng (chống trùng) giống hệt cách cũ.
 */
export function remapStatementColumns(rows: unknown[][]): { rows: unknown[][]; detected: boolean; columns?: { date: number; credit: number; content: number; debit: number } } {
  const limit = Math.min(rows.length, 40);
  for (let r = 0; r < limit; r += 1) {
    const top = (rows[r] || []).map(headerText);
    const next = (rows[r + 1] || []).map(headerText);
    const width = Math.max(top.length, next.length);
    // Tiêu đề 2 tầng: ô tầng dưới được nối với ô trên (ô trên trống do gộp thì lấy ô gần nhất bên trái).
    const nextIsHeader = next.some((cell) => CREDIT_HEADERS.some((p) => p.test(cell))) && !next.some((cell) => /\d{1,2} \d{1,2} \d{4}/.test(cell));
    let carry = "";
    const labels = Array.from({ length: width }, (_, col) => {
      if (top[col]) carry = top[col];
      const upper = top[col] || (nextIsHeader ? carry : "");
      return nextIsHeader && next[col] ? `${upper} ${next[col]}`.trim() : (top[col] || "");
    });
    const date = pickColumn(labels, DATE_HEADERS);
    if (date < 0) continue;
    const content = pickColumn(labels, CONTENT_HEADERS, [date]);
    if (content < 0) continue;
    let credit = pickColumn(labels, CREDIT_HEADERS, [date, content]);
    // Không có cột "ghi có" riêng mà chỉ có "Số tiền" (không có cột "ghi nợ") → dùng cột đó.
    if (credit < 0 && !labels.some((label) => /\bghi no\b|\bdebit\b|\bphat sinh no\b/.test(label))) {
      credit = labels.findIndex((label, col) => col !== date && col !== content && /\bso tien\b/.test(label));
    }
    if (credit < 0) continue;
    // Cột ghi nợ (tiền ra) — đặt vào vị trí C; không có thì để trống.
    const debit = pickColumn(labels, DEBIT_HEADERS, [date, content, credit]);
    const start = r + (nextIsHeader ? 2 : 1);
    const mapped = rows.map((cells, index) => (index < start ? [] : ["", (cells || [])[date], debit >= 0 ? (cells || [])[debit] : "", (cells || [])[credit], "", (cells || [])[content]]));
    return { rows: mapped, detected: true, columns: { date, credit, content, debit } };
  }
  return { rows, detected: false };
}

/** readDebit: file đã dò được cột ghi nợ (đặt ở C) — dòng tiền ra mang số tiền ÂM. */
export function extractStatementRows(rows: unknown[][], readDebit = false): BankStatementRow[] {
  const out: BankStatementRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index] || [];
    const date = normalizeDateCell(cells[CELL_DATE]);
    const content = normalizeText(cells[CELL_CONTENT]);
    const credit = parseAmountCell(cells[CELL_AMOUNT]);
    const debit = readDebit && !credit ? parseAmountCell(cells[CELL_DEBIT]) : 0;
    const amount = credit || (debit ? -debit : 0);
    // Bỏ dòng header/tổng: không có date hoặc không có content; ô ngày không có chữ số nào
    // là dòng tiêu đề ("Ngày giao dịch") — không đếm thành giao dịch tiền ra.
    if (!date || !content || !/\d/.test(date)) continue;
    out.push({ line: index + 1, date, amount, content, fingerprint: statementFingerprint(date, amount, content) });
  }
  return out;
}

function openReceivables(ledger: SepayLedger, studentId: string): SepayReceivable[] {
  return ledger.receivables.filter((row) => (
    row.studentId === studentId
    && (row.status === "OPEN" || row.status === "PARTIALLY_PAID")
    && row.balanceDue > 0
  ));
}

function activeOrderOf(ledger: SepayLedger, receivable: SepayReceivable): SepayPaymentOrder | undefined {
  return ledger.paymentOrders.find((row) => row.receivableId === receivable.id && row.status === "ACTIVE");
}

const REVIEW_TEXT: Record<string, string> = {
  CODE_STUDENT_MISMATCH: "mã trong nội dung là của học viên khác với phiếu khớp — không ghi, kiểm tra tay",
  AMBIGUOUS_STUDENT: "mã trỏ nhiều học viên — không ghi, kiểm tra tay",
  INVALID_RECEIVABLE: "phiếu không hợp lệ hoặc học viên không còn trên hệ thống",
  ALREADY_PAID: "phiếu đã thu đủ",
  OVERPAYMENT: "chuyển thừa so với phiếu",
  UNKNOWN_PAYMENT_CODE: "không có phiếu với mã này",
};

function reviewText(reason: string | undefined, status: string): string {
  return (reason && REVIEW_TEXT[reason]) || reason || status;
}

function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

/**
 * Chạy toàn bộ dòng sao kê qua pipeline SePay: nội dung có mã HP… thì khớp order,
 * chỉ có mã HV… thì đối chiếu mã HV + số tiền với phiếu đang mở (khớp 1 phiếu
 * hoặc đúng tổng nợ thì thu; lệch thì bỏ qua). Trả ledger mới + kết quả từng dòng.
 * Hàm thuần — không ghi gì, caller quyết định persist (preview dùng kết quả rows).
 */
/** Giao dịch đã ghi vào phiếu (đủ hoặc chuyển thiếu) → kích hoạt biên lai: lớp, kỳ,
 * số buổi đã đóng. Chuyển thiếu trước đây chỉ trừ công nợ mà không tính buổi. */
function allocatedForActivation(match: MatchApplyResult) {
  return match.transaction.status === "ALLOCATED" && Boolean(match.receivable && match.payment)
    && (match.event === "TuitionPaymentCompleted" || match.payment!.status === "PARTIAL");
}

export function processBankStatement(
  ledger: SepayLedger,
  students: DemoStudent[],
  rows: BankStatementRow[],
  now = new Date(),
  classes: { id: string; code?: string }[] = [],
  options: { queueUnmatched?: boolean; recordExpenses?: boolean } = {},
): BankImportOutcome {
  const importedIds = new Set(
    ledger.bankTransactions
      .filter((tx) => tx.provider === "BANK_IMPORT")
      .map((tx) => tx.providerTransactionId),
  );
  const fileSeen = new Set<string>();
  // Nhận diện trùng "lỏng": cùng phút giao dịch + nội dung (bỏ dấu câu/khoảng trắng) + số
  // tiền — để cùng một dòng sao kê gửi qua 2 đường (file tải lên web / trợ lý đọc file
  // gửi từng dòng, ngày có thể thiếu giây) không bị ghi 2 lần.
  const looseSeen = new Set<string>();
  {
    const groups = new Map<string, { minute: string; content: string; amount: number }>();
    for (const tx of ledger.bankTransactions) {
      if (tx.provider !== "BANK_IMPORT") continue;
      const base = String(tx.providerTransactionId).replace(/#\d+$/, "");
      const group = groups.get(base) || { minute: String(tx.transactionDate || "").slice(0, 16), content: tx.content, amount: 0 };
      group.amount += Math.round(Number(tx.transferAmount) || 0);
      groups.set(base, group);
    }
    for (const group of groups.values()) {
      looseSeen.add(looseStatementKey(group.minute, group.amount, group.content));
      looseSeen.add(looseStatementKey(group.minute, group.amount, group.content, true));
    }
  }
  const outcomes: BankImportRowOutcome[] = [];
  const completed: MatchApplyResult[] = [];
  const expenses: SepayBankTransaction[] = [];
  let working = ledger;
  const iso = now.toISOString();
  const knownStudentIds = new Set(students.map((row) => row.id));
  /** Học viên mà nội dung dòng đang xử lý nêu tên — tiền chỉ được ghi cho đúng người này. */
  let rowNamed: string[] = [];

  const applyOne = (row: BankStatementRow, fingerprint: string, code: string, amount: number): MatchApplyResult => {
    const tx: SepayBankTransaction = {
      id: `btximp-${crypto.randomUUID()}`,
      provider: "BANK_IMPORT",
      providerTransactionId: fingerprint,
      accountNumber: working.settings.accountNumber,
      transactionDate: statementDateIso(row.date) || iso,
      transferType: "IN",
      transferAmount: amount,
      content: row.content,
      status: "RECEIVED",
      receivedAt: iso,
    };
    // processBankTransaction đọc mã từ content — truyền mã đã resolve; giao dịch
    // lưu lại vẫn giữ nội dung gốc trên sao kê để đối chiếu tay sau này.
    // Chỉ dòng khớp đủ mới được ghi vào sổ giao dịch — dòng bỏ qua (sai số
    // tiền, thiếu mã…) không xuất hiện trong hàng đợi "Giao dịch lệch".
    const result = guardContentStudent(
      processBankTransaction(working, { ...tx, content: code }, (item) => friendlyPaymentOrderCode(working, item, classes, students, amount)),
      rowNamed,
      knownStudentIds,
    );
    if (result.transaction.status !== "ALLOCATED") return result;
    const stored = { ...result, transaction: { ...result.transaction, content: row.content } };
    working = applyMatch(working, stored);
    return stored;
  };

  for (const row of rows) {
    const fp = row.fingerprint;
    const loose = looseStatementKey(String(statementDateIso(row.date) || "").slice(0, 16), row.amount, row.content);
    const already = fileSeen.has(fp) || looseSeen.has(loose) || [...importedIds].some((id) => id === fp || id.startsWith(`${fp}#`));
    if (already) {
      outcomes.push({ ...row, result: "DUPLICATE", detail: "Giao dịch đã nhập trước đó" });
      continue;
    }
    fileSeen.add(fp);
    if (row.amount > 0) looseSeen.add(loose);

    // Dòng ghi nợ (tiền ra): từ STATEMENT_EXPENSE_FROM ghi thành khoản chi trong sổ quỹ.
    if (row.amount < 0) {
      const [d, m, y] = row.date.slice(0, 10).split("/");
      const day = y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
      if (!options.recordExpenses || !day || day < STATEMENT_EXPENSE_FROM) {
        outcomes.push({ ...row, result: "NO_CODE", detail: "Tiền ra trước 05/11/2026 — bỏ qua" });
        continue;
      }
      const tx: SepayBankTransaction = {
        id: `btximp-${crypto.randomUUID()}`,
        provider: "BANK_IMPORT",
        providerTransactionId: fp,
        accountNumber: working.settings.accountNumber,
        transactionDate: statementDateIso(row.date) || iso,
        transferType: "OUT",
        transferAmount: -row.amount,
        content: row.content,
        status: "IGNORED",
        resolution: "Khoản chi trên sao kê — đã ghi vào Quản lý thu chi",
        receivedAt: iso,
        processedAt: iso,
      };
      working = { ...working, bankTransactions: [tx, ...working.bankTransactions] };
      expenses.push(tx);
      outcomes.push({ ...row, result: "EXPENSE", detail: "Ghi khoản chi vào Quản lý thu chi" });
      continue;
    }

    rowNamed = contentNamedStudentIds(row.content, working, students);
    if (rowNamed.length > 1) {
      const names = rowNamed.map((id) => students.find((item) => item.id === id)).map((item) => `${item?.fullName || ""} (${item?.code || ""})`).join(", ");
      outcomes.push({ ...row, result: "REVIEW", detail: `Nội dung có mã của nhiều học viên: ${names} — kiểm tra tay` });
      continue;
    }

    const hpCode = extractPaymentCode(row.content);
    if (hpCode) {
      // Mã phiếu báo HP{lớp}{HV} là mã của học viên chứ không của riêng một phiếu:
      // quy về phiếu đang mở phù hợp nhất (khóa cũ trước, khớp đúng số tiền) kể cả
      // khi một order đang mang đúng chuỗi mã đó. Mã ngẫu nhiên vẫn khớp trực tiếp.
      const friendly = friendlyPaymentOrderCode(working, hpCode, classes, students, row.amount);
      const order = friendly ? undefined : working.paymentOrders.find((item) => item.paymentCode === hpCode && item.status === "ACTIVE");
      const resolved = friendly;
      if (!order && !resolved) {
        const used = working.paymentOrders.some((item) => item.paymentCode === hpCode);
        outcomes.push({ ...row, result: used ? "DUPLICATE" : "NO_CODE", detail: used ? "Mã đã thanh toán trước đó" : `Không có phiếu đang mở với mã ${hpCode}` });
        continue;
      }
      // Khớp exact theo phiếu đơn lẻ trước; nếu không, thử gộp tổng nợ của học viên
      // cho case trả nhiều kỳ cùng lúc (VD 650k = T10+T11).
      const targetOrder = order || (resolved ? working.paymentOrders.find((item) => item.paymentCode === resolved && item.status === "ACTIVE") : undefined);
      if (targetOrder) {
        const receivable = working.receivables.find((item) => item.id === targetOrder.receivableId);
        if (receivable && receivable.balanceDue === row.amount) {
          const match = applyOne(row, fp, targetOrder.paymentCode, row.amount);
          const status = match.transaction.status;
          if (status === "ALLOCATED") {
            if (allocatedForActivation(match)) completed.push(match);
            outcomes.push({ ...row, result: "APPLIED", detail: `Thu ${receivable.studentName} — ${receivable.billingPeriod}` });
          } else {
            outcomes.push({ ...row, result: "REVIEW", detail: `Mã ${targetOrder.paymentCode}: ${reviewText(match.transaction.reviewReason, status)}` });
          }
          continue;
        }
        // Mã HP trỏ đúng học viên nhưng số tiền không khớp phiếu đơn lẻ → thử gộp.
        // Lớp thu khóa: phiếu gửi phụ huynh cộng dồn nợ khóa trước (vd khóa 1 + khóa 2)
        // — tổng khớp nợ các khóa tính từ khóa cũ nhất thì chia trả khóa cũ trước.
        // Lớp thu tháng: phiếu báo cộng phần còn thiếu của tháng đã trả góp (truy thu)
        // vào tháng này — tổng khớp các phiếu tháng còn nợ tính từ tháng cũ nhất thì
        // chia trả tháng cũ trước, giống lớp thu khóa.
        const receivableHead = String(receivable?.billKey || "").split("|")[0];
        const courseRows = receivable && receivable.classId && receivableHead === "course"
          ? courseRequestBundle(working, receivable.studentId, receivable.classId, Number.MAX_SAFE_INTEGER).rows
          : receivable && receivable.classId && (receivableHead === "month" || receivableHead === "months" || receivableHead === "olddebt")
            // Phiếu nợ cũ riêng ("olddebt|lớp|2026-09") xếp như tháng 9 — trả nợ cũ trước.
            ? openReceivables(working, receivable.studentId)
              .filter((item) => item.classId === receivable.classId && ["month", "months", "olddebt"].includes(String(item.billKey || "").split("|")[0]))
              .sort((a, b) => String(String(a.billKey).split("|")[2] || "").localeCompare(String(String(b.billKey).split("|")[2] || "")))
            : [];
        let prefix = 0;
        const coursePrefix = courseRows.findIndex((item) => (prefix += item.balanceDue) === row.amount);
        const openAll = coursePrefix >= 1 ? courseRows.slice(0, coursePrefix + 1) : openReceivables(working, receivable.studentId);
        const totalDue = openAll.reduce((sum, item) => sum + item.balanceDue, 0);
        if (row.amount === totalDue && openAll.length > 1) {
          const splits = openAll
            .map((r) => ({ receivable: r, order: activeOrderOf(working, r) }))
            .filter((item): item is { receivable: SepayReceivable; order: SepayPaymentOrder } => Boolean(item.order));
          // Chỉ chia khi mọi phiếu trong tổng đều còn mã thanh toán — thiếu một phiếu
          // là phần tiền của nó không có chỗ ghi, để kế toán xử lý tay.
          if (splits.length === openAll.length) {
            const applied: string[] = [];
            const reviews: string[] = [];
            splits.forEach((split, index) => {
              const match = applyOne(row, splits.length > 1 ? `${fp}#${index + 1}` : fp, split.order.paymentCode, split.receivable.balanceDue);
              if (match.transaction.status === "ALLOCATED") {
                if (allocatedForActivation(match)) completed.push(match);
                applied.push(split.receivable.billingPeriod || split.order.paymentCode);
              } else {
                reviews.push(reviewText(match.transaction.reviewReason, match.transaction.status));
              }
            });
            outcomes.push({
              ...row,
              result: reviews.length ? "REVIEW" : "APPLIED",
              detail: `Thu ${receivable.studentName} — ${applied.join(", ")}${reviews.length ? ` · còn lại: ${reviews.join(", ")}` : ""}`,
            });
            continue;
          }
        }
      }
      // Fallback xử lý đơn lẻ (sẽ báo OVERPAYMENT nếu lệch).
      const match = applyOne(row, fp, hpCode, row.amount);
      const status = match.transaction.status;
      if (status === "ALLOCATED") {
        if (allocatedForActivation(match)) completed.push(match);
        const name = match.receivable?.studentName || "";
        const shortBy = match.payment?.status === "PARTIAL" ? Math.round(Number(match.receivable?.balanceDue) || 0) : 0;
        outcomes.push({ ...row, result: "APPLIED", detail: `Thu ${name} — ${match.receivable?.billingPeriod || hpCode}${shortBy ? ` · chuyển thiếu, còn nợ ${formatVnd(shortBy)} (truy thu ở phiếu sau)` : ""}` });
      } else {
        outcomes.push({ ...row, result: "REVIEW", detail: `Mã ${hpCode}: ${reviewText(match.transaction.reviewReason, status)}` });
      }
      continue;
    }

    const hvCode = row.content.toUpperCase().match(/\bHV\d{3,}\b/)?.[0] || "";
    if (!hvCode) {
      outcomes.push({ ...row, result: "NO_CODE", detail: "Nội dung không chứa mã HV" });
      continue;
    }
    const student = students.find((item) => String(item.code || "").toUpperCase() === hvCode);
    if (!student) {
      outcomes.push({ ...row, result: "NO_STUDENT", detail: `Không tìm thấy học viên ${hvCode}` });
      continue;
    }
    const open = openReceivables(working, student.id);
    if (!open.length) {
      outcomes.push({ ...row, result: "NO_RECEIVABLE", detail: `${student.fullName} (${hvCode}) không còn khoản phải thu` });
      continue;
    }
    const exact = open.find((item) => item.balanceDue === row.amount);
    const totalDue = open.reduce((sum, item) => sum + item.balanceDue, 0);
    const targets = exact ? [exact] : (row.amount === totalDue ? open : []);
    const splits = targets
      .map((receivable) => ({ receivable, order: activeOrderOf(working, receivable) }))
      .filter((item): item is { receivable: SepayReceivable; order: SepayPaymentOrder } => Boolean(item.order));
    if (!splits.length) {
      outcomes.push({
        ...row,
        result: "AMOUNT_MISMATCH",
        detail: `${student.fullName} nợ ${formatVnd(totalDue)}${open.length > 1 ? ` (${open.length} phiếu)` : ""} — CK ${formatVnd(row.amount)}`,
      });
      continue;
    }
    const applied: string[] = [];
    const reviews: string[] = [];
    splits.forEach((split, index) => {
      const match = applyOne(row, splits.length > 1 ? `${fp}#${index + 1}` : fp, split.order.paymentCode, split.receivable.balanceDue);
      if (match.transaction.status === "ALLOCATED") {
        if (allocatedForActivation(match)) completed.push(match);
        applied.push(split.receivable.billingPeriod || split.order.paymentCode);
      } else {
        reviews.push(reviewText(match.transaction.reviewReason, match.transaction.status));
      }
    });
    outcomes.push({
      ...row,
      result: reviews.length ? "REVIEW" : "APPLIED",
      detail: `Thu ${student.fullName} — ${applied.join(", ")}${reviews.length ? ` · còn lại: ${reviews.join(", ")}` : ""}`,
    });
  }

  // Dòng tiền vào không ghi được (thiếu mã, sai mã, sai số tiền, trả trùng, cần xem tay…)
  // → lưu thành giao dịch "lệch" để kế toán xử lý tay ở trang Giao dịch lệch. Vân tay
  // dòng nằm trong providerTransactionId nên tải lại cùng file sẽ không nhân đôi.
  const queuedOutcomes = outcomes.map((outcome, index) => {
    const row = rows[index];
    if (!options.queueUnmatched || !row || outcome.amount <= 0 || outcome.result === "APPLIED") return outcome;
    if (outcome.result === "DUPLICATE" && /đã nhập trước/i.test(outcome.detail || "")) return outcome;
    const fp = row.fingerprint;
    const allocated = working.bankTransactions.some((tx) => tx.provider === "BANK_IMPORT" && !importedIds.has(tx.providerTransactionId)
      && (tx.providerTransactionId === fp || tx.providerTransactionId.startsWith(`${fp}#`)));
    if (allocated) return outcome;
    const reason = queueReason(outcome);
    const tx: SepayBankTransaction = {
      id: `btximp-${crypto.randomUUID()}`,
      provider: "BANK_IMPORT",
      providerTransactionId: fp,
      accountNumber: working.settings.accountNumber,
      transactionDate: statementDateIso(row.date) || iso,
      transferType: "IN",
      transferAmount: outcome.amount,
      content: row.content,
      status: reason === "NO_PAYMENT_CODE" || reason === "UNKNOWN_PAYMENT_CODE" ? "UNMATCHED" : "NEEDS_REVIEW",
      reviewReason: reason,
      reviewNote: outcome.detail || "",
      receivedAt: iso,
      processedAt: iso,
    };
    working = { ...working, bankTransactions: [tx, ...working.bankTransactions] };
    return { ...outcome, queued: true };
  });

  return { rows: queuedOutcomes, ledger: working, completed, expenses };
}

/** Lý do lệch (mã máy) cho dòng sao kê đưa vào hàng đợi. */
function queueReason(outcome: BankImportRowOutcome): ReviewReason {
  const detail = outcome.detail || "";
  if (outcome.result === "DUPLICATE") return "ALREADY_PAID";
  if (outcome.result === "NO_STUDENT") return "UNKNOWN_PAYMENT_CODE";
  if (outcome.result === "NO_RECEIVABLE") return "NO_OPEN_BILL";
  if (outcome.result === "AMOUNT_MISMATCH") return "AMOUNT_MISMATCH";
  if (outcome.result === "NO_CODE") return /Không có phiếu đang mở/i.test(detail) ? "NO_OPEN_BILL" : "NO_PAYMENT_CODE";
  if (/nhiều học viên|trỏ nhiều/i.test(detail)) return "AMBIGUOUS_STUDENT";
  if (/học viên khác/i.test(detail)) return "CODE_STUDENT_MISMATCH";
  if (/thừa/i.test(detail)) return "OVERPAYMENT";
  return "MANUAL_CHECK";
}
