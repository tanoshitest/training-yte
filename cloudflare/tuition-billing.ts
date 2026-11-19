import { scheduleSlotAppliesOnDate, type DemoClass, type DemoLessonSession } from "./operations-types";
import type { DemoStudent } from "./people-types";
import {
  T2_CLASS_ID,
  T2_OCTOBER_BILLING_MONTH,
  t2OctoberMinimumCreditSessions,
  t2PreviousMonthDebtAmount,
  t2SupersededDebtMonth,
} from "./t2-production-correction";
import { effectivePaidThrough, t3PreviousMonthDebtAmount, t3SupersededDebtMonth } from "./t3-production-correction";
import { t1OctoberMinimumCreditSessions, t1PreviousMonthDebtAmount } from "./t1-production-correction";
import { t7OctoberMinimumCreditSessions, t7PreviousMonthDebtAmount, t7SupersededDebtMonth } from "./t7-production-correction";
import { t8PreviousMonthDebtAmount } from "./t8-production-correction";
import { t4OctoberMinimumCreditSessions, t4PreviousMonthDebtAmount } from "./t4-production-correction";
import { t5PreviousMonthDebtAmount } from "./t5-production-correction";
import { t9OctoberMinimumCreditSessions, t9PreviousMonthDebtAmount } from "./t9-production-correction";
import { t10PreviousMonthDebtAmount } from "./t10-production-correction";
import { t11OctoberMinimumCreditSessions, t11PreviousMonthDebtAmount, t11SupersededDebtMonth } from "./t11-production-correction";
import { t12PreviousMonthDebtAmount, t12SupersededDebtMonth } from "./t12-production-correction";
import { t13OctoberMinimumCreditSessions, t13PreviousMonthDebtAmount, t13SupersededDebtMonth } from "./t13-production-correction";
import { t14OctoberMinimumCreditSessions, t14PreviousMonthDebtAmount, t14SupersededDebtMonth } from "./t14-production-correction";
import { t15PreviousMonthDebtAmount, t15SupersededDebtMonth } from "./t15-production-correction";
import { t16PreviousMonthDebtAmount, t16SupersededDebtMonth } from "./t16-production-correction";
import { t17OctoberMinimumCreditSessions, t17PreviousMonthDebtAmount, t17SupersededDebtMonth } from "./t17-production-correction";
import { t18PreviousMonthDebtAmount, t18SupersededDebtMonth } from "./t18-production-correction";
import { t19PreviousMonthDebtAmount, t19SupersededDebtMonth } from "./t19-production-correction";
import { t20PreviousMonthDebtAmount, t20SupersededDebtMonth } from "./t20-production-correction";
import { t21PreviousMonthDebtAmount, t21SupersededDebtMonth } from "./t21-production-correction";
import { t22SupersededDebtMonth } from "./t22-production-correction";
import { t23PreviousMonthDebtAmount, t23SupersededDebtMonth } from "./t23-production-correction";
import { t24OctoberMinimumCreditSessions, t24PreviousMonthDebtAmount, t24SupersededDebtMonth } from "./t24-production-correction";
import { thanhSenPreviousMonthDebtAmount, thanhSenSupersededDebtMonth } from "./thanh-sen-production-correction";
import {
  applyStudentCreditsToReceivables,
  billPaymentCode,
  createReceivable,
  nextReceiptNumber,
  refreshOrderQr,
  type ReviewReason,
  type SepayLedger,
  type SepayLedgerPayment,
  type SepayReceipt,
  type SepayReceivable,
} from "./sepay-engine";

export const COURSE_SESSIONS = 24;
export type ClassBillingMode = "COURSE" | "MONTHLY";

/**
 * Bộ nhớ đệm theo vòng đời object đầu vào: mỗi request đọc classes/students/
 * sessions/ledger ra object mới nên cache tự mất hiệu lực — các phép tính thuần
 * (khung khóa, suất lịch, tra cứu phiếu/biên lai) chỉ chạy một lần trong một
 * lượt đồng bộ thay vì lặp lại cho từng học viên của cùng một lớp.
 */
const memoOnce = new WeakMap<object, Map<string, unknown>>();
const memoTwice = new WeakMap<object, WeakMap<object, Map<string, unknown>>>();
const memoThrice = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, unknown>>>>();
/** Sentinel cho tham số null/undefined — WeakMap chỉ nhận object key. */
const NIL_SCOPE: object = {};

const asScope = (value: unknown): object | null =>
  value !== null && (typeof value === "object" || typeof value === "function") ? value as object : null;

function memoized<T>(scope: unknown, key: string, compute: () => T): T {
  const target = asScope(scope);
  if (!target) return compute();
  let bucket = memoOnce.get(target);
  if (!bucket) memoOnce.set(target, (bucket = new Map()));
  if (bucket.has(key)) return bucket.get(key) as T;
  const value = compute();
  bucket.set(key, value);
  return value;
}

function memoized2<T>(a: unknown, b: unknown, key: string, compute: () => T): T {
  const first = asScope(a);
  const second = asScope(b);
  if (!first || !second) return compute();
  let inner = memoTwice.get(first);
  if (!inner) memoTwice.set(first, (inner = new WeakMap()));
  let bucket = inner.get(second);
  if (!bucket) inner.set(second, (bucket = new Map()));
  if (bucket.has(key)) return bucket.get(key) as T;
  const value = compute();
  bucket.set(key, value);
  return value;
}

function memoized3<T>(a: unknown, b: unknown, c: unknown, key: string, compute: () => T): T {
  const first = asScope(a);
  const second = asScope(b);
  const third = asScope(c);
  if (!first || !second || !third) return compute();
  let inner = memoThrice.get(first);
  if (!inner) memoThrice.set(first, (inner = new WeakMap()));
  let deep = inner.get(second);
  if (!deep) inner.set(second, (deep = new WeakMap()));
  let bucket = deep.get(third);
  if (!bucket) deep.set(third, (bucket = new Map()));
  if (bucket.has(key)) return bucket.get(key) as T;
  const value = compute();
  bucket.set(key, value);
  return value;
}

export function classBillingMode(row: { billingMode?: string } | null | undefined): ClassBillingMode {
  return row?.billingMode === "MONTHLY" ? "MONTHLY" : "COURSE";
}

export function classSessionPrice(row: { sessionPrice?: number } | null | undefined) {
  const value = Math.round(Number(row?.sessionPrice) || 0);
  return value > 0 ? value : 0;
}

export function classCourseSessions(row: { courseSessions?: number } | null | undefined) {
  const value = Math.round(Number(row?.courseSessions) || 0);
  return value > 0 ? value : COURSE_SESSIONS;
}

/** Lớp đã chốt khóa 1 theo số buổi cũ trước khi đổi gói học phí: khóa 1 giữ
 * đúng số buổi đã phát hành phiếu, các khóa sau chạy theo courseSessions mới.
 * Key = classId, value = số buổi của khóa 1. */
const FIRST_COURSE_SESSIONS_OVERRIDES: Record<string, number> = {
  "class-import-s19": 20,
};

/** Số buổi của khóa thứ `index` (đếm từ 1) — mặc định courseSessions chung,
 * riêng khóa 1 của lớp override giữ số buổi đã chốt. */
export function classCourseSizeAt(
  cls: { id?: string; courseSessions?: number } | null | undefined,
  index: number,
) {
  const override = Math.round(Number(FIRST_COURSE_SESSIONS_OVERRIDES[String(cls?.id || "")]) || 0);
  return Math.max(1, Math.round(Number(index) || 1)) === 1 && override > 0
    ? override
    : classCourseSessions(cls);
}

/** Lớp chốt cứng lịch một khóa theo quyết định trung tâm: khóa chiếm số suất lịch
 * khác số buổi tính phí. Học phí khóa vẫn theo số buổi khóa (classCourseSizeAt).
 * Key = classId → { khóa: số suất lịch tính phí }. Mirror trong public/app.js. */
const COURSE_WINDOW_SLOT_OVERRIDES: Record<string, Record<number, number>> = {
  // S42 (25/10/2026): khóa 1 = 01/08 → 31/10: 22 buổi tính phí (gồm 22/9, 29/9) + 27/10,
  // 31/10 học không tính phí; học phí khóa 1 giữ 24 buổi; khóa 2 buổi 1 = 03/11.
  "class-import-s42": { 1: 22 },
};

/** Số suất lịch (tính phí) mà khóa thứ `index` chiếm trên lịch. */
export function classCourseWindowSlotsAt(
  cls: { id?: string; courseSessions?: number } | null | undefined,
  index: number,
) {
  const override = Math.round(Number(COURSE_WINDOW_SLOT_OVERRIDES[String(cls?.id || "")]?.[Math.max(1, Math.round(Number(index) || 1))]) || 0);
  return override > 0 ? override : classCourseSizeAt(cls, index);
}

export function hasCourseWindowOverride(cls: { id?: string } | null | undefined, index: number) {
  return Boolean(COURSE_WINDOW_SLOT_OVERRIDES[String(cls?.id || "")]?.[Math.max(1, Math.round(Number(index) || 1))]);
}

/** Tổng suất khóa của các khóa trước khóa `index` — vị trí bắt đầu của khóa đó. */
export function courseSlotOffsetBefore(
  cls: { id?: string; courseSessions?: number } | null | undefined,
  index: number,
) {
  let total = 0;
  for (let i = 1; i < index; i += 1) total += classCourseWindowSlotsAt(cls, i);
  return total;
}

/** Khóa (đếm từ 1) chứa suất khóa thứ `ordinal` (đếm từ 0) kể từ đầu khóa 1. */
export function courseIndexAtSlotOrdinal(
  cls: { id?: string; courseSessions?: number } | null | undefined,
  ordinal: number,
) {
  let index = 1;
  let rest = Math.max(0, Math.floor(Number(ordinal) || 0));
  for (let guard = 0; guard < 500; guard += 1) {
    const size = classCourseWindowSlotsAt(cls, index);
    if (rest < size) return index;
    rest -= size;
    index += 1;
  }
  return index;
}

export const COURSE_SCHEDULE_START = "2026-09-01";

export function classCourseStartDate(row: { courseStartDate?: string } | null | undefined) {
  const value = String(row?.courseStartDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return COURSE_SCHEDULE_START;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? value
    : COURSE_SCHEDULE_START;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key = monthKey()) {
  const [year, month] = key.split("-");
  return `Tháng ${month}/${year}`;
}

/** Phiếu chênh lệch/nợ chuyển lớp: lập tay ở endpoint chuyển lớp, neo vào kỳ
 * thu sau của lớp đích. `syncTuitionReceivables` không được đồng bộ lại hay
 * hủy các phiếu này — chỉ luật "mồ côi" (học viên rời lớp đích) mới hủy chúng. */
export const TRANSFER_BILL_KEY_HEAD = "transfer";
/** Phiếu NỢ CŨ riêng của lớp thu tháng ("olddebt|lớp|2026-09"): nợ trước tháng 10 tách khỏi
 * phiếu tháng 10 thành phiếu riêng (như phiếu khóa 1 của lớp khóa). Có phiếu này thì báo giá /
 * phiếu tháng không cộng dòng "Nợ cũ tháng trước" nữa — nợ nằm ở chính phiếu này. */
export const OLD_DEBT_BILL_KEY_HEAD = "olddebt";
export const OLD_DEBT_SPLIT_MONTH = "2026-09";
export function isOldDebtBillKey(billKey?: string | null) {
  return String(billKey || "").split("|")[0] === OLD_DEBT_BILL_KEY_HEAD;
}
export function oldDebtBillKey(classId: string) {
  return `${OLD_DEBT_BILL_KEY_HEAD}|${classId}|${OLD_DEBT_SPLIT_MONTH}`;
}
/** Học viên đã có phiếu nợ cũ riêng ở lớp này (kể cả đã thu đủ). */
export function hasOldDebtBill(ledger: { receivables?: SepayReceivable[] } | null | undefined, studentId: string, classId: string) {
  return receivablesOfStudent(ledger, studentId).some((row) => row.classId === classId
    && row.status !== "CANCELLED" && isOldDebtBillKey(row.billKey));
}
export function transferBillKey(targetClassId: string, sourceClassId: string, anchor: string) {
  return `${TRANSFER_BILL_KEY_HEAD}|${targetClassId}|${sourceClassId}|${anchor}`;
}
export function isTransferBillKey(billKey?: string | null) {
  return String(billKey || "").split("|")[0] === TRANSFER_BILL_KEY_HEAD;
}
export function transferBillKeyParts(billKey?: string | null) {
  const parts = String(billKey || "").split("|");
  return parts[0] === TRANSFER_BILL_KEY_HEAD
    ? { targetClassId: parts[1] || "", sourceClassId: parts[2] || "", anchor: parts[3] || "" }
    : null;
}
/** Dư nợ còn phải thu trên các phiếu chênh lệch chuyển lớp của một học viên tại
 * một lớp (âm = khoản ghi giảm cho học viên). */
export function studentTransferReceivableDue(
  studentId: string | undefined,
  classId: string | undefined,
  ledger?: Pick<SepayLedger, "receivables"> | null,
) {
  if (!studentId || !classId || !ledger) return 0;
  return memoized(ledger, `trd|${studentId}|${classId}`, () =>
    receivablesOfStudent(ledger, studentId).reduce((sum, row) => (
      row.classId === classId && isTransferBillKey(row.billKey) && row.status !== "CANCELLED"
        ? sum + Math.round(Number(row.balanceDue ?? row.amountDue) || 0)
        : sum
    ), 0));
}

/**
 * Tháng chuyển lớp ở lớp đích đã được phép tính chuyển lớp bao phủ: phụ huynh
 * vẫn trả phiếu kỳ đó của lớp cũ, phần dư/thiếu nằm trong phiếu chênh lệch neo
 * kỳ sau — nên lớp đích KHÔNG lập phiếu riêng cho tháng này. Nhận diện: mốc
 * vào lớp được đặt về ngày đầu tháng (joinAnchor của endpoint chuyển lớp) và
 * còn phiếu "transfer|…" chưa hủy của đúng lớp. Buổi đã qua vẫn đếm vào công
 * nợ như các bạn cùng lớp; khi kỳ neo được đóng, paidThrough phủ luôn tháng
 * này (billed từ đầu tháng vì joinDate = ngày 1).
 */
export function isTransferCoveredMonth(
  student: { id: string; classJoinedAt?: Record<string, string> } | null | undefined,
  cls: Pick<DemoClass, "id">,
  key: string,
  ledger?: Pick<SepayLedger, "receivables"> | null,
) {
  if (!student?.id || !/^\d{4}-\d{2}$/.test(key)) return false;
  const joinDate = studentClassJoinDate(student, cls.id);
  if (joinDate !== `${key}-01`) return false;
  return memoized2(ledger, student, `tcm|${cls.id}|${key}`, () =>
    receivablesOfStudent(ledger, student.id).some((row) => (
      row.classId === cls.id && row.status !== "CANCELLED" && isTransferBillKey(row.billKey)
    )));
}

/**
 * Khóa đang chạy của lớp đích đã được phép tính chuyển lớp bao phủ — bản lớp
 * khóa của isTransferCoveredMonth: phụ huynh vẫn trả phiếu khóa đó của lớp cũ,
 * phần chênh lệch nằm trong phiếu "transfer|…" neo khóa kế tiếp — nên lớp đích
 * KHÔNG lập phiếu riêng cho khóa này. Nhận diện: mốc vào lớp được đặt về buổi
 * đầu của khóa (joinAnchor của endpoint chuyển lớp) và còn phiếu "transfer|…"
 * chưa hủy của đúng lớp (phiếu 0đ PAID vẫn là dấu bao phủ hợp lệ).
 */
export function isTransferCoveredCourse(
  student: { id?: string; classJoinedAt?: Record<string, string> } | null | undefined,
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseSessions" | "courseStartDate">,
  courseIndex: number,
  sessions: DemoLessonSession[],
  ledger?: Pick<SepayLedger, "receivables"> | null,
  now = new Date(),
) {
  if (!student?.id || !(courseIndex >= 1)) return false;
  const joinDate = studentClassJoinDate(student, cls.id);
  if (!joinDate) return false;
  return memoized3(ledger, sessions, student, `tcc|${cls.id}|${courseIndex}|${dateKeyOf(now)}`, () => {
    const windowStart = classCourseSessionsForCourse(cls, sessions, courseIndex, now)[0]?.date;
    if (!windowStart || joinDate !== windowStart) return false;
    return receivablesOfStudent(ledger, student.id).some((row) => (
      row.classId === cls.id && row.status !== "CANCELLED" && isTransferBillKey(row.billKey)
    ));
  });
}

/**
 * Số buổi đã thu của khóa được phiếu lớp nguồn bao phủ (học viên chuyển lớp):
 * phiếu khóa cùng kỳ bên lớp nguồn chính là "khoản đã đóng" của khóa này —
 * đóng đủ tính đủ khóa, đóng một phần quy theo tỷ lệ của phiếu. Không cộng
 * khoản này thì số dư hiển thị thiếu buổi dù phụ huynh đã trả qua phiếu lớp
 * cũ. Chuyển lớp nối tiếp (A→B→C) lần theo dấu "transfer|…" tới phiếu nguồn
 * thực — lớp trung gian không lập phiếu vì khóa của nó cũng được bao phủ.
 */
export function coveredCoursePaidSessions(
  student: { id?: string },
  cls: DemoClass,
  ledger?: Pick<SepayLedger, "receivables"> | null,
  courseIndex?: number,
) {
  if (!student.id || !ledger) return 0;
  return memoized2(ledger, student, `ccp|${cls.id}|${courseIndex ?? ""}`, () => {
    const receivables = receivablesOfStudent(ledger, student.id);
    const marker = receivables.find((row) => (
      row.classId === cls.id && row.status !== "CANCELLED" && isTransferBillKey(row.billKey)
    ));
    let sourceId = transferBillKeyParts(marker?.billKey)?.sourceClassId || "";
    let covering: SepayReceivable | undefined;
    for (let depth = 0; sourceId && depth < 3 && !covering; depth += 1) {
      const markerDate = String(marker?.issueDate || "");
      covering = receivables
        .filter((row) => (
          row.classId === sourceId
          && row.status !== "CANCELLED"
          && String(row.billKey || "").split("|")[0] === COURSE_MATERIAL_KEY
          && (!markerDate || String(row.issueDate || "") <= markerDate)
        ))
        .sort((a, b) => courseIndexOfBillKey(b.billKey) - courseIndexOfBillKey(a.billKey))[0];
      if (!covering) {
        const hop = receivables.find((row) => (
          row.classId === sourceId && row.status !== "CANCELLED" && isTransferBillKey(row.billKey)
        ));
        sourceId = transferBillKeyParts(hop?.billKey)?.sourceClassId || "";
      }
    }
    if (!covering) return 0;
    const size = Math.max(1, classCourseSizeAt(cls, courseIndex ?? 1));
    if (covering.status === "PAID" || Number(covering.balanceDue) <= 0) return size;
    const due = Math.max(1, Math.round(Number(covering.amountDue) || 0));
    const paid = Math.max(0, Math.round(Number(covering.amountPaid) || 0));
    return Math.min(size, Math.floor(paid * size / due));
  });
}

/**
 * Khoản chênh lệch khi chuyển lớp cùng loại thu phí, quy ra tiền một lần neo
 * vào kỳ sau (tháng kế / khóa kế tiếp), cùng lớp đích:
 *
 *    amount = (buổi còn lại kỳ đang chạy ở lớp đích × giá đích)
 *           + (buổi đã học kỳ đang chạy ở lớp nguồn × giá nguồn)
 *           − (phiếu kỳ đang chạy của lớp nguồn)
 *
 * Âm = phụ huynh đóng dư → KHẤU TRỪ vào phiếu kỳ sau (chuyển từ lớp đắt sang
 * lớp rẻ). Dương = thu thêm (chuyển lên lớp đắt hơn / nợ nguồn lớn).
 * Ví dụ S3(75k)→T3(50k) chuyển 10/10, phiếu T10 S3 = 10 buổi/750k, đã học 3
 * buổi S3, T3 T10 = 8 buổi còn 6 buổi sau ngày chuyển:
 *    6×50k + 3×75k − 750k = 300k + 225k − 750k = −225k (khấu trừ T11).
 *
 * Phiếu kỳ đang chạy của lớp đích chỉ thu các buổi đã qua tới ngày chuyển
 * (`elapsedTargetAmount`): các buổi còn lại đã được trả bằng khoản dư lớp cũ.
 * Phiếu kỳ đang chạy của lớp nguồn giữ nguyên thu đủ.
 */
export function transferCarryBreakdown(input: {
  student: Parameters<typeof studentRemainingSessions>[0];
  sourceClass: DemoClass;
  targetClass: DemoClass;
  sessions?: DemoLessonSession[];
  ledger?: SepayLedger | null;
  now?: Date;
  transferDate?: string;
}) {
  const now = input.now || new Date();
  const sessions = input.sessions || [];
  const transferDate = input.transferDate || dateKeyOf(now);
  const sourcePrice = classSessionPrice(input.sourceClass);
  const targetPrice = classSessionPrice(input.targetClass);
  const mode = classBillingMode(input.targetClass);
  const joinSource = studentClassJoinDate(input.student, input.sourceClass.id);

  const sourceIndex = mode === "COURSE" ? classCurrentCourseIndex(input.sourceClass, now, sessions) : 0;
  const targetIndex = mode === "COURSE" ? classCurrentCourseIndex(input.targetClass, now, sessions) : 0;
  const currentMonth = monthKey(new Date(`${transferDate}T12:00:00`));

  // Buổi "đã qua" trong kỳ đang chạy tính tới trước ngày chuyển =
  // (suất tính phí từ đầu kỳ) − (suất tính phí từ ngày chuyển trở đi).
  const billedSource = mode === "COURSE"
    ? billedCourseSessions(input.sourceClass, sessions, sourceIndex, now, joinSource || undefined)
    : billedMonthSessions(input.sourceClass, sessions, currentMonth, joinSource || undefined);
  const billedSourceFromTransfer = mode === "COURSE"
    ? billedCourseSessions(input.sourceClass, sessions, sourceIndex, now, joinSource && joinSource > transferDate ? joinSource : transferDate)
    : billedMonthSessions(input.sourceClass, sessions, currentMonth, joinSource && joinSource > transferDate ? joinSource : transferDate);
  const elapsedSourceSessions = Math.max(0, billedSource - billedSourceFromTransfer);

  const billedTarget = mode === "COURSE"
    ? billedCourseSessions(input.targetClass, sessions, targetIndex, now)
    : billedMonthSessions(input.targetClass, sessions, currentMonth);
  const remainingTargetSessions = mode === "COURSE"
    ? billedCourseSessions(input.targetClass, sessions, targetIndex, now, transferDate)
    : billedMonthSessions(input.targetClass, sessions, currentMonth, transferDate);
  const elapsedTargetSessions = Math.max(0, billedTarget - remainingTargetSessions);

  // Phiếu kỳ đang chạy của lớp nguồn: dùng số tiền thật trên phiếu khi có —
  // phiếu đó có thể đã chứa khoản điều chỉnh của lần chuyển trước (vd đã trừ
  // 225k), dùng báo giá gốc sẽ làm mất khoản cũ khi chuyển tiếp.
  const currentSourceBillKey = mode === "COURSE"
    ? `course|${input.sourceClass.id}|${sourceIndex}`
    : `month|${input.sourceClass.id}|${currentMonth}`;
  const issuedSourceBill = (input.ledger?.receivables || []).find((row) => (
    row.studentId === input.student.id
    && row.classId === input.sourceClass.id
    && row.status !== "CANCELLED"
    && String(row.billKey || "") === currentSourceBillKey
  ));
  const sourceBillAmount = issuedSourceBill
    ? Math.round(Number(issuedSourceBill.amountDue) || 0)
    : billedSource * sourcePrice;
  const sourceElapsedAmount = elapsedSourceSessions * sourcePrice;
  const targetRemainingAmount = remainingTargetSessions * targetPrice;
  const elapsedTargetAmount = elapsedTargetSessions * targetPrice;
  const amount = Math.round(targetRemainingAmount + sourceElapsedAmount - sourceBillAmount);

  // Lớp tháng neo vào tháng kế; lớp khóa neo vào khóa kế tiếp ("course2"…).
  const anchor = mode === "COURSE" ? `course${targetIndex + 1}` : nextMonthKey(currentMonth);
  const anchorLabel = mode === "COURSE"
    ? `Khóa ${targetIndex + 1}`
    : `kỳ ${anchor.slice(5, 7)}/${anchor.slice(0, 4)}`;
  const dueDate = mode === "COURSE" ? dateKeyOf(now) : `${anchor}-01`;
  // Học viên chuyển lớp được tính học lớp đích cả kỳ đang chạy (đã tham gia
  // các buổi trước ngày chuyển) — mốc vào lớp đặt về đầu kỳ: ngày 1 của tháng,
  // hoặc buổi đầu của khóa đang chạy để công nợ/buổi đã qua y như các bạn.
  const joinAnchor = mode === "COURSE"
    ? classCourseSessionsForCourse(input.targetClass, sessions, targetIndex, now)[0]?.date
    : `${currentMonth}-01`;
  const currentPeriod = mode === "COURSE" ? `course${targetIndex}` : currentMonth;
  return {
    mode,
    anchor,
    anchorLabel,
    dueDate,
    joinAnchor,
    currentPeriod,
    sourceIndex,
    targetIndex,
    billedSource,
    elapsedSourceSessions,
    billedTarget,
    elapsedTargetSessions,
    remainingTargetSessions,
    sourceBillAmount,
    sourceElapsedAmount,
    targetRemainingAmount,
    elapsedTargetAmount,
    amount,
    sourcePrice,
    targetPrice,
  };
}

/** Tổng khoản chênh lệch chuyển lớp (có thể âm) neo vào một kỳ cụ thể của lớp
 * đích — tháng "YYYY-MM" hoặc "courseK". Dùng để trừ/cộng vào báo giá của kỳ
 * neo thay vì thu riêng: phiếu thường của kỳ neo = báo giá + khoản này. */
export function transferAdjustmentForAnchor(
  studentId: string | undefined,
  classId: string | undefined,
  anchor: string,
  ledger?: Pick<SepayLedger, "receivables"> | null,
) {
  if (!studentId || !classId || !anchor || !ledger) return 0;
  return memoized(ledger, `taa|${studentId}|${classId}|${anchor}`, () =>
    receivablesOfStudent(ledger, studentId).reduce((sum, row) => {
      if (row.classId !== classId || row.status === "CANCELLED") return sum;
      const parts = transferBillKeyParts(row.billKey);
      return parts?.anchor === anchor ? sum + Math.round(Number(row.balanceDue ?? row.amountDue) || 0) : sum;
    }, 0));
}

/** Chỉ lịch nghỉ do học vụ chốt trước mới làm giảm học phí của chính tháng đó. */
export function isPlannedTuitionOff(session: Pick<DemoLessonSession, "isOff" | "offSource"> | null | undefined) {
  return Boolean(session?.isOff && session.offSource !== "TEACHER");
}

/**
 * Buổi giáo viên cho nghỉ còn nguyên trạng nghỉ. Với lớp thu khóa buổi này
 * không chiếm suất của khóa: khóa tự nối dài thêm một suất lịch để học bù,
 * nên khóa sau vẫn thu đủ số buổi và không cần khấu trừ.
 */
export function isTeacherOffSession(
  session: Pick<DemoLessonSession, "isOff" | "offSource" | "status"> | null | undefined,
) {
  return Boolean(session?.isOff && session.offSource === "TEACHER" && session.status !== "CANCELLED");
}

/**
 * Buổi "học không tính phí": lớp vẫn học và điểm danh bình thường nhưng buổi
 * này không tính tiền. Với lớp thu khóa suất đó không chiếm vị trí của khóa —
 * khóa tự nối dài thêm một suất để bù, giống buổi GV cho nghỉ.
 */
export function isNoFeeSession(
  session: Pick<DemoLessonSession, "noFee" | "isOff" | "status"> | null | undefined,
) {
  return Boolean(session?.noFee && !session.isOff && session.status !== "CANCELLED");
}

/**
 * Suất lịch không chiếm vị trí "Buổi N" của khóa: nghỉ học vụ, GV cho nghỉ,
 * buổi học không tính phí và buổi bị huỷ đều bị bỏ qua khi sinh/đếm suất —
 * khóa tự kéo dài để học bù, số buổi tính phí của khóa vẫn trọn vẹn.
 * (isOff phủ cả nguồn ADMIN lẫn TEACHER; CANCELLED là buổi đã huỷ.)
 */
export function isCourseSlotSkippingSession(
  session: Pick<DemoLessonSession, "isOff" | "noFee" | "status"> | null | undefined,
) {
  return Boolean(session?.isOff || session?.noFee || session?.status === "CANCELLED");
}

/** Buổi dạy bù đã được xếp cho một buổi nghỉ (nếu có). Buổi bù chiếm đúng vị
 * trí khóa của buổi nghỉ — khóa không kéo dài thêm suất bù ở cuối nữa. Buổi
 * bù bị hủy/nghỉ thì không còn hiệu lực — buổi nghỉ lại chờ được bù. */
export function makeupSessionFor(
  session: Pick<DemoLessonSession, "id"> | null | undefined,
  sessions: Pick<DemoLessonSession, "id" | "makeupOf" | "isOff" | "status">[] = [],
) {
  if (!session?.id) return undefined;
  return memoized2(sessions, session, `mk|${session.id}`, () =>
    sessions.find((item) => item.makeupOf === session.id && !item.isOff && item.status !== "CANCELLED"));
}

/**
 * Ngày mà một bản ghi buổi học "chiếm" suất lịch — theo recurrenceKey nếu có,
 * nếu không thì theo ngày của chính bản ghi.
 */
function sessionClaimDate(session: Pick<DemoLessonSession, "date" | "recurrenceKey">) {
  return String(session.recurrenceKey || "").split("|")[1] || session.date;
}

/**
 * Ghép bản ghi buổi học thật vào các suất lịch của một ngày: bản ghi cùng ngày
 * nhưng khác giờ (lịch đã chỉnh sau khi có bản ghi) chiếm một suất trống còn lại
 * thay vì bị đếm thêm trùng lặp. Bản ghi vượt quá số suất của ngày nằm ngoài
 * thời khóa biểu — để nguyên trong `leftovers` cho nơi gọi xử lý.
 */
function claimDaySlots<Slot extends { startTime: string }>(
  daySlots: Slot[],
  storedToday: DemoLessonSession[],
): { claimed: (DemoLessonSession | undefined)[]; leftovers: DemoLessonSession[] } {
  const claimed: (DemoLessonSession | undefined)[] = new Array(daySlots.length);
  const pending: DemoLessonSession[] = [];
  for (const item of storedToday) {
    const index = daySlots.findIndex((slot, i) => !claimed[i] && slot.startTime === item.startTime);
    if (index >= 0) claimed[index] = item; else pending.push(item);
  }
  const leftovers: DemoLessonSession[] = [];
  for (const item of pending) {
    const index = daySlots.findIndex((slot, i) => !claimed[i]);
    if (index >= 0) claimed[index] = item; else leftovers.push(item);
  }
  return { claimed, leftovers };
}

function storedSessionsByClaimDate(sessions: DemoLessonSession[], classId: string, extra = false) {
  return memoized(sessions, `stored|${classId}|${extra ? 1 : 0}`, () => storedSessionsByClaimDateImpl(sessions, classId, extra));
}

function storedSessionsByClaimDateImpl(sessions: DemoLessonSession[], classId: string, extra = false) {
  const map = new Map<string, DemoLessonSession[]>();
  for (const item of sessions) {
    if (item.classId !== classId || Boolean(item.isExtra) !== extra) continue;
    const date = sessionClaimDate(item);
    const list = map.get(date) || [];
    list.push(item);
    map.set(date, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return map;
}

/** Buổi học của một lớp — index một lần cho mỗi request thay vì quét lại toàn
 * danh sách buổi cho từng cặp (học viên × lớp). */
function sessionsOfClass(sessions: DemoLessonSession[], classId: string) {
  return memoized(sessions, `byClass|${classId}`, () => sessions.filter((item) => item.classId === classId));
}

export function billedMonthSessions(
  cls: Pick<DemoClass, "id" | "schedules">,
  sessions: DemoLessonSession[],
  key = monthKey(),
  minDate?: string,
) {
  return memoized2(cls, sessions, `bms|${key}|${minDate || ""}`, () => billedMonthSessionsImpl(cls, sessions, key, minDate));
}

function billedMonthSessionsImpl(
  cls: Pick<DemoClass, "id" | "schedules">,
  sessions: DemoLessonSession[],
  key = monthKey(),
  minDate?: string,
) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 12);
  const end = new Date(year, month, 0, 12);
  const explicit = sessionsOfClass(sessions, cls.id);
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  const claimedIds = new Set<string>();
  let count = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (minDate && date < minDate) continue;
    const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (const stored of claimed) {
      if (stored) claimedIds.add(sessionIdentity(stored));
      if (isPlannedTuitionOff(stored) || isNoFeeSession(stored) || stored?.status === "CANCELLED") continue;
      count += 1;
    }
  }
  // Bản ghi thật trong tháng không chiếm được suất lịch nào (học thêm, ngày ngoài
  // lịch hiện tại, lịch đã đổi sau khi có bản ghi) vẫn phải tính vào phiếu thu.
  for (const item of explicit) {
    if (!item.date.startsWith(key) || claimedIds.has(sessionIdentity(item))) continue;
    if (minDate && item.date < minDate) continue;
    // Buổi dạy bù thay cho buổi nghỉ đã tính phí (suất nghỉ vẫn nằm trong phiếu)
    // — không thu thêm lần nữa.
    if (item.makeupOf) continue;
    if (!isPlannedTuitionOff(item) && !isNoFeeSession(item) && item.status !== "CANCELLED") count += 1;
  }
  return count;
}

function prevMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const prev = new Date(year, month - 2, 1, 12);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Buổi GV nghỉ chỉ sinh khấu trừ khi thuộc tháng này trở đi. Các buổi nghỉ
 * trước tháng 10/2026 kế toán đã tự trừ và thu tay, nên phiếu tháng 10 không
 * còn dòng khấu trừ — cơ chế tự động áp dụng từ phiếu tháng 11 trở đi.
 */
export const TUITION_OFF_CREDIT_START_MONTH = "2026-10";
/** Từ kỳ này, phiếu tháng chỉ khấu trừ buổi GV nghỉ của chính tháng trước (suy ra từ lịch).
 * Tín dụng buổi nghỉ lưu trên hồ sơ (tuitionCredits) không còn được trừ thêm — buổi nghỉ
 * đã khấu trừ ở phiếu tháng kế tiếp nên trừ tiếp từ tín dụng lưu là trừ lần 2 (T4 Khánh Ly T11). */
export const TUITION_STORED_CREDIT_END_MONTH = "2026-12";
/** Phiếu tháng 11/2026 chốt theo bảng công nợ 08/11/2026 (anh Vũ, 9/11): buổi GV tick nghỉ trong
 * tháng 11 không trừ vào chính phiếu tháng 11 — dạy bù hoặc trừ ở phiếu tháng 12. Riêng 2 buổi
 * dưới đây đã được trừ ngay trên phiếu T11 trước ngày chốt → giữ nguyên, phiếu T12 không trừ lại. */
// S1 03/11 bỏ khỏi danh sách (anh Mori 12/11/2026): phiếu T11 tính đủ buổi, buổi GV nghỉ 03/11 trừ ở phiếu T12
// như mọi lớp. T8 (Thạch Khê) giữ nguyên vì Thạch Khê đã chốt.
export const NOV_2026_DEDUCTED_OFF_KEYS: ReadonlySet<string> = new Set(["class-import-t8|2026-11-04"]);
const NOV_2026 = "2026-11";

/** Số buổi GV nghỉ tháng 11/2026 (chưa dạy bù) phải hoãn sang phiếu tháng 12 — không trừ trên phiếu T11. */
export function november2026DeferredOffSessions(cls: Pick<DemoClass, "id">, sessions: DemoLessonSession[]) {
  return sessions.filter((item) => (
    item.classId === cls.id
    && item.isOff
    && item.offSource === "TEACHER"
    && item.status !== "CANCELLED"
    && sessionClaimDate(item).startsWith(NOV_2026)
    && !NOV_2026_DEDUCTED_OFF_KEYS.has(`${cls.id}|${sessionClaimDate(item)}`)
    && !makeupSessionFor(item, sessions)
  )).length;
}

/**
 * Buổi giáo viên cho nghỉ của tháng trước vẫn còn nguyên trạng nghỉ tới cuối
 * tháng đó (không dạy bù/đảo điểm danh) — được khấu trừ trên phiếu tháng này.
 * Đếm theo ngày buổi nghỉ "chiếm" suất (recurrenceKey nếu có, nếu không theo date)
 * để khớp đúng tháng mà buổi đó đã được tính phí.
 */
export function teacherOffCreditSessions(
  cls: Pick<DemoClass, "id">,
  sessions: DemoLessonSession[],
  key = monthKey(),
  minDate?: string,
) {
  return memoized2(cls, sessions, `tocs|${key}|${minDate || ""}`, () => teacherOffCreditSessionsImpl(cls, sessions, key, minDate));
}

function teacherOffCreditSessionsImpl(
  cls: Pick<DemoClass, "id">,
  sessions: DemoLessonSession[],
  key = monthKey(),
  minDate?: string,
) {
  const prev = prevMonthKey(key);
  const t2OctoberOverride = cls.id === T2_CLASS_ID && key === T2_OCTOBER_BILLING_MONTH;
  if (prev < TUITION_OFF_CREDIT_START_MONTH && !t2OctoberOverride) return 0;
  const count = sessions.filter((item) => (
    item.classId === cls.id
    && item.isOff
    && item.offSource === "TEACHER"
    && item.status !== "CANCELLED"
    && sessionClaimDate(item).startsWith(prev)
    && (!minDate || sessionClaimDate(item) >= minDate)
    // Buổi nghỉ đã trừ ngay trên phiếu T11/2026 (chốt 08/11) — phiếu T12 không trừ lại.
    && !NOV_2026_DEDUCTED_OFF_KEYS.has(`${cls.id}|${sessionClaimDate(item)}`)
    // Buổi nghỉ đã được dạy bù thì học viên đã học đủ — không khấu trừ.
    && !makeupSessionFor(item, sessions)
  )).length;
  // Riêng T2: phiếu tháng 10 khấu trừ đúng hai ngày GV cho nghỉ của tháng 9.
  return t2OctoberOverride ? Math.min(2, count) : count;
}

/** Ngày học viên được thêm vào lớp (YYYY-MM-DD) — mốc của luật thu giữa tháng. */
export function studentClassJoinDate(
  student: { code?: string; fullName?: string; classJoinedAt?: Record<string, string> } | null | undefined,
  classId: string,
) {
  const date = String(student?.classJoinedAt?.[classId] || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

/**
 * Buổi có áp cho học viên theo mốc vào lớp: chỉ các buổi từ ngày vào trở đi.
 * Ngày vào lớp ra phiếu của tháng luôn (không còn luật "sau ngày 5 hoãn phiếu").
 */
export function sessionWithinJoinRule(
  session: Pick<DemoLessonSession, "date" | "isOff">,
  joinDate: string | undefined,
) {
  return !joinDate || session.date >= joinDate;
}

/**
 * Sinh đúng số buổi của một khóa từ ngày bắt đầu và thời khóa biểu tuần.
 * Buổi nghỉ lễ (admin) vẫn giữ vị trí trong khóa và chỉ bị loại khỏi số buổi
 * tính học phí; buổi GV cho nghỉ không chiếm suất nên khóa tự kéo dài bù.
 */
export function classCourseScheduleSessions(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseSessions" | "courseStartDate">,
  sessions: DemoLessonSession[],
  now = new Date(),
) {
  return classCourseScheduleSlots(cls, sessions, classCourseWindowSlotsAt(cls, 1), now);
}

/** Suất lịch của khóa thứ `courseIndex` (đếm từ 1): khóa sau nối tiếp ngay suất cuối khóa trước. */
export function classCourseSessionsForCourse(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseSessions" | "courseStartDate">,
  sessions: DemoLessonSession[],
  courseIndex = 1,
  now = new Date(),
) {
  const index = Math.max(1, Math.round(Number(courseIndex) || 1));
  const offset = courseSlotOffsetBefore(cls, index);
  return classCourseScheduleSlots(cls, sessions, offset + classCourseWindowSlotsAt(cls, index), now).slice(offset);
}

function classCourseScheduleSlots(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseSessions" | "courseStartDate">,
  sessions: DemoLessonSession[],
  target: number,
  now = new Date(),
) {
  return memoized2(cls, sessions, `slots|${target}|${dateKeyOf(now)}`, () => classCourseScheduleSlotsImpl(cls, sessions, target, now));
}

function classCourseScheduleSlotsImpl(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseSessions" | "courseStartDate">,
  sessions: DemoLessonSession[],
  target: number,
  now: Date,
) {
  const startKey = classCourseStartDate(cls);
  const [year, month, day] = startKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 12);
  const slots = [...(cls.schedules || [])].sort((a, b) => `${a.weekday}|${a.startTime}`.localeCompare(`${b.weekday}|${b.startTime}`));
  if (!slots.length) return [];
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  const rows: DemoLessonSession[] = [];
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // 1000 buổi với lịch tối thiểu 1 lần/tuần cần dưới 20 năm; chặn vòng lặp để dữ liệu lỗi không treo request.
  const guardDays = Math.max(366, target * 14 + 14);
  for (let offset = 0; offset <= guardDays && rows.length < target; offset += 1) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12);
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const daySlots = slots.filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (let index = 0; index < daySlots.length; index += 1) {
      if (rows.length >= target) break;
      const slot = daySlots[index];
      const stored = claimed[index];
      // Suất nghỉ (học vụ hoặc GV) hoặc "học không tính phí" không phát sinh
      // buổi của khóa — khóa dài ra đúng một suất để học bù vào cuối, khóa sau
      // không mất buổi nào. Riêng buổi nghỉ đã được xếp lịch dạy bù thì buổi
      // bù chiếm đúng vị trí này — khóa kết thúc đúng hạn như chưa nghỉ.
      if (isCourseSlotSkippingSession(stored)) {
        const makeup = makeupSessionFor(stored, sessions);
        if (makeup) rows.push(makeup as DemoLessonSession);
        continue;
      }
      const recurrenceKey = `${cls.id}|${date}|${slot.startTime}`;
      rows.push(stored || {
        id: `recurring|${recurrenceKey}`,
        classId: cls.id,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherId: cls.teacherId,
        roomId: cls.roomId,
        status: date < todayKey ? "COMPLETED" : "SCHEDULED",
        isExtra: false,
        recurrenceKey,
        note: "",
        isOff: false,
        hasHomework: false,
        attendance: [],
      });
    }
  }
  return rows;
}

export function billedCourseSessions(cls: DemoClass, sessions: DemoLessonSession[], courseIndex = 1, now = new Date(), minDate?: string) {
  return memoized2(cls, sessions, `bcs|${courseIndex}|${minDate || ""}|${dateKeyOf(now)}`, () => billedCourseSessionsImpl(cls, sessions, courseIndex, now, minDate));
}

function billedCourseSessionsImpl(cls: DemoClass, sessions: DemoLessonSession[], courseIndex = 1, now = new Date(), minDate?: string) {
  const configured = classCourseSizeAt(cls, courseIndex);
  // Khóa chốt cứng lịch: học phí giữ đúng số buổi khóa đã chốt.
  if (hasCourseWindowOverride(cls, courseIndex)) return configured;
  const course = classCourseSessionsForCourse(cls, sessions, courseIndex, now);
  // Giữ cách tính cũ cho dữ liệu lớp chưa có thời khóa biểu; UI sẽ yêu cầu cấu hình lịch trước khi lưu lịch nghỉ.
  if (!course.length) return configured;
  return course.filter((item) => !item.isOff && !item.noFee && item.status !== "CANCELLED" && (!minDate || item.date >= minDate)).length;
}

/** Lớp thu khóa chỉ có một khoản học liệu cho cả khóa, không chia theo tháng. */
export const COURSE_MATERIAL_KEY = "course";

/** Khoản học liệu của từng khóa: khóa 1 giữ key "course" cho tương thích dữ liệu cũ. */
export function courseMaterialKey(courseIndex = 1) {
  const index = Math.max(1, Math.round(Number(courseIndex) || 1));
  return index === 1 ? COURSE_MATERIAL_KEY : `${COURSE_MATERIAL_KEY}|${index}`;
}

/** Khóa của một billKey "course|classId|k" — khóa 1 đọc cả "course|classId" lẫn "course|classId|1". */
export function courseIndexOfBillKey(billKey: string | undefined) {
  const index = Math.round(Number(String(billKey || "").split("|")[2]) || 0);
  return Math.max(1, index || 1);
}

/** Học liệu thu thêm của một kỳ (tháng "YYYY-MM" hoặc cả khóa). Không cấu hình thì tiền bằng 0. */
export function classMaterialFee(cls: Pick<DemoClass, "materialFees">, key: string) {
  const row = cls.materialFees?.[key];
  const amount = Math.max(0, Math.round(Number(row?.amount) || 0));
  return { amount, description: amount ? String(row?.description || "").trim() : "" };
}

/**
 * Học liệu của khóa thứ `courseIndex`: khóa sau chưa cấu hình riêng thì kế thừa
 * khoản "course" của khóa 1 (lớp cũ chỉ nhập một lần). Ghi 0 đồng tường minh
 * vào key "course|k" để một khóa không thu học liệu.
 */
export function courseMaterialFee(cls: Pick<DemoClass, "materialFees">, courseIndex = 1) {
  const index = Math.max(1, Math.round(Number(courseIndex) || 1));
  if (index <= 1) return classMaterialFee(cls, COURSE_MATERIAL_KEY);
  const key = courseMaterialKey(index);
  if (cls.materialFees?.[key]) return classMaterialFee(cls, key);
  return classMaterialFee(cls, COURSE_MATERIAL_KEY);
}

export function classTuitionCharge(
  cls: DemoClass,
  sessions: DemoLessonSession[],
  key = monthKey(),
  courseIndex = 1,
) {
  return memoized2(cls, sessions, `ctc|${key}|${courseIndex}|${dateKeyOf(new Date())}`, () => classTuitionChargeImpl(cls, sessions, key, courseIndex));
}

function classTuitionChargeImpl(
  cls: DemoClass,
  sessions: DemoLessonSession[],
  key = monthKey(),
  courseIndex = 1,
) {
  const price = classSessionPrice(cls);
  const mode = classBillingMode(cls);
  if (mode === "MONTHLY") {
    const billed = billedMonthSessions(cls, sessions, key);
    // Buổi nghỉ của giáo viên trong tháng trước đã bị tính phí ở kỳ đó; tháng này
    // giảm tiền tương ứng số buổi — số buổi được cộng (billed) vẫn giữ nguyên.
    const offCreditSessions = Math.min(billed, teacherOffCreditSessions(cls, sessions, key));
    const materials = classMaterialFee(cls, key);
    return {
      mode,
      billed,
      offCreditSessions,
      materialsAmount: materials.amount,
      materialsLabel: materials.description,
      amount: (billed - offCreditSessions) * price + materials.amount,
      period: `${monthLabel(key)} · ${cls.name}`,
      billKey: `month|${cls.id}|${key}`,
    };
  }
  const index = Math.max(1, Math.round(Number(courseIndex) || 1));
  const courseSessions = classCourseSizeAt(cls, index);
  const billed = billedCourseSessions(cls, sessions, index);
  const materials = courseMaterialFee(cls, index);
  return {
    mode,
    billed,
    offCreditSessions: 0,
    materialsAmount: materials.amount,
    materialsLabel: materials.description,
    amount: billed * price + materials.amount,
    period: index === 1 ? `Khóa ${courseSessions} buổi · ${cls.name}` : `Khóa ${index} · ${courseSessions} buổi · ${cls.name}`,
    billKey: index === 1 ? `course|${cls.id}` : `course|${cls.id}|${index}`,
  };
}

function validMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function nextMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const next = new Date(year, month, 1, 12);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function receiptMonthKeys(ledger: SepayLedger, studentId: string, classId: string) {
  return memoized(ledger, `rmk|${studentId}|${classId}`, () => {
    const keys: string[] = [];
    for (const receipt of receiptsOfStudent(ledger, studentId)) {
      if (receiptClassId(receipt, ledger) !== classId) continue;
      if (receipt.billingMode && receipt.billingMode !== "MONTHLY") continue;
      for (const match of String(receipt.billingPeriod || "").matchAll(/Tháng\s+(0[1-9]|1[0-2])\/(\d{4})/g)) {
        keys.push(`${match[2]}-${match[1]}`);
      }
    }
    return keys;
  });
}

/**
 * Học viên đã bị tính học phí của `key` chưa — qua mốc đã thu, biên lai, hoặc
 * khoản phải thu còn hiệu lực của tháng đó. Khấu trừ buổi nghỉ GV của tháng
 * trước chỉ áp cho người đã bị tính phí tháng đó (không áp cho người mới vào).
 */
function studentBilledMonth(
  student: { id: string; code?: string; fullName?: string; tuitionPaidThrough?: Record<string, string> },
  classId: string,
  key: string,
  ledger: SepayLedger,
  receivables: SepayLedger["receivables"],
) {
  return memoized3(receivables, ledger, student, `sbm|${classId}|${key}`, () => studentBilledMonthImpl(student, classId, key, ledger, receivables));
}

function studentBilledMonthImpl(
  student: { id: string; code?: string; fullName?: string; tuitionPaidThrough?: Record<string, string> },
  classId: string,
  key: string,
  ledger: SepayLedger,
  receivables: SepayLedger["receivables"],
) {
  const through = [
    effectivePaidThrough(student, { id: classId }, student.tuitionPaidThrough?.[classId]),
    ...receiptMonthKeys(ledger, student.id, classId),
  ]
    .filter(validMonthKey)
    .sort()
    .at(-1);
  if (through && through >= key) return true;
  // Tháng chuyển lớp ở lớp đích được phiếu lớp cũ bao phủ — coi như đã bị tính
  // phí kỳ đó (khấu trừ buổi nghỉ GV của kỳ sau áp dụng bình thường).
  if (isTransferCoveredMonth(student, { id: classId }, key, ledger)) return true;
  return receivablesOfStudent(receivables, student.id).some((row) => {
    if (row.status === "CANCELLED") return false;
    const billKey = String(row.billKey || "");
    if (!billKey.endsWith(`|${classId}`) && !billKey.includes(`|${classId}|`)) return false;
    return (billKey.split("|")[2] || "").split(",").includes(key);
  });
}

/**
 * Lập báo giá thu học phí. Lớp tháng thu từ tháng kế tiếp sau mốc đã đóng
 * đến tháng hiện tại; biên lai cũ được dùng làm mốc dự phòng cho dữ liệu trước migration.
 */
export function tuitionCollectionCharge(
  student: {
    id: string;
    code?: string;
    fullName?: string;
    tuitionPaidThrough?: Record<string, string>;
    tuitionCredits?: Record<string, number | string | null>;
    classJoinedAt?: Record<string, string>;
  },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
  now = new Date(),
  courseIndexOverride?: number,
) {
  if (classBillingMode(cls) !== "MONTHLY") {
    // Mỗi khóa là một phiếu riêng. Không chỉ định khóa thì thu khóa cũ nhất
    // còn nợ trong số các khóa đã bắt đầu — không suy khóa từ số biên lai (một
    // phiếu trả làm hai lần chuyển khoản từng bị đếm thành hai khóa).
    const overriddenCourse = Math.round(Number(courseIndexOverride) || 0);
    const courseIndex = overriddenCourse > 0
      ? overriddenCourse
      : defaultCollectCourseIndex(student, cls, sessions, ledger, now);
    const fullRaw = classTuitionCharge(cls, sessions, monthKey(now), courseIndex);
    // Kỳ khóa đang chạy của học viên vừa chuyển lớp đến đã được phiếu lớp
    // nguồn bao phủ — lớp đích không lập phiếu riêng cho khóa này (tránh thu
    // kép), phần chênh lệch nằm trong phiếu "transfer|…" neo khóa kế tiếp.
    if (isTransferCoveredCourse(student, cls, courseIndex, sessions, ledger, now)) {
      return {
        ...fullRaw,
        mode: "COURSE" as const,
        originalBilled: 0,
        creditSessions: 0,
        billed: 0,
        oldDebtSessions: 0,
        oldDebtAmount: 0,
        transferAdjustment: 0,
        amount: 0,
        months: [] as string[],
        items: [] as Array<ReturnType<typeof classTuitionCharge> & { originalBilled: number; creditSessions: number; carryInSessions: number }>,
        carryInSessions: 0,
      };
    }
    // Học viên vào lớp từ buổi thứ N của khóa: phiếu tự trừ các buổi trước
    // ngày vào — chỉ thu các buổi của khóa kể từ ngày nhập học.
    const joinDate = studentClassJoinDate(student, cls.id);
    const joinBilled = joinDate ? billedCourseSessions(cls, sessions, courseIndex, now, joinDate) : fullRaw.billed;
    const raw = joinBilled === fullRaw.billed
      ? fullRaw
      : { ...fullRaw, billed: joinBilled, amount: joinBilled * classSessionPrice(cls) + fullRaw.materialsAmount };
    // Buổi GV cho nghỉ không chiếm suất của khóa — khóa đó đã tự kéo dài để học
    // bù nên khóa sau thu đủ số buổi, không còn cơ chế khấu trừ qua khóa.
    const storedCredit = Math.round(Number(student.tuitionCredits?.[cls.id]) || 0);
    const creditSessions = 0;
    const billed = raw.billed;
    // tuitionCredits âm = số buổi cũ đã học nhưng chưa thu tiền (nợ mang sang).
    // Phiếu kèm thêm dòng "Công nợ cũ" riêng, không gộp vào số buổi của khóa.
    // Nợ buổi cũ (dữ liệu nhập tay) chỉ gắn vào phiếu khóa đang học trở đi — các
    // phiếu khóa trước đã lập riêng, cộng vào đó nữa là nợ kép.
    const oldDebtSessions = courseIndex >= classCurrentCourseIndex(cls, now, sessions) ? Math.max(0, -storedCredit) : 0;
    // Khoản đang gửi ở Lớp chờ (phần đã học + nợ cũ) quay lại lớp khóa.
    const parkedCarry = parkedCarryAmount(student.id, cls.id, { courseIndex }, ledger);
    const oldDebtAmount = oldDebtSessions * classSessionPrice(cls) + parkedCarry;
    // Khoản chênh lệch chuyển lớp neo vào khóa này ("transfer|…|courseK") gộp
    // vào báo giá — âm = khấu trừ, dương = thu thêm.
    const transferAdjustment = transferAdjustmentForAnchor(student.id, cls.id, `course${courseIndex}`, ledger);
    return {
      ...raw,
      mode: "COURSE" as const,
      originalBilled: raw.billed,
      creditSessions,
      billed,
      oldDebtSessions,
      oldDebtAmount,
      transferAdjustment,
      // Buổi giáo viên cho nghỉ chỉ khấu trừ buổi học, không khấu trừ học liệu.
      amount: billed * classSessionPrice(cls) + raw.materialsAmount + oldDebtAmount + transferAdjustment,
      period: courseIndex > 1
        ? `Khóa kế tiếp ${classCourseSizeAt(cls, courseIndex)} buổi · Khóa ${courseIndex} · ${cls.name}`
        : raw.period,
      billKey: raw.billKey,
      months: [] as string[],
      items: [] as Array<ReturnType<typeof classTuitionCharge> & { originalBilled: number; creditSessions: number; carryInSessions: number }>,
      carryInSessions: 0,
    };
  }

  const currentMonth = monthKey(now);
  const stored = effectivePaidThrough(student, cls, student.tuitionPaidThrough?.[cls.id]);
  const receiptMonths = receiptMonthKeys(ledger, student.id, cls.id);
  const paidCandidates = [stored, ...receiptMonths].filter(validMonthKey).sort();
  const paidThrough = paidCandidates.at(-1);
  // Tháng cần thu = mọi tháng từ sau mốc đã đóng (hoặc từ tháng vào lớp khi
  // chưa đóng tháng nào) đến tháng hiện tại, gộp thêm các tháng đang có phiếu
  // mở — phiếu tự cộng công nợ cũ vào học phí tháng mới.
  const joinDate = studentClassJoinDate(student, cls.id);
  const joinMonth = joinDate?.slice(0, 7);
  const wanted = new Set<string>();
  let cursor = paidThrough
    ? nextMonthKey(paidThrough)
    : (joinMonth && joinMonth < currentMonth ? joinMonth : currentMonth);
  while (cursor <= currentMonth && wanted.size < 36) {
    wanted.add(cursor);
    cursor = nextMonthKey(cursor);
  }
  // Phiếu tháng đã thu một phần (trả góp / thu thiếu): phần còn thiếu là khoản
  // truy thu theo đúng phiếu đó (monthlyCarryReceivables) — không gộp lại tháng
  // đó vào báo giá mới với nguyên học phí (sẽ thu lại cả phần đã đóng).
  const partialMonths = new Set<string>();
  for (const row of receivablesOfStudent(ledger, student.id)) {
    if (row.status === "CANCELLED") continue;
    const billKey = String(row.billKey || "");
    const head = billKey.split("|")[0];
    if ((head !== "month" && head !== "months") || billKey.split("|")[1] !== cls.id) continue;
    if (row.amountPaid > 0) {
      if (row.balanceDue > 0) for (const key of (billKey.split("|")[2] || "").split(",")) if (validMonthKey(key)) partialMonths.add(key);
      continue;
    }
    // Phiếu một tháng ĐÃ QUA còn nợ (chưa đóng) đứng riêng thành NỢ CŨ — như phiếu khóa trước của
    // lớp khóa: không gộp vào phiếu tháng mới; phiếu báo tháng mới in kèm dòng nợ cũ (anh Vũ 28/10/2026).
    if (isPastMonthDebtBill(row, currentMonth)) {
      partialMonths.add(String(billKey.split("|")[2]));
      continue;
    }
    for (const key of (billKey.split("|")[2] || "").split(",")) {
      if (validMonthKey(key) && key <= currentMonth) wanted.add(key);
    }
  }
  for (const key of partialMonths) wanted.delete(key);
  // Tháng đã được dòng nợ cũ / xử lý riêng thay thế không gộp lại vào báo giá —
  // khoản của nó đã nằm trong oldDebtAmount (hoặc đã tính đã đóng), đếm lại sẽ
  // thành nợ kép. Che cả ba đường vào wanted: mốc đã đóng sớm, ngày vào lớp và
  // phiếu tháng cũ còn mở sót lại.
  for (const key of [...wanted]) {
    if (isSupersededDebtMonth(student, cls, key)) wanted.delete(key);
  }
  // Tháng chuyển lớp ở lớp đích đã được phiếu lớp cũ bao phủ (phần chênh nằm
  // trong phiếu transfer neo kỳ sau) — không lập phiếu riêng cho tháng đó.
  for (const key of [...wanted]) {
    if (isTransferCoveredMonth(student, cls, key, ledger)) wanted.delete(key);
  }
  const months = [...wanted].filter((key) => !joinMonth || key >= joinMonth).sort();
  // Số buổi dương còn lại sau một kỳ đã thu là tín dụng do giáo viên cho nghỉ.
  // Tín dụng được khấu trừ từ kỳ kế tiếp, không sửa lại học phí của tháng đã chốt.
  // Tín dụng của buổi GV nghỉ trong chính tháng 11/2026 không trừ vào phiếu T11 (hoãn sang T12).
  const deferredNovember = months.includes(NOV_2026) ? november2026DeferredOffSessions(cls, sessions) : 0;
  const storedCredit = paidThrough
    ? Math.max(0, Math.round(Number(student.tuitionCredits?.[cls.id]) || 0) - deferredNovember)
    : 0;
  // Khấu trừ ngầm: buổi GV cho nghỉ tháng trước còn nguyên nghỉ tới cuối tháng —
  // suy ra từ bản ghi buổi học để vá cả các ca cũ chưa được cấp tuitionCredits.
  // Chỉ áp cho học viên đã bị tính phí tháng đó (đã thu hoặc đã có phiếu).
  const implicitOf = months.map((key) => {
    const observed = studentBilledMonth(student, cls.id, prevMonthKey(key), ledger, ledger.receivables)
      ? teacherOffCreditSessions(cls, sessions, key)
      : 0;
    return Math.max(observed, t2OctoberMinimumCreditSessions(student, cls, key), t1OctoberMinimumCreditSessions(student, cls, key), t7OctoberMinimumCreditSessions(student, cls, key), t4OctoberMinimumCreditSessions(student, cls, key), t9OctoberMinimumCreditSessions(student, cls, key), t11OctoberMinimumCreditSessions(student, cls, key), t13OctoberMinimumCreditSessions(student, cls, key), t14OctoberMinimumCreditSessions(student, cls, key), t17OctoberMinimumCreditSessions(student, cls, key), t24OctoberMinimumCreditSessions(student, cls, key));
  });
  let pool = Math.max(storedCredit, implicitOf.reduce((sum, count) => sum + count, 0));
  // Ưu tiên trừ đúng kỳ có buổi nghỉ tháng trước; tín dụng lưu còn dư trừ từ kỳ sớm nhất.
  const raws = months.map((key) => classTuitionCharge(cls, sessions, key));
  // Tháng vào lớp lập phiếu ngay, chỉ tính các buổi từ ngày nhập học trở đi —
  // vào buổi cuối tháng thì phiếu đúng 1 buổi.
  const credits = raws.map((raw, index) => {
    const monthSessions = months[index] === joinMonth && joinDate
      ? billedMonthSessions(cls, sessions, months[index], joinDate)
      : raw.billed;
    const own = Math.min(implicitOf[index] || 0, pool, monthSessions);
    pool -= own;
    return { own, monthSessions };
  });
  const items = raws.map((raw, index) => {
    const monthSessions = credits[index].monthSessions;
    // Tín dụng lưu dư (ví dụ buổi nghỉ T10 vừa tick) chỉ được trừ từ tháng 11
    // trở đi — không để phiếu tháng 10 khấu trừ, tránh trừ kép với khấu trừ
    // ngầm của chính tháng sau.
    const extra = prevMonthKey(months[index]) >= TUITION_OFF_CREDIT_START_MONTH && months[index] < TUITION_STORED_CREDIT_END_MONTH
      ? Math.min(pool, monthSessions - credits[index].own)
      : 0;
    pool -= extra;
    const creditSessions = credits[index].own + extra;
    const billed = monthSessions - creditSessions;
    // Học liệu là khoản riêng nên không bị buổi khấu trừ làm giảm.
    return { ...raw, originalBilled: monthSessions, creditSessions, carryInSessions: 0, billed, amount: billed * classSessionPrice(cls) + raw.materialsAmount };
  });
  const billed = items.reduce((sum, row) => sum + row.billed, 0);
  const parkedCarry = parkedCarryAmount(student.id, cls.id, { months }, ledger);
  // Khoản phiếu đã ngắt lúc về Lớp chờ (phần đã học + nợ cũ) được đem vào phiếu
  // của kỳ quay lại — cùng dòng "Nợ cũ" trên phiếu báo. Nếu khoản mang sang vốn
  // là phiếu nợ cũ riêng thì vá nợ cũ không cộng thêm lần nữa.
  const regularOldDebt = hasOldDebtBill(ledger, student.id, cls.id)
    || parkedCarryCoversOldDebt(student.id, cls.id, { months }, ledger)
    ? 0
    : studentOldDebtAmount(student, cls, months);
  const oldDebtAmount = regularOldDebt + parkedCarry;
  // Khoản chênh lệch chuyển lớp neo vào các tháng đang lập phiếu (âm = khấu
  // trừ, dương = thu thêm) gộp thẳng vào báo giá — phiếu thường của kỳ neo
  // thu đúng số đã điều chỉnh, không phát hành phiếu riêng cho phụ huynh.
  const transferAdjustment = months.reduce(
    (sum, key) => sum + transferAdjustmentForAnchor(student.id, cls.id, key, ledger),
    0,
  );
  const amount = items.reduce((sum, row) => sum + row.amount, 0) + oldDebtAmount + transferAdjustment;
  return {
    mode: "MONTHLY" as const,
    billed,
    amount,
    period: items.length ? `${items.map((row) => row.period.split(" · ")[0]).join(" + ")} · ${cls.name}` : `Đã thu đến ${monthLabel(paidThrough || currentMonth)} · ${cls.name}`,
    billKey: months.length === 1 ? `month|${cls.id}|${months[0]}` : `months|${cls.id}|${months.join(",")}`,
    months,
    items,
    creditSessions: items.reduce((sum, row) => sum + row.creditSessions, 0),
    carryInSessions: items.reduce((sum, row) => sum + (row.carryInSessions || 0), 0),
    materialsAmount: items.reduce((sum, row) => sum + row.materialsAmount, 0),
    // Ngoại lệ dữ liệu production của T1/T2: các học viên được chỉ định có nợ cũ tháng trước.
    oldDebtSessions: 0,
    oldDebtAmount,
    oldDebtLabel: parkedCarry && !regularOldDebt ? "Nợ cũ từ Lớp chờ" : oldDebtAmount ? "Nợ cũ tháng trước" : "",
    transferAdjustment,
  };
}

/** Mã thanh toán theo format "HP" + mã lớp + mã học viên (vd HPS6HV0077) — phụ
 * huynh nhìn nội dung CK hiểu ngay lớp con, SePay vẫn trích được mã HPxxxxx. */
export { billPaymentCode, billPeriodTag } from "./sepay-engine";

export function studentTuitionPaymentCode(cls: { code?: string }, student: { code?: string }): string | undefined {
  const clsPart = String(cls?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stuPart = String(student?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clsPart && stuPart ? `HP${clsPart}${stuPart}` : undefined;
}

/** Tổng nợ cũ gắn vào các tháng đang lập phiếu — gộp các vá của từng lớp. */
export function studentOldDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  months: string[],
) {
  return memoized2(student, cls, `soda|${months.join(",")}`, () => studentOldDebtAmountImpl(student, cls, months));
}

function studentOldDebtAmountImpl(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  months: string[],
) {
  return t2PreviousMonthDebtAmount(student, cls, months)
    + t1PreviousMonthDebtAmount(student, cls, months)
    + t3PreviousMonthDebtAmount(student, cls, months)
    + t7PreviousMonthDebtAmount(student, cls, months)
    + t8PreviousMonthDebtAmount(student, cls, months)
    + t4PreviousMonthDebtAmount(student, cls, months)
    + t5PreviousMonthDebtAmount(student, cls, months)
    + t9PreviousMonthDebtAmount(student, cls, months)
    + t10PreviousMonthDebtAmount(student, cls, months)
    + t11PreviousMonthDebtAmount(student, cls, months)
    + t12PreviousMonthDebtAmount(student, cls, months)
    + t13PreviousMonthDebtAmount(student, cls, months)
    + t14PreviousMonthDebtAmount(student, cls, months)
    + t15PreviousMonthDebtAmount(student, cls, months)
    + t16PreviousMonthDebtAmount(student, cls, months)
    + t17PreviousMonthDebtAmount(student, cls, months)
    + t18PreviousMonthDebtAmount(student, cls, months)
    + t19PreviousMonthDebtAmount(student, cls, months)
    + t20PreviousMonthDebtAmount(student, cls, months)
    + t21PreviousMonthDebtAmount(student, cls, months)
    + t23PreviousMonthDebtAmount(student, cls, months)
    + t24PreviousMonthDebtAmount(student, cls, months)
    + thanhSenPreviousMonthDebtAmount(student, cls, months);
}

/** Tháng đã được dòng nợ cũ / ngoại lệ "đã đóng" thay thế — gộp các vá của từng lớp. */
function isSupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return memoized2(student, cls, `sdm|${month}`, () => isSupersededDebtMonthImpl(student, cls, month));
}

function isSupersededDebtMonthImpl(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return t2SupersededDebtMonth(student, cls, month)
    || t3SupersededDebtMonth(student, cls, month)
    || t12SupersededDebtMonth(student, cls, month)
    || t13SupersededDebtMonth(student, cls, month)
    || t14SupersededDebtMonth(student, cls, month)
    || t15SupersededDebtMonth(student, cls, month)
    || t16SupersededDebtMonth(student, cls, month)
    || t17SupersededDebtMonth(student, cls, month)
    || t18SupersededDebtMonth(student, cls, month)
    || t19SupersededDebtMonth(student, cls, month)
    || t20SupersededDebtMonth(student, cls, month)
    || t21SupersededDebtMonth(student, cls, month)
    || t22SupersededDebtMonth(student, cls, month)
    || t23SupersededDebtMonth(student, cls, month)
    || t24SupersededDebtMonth(student, cls, month)
    || t7SupersededDebtMonth(student, cls, month)
    || t11SupersededDebtMonth(student, cls, month)
    || thanhSenSupersededDebtMonth(student, cls, month);
}

/**
 * Đổi ngày nhập học khi phụ huynh ĐÃ ĐÓNG ĐỦ phiếu khóa theo ngày cũ: tiền đóng nhiều hơn học phí theo ngày
 * mới thì phần dư (làm tròn xuống theo giá buổi) thành tín dụng JOIN_DATE_EXCESS — tự trừ vào phiếu khóa kế
 * tiếp. Phần dư tách khỏi biên lai nguồn (không tính thành buổi đã đóng của khóa này) và khi áp vào phiếu khóa
 * sau thì tính thành buổi đã đóng của khóa đó, nên số buổi tồn không bị đếm trùng. Chỉ xử lý phiếu khóa
 * PAID đủ; đổi ngày sớm hơn (phải thu thêm) không tự mở lại phiếu đã đóng — để kế toán xử lý tay.
 */
export function creditCourseExcessForJoinChange(input: {
  ledger: SepayLedger;
  previousStudent: { id: string; classJoinedAt?: Record<string, string>; tuitionCredits?: Record<string, number | string | null>; code?: string; fullName?: string; tuitionPaidThrough?: Record<string, string> };
  student: { id: string; classJoinedAt?: Record<string, string>; tuitionCredits?: Record<string, number | string | null>; code?: string; fullName?: string; tuitionPaidThrough?: Record<string, string> };
  cls: DemoClass;
  sessions: DemoLessonSession[];
  now?: Date;
}): { ledger: SepayLedger; credited: Array<{ courseIndex: number; amount: number }> } {
  const { ledger, previousStudent, student, cls, sessions } = input;
  const now = input.now || new Date();
  const none = { ledger, credited: [] as Array<{ courseIndex: number; amount: number }> };
  if (classBillingMode(cls) !== "COURSE") return none;
  const oldJoin = studentClassJoinDate(previousStudent, cls.id);
  const newJoin = studentClassJoinDate(student, cls.id);
  if ((oldJoin || "") === (newJoin || "")) return none;
  const price = classSessionPrice(cls);
  if (!(price > 0)) return none;
  const courseSet = new Set<number>();
  for (const date of [oldJoin, newJoin]) if (date) courseSet.add(classCourseIndexOfDate(cls, date, sessions));
  const excessIndex = joinExcessIndex(ledger);
  const credits: SepayCredit[] = [];
  const credited: Array<{ courseIndex: number; amount: number }> = [];
  const touched = new Map<string, number>();
  for (const bill of receivablesOfStudent(ledger, student.id)) {
    if (bill.classId !== cls.id || bill.status !== "PAID" || Math.round(Number(bill.balanceDue) || 0) > 0) continue;
    if (String(bill.billKey || "").split("|")[0] !== COURSE_MATERIAL_KEY) continue;
    const index = courseIndexOfBillKey(bill.billKey);
    if (!courseSet.has(index)) continue;
    // Các khoản thu COMPLETED của phiếu này, mới nhất trước.
    const rows = ledger.payments
      .filter((payment) => payment.receivableId === bill.id && payment.status === "COMPLETED")
      .map((payment) => ({ payment, receipt: ledger.receipts.find((row) => row.paymentId === payment.id) }))
      .filter((row): row is { payment: SepayLedgerPayment; receipt: SepayReceipt } => Boolean(row.receipt))
      .sort((a, b) => String(b.payment.paidAt || "").localeCompare(String(a.payment.paidAt || "")));
    const net = (row: { payment: SepayLedgerPayment; receipt: SepayReceipt }) =>
      receiptTuitionAmount(row.receipt, (excessIndex.byPayment.get(row.payment.id) || 0) + (touched.get(row.payment.id) || 0));
    const paid = rows.reduce((sum, row) => sum + net(row), 0);
    const quote = tuitionCollectionCharge(student, cls, sessions, ledger, now, index);
    const required = Math.max(0, Math.round(Number(quote.amount) || 0) - Math.max(0, Math.round(Number((quote as { materialsAmount?: number }).materialsAmount) || 0)));
    let excess = Math.floor((paid - required) / price) * price;
    if (!(excess >= price)) continue;
    const total = excess;
    for (const row of rows) {
      if (excess <= 0) break;
      const take = Math.min(excess, net(row));
      if (take <= 0) continue;
      credits.push({
        id: `cred-${crypto.randomUUID()}`,
        studentId: student.id,
        sourcePaymentId: row.payment.id,
        amount: take,
        remainingAmount: take,
        reason: JOIN_EXCESS_CREDIT_REASON,
        status: "OPEN",
        createdAt: now.toISOString(),
      });
      touched.set(row.payment.id, (touched.get(row.payment.id) || 0) + take);
      excess -= take;
    }
    credited.push({ courseIndex: index, amount: total - Math.max(0, excess) });
  }
  if (!credits.length) return none;
  return { ledger: applyStudentCreditsToReceivables({ ...ledger, credits: [...credits, ...(ledger.credits || [])] }), credited };
}

/**
 * Đổi ngày nhập học của một học viên ở lớp thu theo khóa: phiếu khóa đã chốt (frozenAt, do
 * "Gửi yêu cầu thanh toán" hoặc rời lớp) mà CHƯA thu đồng nào phải được tính lại theo mốc mới,
 * nếu không số tiền giữ nguyên còn số buổi tồn đổi. Chỉ nhả chốt phiếu OPEN, amountPaid = 0,
 * billKey "course|…" của đúng (học viên, lớp) có đổi ngày — phiếu đã thu / một phần giữ nguyên
 * cho kế toán quyết định. Đồng bộ phiếu chạy ngay sau đó sẽ ghi lại amountDue theo mốc mới.
 */
export function unfreezeCourseReceivablesForJoinChange(
  ledger: SepayLedger,
  changes: Array<{ studentId: string; classId: string }>,
): { ledger: SepayLedger; unfrozen: number } {
  if (!changes.length) return { ledger, unfrozen: 0 };
  const keys = new Set(changes.map((item) => `${item.studentId}|${item.classId}`));
  let unfrozen = 0;
  const receivables = ledger.receivables.map((row) => {
    if (!row.frozenAt || row.status !== "OPEN" || Math.round(Number(row.amountPaid) || 0) > 0) return row;
    if (String(row.billKey || "").split("|")[0] !== "course") return row;
    if (!keys.has(`${row.studentId}|${row.classId}`)) return row;
    unfrozen += 1;
    const { frozenAt: _frozenAt, ...rest } = row;
    return rest as typeof row;
  });
  return unfrozen ? { ledger: { ...ledger, receivables }, unfrozen } : { ledger, unfrozen: 0 };
}

/**
 * Số buổi tính phí của tháng `month` mà học viên đã học trước khi rời lớp:
 * buổi trước ngày rời tính theo mốc còn đi học; buổi đúng ngày rời chỉ tính khi
 * đã lưu điểm danh (kể cả vắng — vắng vẫn trừ buổi như luật số dư). Buổi sau
 * ngày rời không tính.
 */
export function leftClassMonthConsumedSessions(
  student: { id: string; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  month: string,
  leaveDate: string,
) {
  const leaveDay = String(leaveDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDay)) return 0;
  const joinDate = studentClassJoinDate(student as DemoStudent, cls.id);
  let count = 0;
  for (const session of sessionsOfClass(sessions, cls.id)) {
    const date = String(session.date || "");
    if (!date.startsWith(month) || date > leaveDay) continue;
    if (!sessionChargesTuition(session) || !sessionWithinJoinRule(session, joinDate)) continue;
    if ((session.attendance || []).some((entry) => entry.studentId === student.id) || date < leaveDay) count += 1;
  }
  return count;
}

/**
 * Phiếu tháng đang chạy của học viên vừa rời lớp: giữ số đã xuất, trừ phần buổi
 * chưa học để chỉ còn thu buổi đã học. Chỉ đụng phiếu đúng học phí tháng (không
 * gộp nợ cũ / tín dụng) và chưa thu đồng nào — phiếu đã thu một phần để kế toán
 * quyết định tay.
 */
function prorateLeftClassBill(
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  row: SepayReceivable,
  iso: string,
): SepayReceivable {
  if (classBillingMode(cls) !== "MONTHLY" || row.leftClass) return row;
  if (!["DRAFT", "OPEN"].includes(String(row.status))) return row;
  if (Math.round(Number(row.amountPaid) || 0) > 0) return row;
  const parts = String(row.billKey || "").split("|");
  if (parts[0] !== "month") return row;
  const leaveDay = iso.slice(0, 10);
  const leaveMonth = leaveDay.slice(0, 7);
  const months = String(parts[2] || "").split(",").filter(validMonthKey);
  if (months.length !== 1 || months[0] !== leaveMonth) return row;
  const price = classSessionPrice(cls);
  const joinDate = studentClassJoinDate(student, cls.id);
  const billed = billedMonthSessions(cls, sessions, leaveMonth, joinDate);
  const materials = classMaterialFee(cls, leaveMonth).amount;
  const issued = Math.round(Number(row.amountDue) || 0);
  if (!billed || issued !== billed * price + materials) return row;
  const consumed = Math.min(billed, leftClassMonthConsumedSessions(student, cls, sessions, leaveMonth, leaveDay));
  const deductionSessions = billed - consumed;
  if (deductionSessions <= 0) return row;
  const deductionAmount = deductionSessions * price;
  const amountDue = Math.max(0, issued - deductionAmount);
  return {
    ...row,
    issuedAmount: issued,
    amountDue,
    balanceDue: Math.max(0, amountDue - Math.round(Number(row.amountPaid) || 0)),
    leftClass: {
      at: iso,
      billedSessions: billed,
      consumedSessions: consumed,
      deductionSessions,
      deductionAmount,
    },
  };
}

/**
 * Học viên rời lớp giữa kỳ mà đã học quá số buổi đã đóng (số dư âm): phiếu
 * của các kỳ đã tới là công nợ đã chốt — đóng băng để sync không hủy mồ côi;
 * doanh số ghi nhận phần giảm theo buổi thực học. Phiếu kỳ sau chưa tới vẫn
 * để sync hủy như thường. `cls` phải là bản ghi lớp TRƯỚC khi gỡ (còn học
 * viên trong studentIds) để đếm đúng buổi đã trừ phí.
 * Phiếu tháng đang chạy còn nguyên buổi chưa học được trừ ngay lúc rời lớp để
 * phiếu báo hiện đúng "đã xuất / khấu trừ / còn lại".
 */
export function freezeLeftClassReceivables(
  ledger: SepayLedger,
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  iso: string,
  now = new Date(),
): SepayLedger {
  const remaining = classBillingMode(cls) === "COURSE"
    ? courseRemainingSessions(student, cls, sessions, ledger, now)
    : monthlyRemainingSessions(student, cls, sessions, ledger, now);
  if (remaining >= 0) return ledger;
  const currentMonth = monthKey(now);
  const currentCourse = classCurrentCourseIndex(cls, now, sessions);
  const adjusted = new Map<string, number>();
  let changed = false;
  const receivables = ledger.receivables.map((row) => {
    if (row.studentId !== student.id || row.classId !== cls.id) return row;
    if (!row.frozenAt) {
      if (!["DRAFT", "OPEN"].includes(String(row.status))) return row;
      const parts = String(row.billKey || "").split("|");
      if (parts[0] === "month" || parts[0] === "months") {
        const months = String(parts[2] || "").split(",").filter(validMonthKey);
        if (!months.length || months.every((key) => key > currentMonth)) return row;
      } else if (parts[0] === "course") {
        if ((courseIndexOfBillKey(row.billKey) || 1) > currentCourse) return row;
      } else return row;
    }
    const prorated = prorateLeftClassBill(student, cls, sessions, row, iso);
    if (prorated !== row) {
      changed = true;
      adjusted.set(prorated.id, Math.round(Number(prorated.amountDue) || 0));
    }
    if (prorated.frozenAt) return prorated;
    changed = true;
    return { ...prorated, frozenAt: iso };
  });
  if (!changed) return ledger;
  const paymentOrders = adjusted.size
    ? ledger.paymentOrders.map((order) => {
      const amount = adjusted.get(order.receivableId);
      return amount === undefined || order.status !== "ACTIVE" ? order : refreshOrderQr(order, ledger.settings, amount);
    })
    : ledger.paymentOrders;
  return { ...ledger, receivables, paymentOrders };
}

/**
 * Học viên về Lớp chờ: ngắt phiếu công nợ còn mở (chưa đóng đồng nào thì hủy
 * luôn, đã đóng một phần thì hủy phần còn thiếu) và ghi lại khoản đã học của
 * tháng rời lớp + nợ cũ để cộng vào phiếu khi quay lại lớp. Phiếu đã đóng đủ
 * phần thực học được giữ nguyên, kế toán tự tạo phiếu chi hoàn phần chưa học
 * (trả về trong `refunds`) — doanh số của phiếu đó giảm theo buổi thực học.
 * Chỉ áp dụng lớp thu tháng; lớp khóa giữ luật đóng băng cũ.
 */
export function parkLeftClassReceivables(
  ledger: SepayLedger,
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  iso: string,
): {
  ledger: SepayLedger;
  refunds: Array<{ receivableId: string; amount: number; studentName: string; className: string; description: string; branchId?: string }>;
  carried: number;
} {
  if (classBillingMode(cls) !== "MONTHLY") return { ledger, refunds: [], carried: 0 };
  const leaveMonth = String(iso || "").slice(0, 7);
  if (!validMonthKey(leaveMonth)) return { ledger, refunds: [], carried: 0 };
  const price = classSessionPrice(cls);
  const joinDate = studentClassJoinDate(student, cls.id);
  const billed = billedMonthSessions(cls, sessions, leaveMonth, joinDate);
  const consumed = Math.min(billed, leftClassMonthConsumedSessions(student, cls, sessions, leaveMonth, String(iso).slice(0, 10)));
  const unusedSessions = Math.max(0, billed - consumed);
  const deductionAmount = unusedSessions * price;
  const refunds: Array<{ receivableId: string; amount: number; studentName: string; className: string; description: string; branchId?: string }> = [];
  const cancelled = new Set<string>();
  let carried = 0;
  const receivables = ledger.receivables.map((row) => {
    if (row.studentId !== student.id || row.classId !== cls.id) return row;
    if (!["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "OVERPAID"].includes(String(row.status))) return row;
    const original = Math.max(0, Math.round(Number(row.amountDue) || 0));
    const paid = Math.max(0, Math.round(Number(row.amountPaid) || 0));
    const parts = String(row.billKey || "").split("|");
    const head = parts[0];
    const leaveMonthKey = head === "olddebt";
    const keys = head === "month" || head === "months"
      ? (parts[2] || "").split(",").filter(validMonthKey)
      : [];
    if (!leaveMonthKey && !keys.length) return row;
    const leaveMonthRow = keys.includes(leaveMonth);
    // Phiếu đã đóng chỉ xử lý đúng phiếu của tháng rời lớp — phiếu tháng sau
    // đã trả trước để nguyên cho luật bảo lưu tín dụng hiện có.
    if (["PAID", "OVERPAID"].includes(String(row.status)) && !leaveMonthRow) return row;
    const dueKeys = keys.filter((key) => key <= leaveMonth);
    const futureKeys = keys.filter((key) => key > leaveMonth);
    let owed = original;
    if (head === "month" || head === "months") {
      if (!dueKeys.length) owed = 0;
      else if (futureKeys.length) {
        // Phiếu gộp cả tháng chưa tới: bỏ phần doanh số của các tháng sau khi rời.
        const weights = keys.map((key) => Math.max(1, billedMonthSessions(cls, sessions, key)));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        const futureWeight = keys.reduce((sum, key, index) => sum + (key > leaveMonth ? weights[index] : 0), 0);
        owed = Math.round(original * (total - futureWeight) / total);
      }
      // Tháng rời lớp chỉ còn tiền các buổi đã học — phần chưa học không thu.
      if (keys.includes(leaveMonth)) owed = Math.max(0, owed - deductionAmount);
    }
    owed = Math.max(0, Math.min(original, owed));
    // Phiếu của tháng chưa tới (chưa đóng đồng nào) không còn gì phải thu —
    // hủy luôn, không mang sang.
    if (owed <= 0 && paid <= 0) {
      cancelled.add(row.id);
      return { ...row, amountDue: 0, balanceDue: 0, status: "CANCELLED" as const };
    }
    const leftClass: NonNullable<SepayReceivable["leftClass"]> = {
      at: iso,
      billedSessions: leaveMonthRow ? billed : 0,
      consumedSessions: leaveMonthRow ? consumed : 0,
      deductionSessions: leaveMonthRow ? unusedSessions : 0,
      deductionAmount: leaveMonthRow ? deductionAmount : 0,
    };
    if (paid >= owed) {
      // Đã đóng đủ phần thực học: giữ phiếu, hoàn lại phần chưa học.
      const refund = Math.max(0, paid - owed);
      const base = Math.min(paid, original);
      const reduction = Math.max(0, base - owed);
      if (!reduction && !refund) return row;
      leftClass.revenue = { billed, consumed, actual: owed, reduction };
      if (refund) {
        refunds.push({
          receivableId: row.id,
          amount: refund,
          studentName: student.fullName,
          className: cls.name || cls.code || cls.id,
          description: `Hoàn học phí ${unusedSessions} buổi chưa học — ${cls.name || cls.code || cls.id}`,
          ...(cls.branchId ? { branchId: cls.branchId } : {}),
        });
        leftClass.refundAmount = refund;
        leftClass.refundedAt = iso;
      }
      // Phiếu đóng thiếu nhưng đã đủ phần thực học — số còn lại không còn là nợ.
      const settled = paid < original
        ? { amountDue: owed, balanceDue: 0, status: "PAID" as const }
        : {};
      return { ...row, ...settled, leftClass };
    }
    // Còn nợ phần đã học (hoặc nợ cũ): ngắt phiếu và mang khoản sang lớp sau.
    const carry = Math.max(0, owed - paid);
    carried += carry;
    if (carry) leftClass.carryAmount = carry;
    cancelled.add(row.id);
    return {
      ...row,
      ...(carry ? { issuedAmount: Math.max(original, Math.round(Number(row.issuedAmount) || 0)) } : {}),
      amountDue: owed,
      balanceDue: 0,
      status: "CANCELLED" as const,
      ...(carry || leftClass.deductionSessions || leftClass.revenue ? { leftClass } : {}),
    };
  });
  if (!cancelled.size && !refunds.length) return { ledger, refunds: [], carried: 0 };
  const paymentOrders = cancelled.size
    ? ledger.paymentOrders.map((order) => (
      cancelled.has(order.receivableId) && order.status === "ACTIVE"
        ? { ...order, status: "CANCELLED" as const }
        : order
    ))
    : ledger.paymentOrders;
  return { ledger: { ...ledger, receivables, paymentOrders }, refunds, carried };
}

/**
 * Gắn khoản đang "gửi" của học viên đang ở Lớp chờ vào phiếu của lớp đích kỳ
 * hiện tại (tháng hoặc khóa). Chỉ gắn một lần — sau đó khoản nằm trong báo giá
 * của kỳ đó nên không cần đánh dấu lại.
 */
export function attachParkedCarry(
  ledger: SepayLedger,
  pairs: Array<{ studentId: string; classId: string; month?: string; courseIndex?: number }>,
): { ledger: SepayLedger; attached: number } {
  if (!pairs.length) return { ledger, attached: 0 };
  const byStudent = new Map(pairs.map((pair) => [pair.studentId, pair]));
  let attached = 0;
  const receivables = ledger.receivables.map((row) => {
    if (!row.leftClass?.carryAmount || row.leftClass.carryTarget) return row;
    const pair = byStudent.get(row.studentId);
    if (!pair) return row;
    attached += 1;
    return {
      ...row,
      leftClass: {
        ...row.leftClass,
        carryTarget: {
          classId: pair.classId,
          ...(pair.month ? { month: pair.month } : {}),
          ...(pair.courseIndex ? { courseIndex: pair.courseIndex } : {}),
        },
      },
    };
  });
  return attached ? { ledger: { ...ledger, receivables }, attached } : { ledger, attached: 0 };
}

/** Các phiếu đã ngắt lúc về Lớp chờ, có khoản mang sang gắn vào kỳ của lớp này. */
function parkedCarryRows(
  studentId: string | undefined,
  classId: string | undefined,
  target: { months?: string[]; courseIndex?: number },
  ledger?: Pick<SepayLedger, "receivables"> | null,
): SepayReceivable[] {
  if (!studentId || !classId || !ledger) return [];
  return receivablesOfStudent(ledger.receivables, studentId).filter((row) => {
    const left = row.leftClass;
    if (!left?.carryAmount || left.carryTarget?.classId !== classId) return false;
    if (target.courseIndex) return left.carryTarget.courseIndex === target.courseIndex;
    return Boolean(target.months?.includes(left.carryTarget.month || ""));
  });
}

/** Khoản nợ cũ đang gửi ở Lớp chờ đã gắn vào kỳ (tháng/khóa) của lớp này. */
export function parkedCarryAmount(
  studentId: string | undefined,
  classId: string | undefined,
  target: { months?: string[]; courseIndex?: number },
  ledger?: Pick<SepayLedger, "receivables"> | null,
) {
  return parkedCarryRows(studentId, classId, target, ledger)
    .reduce((sum, row) => sum + Math.round(Number(row.leftClass?.carryAmount) || 0), 0);
}

/**
 * Khoản mang sang đã bao gồm phiếu nợ cũ riêng ("olddebt|…") của lớp: vá nợ cũ
 * không được cộng thêm lần nữa khi quay lại lớp.
 */
export function parkedCarryCoversOldDebt(
  studentId: string | undefined,
  classId: string | undefined,
  target: { months?: string[]; courseIndex?: number },
  ledger?: Pick<SepayLedger, "receivables"> | null,
) {
  return parkedCarryRows(studentId, classId, target, ledger).some((row) => isOldDebtBillKey(row.billKey));
}

/**
 * Học viên quay lại đúng lớp trong tháng đã rời: trả phiếu về số đã xuất để thu
 * đủ tháng như các bạn. Chỉ áp phiếu chưa thu đồng nào; phiếu đã thu một phần
 * giữ nguyên phần khấu trừ đã chốt.
 */
export function restoreLeftClassReceivables(
  ledger: SepayLedger,
  changes: Array<{ studentId: string; classId: string }>,
  now = new Date(),
): { ledger: SepayLedger; restored: number } {
  if (!changes.length) return { ledger, restored: 0 };
  const keys = new Set(changes.map((item) => `${item.studentId}|${item.classId}`));
  const currentMonth = monthKey(now);
  const adjusted = new Map<string, number>();
  let restored = 0;
  const receivables = ledger.receivables.map((row) => {
    if (!row.leftClass || !keys.has(`${row.studentId}|${row.classId}`)) return row;
    if (!["DRAFT", "OPEN"].includes(String(row.status)) || Math.round(Number(row.amountPaid) || 0) > 0) return row;
    const months = String(row.billKey || "").split("|")[2]?.split(",").filter(validMonthKey) || [];
    if (!months.includes(currentMonth) || !months.includes(String(row.leftClass.at || "").slice(0, 7))) return row;
    const issued = Math.round(Number(row.issuedAmount) || 0);
    if (issued <= Math.round(Number(row.amountDue) || 0)) return row;
    restored += 1;
    adjusted.set(row.id, issued);
    // Bỏ cả frozenAt: phiếu đã chốt theo số khấu trừ lúc nghỉ, quay lại lớp thì
    // số tiền đổi về đủ tháng — giữ chốt cũ sẽ khoá đồng bộ ở số sai.
    const { leftClass: _leftClass, issuedAmount: _issued, frozenAt: _frozenAt, ...rest } = row;
    return { ...rest, amountDue: issued, balanceDue: issued } as SepayReceivable;
  });
  if (!restored) return { ledger, restored: 0 };
  const paymentOrders = ledger.paymentOrders.map((order) => {
    const amount = adjusted.get(order.receivableId);
    return amount === undefined || order.status !== "ACTIVE" ? order : refreshOrderQr(order, ledger.settings, amount);
  });
  return { ledger: { ...ledger, receivables, paymentOrders }, restored };
}

const PRESERVED_WAITING_CLASS_ID = "class-waiting";
const PRESERVED_WAITING_CLASS_NAME = "Lớp chờ";
const PRESERVED_CREDIT_REASON = "PRESERVED";
const preservedCreditId = (studentId: string, classId: string) => `cred-preserved-${studentId}-${classId}`;

/**
 * Số buổi "thực học" của học viên trước khi rời lớp — mirror invoiceRowConsumption
 * của app.js (báo cáo giảm doanh số): buổi đã lưu điểm danh có tên học viên (kể cả
 * vắng) tính đã học; buổi chưa lưu điểm danh tính theo mốc còn đi học
 * (ngày vào lớp → trước ngày về Lớp chờ).
 */
export function leftClassConsumedSessions(
  student: { id: string; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now = new Date(),
) {
  return memoized3(sessions, cls, student, `lcc|${dateKeyOf(now)}`, () => leftClassConsumedSessionsImpl(student, cls, sessions, now));
}

function leftClassConsumedSessionsImpl(
  student: { id: string; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now: Date,
) {
  const joinDate = studentClassJoinDate(student as DemoStudent, cls.id);
  const leaveDate = studentClassJoinDate(student as DemoStudent, PRESERVED_WAITING_CLASS_ID);
  const enrolledOn = (date: string) => (!joinDate || date >= joinDate) && (!leaveDate || date < leaveDate);
  const isCourse = classBillingMode(cls) === "COURSE";
  const taught = (session: DemoLessonSession) => {
    if (!sessionChargesTuition(session)) return false;
    if (isCourse && isCourseSlotSkippingSession(session)) return false;
    if ((session.attendance || []).some((entry) => entry.studentId === student.id)) return true;
    return enrolledOn(String(session.date || ""));
  };
  const today = dateKeyOf(now);
  const elapsed = monthlyElapsedSessions(cls, sessions, now);
  const seen = new Set<string>();
  let count = 0;
  for (const session of elapsed) {
    seen.add(sessionIdentity(session));
    if (taught(session)) count += 1;
  }
  for (const session of sessionsOfClass(sessions, cls.id)) {
    if (String(session.date || "") < SESSION_BALANCE_EPOCH) continue;
    if (seen.has(sessionIdentity(session)) || String(session.date || "") >= today) continue;
    if (taught(session)) count += 1;
  }
  return count;
}

/**
 * Tiền bảo lưu của học viên ở lớp đã rời = tiền đã đóng cho lớp đó trừ giá trị
 * thực học (buổi thực học × đơn giá) trừ tiền học liệu của các kỳ đã thu trong
 * khoảng còn đi học. Âm → 0 (không bảo lưu được phần chưa thu).
 */
function preservedCreditAmount(
  student: { id: string; classJoinedAt?: Record<string, string>; tuitionPaidThrough?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
  entry: { amount: number; courseIndexes: Set<number> },
  now: Date,
) {
  const price = classSessionPrice(cls);
  const consumed = leftClassConsumedSessions(student as DemoStudent, cls, sessions, now) * price;
  let materials = 0;
  if (classBillingMode(cls) === "COURSE") {
    for (const index of entry.courseIndexes) materials += courseMaterialFee(cls, index).amount;
  } else {
    const joinMonth = studentClassJoinDate(student as DemoStudent, cls.id)?.slice(0, 7);
    const leaveMonth = studentClassJoinDate(student as DemoStudent, PRESERVED_WAITING_CLASS_ID)?.slice(0, 7);
    for (const key of paidSessionMonths(student as DemoStudent, cls, ledger)) {
      if (joinMonth && key < joinMonth) continue;
      if (leaveMonth && key > leaveMonth) continue;
      materials += classMaterialFee(cls, key).amount;
    }
  }
  return Math.max(0, entry.amount - consumed - materials);
}

/**
 * Đồng bộ khoản bảo lưu học phí của học viên đã rời lớp (đang ở Lớp chờ / lớp
 * khác): tiền đã đóng dư so với buổi thực học → credit PRESERVED gắn học viên,
 * id `cred-preserved-<hv>-<lớp>` nên lặp đồng bộ không nhân đôi. Credit lớp
 * nguồn nằm trong luồng chuyển lớp (phiếu transfer|…) bị bỏ qua — chênh lệch ở
 * đó đã do phiếu điều chỉnh lo. Học viên quay lại đúng lớp nguồn → credit mất
 * đích → xóa nếu chưa dùng, kẹp phần đã dùng nếu đã áp một phần.
 */
export function syncPreservedCredits(
  ledger: SepayLedger,
  classes: DemoClass[],
  students: Array<{ id: string; classJoinedAt?: Record<string, string>; tuitionPaidThrough?: Record<string, string> }>,
  sessions: DemoLessonSession[],
  now = new Date(),
): SepayLedger {
  const paidByPair = new Map<string, { amount: number; courseIndexes: Set<number> }>();
  const paymentById = new Map((ledger.payments || []).map((row) => [row.id, row]));
  const receivableById = new Map((ledger.receivables || []).map((row) => [row.id, row]));
  for (const receipt of ledger.receipts || []) {
    const classId = receiptClassId(receipt, ledger);
    if (!classId) continue;
    const key = `${receipt.studentId}|${classId}`;
    const entry = paidByPair.get(key) || { amount: 0, courseIndexes: new Set<number>() };
    entry.amount += Math.max(0, Math.round(Number(receipt.amount) || 0));
    if ((receipt.billingMode || "") === "COURSE") {
      const payment = paymentById.get(receipt.paymentId);
      entry.courseIndexes.add(courseIndexOfBillKey(payment ? receivableById.get(payment.receivableId)?.billKey : undefined));
    }
    paidByPair.set(key, entry);
  }
  const roster = new Map<string, Set<string>>();
  for (const cls of classes) roster.set(cls.id, new Set(cls.studentIds || []));
  // Cặp đã tất toán lúc về Lớp chờ (ngắt công nợ mang sang / hoàn tiền phần chưa
  // học) không tạo thêm bảo lưu — nếu không tiền vừa hoàn vừa thành tín dụng.
  const settledPairs = new Set<string>();
  for (const row of ledger.receivables || []) {
    const left = row.leftClass;
    if (left?.carryAmount || left?.refundAmount || left?.revenue) settledPairs.add(`${row.studentId}|${row.classId}`);
  }
  const transferSources = new Set<string>();
  for (const row of ledger.receivables || []) {
    const parts = String(row.billKey || "").split("|");
    if (parts[0] === "transfer" && parts[2]) transferSources.add(`${row.studentId}|${parts[2]}`);
  }
  const desired = new Map<string, { studentId: string; classId: string; amount: number }>();
  for (const [key, entry] of paidByPair) {
    if (settledPairs.has(key)) continue;
    const [studentId, classId] = key.split("|");
    if (roster.get(classId)?.has(studentId) || transferSources.has(key)) continue;
    const cls = classes.find((row) => row.id === classId);
    const student = students.find((row) => row.id === studentId);
    if (!cls || !student || !cls.branchId || String(cls.name || "").trim() === PRESERVED_WAITING_CLASS_NAME) continue;
    const amount = preservedCreditAmount(student, cls, sessions, ledger, entry, now);
    if (amount > 0) desired.set(preservedCreditId(studentId, classId), { studentId, classId, amount });
  }
  const appliedByCredit = new Map<string, number>();
  for (const row of ledger.receivables || []) {
    if (row.status === "CANCELLED") continue;
    for (const item of row.appliedCredits || []) {
      appliedByCredit.set(item.creditId, (appliedByCredit.get(item.creditId) || 0) + (Math.round(Number(item.amount)) || 0));
    }
  }
  let changed = false;
  const credits = (ledger.credits || []).map((row) => {
    if (row.reason !== PRESERVED_CREDIT_REASON) return row;
    if (desired.has(row.id)) {
      const { amount, classId } = desired.get(row.id)!;
      // Bảo lưu cũ chưa lưu lớp nguồn (trước khi có cột sourceClassId) → bổ sung để
      // không tự áp ngược vào chính lớp đã rời.
      if (Math.round(Number(row.amount) || 0) === amount && row.sourceClassId === classId) return row;
      changed = true;
      return { ...row, amount, sourceClassId: classId };
    }
    // Không còn đích bảo lưu (học viên quay lại lớp nguồn / số đã đóng không
    // còn dư) → thu hồi phần chưa dùng; phần đã áp giữ nguyên làm bằng chứng.
    const applied = appliedByCredit.get(row.id) || 0;
    if (applied <= 0) { changed = true; return null; }
    changed = true;
    return { ...row, amount: Math.min(Math.round(Number(row.amount) || 0), applied) };
  }).filter(Boolean) as SepayLedger["credits"];
  for (const [id, item] of desired) {
    if (credits.some((row) => row.id === id)) continue;
    changed = true;
    credits.push({
      id,
      studentId: item.studentId,
      sourcePaymentId: `preserved:${item.classId}`,
      amount: item.amount,
      remainingAmount: item.amount,
      reason: PRESERVED_CREDIT_REASON,
      status: "OPEN",
      createdAt: now.toISOString(),
      sourceClassId: item.classId,
    });
  }
  return changed ? { ...ledger, credits } : ledger;
}

export function syncTuitionReceivables(
  ledger: SepayLedger,
  classes: DemoClass[],
  students: Array<{ id: string; code?: string; fullName: string; tuitionExempt?: boolean; tuitionPaidThrough?: Record<string, string>; tuitionCredits?: Record<string, number | string | null>; classJoinedAt?: Record<string, string> }>,
  sessions: DemoLessonSession[],
  now = new Date(),
): SepayLedger {
  ledger = syncPreservedCredits(ledger, classes, students, sessions, now);
  const byStudent = new Map(students.map((row) => [row.id, row]));
  const usedCodes = ledger.paymentOrders.map((item) => item.paymentCode);
  const exemptStudentIds = new Set(students.filter((row) => row.tuitionExempt).map((row) => row.id));
  const cancelledReceivableIds = new Set<string>();
  let receivables = ledger.receivables.map((row) => {
    if (!exemptStudentIds.has(row.studentId) || row.amountPaid > 0 || !["DRAFT", "OPEN"].includes(row.status)) return row;
    cancelledReceivableIds.add(row.id);
    return { ...row, balanceDue: 0, status: "CANCELLED" as const };
  });
  let paymentOrders = ledger.paymentOrders.map((row) => (
    cancelledReceivableIds.has(row.receivableId) && row.status === "ACTIVE"
      ? { ...row, status: "CANCELLED" as const }
      : row
  ));

  // Phiếu "mồ côi": học viên đã bị gỡ khỏi lớp nhưng phiếu chưa gửi còn sót —
  // hủy để danh sách phải thu khớp danh sách lớp thật. Phiếu đã gửi yêu cầu
  // (frozenAt) hoặc đã thu một phần giữ nguyên để kế toán quyết định.
  const knownClassIds = new Set(classes.map((row) => row.id));
  const rosterPairs = new Set<string>();
  for (const cls of classes) {
    for (const studentId of cls.studentIds || []) rosterPairs.add(`${cls.id}|${studentId}`);
  }
  const orphanIds = new Set<string>();
  receivables = receivables.map((row) => {
    if (!["DRAFT", "OPEN"].includes(row.status) || row.amountPaid > 0 || row.frozenAt) return row;
    const classId = String(row.classId || "");
    if (!classId || !knownClassIds.has(classId)) return row;
    if (rosterPairs.has(`${classId}|${row.studentId}`)) return row;
    orphanIds.add(row.id);
    return { ...row, balanceDue: 0, status: "CANCELLED" as const };
  });
  if (orphanIds.size) {
    paymentOrders = paymentOrders.map((order) => (
      orphanIds.has(order.receivableId) && order.status === "ACTIVE"
        ? { ...order, status: "CANCELLED" as const }
        : order
    ));
  }

  // Vị trí dòng phiếu/lệnh QR theo học viên/id — vòng lặp chỉ duyệt đúng các
  // dòng của học viên đang xét thay vì quét lại toàn bộ sổ mỗi lượt. Dựng lại
  // khi mảng bị đổi độ dài (prepend phiếu mới); thay thế tại chỗ giữ nguyên.
  const noReceivables: SepayLedger["receivables"] = [];
  const receivablePositions = new Map<string, number[]>();
  const indexReceivables = () => {
    receivablePositions.clear();
    for (let index = 0; index < receivables.length; index += 1) {
      const studentId = receivables[index].studentId;
      const list = receivablePositions.get(studentId) || [];
      list.push(index);
      receivablePositions.set(studentId, list);
    }
  };
  indexReceivables();
  const studentRows = (studentId: string) => {
    const rows: SepayReceivable[] = [];
    for (const index of receivablePositions.get(studentId) || []) rows.push(receivables[index]);
    return rows;
  };
  const orderIndexById = new Map<string, number>();
  const orderIndexesByReceivable = new Map<string, number[]>();
  const indexPaymentOrders = () => {
    orderIndexById.clear();
    orderIndexesByReceivable.clear();
    for (let index = 0; index < paymentOrders.length; index += 1) {
      const order = paymentOrders[index];
      orderIndexById.set(order.id, index);
      const list = orderIndexesByReceivable.get(order.receivableId) || [];
      list.push(index);
      orderIndexesByReceivable.set(order.receivableId, list);
    }
  };
  indexPaymentOrders();
  const updateOrder = (orderId: string | undefined, update: (order: SepayLedger["paymentOrders"][number]) => SepayLedger["paymentOrders"][number]) => {
    if (!orderId) return;
    const index = orderIndexById.get(orderId);
    if (index !== undefined) paymentOrders[index] = update(paymentOrders[index]);
  };
  const cancelOrdersOf = (receivableId: string) => {
    for (const index of orderIndexesByReceivable.get(receivableId) || []) {
      if (paymentOrders[index].status === "ACTIVE") paymentOrders[index] = { ...paymentOrders[index], status: "CANCELLED" as const };
    }
  };

  /**
   * Lớp thu khóa: mỗi khóa đã bắt đầu là một phiếu riêng. Qua ngày sau buổi cuối
   * khóa cũ, khóa mới tự phát sinh phiếu cho cả lớp; khóa chưa bắt đầu không
   * lập phiếu. Khóa có từ trước khi dùng hệ thống mà học viên không có phiếu nào
   * được coi như đã thu. Phiếu đã gửi yêu cầu / đã thu giữ nguyên.
   */
  const syncStudentCourseReceivables = (
    cls: DemoClass,
    student: (typeof students)[number],
    studentId: string,
  ) => {
    const current = classCurrentCourseIndex(cls, now, sessions);
    // Khóa đang chạy của học viên vừa chuyển lớp đến được phiếu lớp nguồn bao
    // phủ: hủy phiếu khóa của lớp đích lỡ lập trước khi vá (thu kép).
    if (isTransferCoveredCourse(student, cls, current, sessions, ledger, now)) {
      const stale = new Set<string>();
      for (const index of receivablePositions.get(studentId) || []) {
        const row = receivables[index];
        if (row.classId !== cls.id || row.status !== "OPEN" || row.amountPaid > 0 || row.frozenAt) continue;
        if (String(row.billKey || "").split("|")[0] !== COURSE_MATERIAL_KEY) continue;
        if (courseIndexOfBillKey(row.billKey) !== current) continue;
        stale.add(row.id);
        receivables[index] = { ...row, balanceDue: 0, status: "CANCELLED" as const };
      }
      for (const receivableId of stale) cancelOrdersOf(receivableId);
    }
    const first = studentFirstCourseIndex(student, cls, sessions);
    for (let courseIndex = first; courseIndex <= current; courseIndex += 1) {
      const rowsOfCourse = studentRows(studentId).filter((row) => (
        row.status !== "CANCELLED"
        && row.classId === cls.id
        && String(row.billKey || "").split("|")[0] === COURSE_MATERIAL_KEY
        && courseIndexOfBillKey(row.billKey) === courseIndex
      ));
      if (!rowsOfCourse.length) {
        const start = courseStartForGolive(cls, sessions, courseIndex, now);
        if (start && start < COURSE_BILLING_GOLIVE) continue;
      }
      const charge = tuitionCollectionCharge(student, cls, sessions, ledger, now, courseIndex);
      const existing = rowsOfCourse[0];
      if (!existing) {
        if (charge.amount <= 0) continue;
        const friendlyCode = billPaymentCode(cls, student, charge.billKey);
        const codeTaken = Boolean(friendlyCode)
          && paymentOrders.some((row) => row.paymentCode === friendlyCode && row.status === "ACTIVE");
        const created = createReceivable({
          studentId,
          studentName: student.fullName,
          billingPeriod: charge.period,
          amountDue: charge.amount,
          usedCodes,
          paymentCode: codeTaken ? undefined : friendlyCode,
          now: now.toISOString(),
        });
        created.receivable.classId = cls.id;
        created.receivable.billKey = charge.billKey;
        usedCodes.push(created.order.paymentCode);
        receivables = [created.receivable, ...receivables];
        paymentOrders = [{ ...refreshOrderQr(created.order, ledger.settings, charge.amount) }, ...paymentOrders];
        indexReceivables();
        indexPaymentOrders();
        continue;
      }
      // Phiếu đã gửi yêu cầu / đã thu (một phần) giữ nguyên số tiền đã chốt.
      if (existing.status !== "OPEN" || existing.frozenAt || existing.amountPaid > 0) continue;
      const position = (receivablePositions.get(studentId) || []).find((index) => receivables[index].id === existing.id);
      if (position === undefined) continue;
      if (charge.amount <= 0) {
        receivables[position] = { ...existing, balanceDue: 0, status: "CANCELLED" as const };
        cancelOrdersOf(existing.id);
        continue;
      }
      if (existing.amountDue === charge.amount && existing.billingPeriod === charge.period) continue;
      receivables[position] = {
        ...existing,
        studentName: student.fullName,
        billingPeriod: charge.period,
        amountDue: charge.amount,
        balanceDue: charge.amount,
        appliedCredits: [],
      };
      updateOrder(existing.paymentOrderId, (order) => ({ ...refreshOrderQr(order, ledger.settings, charge.amount), status: "ACTIVE" as const }));
    }
  };

  for (const cls of classes) {
    if (cls.billingEnabled === false) continue;
    if (!classSessionPrice(cls)) continue;
    for (const studentId of cls.studentIds || []) {
      const student = byStudent.get(studentId);
      if (!student || student.tuitionExempt) continue;
      if (classBillingMode(cls) === "COURSE") {
        syncStudentCourseReceivables(cls, student, studentId);
        continue;
      }
      // Báo giá của chính học viên: lớp khóa biết khóa đang cần thu (khóa 2 trở
      // đi), lớp tháng gộp cả các tháng chưa đóng — phiếu tự cộng công nợ cũ
      // vào học phí tháng mới, và tháng vào lớp prorate theo ngày vào.
      const charge = tuitionCollectionCharge(student, cls, sessions, ledger, now);
      const amount = charge.amount;
      const chargeMonths = new Set(charge.months || []);
      // Lớp tháng: phiếu tháng sau tự lập sẵn trong tháng hiện tại — kế toán/phụ
      // huynh xem và tải phiếu kỳ tới ngay mà không cần bấm "Gửi yêu cầu thanh
      // toán". Sang tháng sau phiếu lẻ này nhập vào phiếu gộp công nợ (khối hủy
      // bên dưới) hoặc giữ riêng nếu tháng trước đã có phiếu chốt. Lớp khóa
      // không áp — phiếu khóa kế tiếp đã tự lập qua báo giá ở trên.
      if (charge.mode === "MONTHLY") {
        const nextKey = nextMonthKey(monthKey(now));
        const joinDate = studentClassJoinDate(student, cls.id);
        const joinMonth = joinDate?.slice(0, 7);
        const nextBillKey = `month|${cls.id}|${nextKey}`;
        const nextPeriod = `${monthLabel(nextKey)} · ${cls.name}`;
        const studentBillRows = studentRows(studentId);
        const standalone = studentBillRows.find((row) => row.billKey === nextBillKey && row.status !== "CANCELLED");
        const covered = studentBillRows.find((row) => row.status !== "CANCELLED"
          && ["month", "months"].includes(String(row.billKey || "").split("|")[0])
          && String(row.billKey || "").split("|")[1] === cls.id
          && (String(row.billKey || "").split("|")[2] || "").split(",").includes(nextKey));
        // Không lập phiếu tháng sau khi: học viên vào lớp sau tháng đó, đã thu
        // (mốc/biên lai) tới tháng đó, hoặc tháng đó được dòng nợ riêng thay thế.
        const skipNext = Boolean(joinMonth && joinMonth > nextKey)
          || studentBilledMonth(student, cls.id, nextKey, ledger, noReceivables)
          || isSupersededDebtMonth(student, cls, nextKey);
        const billedNext = skipNext ? 0
          : billedMonthSessions(cls, sessions, nextKey, joinMonth === nextKey ? joinDate : undefined);
        // Buổi GV nghỉ tháng hiện tại chỉ khấu trừ trên phiếu tháng sau cho học
        // viên đã bị tính phí tháng này (đã thu, đã có phiếu, hoặc sắp lập phiếu
        // trong lần sync này) — và chỉ tính buổi nghỉ sau ngày vào lớp.
        const billedCurrent = joinMonth !== nextKey
          && (chargeMonths.has(monthKey(now))
            || studentBilledMonth(student, cls.id, monthKey(now), ledger, ledger.receivables));
        const offCreditNext = Math.min(billedNext,
          billedCurrent ? teacherOffCreditSessions(cls, sessions, nextKey, joinDate || undefined) : 0);
        const materialsNext = classMaterialFee(cls, nextKey);
        // Khoản chênh lệch chuyển lớp neo vào tháng này ("transfer|…|YYYY-MM")
        // gộp vào số tiền phiếu lập sẵn — âm = khấu trừ, dương = thu thêm.
        const nextAmount = (billedNext - offCreditNext) * classSessionPrice(cls)
          + materialsNext.amount + (hasOldDebtBill(ledger, studentId, cls.id) ? 0 : studentOldDebtAmount(student, cls, [nextKey]))
          + transferAdjustmentForAnchor(studentId, cls.id, nextKey, ledger);
        if (nextAmount > 0 && !covered) {
          // Mã thanh toán riêng — phiếu tháng này đã dùng mã HP{lớp}{HV}; SePay
          // đối soát chỉ theo mã nên hai phiếu trùng mã sẽ ghi nhận nhầm khoản.
          // Mã HP{lớp}{kỳ}{HV} riêng của tháng sau (khác mã tháng này) — đối soát khớp thẳng.
          const nextCode = billPaymentCode(cls, student, nextBillKey);
          const nextCodeTaken = Boolean(nextCode) && paymentOrders.some((row) => row.paymentCode === nextCode && row.status === "ACTIVE");
          const created = createReceivable({
            studentId,
            studentName: student.fullName,
            billingPeriod: nextPeriod,
            amountDue: nextAmount,
            usedCodes,
            paymentCode: nextCodeTaken ? undefined : nextCode,
          });
          created.receivable.classId = cls.id;
          created.receivable.billKey = nextBillKey;
          usedCodes.push(created.order.paymentCode);
          receivables = [created.receivable, ...receivables];
          paymentOrders = [{ ...refreshOrderQr(created.order, ledger.settings, nextAmount) }, ...paymentOrders];
          indexReceivables();
          indexPaymentOrders();
        } else if (standalone && standalone.status === "OPEN" && !standalone.frozenAt && !(standalone.amountPaid > 0)) {
          if (nextAmount > 0) {
            standalone.amountDue = nextAmount;
            standalone.balanceDue = nextAmount;
            // Số tiền vừa đặt là học phí gốc — nhả tín dụng đã áp để bước áp tín dụng cuối
            // đồng bộ trừ lại đúng một lần (giữ lại thì bị coi là số đã trừ → tín dụng mất tác dụng).
            standalone.appliedCredits = [];
            standalone.billingPeriod = nextPeriod;
            standalone.studentName = student.fullName;
            updateOrder(standalone.paymentOrderId, (order) => ({ ...refreshOrderQr(order, ledger.settings, nextAmount), status: "ACTIVE" as const }));
          } else {
            // Tháng sau không còn gì phải thu (admin nghỉ hết lịch, học viên đã
            // trả trước…) — hủy phiếu lẻ đã lập sẵn để không còn công nợ thừa.
            standalone.balanceDue = 0;
            standalone.status = "CANCELLED";
            updateOrder(standalone.paymentOrderId, (order) => (order.status === "ACTIVE" ? { ...order, status: "CANCELLED" as const } : order));
          }
        }
      }
      // Phiếu của tháng đã được dòng nợ thay thế: hủy phiếu lẻ sót để không còn
      // công nợ kép — khoản của nó nằm trong phiếu tháng 10 rồi.
      {
        const stale = new Set<string>();
        for (const index of receivablePositions.get(studentId) || []) {
          const row = receivables[index];
          if (row.classId !== cls.id || row.status !== "OPEN" || row.amountPaid > 0 || row.frozenAt) continue;
          const parts = String(row.billKey || "").split("|");
          if (parts[0] !== "month" && parts[0] !== "months") continue;
          const keys = (parts[2] || "").split(",").filter(validMonthKey);
          if (!keys.length || keys.some((key) => !isSupersededDebtMonth(student, cls, key) && !isTransferCoveredMonth(student, cls, key, ledger))) continue;
          stale.add(row.id);
          receivables[index] = { ...row, balanceDue: 0, status: "CANCELLED" as const };
        }
        if (stale.size) {
          for (const receivableId of stale) cancelOrdersOf(receivableId);
        }
      }
      // Khóa đang chạy của học viên vừa chuyển đến được phiếu lớp nguồn bao
      // phủ: hủy phiếu khóa của lớp đích lỡ lập trước khi vá — công nợ thực
      // của bạn vẫn là phiếu lớp cũ, phiếu này là thu kép. Phiếu đã chốt
      // (frozenAt / đã thu một phần) giữ nguyên cho kế toán quyết định.
      if (charge.mode === "COURSE" && isTransferCoveredCourse(student, cls, classCurrentCourseIndex(cls, now, sessions), sessions, ledger, now)) {
        const coveredIndex = classCurrentCourseIndex(cls, now, sessions);
        const stale = new Set<string>();
        for (const index of receivablePositions.get(studentId) || []) {
          const row = receivables[index];
          if (row.classId !== cls.id || row.status !== "OPEN" || row.amountPaid > 0 || row.frozenAt) continue;
          if (String(row.billKey || "").split("|")[0] !== COURSE_MATERIAL_KEY) continue;
          if (courseIndexOfBillKey(row.billKey) !== coveredIndex) continue;
          stale.add(row.id);
          receivables[index] = { ...row, balanceDue: 0, status: "CANCELLED" as const };
        }
        if (stale.size) {
          for (const receivableId of stale) cancelOrdersOf(receivableId);
        }
      }
      if (amount <= 0) continue;
      // Tháng đã có phiếu đã chốt (đã gửi yêu cầu thanh toán hoặc đã thu một
      // phần) không gộp lại vào phiếu mới — phiếu mới chỉ ôm các tháng còn
      // trống để không thu kép với phiếu đã chốt (vd phiếu T10 đã gửi giữ nguyên,
      // phiếu T11 lẻ vẫn tự lập riêng thay vì bị viết đè thành gộp T10+T11).
      const lockedMonths = new Set<string>();
      for (const index of receivablePositions.get(studentId) || []) {
        const row = receivables[index];
        if (row.classId !== cls.id || row.status === "CANCELLED") continue;
        if (!row.frozenAt && !(row.amountPaid > 0)) continue;
        const parts = String(row.billKey || "").split("|");
        if (parts[0] !== "month" && parts[0] !== "months") continue;
        for (const key of (parts[2] || "").split(",")) {
          if (validMonthKey(key)) lockedMonths.add(key);
        }
      }
      const openMonths = charge.mode === "MONTHLY" ? charge.months.filter((key) => !lockedMonths.has(key)) : [];
      const openSet = new Set(openMonths);
      const openItems = charge.mode === "MONTHLY"
        ? (charge.items || []).filter((_, index) => openSet.has(charge.months[index]))
        : [];
      const subsetMonths = charge.mode === "MONTHLY" && openMonths.length !== charge.months.length;
      const openAmount = subsetMonths
        ? openItems.reduce((sum, row) => sum + row.amount, 0)
          + (hasOldDebtBill(ledger, student.id, cls.id) ? 0 : studentOldDebtAmount(student, cls, openMonths))
          + parkedCarryAmount(student.id, cls.id, { months: openMonths }, ledger)
        : amount;
      const openPeriod = subsetMonths
        ? `${openItems.map((row) => row.period.split(" · ")[0]).join(" + ")} · ${cls.name}`
        : charge.period;
      // Đích đồng bộ: các tháng còn trống của báo giá; khi mọi tháng đã có phiếu
      // chốt thì đích chính là phiếu đã chốt — các bản vá "sửa phiếu đã chốt"
      // (vd T2 tháng 10) vẫn tính lại được số tiền trên phiếu đó.
      const syncMonths = charge.mode === "MONTHLY" ? (openMonths.length ? openMonths : charge.months) : [];
      const syncBillKey = charge.mode === "MONTHLY"
        ? `month${syncMonths.length > 1 ? "s" : ""}|${cls.id}|${syncMonths.join(",")}`
        : charge.billKey;
      const syncAmount = charge.mode === "MONTHLY" && !openMonths.length ? amount : openAmount;
      const syncPeriod = charge.mode === "MONTHLY" && !openMonths.length ? charge.period : openPeriod;
      if (charge.mode === "MONTHLY" && openMonths.length && openAmount <= 0) continue;
      // Phiếu tháng sau lập sẵn không được nhầm là phiếu của báo giá tháng này:
      // chỉ nhận phiếu có sẵn khi các tháng nó chứa nằm gọn trong các tháng còn
      // mở của báo giá. Phiếu đã chốt (frozenAt / đã thu một phần) chỉ làm
      // existing khi báo giá không còn tháng nào trống — nó giữ nguyên trừ các
      // bản vá được phép sửa phiếu chốt.
      const coveredByCharge = (row: SepayReceivable) => {
        const parts = String(row.billKey || "").split("|");
        if (parts[0] !== "month" && parts[0] !== "months") return true;
        const keys = (parts[2] || "").split(",").filter(validMonthKey);
        if (!keys.length) return true;
        return keys.every((key) => openSet.has(key));
      };
      const lockedByCharge = (row: SepayReceivable) => {
        const parts = String(row.billKey || "").split("|");
        if (parts[0] !== "month" && parts[0] !== "months") return false;
        return (parts[2] || "").split(",").some((key) => chargeMonths.has(key));
      };
      // Phiếu trùng tháng: ưu tiên phiếu chứa tháng sớm nhất của báo giá — nó
      // mang mã thanh toán phụ huynh đã nhận lâu nhất (HP… trên phiếu báo tháng
      // trước). Phiếu gộp kế thừa mã đó, phiếu lẻ mới lập sẵn bị hủy thay vì
      // hủy mã đang lưu hành ngoài phụ huynh.
      const rowMonths = (row: SepayReceivable) =>
        (String(row.billKey || "").split("|")[2] || "").split(",").filter(validMonthKey);
      const firstOpenMonth = openMonths[0];
      // Phiếu chênh lệch chuyển lớp không phải phiếu báo giá — đứng riêng, đồng
      // bộ không được gán lại billKey/số tiền hay hủy nó.
      const isUpdatableSubset = (row: SepayReceivable) =>
        row.studentId === studentId && row.classId === cls.id && row.status === "OPEN"
        && !row.frozenAt && !(row.amountPaid > 0) && coveredByCharge(row)
        && !isTransferBillKey(row.billKey);
      const billRows = studentRows(studentId);
      const subsetExisting =
        billRows.find((row) => isUpdatableSubset(row) && Boolean(firstOpenMonth) && rowMonths(row).includes(firstOpenMonth!))
        || billRows.find(isUpdatableSubset);
      const existing =
        billRows.find((row) => row.billKey === syncBillKey && row.status !== "CANCELLED")
        || subsetExisting
        || billRows.find((row) => row.classId === cls.id && row.status === "OPEN" && (row.frozenAt || row.amountPaid > 0) && lockedByCharge(row))
        || billRows.find((row) => !row.billKey && (row.status === "OPEN" || row.amountDue === 2000));
      if (!existing) {
        if (charge.mode === "MONTHLY" && !openMonths.length) continue;
        // Không dùng lại mã HP{lớp}{HV} khi một order ACTIVE khác đã mang mã đó
        // (vd phiếu tháng trước đã chốt) — SePay đối soát chỉ theo mã nên hai
        // phiếu trùng mã sẽ ghi nhận nhầm khoản.
        const friendlyCode = billPaymentCode(cls, student, syncBillKey);
        const codeTaken = Boolean(friendlyCode)
          && paymentOrders.some((row) => row.paymentCode === friendlyCode && row.status === "ACTIVE");
        const created = createReceivable({
          studentId,
          studentName: student.fullName,
          billingPeriod: syncPeriod,
          amountDue: syncAmount,
          usedCodes,
          paymentCode: codeTaken ? undefined : friendlyCode,
        });
        created.receivable.classId = cls.id;
        created.receivable.billKey = syncBillKey;
        usedCodes.push(created.order.paymentCode);
        receivables = [created.receivable, ...receivables];
        paymentOrders = [{ ...refreshOrderQr(created.order, ledger.settings, syncAmount) }, ...paymentOrders];
        indexReceivables();
        indexPaymentOrders();
        continue;
      }
      // Khoản đã "Gửi yêu cầu thanh toán" (frozenAt) không được đồng bộ ghi đè lại
      // amountDue/billingPeriod nữa — nó đã chốt cứng theo tuitionCollectionCharge (D2).
      const refreshFrozenT2October = existing.status === "OPEN"
        && existing.amountPaid === 0
        && cls.id === T2_CLASS_ID
        && charge.mode === "MONTHLY"
        && charge.months.includes(T2_OCTOBER_BILLING_MONTH);
      if ((existing.status !== "OPEN" || existing.amountPaid > 0 || existing.frozenAt) && !refreshFrozenT2October) {
        existing.classId = existing.classId || cls.id;
        existing.billKey = existing.billKey || syncBillKey;
        continue;
      }
      existing.classId = cls.id;
      existing.billKey = syncBillKey;
      existing.studentName = student.fullName;
      existing.billingPeriod = syncPeriod;
      existing.amountDue = syncAmount;
      existing.balanceDue = syncAmount;
      // Phiếu được ghi đè về số gross mới — nhả tín dụng đã áp để pass cuối
      // phân bổ lại đúng (tránh cộng dồn gross + applied cũ).
      existing.appliedCredits = [];
      updateOrder(existing.paymentOrderId, (order) => ({ ...refreshOrderQr(order, ledger.settings, syncAmount), status: "ACTIVE" }));
      // Phiếu gộp đã chứa mọi tháng của các phiếu tháng đang mở khác — hủy các
      // phiếu lẻ sót lại để không thu kép (công nợ của chúng nằm trong bundle).
      // Phiếu đã chốt giữ nguyên — các tháng của nó đã bị loại khỏi phiếu gộp.
      const bundledMonths = new Set(syncMonths);
      if (bundledMonths.size > 1) {
        for (const index of receivablePositions.get(studentId) || []) {
          const row = receivables[index];
          if (row === existing || row.classId !== cls.id) continue;
          if (row.status !== "OPEN" || row.frozenAt || row.amountPaid > 0) continue;
          const parts = String(row.billKey || "").split("|");
          if (parts[0] !== "month" && parts[0] !== "months") continue;
          const keys = (parts[2] || "").split(",").filter(validMonthKey);
          if (!keys.length || keys.some((key) => !bundledMonths.has(key))) continue;
          row.balanceDue = 0;
          row.status = "CANCELLED";
          updateOrder(row.paymentOrderId, (order) => (order.status === "ACTIVE" ? { ...order, status: "CANCELLED" as const } : order));
        }
      }
    }
  }

  // Áp tín dụng bảo lưu/tiền thừa vào các phiếu đang mở sau khi cơ cấu phiếu đã
  // ổn định — chạy cuối cùng để phân bổ theo thứ tự phiếu cũ trước.
  return applyStudentCreditsToReceivables({ ...ledger, receivables, paymentOrders });
}

export function countCompletedClassSessions(
  cls: Pick<DemoClass, "id" | "schedules" | "courseStartDate">,
  sessions: DemoLessonSession[],
  now = new Date(),
) {
  return memoized2(cls, sessions, `completed|${dateKeyOf(now)}`, () => countCompletedClassSessionsImpl(cls, sessions, now));
}

function countCompletedClassSessionsImpl(
  cls: Pick<DemoClass, "id" | "schedules" | "courseStartDate">,
  sessions: DemoLessonSession[],
  now: Date,
) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 84, 12);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 12);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const courseStartKey = classCourseStartDate(cls);
  const explicit = sessionsOfClass(sessions, cls.id);
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  const counted = new Set<string>();
  let completed = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (date < courseStartKey) continue;
    const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (const stored of claimed) {
      if (stored) counted.add(sessionIdentity(stored));
      const status = stored?.status || (date < todayKey ? "COMPLETED" : "SCHEDULED");
      if (status === "COMPLETED" && !stored?.isOff) completed += 1;
    }
  }
  // Bản ghi thật ngoài các suất lịch (buổi thêm, ngày không còn trong lịch
  // hiện tại) vẫn là buổi đã dạy — đếm một lần theo định danh của nó.
  for (const session of explicit) {
    if (!session.isExtra && counted.has(sessionIdentity(session))) continue;
    if (session.status !== "COMPLETED" || session.isOff) continue;
    completed += 1;
  }
  return completed;
}

/** Tiền buổi học trong phiếu, đã bỏ phần học liệu để không thành số buổi ảo. */
function receiptTuitionAmount(receipt: { amount: number; materialsAmount?: number }, excessCredited = 0) {
  const materials = Math.max(0, Math.round(Number(receipt.materialsAmount) || 0));
  return Math.max(0, Math.round(Number(receipt.amount) || 0) - materials - Math.max(0, Math.round(Number(excessCredited) || 0)));
}

/** Lý do tín dụng "dư do đổi ngày nhập học": phụ huynh đã đóng theo ngày cũ, phần dư trừ vào khóa sau. */
export const JOIN_EXCESS_CREDIT_REASON = "JOIN_DATE_EXCESS";

/** Tiền dư đã tách khỏi từng khoản thu (theo paymentId) + các id tín dụng loại này. */
function joinExcessIndex(ledger: { credits?: SepayCredit[] } | null | undefined) {
  return memoized(ledger, "jex", () => {
    const byPayment = new Map<string, number>();
    const ids = new Set<string>();
    for (const credit of ledger?.credits || []) {
      if (credit.reason !== JOIN_EXCESS_CREDIT_REASON) continue;
      ids.add(credit.id);
      byPayment.set(credit.sourcePaymentId, (byPayment.get(credit.sourcePaymentId) || 0) + (Math.round(Number(credit.amount)) || 0));
    }
    return { byPayment, ids };
  });
}

/** Số buổi đã "đóng" nhờ tín dụng dư (đã áp vào phiếu khóa) — chỉ loại tín dụng đổi ngày nhập học. */
function appliedJoinExcessSessions(
  ledger: { credits?: SepayCredit[]; receivables?: SepayReceivable[] } | null | undefined,
  studentId: string | undefined,
  cls: DemoClass,
  courseIndex?: number,
) {
  const { ids } = joinExcessIndex(ledger);
  if (!ids.size || !studentId) return 0;
  const price = classSessionPrice(cls);
  if (!(price > 0)) return 0;
  let amount = 0;
  for (const row of receivablesOfStudent(ledger as { receivables?: SepayReceivable[] }, studentId)) {
    if (row.classId !== cls.id || row.status === "CANCELLED") continue;
    if (String(row.billKey || "").split("|")[0] !== COURSE_MATERIAL_KEY) continue;
    if (courseIndex !== undefined && courseIndexOfBillKey(row.billKey) !== courseIndex) continue;
    for (const item of row.appliedCredits || []) if (ids.has(item.creditId)) amount += Math.round(Number(item.amount)) || 0;
  }
  return Math.round(amount / price);
}

export function paidCourseReceiptSessions(
  student: { id?: string },
  cls: DemoClass,
  ledger?: SepayLedger | null,
  courseIndex?: number,
) {
  if (!student.id || !ledger) return 0;
  return memoized2(ledger, student, `prs|${cls.id}|${courseIndex ?? ""}`, () => {
    const price = classSessionPrice(cls);
    const joinExcess = joinExcessIndex(ledger);
    let extraPaid = 0;
    for (const receipt of receiptsOfStudent(ledger, student.id)) {
      // Biên lai chờ kích hoạt từ SePay chưa có classId — chưa tính là buổi đã thu.
      if (!receipt.classId || receiptClassId(receipt, ledger) !== cls.id) continue;
      if ((receipt.billingMode || "COURSE") !== "COURSE") continue;
      // Truyền courseIndex để chỉ cộng biên lai của đúng khóa đó.
      if (courseIndex !== undefined && receiptCourseIndex(receipt, ledger) !== courseIndex) continue;
      extraPaid += price > 0 ? Math.round(receiptTuitionAmount(receipt, joinExcess.byPayment.get(receipt.paymentId) || 0) / price) : classCourseSizeAt(cls, receiptCourseIndex(receipt, ledger) || 1);
    }
    return extraPaid + appliedJoinExcessSessions(ledger, student.id, cls, courseIndex);
  });
}

/**
 * Khoản phải thu khóa 1 đang mở nghĩa là khóa đầu chưa thực thu — học viên
 * không còn được mặc định "đã đóng khóa" như lớp cũ nhập trước khi có SePay.
 */
export function courseOneReceivableOpen(
  studentId: string | undefined,
  cls: Pick<DemoClass, "id">,
  ledger?: SepayLedger | null,
) {
  if (!studentId || !ledger) return false;
  return memoized(ledger, `co1|${studentId}|${cls.id}`, () =>
    receivablesOfStudent(ledger, studentId).some((receivable) => {
      if (receivable.status !== "OPEN" && receivable.status !== "PARTIALLY_PAID") return false;
      const billKey = String(receivable.billKey || "");
      return billKey.split("|")[0] === COURSE_MATERIAL_KEY
        && billKey.split("|")[1] === cls.id
        && courseIndexOfBillKey(billKey) === 1;
    }));
}

/**
 * Số suất lịch đã trôi qua trước endKey, tính từ đầu khóa 1. Mọi suất nghỉ
 * (học vụ, GV) và buổi học không tính phí đều không chiếm vị trí — suất đó bị
 * bỏ qua nên ranh giới khóa tự đẩy sang đúng bằng số buổi đã nghỉ.
 */
function classScheduleSlotsBefore(cls: DemoClass, endKey: string, sessions: DemoLessonSession[] = []) {
  return memoized2(cls, sessions, `before|${endKey}`, () => classScheduleSlotsBeforeImpl(cls, endKey, sessions));
}

function classScheduleSlotsBeforeImpl(cls: DemoClass, endKey: string, sessions: DemoLessonSession[] = []) {
  const startKey = classCourseStartDate(cls);
  if (startKey >= endKey) return 0;
  const [year, month, day] = startKey.split("-").map(Number);
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  let count = 0;
  for (const cursor = new Date(year, month - 1, day, 12); dateKeyOf(cursor) < endKey; cursor.setDate(cursor.getDate() + 1)) {
    const date = dateKeyOf(cursor);
    const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (const stored of claimed) {
      // Suất nghỉ không đếm — trừ khi đã có buổi dạy bù lấp đúng vị trí đó.
      if (isCourseSlotSkippingSession(stored) && !makeupSessionFor(stored, sessions)) continue;
      count += 1;
    }
  }
  return count;
}

/** Khóa đang chạy tại thời điểm now: cứ courseSessions suất lịch trôi qua là một khóa. */
export function classCurrentCourseIndex(cls: DemoClass, now = new Date(), sessions: DemoLessonSession[] = []) {
  return boundaryHeldCourseIndex(cls, dateKeyOf(now), courseIndexAtSlotOrdinal(cls, classScheduleSlotsBefore(cls, dateKeyOf(now), sessions)));
}

/** Buổi ngoài suất khóa (học không tính phí) rơi đúng biên hai khóa mà thực
 * chất là buổi cuối của khóa trước — vd S40 17/10/2026: buổi 25 khóa 1 không
 * tính phí, khóa 2 mở buổi 1 = 19/10. Key = `${classId}|${date}` → khóa sở hữu.
 * Mirror trong public/app.js (BOUNDARY_NOFEE_COURSE_OVERRIDES). */
const BOUNDARY_NOFEE_COURSE_OVERRIDES: Record<string, number> = {
  "class-import-s40|2026-10-17": 1,
  // S36: buổi thêm không tính phí 24/10/2026 thuộc khóa 1; khóa 2 mở buổi 1 ngày
  // 29/10, công nợ khóa 2 hiện từ 25/10 (sau buổi thêm).
  "class-import-s36|2026-10-24": 1,
  // S42: 27/10 và 31/10/2026 học không tính phí, thuộc khóa 1; khóa 2 buổi 1 = 03/11.
  "class-import-s42|2026-10-27": 1,
  "class-import-s42|2026-10-31": 1,
};

/** Buổi ghim cuối khóa chưa qua thì lớp vẫn ở khóa sở hữu buổi đó — khóa sau
 * (công nợ) chỉ mở từ ngày sau buổi ghim. Mirror trong public/app.js. */
function boundaryHeldCourseIndex(cls: DemoClass, todayKey: string, index: number) {
  let held = index;
  for (const [key, owner] of Object.entries(BOUNDARY_NOFEE_COURSE_OVERRIDES)) {
    const [classId, date] = key.split("|");
    if (classId === cls?.id && todayKey <= date && owner < held) held = owner;
  }
  return held;
}

/** Khóa mà một ngày thuộc về — dùng để gán bản ghi ngoài thời khóa biểu vào đúng khóa. */
export function classCourseIndexOfDate(cls: DemoClass, date: string, sessions: DemoLessonSession[] = []) {
  const pinned = BOUNDARY_NOFEE_COURSE_OVERRIDES[`${cls?.id || ""}|${String(date || "")}`];
  if (pinned != null) return pinned;
  return courseIndexAtSlotOrdinal(cls, classScheduleSlotsBefore(cls, date, sessions));
}

/**
 * Mốc bắt đầu thu học phí khóa qua hệ thống. Khóa bắt đầu trước mốc này mà học
 * viên không có phiếu nào được coi như đã thu ngoài hệ thống (lớp có từ trước
 * khi dùng phần mềm) — không lập phiếu, không tính nợ.
 */
export const COURSE_BILLING_GOLIVE = COURSE_SCHEDULE_START;

/** Ngày buổi đầu tiên của khóa thứ `index` (đếm từ 1). */
export function classCourseStartDateOf(cls: DemoClass, sessions: DemoLessonSession[], index: number, now = new Date()) {
  return classCourseSessionsForCourse(cls, sessions, index, now)[0]?.date;
}

/** Ngày khai giảng đã cấu hình rõ ràng (lớp chưa chốt ngày thì không có). */
function explicitCourseStartDate(cls: { courseStartDate?: string } | null | undefined) {
  const value = String(cls?.courseStartDate || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && classCourseStartDate(cls) === value ? value : undefined;
}

/** Ngày khóa bắt đầu để so với mốc golive: khóa 1 theo ngày khai giảng đã cấu hình. */
function courseStartForGolive(cls: DemoClass, sessions: DemoLessonSession[], index: number, now = new Date()) {
  return index === 1 ? explicitCourseStartDate(cls) : classCourseStartDateOf(cls, sessions, index, now);
}

/** Khóa đầu tiên học viên phải đóng ở lớp: khóa chứa ngày nhập học, mặc định khóa 1. */
export function studentFirstCourseIndex(
  student: { classJoinedAt?: Record<string, string> } | null | undefined,
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
) {
  const joinDate = studentClassJoinDate(student, cls.id);
  return joinDate ? Math.max(1, classCourseIndexOfDate(cls, joinDate, sessions)) : 1;
}

/** Phiếu khóa của học viên ở lớp (bỏ phiếu hủy, phiếu chuyển lớp) gom theo số khóa. */
export function studentCourseReceivables(ledger: SepayLedger | null | undefined, studentId: string | undefined, cls: Pick<DemoClass, "id">) {
  const map = new Map<number, SepayReceivable[]>();
  if (!ledger || !studentId) return map;
  for (const row of receivablesOfStudent(ledger, studentId)) {
    if (row.status === "CANCELLED") continue;
    const parts = String(row.billKey || "").split("|");
    if (parts[0] !== COURSE_MATERIAL_KEY || parts[1] !== cls.id) continue;
    const index = courseIndexOfBillKey(row.billKey);
    const list = map.get(index) || [];
    list.push(row);
    map.set(index, list);
  }
  return map;
}

const isOpenWithBalance = (row: SepayReceivable) =>
  (row.status === "OPEN" || row.status === "PARTIALLY_PAID") && Math.round(Number(row.balanceDue) || 0) > 0;

/**
 * Phiếu khóa chưa bắt đầu nhưng trung tâm đã đòi phụ huynh (đã gửi yêu cầu
 * thanh toán hoặc đã thu một phần) — lập theo cách thu sớm trước đây, vẫn là
 * công nợ thật và được thu tiếp. Phiếu lập sẵn chưa gửi, chưa thu thì không.
 */
const isRequestedEarly = (row: SepayReceivable) =>
  isOpenWithBalance(row) && (Boolean(row.frozenAt) || Math.round(Number(row.amountPaid) || 0) > 0);

/** Khóa đã thu ngoài hệ thống: bắt đầu trước mốc golive và học viên không có phiếu nào của khóa đó. */
export function isLegacyPaidCourse(
  student: { id?: string },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger | null | undefined,
  index: number,
  now = new Date(),
) {
  if ((studentCourseReceivables(ledger, student.id, cls).get(index) || []).length) return false;
  const start = courseStartForGolive(cls, sessions, index, now);
  return Boolean(start && start < COURSE_BILLING_GOLIVE);
}

/**
 * Khóa mặc định để thu: khóa cũ nhất còn nợ trong các khóa đã bắt đầu; nếu
 * không còn khóa nào nợ thì khóa đang học.
 */
export function defaultCollectCourseIndex(
  student: { id?: string; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger | null | undefined,
  now = new Date(),
) {
  const current = classCurrentCourseIndex(cls, now, sessions);
  const first = studentFirstCourseIndex(student, cls, sessions);
  const rows = studentCourseReceivables(ledger, student.id, cls);
  for (let index = first; index <= current; index += 1) {
    if ((rows.get(index) || []).some(isOpenWithBalance)) return index;
  }
  for (let index = first; index <= current; index += 1) {
    if (!(rows.get(index) || []).length && !isLegacyPaidCourse(student, cls, sessions, ledger, index, now)) return index;
  }
  const early = [...rows.entries()].filter(([index, list]) => index > current && list.some(isRequestedEarly)).map(([index]) => index).sort((a, b) => a - b)[0];
  return early || Math.max(first, current);
}

export type CourseCollectStatus = "DUE" | "PAID" | "LEGACY_PAID" | "FUTURE" | "COVERED";

/**
 * Trạng thái thu của từng khóa (từ khóa đầu tiên học viên phải đóng tới khóa
 * kế tiếp khóa đang học): DUE thu được, PAID đã đủ, LEGACY_PAID đã thu ngoài
 * hệ thống, FUTURE chưa bắt đầu (chỉ xem phiếu báo), COVERED phiếu lớp nguồn bao phủ.
 */
/**
 * Gói phiếu gửi yêu cầu thanh toán của lớp thu khóa: phiếu khóa `targetIndex` (khóa
 * hiện tại) cộng dồn mọi phiếu khóa trước của học viên ở cùng lớp còn nợ — phụ huynh
 * nhận MỘT số tiền tổng (vd nợ khóa 1 1.560k + khóa 2 1.560k = 3.120k). Mỗi khóa vẫn
 * là một phiếu riêng; khi tiền về, tổng được chia trả khóa cũ trước.
 */
export function courseRequestBundle(ledger: SepayLedger, studentId: string, classId: string, targetIndex: number) {
  const rows = ledger.receivables
    .filter((row) => row.studentId === studentId && row.classId === classId
      && String(row.billKey || "").split("|")[0] === "course"
      && courseIndexOfBillKey(row.billKey) <= targetIndex
      && (row.status === "OPEN" || row.status === "PARTIALLY_PAID")
      && Math.round(Number(row.balanceDue) || 0) > 0)
    .sort((a, b) => courseIndexOfBillKey(a.billKey) - courseIndexOfBillKey(b.billKey));
  return { rows, total: rows.reduce((sum, row) => sum + Math.round(Number(row.balanceDue) || 0), 0) };
}

/** Số tiền gửi cho phụ huynh của một phiếu: lớp khóa = cộng dồn nợ các khóa trước
 * (courseRequestBundle); phiếu khác = số còn phải trả (đã thu một phần thì là phần còn lại). */
export function receivableRequestAmount(ledger: SepayLedger, receivable: SepayReceivable) {
  if (String(receivable.billKey || "").split("|")[0] === "course" && receivable.classId) {
    const bundle = courseRequestBundle(ledger, receivable.studentId, receivable.classId, courseIndexOfBillKey(receivable.billKey));
    if (bundle.total > 0) return bundle.total;
  }
  const balance = Math.round(Number(receivable.balanceDue) || 0);
  // Lớp tháng đã tách nợ cũ thành phiếu riêng: phiếu tháng gửi phụ huynh cộng phần nợ cũ còn
  // thiếu (như phiếu khóa cộng nợ khóa trước) — nhập sao kê chia trả nợ cũ trước.
  // Lớp tháng: phiếu tháng gửi phụ huynh cộng nợ cũ (tháng trước chưa đóng / đóng thiếu + nợ cũ
  // riêng) — như phiếu khóa cộng nợ khóa trước; nhập sao kê chia trả nợ cũ trước.
  const months = receivableMonths(receivable);
  if (months.length && receivable.classId && balance > 0) {
    const oldDebt = monthlyPriorDebtReceivables(ledger, receivable.studentId, receivable.classId, months[0])
      .reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.balanceDue) || 0)), 0);
    if (oldDebt > 0) return balance + oldDebt;
  }
  return balance > 0 ? balance : Math.round(Number(receivable.amountDue) || 0);
}

export function studentCourseCollectStates(
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
  now = new Date(),
) {
  const current = classCurrentCourseIndex(cls, now, sessions);
  const first = studentFirstCourseIndex(student, cls, sessions);
  const rows = studentCourseReceivables(ledger, student.id, cls);
  const states: Array<{ index: number; status: CourseCollectStatus; balanceDue: number; receivable?: SepayReceivable }> = [];
  const lastEarly = Math.max(0, ...[...rows.entries()].filter(([, list]) => list.some(isRequestedEarly)).map(([index]) => index));
  for (let index = first; index <= Math.max(current + 1, first, lastEarly); index += 1) {
    const list = rows.get(index) || [];
    const open = list.find(isOpenWithBalance);
    const balanceDue = list.filter(isOpenWithBalance).reduce((sum, row) => sum + Math.round(Number(row.balanceDue) || 0), 0);
    let status: CourseCollectStatus;
    if (index > current && list.some(isRequestedEarly)) status = "DUE";
    else if (index > current) status = "FUTURE";
    else if (open) status = "DUE";
    else if (list.length) status = "PAID";
    else if (isLegacyPaidCourse(student, cls, sessions, ledger, index, now)) status = "LEGACY_PAID";
    else if (isTransferCoveredCourse(student, cls, index, sessions, ledger, now)) status = "COVERED";
    else status = "DUE";
    states.push({ index, status, balanceDue, receivable: open || list[0] });
  }
  return states;
}

/** Tra cứu theo id của sổ — dựng một lần cho mỗi request thay vì find() tuyến tính. */
function ledgerRowIndexes(ledger: SepayLedger) {
  return memoized(ledger, "ledgerRowIndexes", () => ({
    paymentById: new Map((ledger.payments || []).map((row) => [row.id, row])),
    receivableById: new Map((ledger.receivables || []).map((row) => [row.id, row])),
  }));
}

/** Biên lai của một học viên — index một lần cho mỗi danh sách thay vì quét
 * lại toàn sổ cho từng cặp (học viên × lớp). Nhận cả ledger lẫn mảng thuần. */
function receiptsOfStudent(source: { receipts?: SepayReceipt[] } | SepayReceipt[] | null | undefined, studentId?: string) {
  const rows = Array.isArray(source) ? source : source?.receipts;
  if (!rows) return [] as SepayReceipt[];
  return (memoized(rows, "byStudent", () => {
    const map = new Map<string, SepayReceipt[]>();
    for (const receipt of rows) {
      const list = map.get(receipt.studentId) || [];
      list.push(receipt);
      map.set(receipt.studentId, list);
    }
    return map;
  }).get(studentId || "") || []);
}

/** Phiếu thu của một học viên — index một lần cho mỗi danh sách. */
function receivablesOfStudent(source: { receivables?: SepayReceivable[] } | SepayReceivable[] | null | undefined, studentId?: string) {
  const rows = Array.isArray(source) ? source : source?.receivables;
  if (!rows) return [] as SepayReceivable[];
  return (memoized(rows, "byStudent", () => {
    const map = new Map<string, SepayReceivable[]>();
    for (const receivable of rows) {
      const list = map.get(receivable.studentId) || [];
      list.push(receivable);
      map.set(receivable.studentId, list);
    }
    return map;
  }).get(studentId || "") || []);
}

/** Khóa học mà biên lai này đã trả, suy từ billKey của khoản phải thu gốc. */
function receiptCourseIndex(receipt: SepayReceipt, ledger: SepayLedger) {
  const { paymentById, receivableById } = ledgerRowIndexes(ledger);
  const payment = paymentById.get(receipt.paymentId);
  const receivable = payment ? receivableById.get(payment.receivableId) : undefined;
  return courseIndexOfBillKey(receivable?.billKey);
}

export function paidCourseSessions(
  student: { id?: string },
  cls: DemoClass,
  ledger?: SepayLedger | null,
  courseIndex?: number,
  assumedCourseSize?: number,
) {
  return memoized2(ledger, student, `pcs|${cls.id}|${courseIndex ?? ""}|${assumedCourseSize ?? ""}`, () => paidCourseSessionsImpl(student, cls, ledger, courseIndex, assumedCourseSize));
}

function paidCourseSessionsImpl(
  student: { id?: string },
  cls: DemoClass,
  ledger: SepayLedger | null | undefined,
  courseIndex?: number,
  assumedCourseSize?: number,
) {
  const receiptPaid = paidCourseReceiptSessions(student, cls, ledger, courseIndex);
  // Mỗi khóa là một hộp riêng: buổi thừa của khóa trước không bù sang. Chỉ
  // khóa 1 mới được mặc định "đã đóng" cho lớp cũ trước SePay (không có phiếu
  // khóa 1 nào đang mở); khóa 2+ không có biên lai của đúng khóa thì = 0.
  // Học viên vào trễ (joinDate) chỉ được coi là đã đóng các buổi từ ngày vào.
  // Chỉ lớp có khóa 1 bắt đầu trước khi dùng hệ thống mới được mặc định.
  const legacyCourseOne = (courseIndex === undefined || courseIndex === 1)
    && (explicitCourseStartDate(cls) ? explicitCourseStartDate(cls)! < COURSE_BILLING_GOLIVE : true);
  if (!legacyCourseOne) return receiptPaid;
  // Khóa 1 lớp cũ: mặc định đã đóng đủ, trừ đi số buổi ứng với phần còn nợ của phiếu
  // khóa 1 đang mở (nợ cả khóa → 0 buổi; nợ một phần, vd 715.000đ → trừ 11 buổi).
  const size = assumedCourseSize ?? classCourseSizeAt(cls, 1);
  // Nợ cũ gộp vào phiếu khóa sau ("Nợ cũ …", phần vượt học phí khóa đó) cũng là buổi
  // khóa 1 chưa đóng. Học viên đã nhập nợ cũ dạng buổi (tuitionCredits âm) thì phần
  // vượt đó chính là khoản nợ buổi — đã trừ riêng, không trừ lần hai.
  const legacyCredit = Math.round(Number((student as { tuitionCredits?: Record<string, unknown> }).tuitionCredits?.[cls.id]) || 0);
  const owed = courseOneOpenBalance(student.id, cls, ledger) + (legacyCredit < 0 ? 0 : courseLumpedOldDebt(student.id, cls, ledger));
  const price = classSessionPrice(cls);
  const unpaid = owed <= 0 ? 0 : price > 0 ? Math.round(owed / price) : size;
  return Math.max(Math.max(0, size - unpaid), receiptPaid);
}

/** Phần "nợ cũ" gộp trong phiếu khóa 2+ = số tiền phiếu vượt học phí (+ học liệu) của khóa đó. */
export function courseLumpedOldDebt(studentId: string | undefined, cls: DemoClass, ledger?: SepayLedger | null) {
  if (!studentId || !ledger) return 0;
  return memoized(ledger, `lumped|${studentId}|${cls.id}`, () => {
    const price = classSessionPrice(cls);
    return receivablesOfStudent(ledger, studentId).reduce((sum, receivable) => {
      if (receivable.status === "CANCELLED" || receivable.classId !== cls.id) return sum;
      const billKey = String(receivable.billKey || "");
      if (billKey.split("|")[0] !== COURSE_MATERIAL_KEY) return sum;
      const index = courseIndexOfBillKey(billKey);
      if (index < 2) return sum;
      const nominal = classCourseSizeAt(cls, index) * price + Math.max(0, Math.round(Number(courseMaterialFee(cls, index).amount) || 0));
      return sum + Math.max(0, Math.round(Number(receivable.amountDue) || 0) - nominal);
    }, 0);
  });
}

/** Tổng còn nợ của các phiếu khóa 1 đang mở (0 nếu không có). */
export function courseOneOpenBalance(studentId: string | undefined, cls: Pick<DemoClass, "id">, ledger?: SepayLedger | null) {
  if (!studentId || !ledger) return 0;
  return memoized(ledger, `co1bal|${studentId}|${cls.id}`, () =>
    receivablesOfStudent(ledger, studentId).reduce((sum, receivable) => {
      if (receivable.status !== "OPEN" && receivable.status !== "PARTIALLY_PAID") return sum;
      const billKey = String(receivable.billKey || "");
      if (billKey.split("|")[0] !== COURSE_MATERIAL_KEY || billKey.split("|")[1] !== cls.id || courseIndexOfBillKey(billKey) !== 1) return sum;
      return sum + Math.max(0, Math.round(Number(receivable.balanceDue) || 0));
    }, 0));
}

export function chargedCourseSessions(
  studentId: string,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now = new Date(),
  courseIndex?: number,
  joinDate?: string,
) {
  return memoized2(cls, sessions, `charged|${studentId}|${courseIndex ?? ""}|${joinDate || ""}|${dateKeyOf(now)}`, () => chargedCourseSessionsImpl(studentId, cls, sessions, now, courseIndex, joinDate));
}

type ChargedCourseSlot = { date: string; courseIndex: number; studentIds: Set<string> };
type ChargedCourseExtra = ChargedCourseSlot & {
  /**
   * Buổi dạy bù đã chiếm vị trí của một suất lịch: ở bản gốc nó chỉ bị đánh
   * dấu "seen" khi suất đó thuộc đúng khóa đang tính (hoặc không lọc khóa) —
   * nếu không, nó đi tiếp vào vòng duyệt bản ghi ngoài lịch và có thể được
   * đếm theo khóa của chính ngày diễn ra. Giữ đúng ngữ nghĩa đó.
   */
  anchorIndexes?: Set<number>;
};

/**
 * Dòng thời gian các suất tính phí của lớp — phần này giống hệt nhau cho mọi
 * học viên nên dựng một lần rồi cache; mỗi học viên chỉ lọc theo joinDate và
 * tư cách thành viên của suất.
 */
function chargedCourseTimeline(cls: DemoClass, sessions: DemoLessonSession[], now: Date) {
  return memoized2(cls, sessions, `ctl|${dateKeyOf(now)}`, () => {
    const startKey = classCourseStartDate(cls);
    const todayKey = dateKeyOf(now);
    const explicit = sessionsOfClass(sessions, cls.id);
    const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
    const seenStored = new Set<string>();
    const makeupAnchors = new Map<string, number>();
    const slots: ChargedCourseSlot[] = [];
    let slotIndex = 0;
    // Các suất lịch đã qua tính phí như elapsed: chạy liên tục từ đầu khóa 1 qua
    // mọi khóa sau; suất chưa lưu bản ghi nào vẫn coi như đã dạy.
    if (startKey <= todayKey) {
      const [year, month, day] = startKey.split("-").map(Number);
      for (const cursor = new Date(year, month - 1, day, 12); dateKeyOf(cursor) < todayKey; cursor.setDate(cursor.getDate() + 1)) {
        const date = dateKeyOf(cursor);
        const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
        if (!daySlots.length) continue;
        const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
        for (const stored of claimed) {
          if (stored) seenStored.add(sessionIdentity(stored));
          // Suất nghỉ (học vụ hoặc GV) hoặc "học không tính phí" không chiếm vị
          // trí khóa và không tính phí — khóa đã tự kéo dài để học bù. Nếu đã có
          // buổi dạy bù thì buổi bù chiếm vị trí này và tính phí như buổi thường
          // (chỉ khi buổi bù đã diễn ra).
          const makeup = stored ? makeupSessionFor(stored, sessions) : undefined;
          if (isCourseSlotSkippingSession(stored) && !makeup) continue;
          const belongsTo = courseIndexAtSlotOrdinal(cls, slotIndex);
          slotIndex += 1;
          if (makeup) makeupAnchors.set(sessionIdentity(makeup), belongsTo);
          const candidate = makeup || stored || { status: "COMPLETED" as const, isOff: false };
          if (!sessionChargesTuition(candidate)) continue;
          slots.push({ date, courseIndex: belongsTo, studentIds: sessionStudentIds(makeup || stored, cls) });
        }
      }
    }
    // Bản ghi lưu tay ngoài các suất lịch đã duyệt (buổi học thêm, GV nghỉ ghi
    // trước cho ngày chưa tới, buổi ngoài thời khóa biểu) gán về khóa theo ngày.
    // Buổi trước ngày bắt đầu khóa thuộc chu kỳ khóa cũ — không tính vào khóa
    // hiện tại (đồng bộ classElapsedCourseSessions vốn cũng bỏ qua các bản ghi đó).
    const extras: ChargedCourseExtra[] = [];
    for (const session of explicit) {
      const identity = sessionIdentity(session);
      if (seenStored.has(identity)) continue;
      if (session.date < startKey) continue;
      if (session.isOff || !sessionChargesTuition(session)) continue;
      const anchorIndex = makeupAnchors.get(identity);
      extras.push({
        date: session.date,
        courseIndex: classCourseIndexOfDate(cls, session.date, sessions),
        studentIds: sessionStudentIds(session, cls),
        ...(anchorIndex !== undefined ? { anchorIndexes: new Set([anchorIndex]) } : {}),
      });
    }
    return { slots, extras };
  });
}

function chargedCourseSessionsImpl(
  studentId: string,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now: Date,
  courseIndex?: number,
  joinDate?: string,
) {
  if (!studentId) return 0;
  const { slots, extras } = chargedCourseTimeline(cls, sessions, now);
  let count = 0;
  for (const slot of slots) {
    if (courseIndex !== undefined && slot.courseIndex !== courseIndex) continue;
    // Buổi trước ngày nhập học không tính phí cho học viên này.
    if (joinDate && slot.date < joinDate) continue;
    if (!slot.studentIds.has(studentId)) continue;
    count += 1;
  }
  for (const extra of extras) {
    if (extra.anchorIndexes && (courseIndex === undefined || extra.anchorIndexes.has(courseIndex))) continue;
    if (joinDate && extra.date < joinDate) continue;
    if (courseIndex !== undefined && extra.courseIndex !== courseIndex) continue;
    if (!extra.studentIds.has(studentId)) continue;
    count += 1;
  }
  return count;
}

export function courseRemainingSessions(
  student: { id?: string; classJoinedAt?: Record<string, string>; tuitionCredits?: Record<string, number | string | null> },
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  ledger?: SepayLedger | null,
  now = new Date(),
) {
  if (!student.id) return 0;
  return memoized3(sessions, ledger, student, `crs|${cls.id}|${dateKeyOf(now)}`, () => courseRemainingSessionsImpl(student, cls, sessions, ledger, now));
}

function courseRemainingSessionsImpl(
  student: { id?: string; classJoinedAt?: Record<string, string>; tuitionCredits?: Record<string, number | string | null> },
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  ledger: SepayLedger | null | undefined,
  now: Date,
) {
  // Tồn = tổng buổi đã đóng của mọi khóa − buổi đã học kể từ khóa đầu tiên của
  // học viên. Sang khóa mới chưa đóng thì tồn về 0 rồi âm dần; còn nợ khóa cũ
  // thì âm thêm đúng số buổi khóa cũ; đóng khóa nào cộng đủ số buổi khóa đó.
  // tuitionCredits âm là nợ buổi cũ nhập tay — trừ tiếp vào số buổi tồn.
  const current = classCurrentCourseIndex(cls, now, sessions);
  const joinDate = studentClassJoinDate(student, cls.id);
  const first = studentFirstCourseIndex(student, cls, sessions);
  const legacyDebt = Math.min(0, Math.round(Number(student.tuitionCredits?.[cls.id]) || 0));
  // Khóa xa nhất cần cộng: khóa đang học, hoặc khóa đã có biên lai (đóng trước).
  let last = Math.max(current, first);
  for (const receipt of receiptsOfStudent(ledger, student.id)) {
    if (!receipt.classId || receipt.classId !== cls.id || (receipt.billingMode || "COURSE") !== "COURSE") continue;
    last = Math.max(last, receiptCourseIndex(receipt, ledger as SepayLedger));
  }
  let paid = 0;
  for (let index = first; index <= last; index += 1) {
    const assumedSize = joinDate && index === first ? billedCourseSessions(cls, sessions, index, now, joinDate) : undefined;
    // Khóa chốt cứng lịch: đóng đủ khóa = đủ số suất tính phí của khóa trên lịch.
    const paidOfCourse = hasCourseWindowOverride(cls, index)
      ? Math.min(paidCourseSessions(student, cls, ledger, index, assumedSize), classCourseWindowSlotsAt(cls, index))
      : paidCourseSessions(student, cls, ledger, index, assumedSize);
    // Khóa được phiếu lớp nguồn bao phủ (học viên chuyển lớp): khoản đã thu của
    // phiếu nguồn là tiền đã đóng của khóa này.
    const coveredPaid = index <= current && isTransferCoveredCourse(student, cls, index, sessions, ledger, now)
      ? coveredCoursePaidSessions(student, cls, ledger, index)
      : 0;
    paid += Math.max(paidOfCourse, coveredPaid);
  }
  // Buổi đã học: mỗi khóa tính tối đa đúng số buổi của khóa (buổi lẻ ngoài lịch
  // không làm một khóa thành 25 buổi).
  let charged = 0;
  for (let index = first; index <= current; index += 1) {
    const size = billedCourseSessions(cls, sessions, index, now, index === first ? joinDate : undefined);
    charged += Math.min(chargedCourseSessions(student.id, cls, sessions, now, index, joinDate), size || Number.MAX_SAFE_INTEGER);
  }
  return paid - charged + legacyDebt;
}

/**
 * Số buổi lớp đã thực học kể từ đầu khóa. Khác số buổi đã thu của từng học viên,
 * bộ đếm này đi theo chính thời khóa biểu của lớp và tiếp tục qua nhiều khóa.
 */
export function classElapsedCourseSessions(
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  now = new Date(),
) {
  return memoized2(cls, sessions, `elapsed|${dateKeyOf(now)}`, () => classElapsedCourseSessionsImpl(cls, sessions, now));
}

function classElapsedCourseSessionsImpl(
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now: Date,
) {
  const startKey = classCourseStartDate(cls);
  const todayKey = dateKeyOf(now);
  if (startKey > todayKey) return 0;

  const explicit = sessionsOfClass(sessions, cls.id);
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  const seen = new Set<string>();
  const [year, month, day] = startKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 12);
  let count = 0;

  for (let cursor = new Date(start); dateKeyOf(cursor) < todayKey; cursor.setDate(cursor.getDate() + 1)) {
    const date = dateKeyOf(cursor);
    const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (const stored of claimed) {
      if (stored) seen.add(sessionIdentity(stored));
      // Buổi GV cho nghỉ không phải buổi đã học — khóa kéo dài để dạy bù. Buổi
      // "học không tính phí" cũng không đếm vào tiến độ tính phí của khóa.
      if (stored?.isOff || isNoFeeSession(stored)) continue;
      if (sessionChargesTuition(stored || {
        status: "COMPLETED",
        isOff: false,
      })) count += 1;
    }
  }

  // Buổi hôm nay chỉ tính sau khi đã lưu hoàn thành; buổi học thêm cũng đi theo
  // dữ liệu thực tế. Không đếm trước các bản ghi tương lai.
  for (const session of explicit) {
    if (session.date < startKey || session.date > todayKey || seen.has(sessionIdentity(session))) continue;
    if (!session.isOff && sessionChargesTuition(session)) count += 1;
  }
  return count;
}

/**
 * Học viên miễn học phí luôn có số buổi bằng tiến độ của lớp. Ở đúng ranh giới
 * cuối khóa trả về 0; khi lớp học buổi đầu của khóa kế tiếp, số dư tự bật sang
 * tổng số buổi khóa mới trừ một.
 */
export function tuitionExemptRemainingSessions(
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  now = new Date(),
) {
  return memoized2(cls, sessions, `exempt|${dateKeyOf(now)}`, () => {
    const elapsed = classElapsedCourseSessions(cls, sessions, now);
    if (elapsed === 0) return classCourseSizeAt(cls, 1);
    const index = courseIndexAtSlotOrdinal(cls, elapsed);
    const usedInCurrentCourse = elapsed - courseSlotOffsetBefore(cls, index);
    return usedInCurrentCourse === 0 ? 0 : classCourseWindowSlotsAt(cls, index) - usedInCurrentCourse;
  });
}

export function refreshTuitionExemptSessionBalances(
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[] = [],
  now = new Date(),
) {
  return students.map((student) => {
    if (!student.tuitionExempt) return student;
    const sessionBalances = { ...(student.sessionBalances || {}) };
    let changed = false;
    for (const cls of classes) {
      if (!(cls.studentIds || []).includes(student.id)) continue;
      const remaining = tuitionExemptRemainingSessions(cls, sessions, now);
      if (sessionBalances[cls.id] === remaining) continue;
      sessionBalances[cls.id] = remaining;
      changed = true;
    }
    return changed ? { ...student, sessionBalances } : student;
  });
}

export function studentRemainingSessions(
  student: { id?: string; tuitionExempt?: boolean; sessionBalances?: Record<string, number | string | null>; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  ledger?: SepayLedger | null,
  now = new Date(),
) {
  if (student.tuitionExempt) return tuitionExemptRemainingSessions(cls, sessions, now);
  if (classBillingMode(cls) === "COURSE" && student.id) {
    return courseRemainingSessions(student, cls, sessions, ledger, now);
  }
  return monthlyRemainingSessions(student, cls, sessions, ledger, now);
}

function sessionIdentity(session: Pick<DemoLessonSession, "id" | "classId" | "date" | "startTime" | "recurrenceKey">) {
  return session.recurrenceKey || `${session.classId}|${session.date}|${session.startTime}`;
}

function findMatchingSession(sessions: DemoLessonSession[], target: DemoLessonSession) {
  return sessions.find((item) => item.id === target.id)
    || sessions.find((item) => sessionIdentity(item) === sessionIdentity(target));
}

/**
 * Buổi tính phí: điểm danh đã lưu, hoặc giáo viên cho nghỉ.
 * Nghỉ lễ / học vụ khóa (admin) luôn thắng — không trừ, không tính phí.
 */
export function sessionChargesTuition(
  session: Pick<DemoLessonSession, "status" | "isOff" | "offSource" | "noFee"> | null | undefined,
) {
  if (!session || session.status === "CANCELLED" || isPlannedTuitionOff(session) || session.noFee) return false;
  if (session.isOff && session.offSource === "TEACHER") return true;
  return session.status === "COMPLETED" && !session.isOff;
}

function sessionStudentIds(session: DemoLessonSession | null | undefined, cls: DemoClass | undefined) {
  return memoized2(cls, session, `ssi|${session?.id || ""}`, () => {
    const ids = new Set<string>(cls?.studentIds || []);
    for (const row of session?.attendance || []) {
      if (row.studentId) ids.add(row.studentId);
    }
    return ids;
  });
}

/**
 * Khi lưu điểm danh: buổi tính phí trừ 1; lưu lại cùng buổi không trừ trùng.
 * GV cho nghỉ vẫn trừ và cộng công nợ khấu trừ kỳ sau. Học bù (bỏ tick nghỉ) không trừ thêm.
 * Học vụ khóa ngày đó thành nghỉ lễ thì hoàn lại buổi đã trừ và bỏ công nợ kỳ sau.
 */
export function applyAttendanceSessionBalances(
  students: DemoStudent[],
  classes: DemoClass[],
  previousSessions: DemoLessonSession[],
  nextSessions: DemoLessonSession[],
  ledger?: SepayLedger | null,
  now = new Date(),
) {
  const classById = new Map(classes.map((item) => [item.id, item]));
  const studentById = new Map(students.map((item) => [item.id, item]));
  const deltas = new Map<string, Map<string, number>>();
  const creditDeltas = new Map<string, Map<string, number>>();

  const addDelta = (classId: string, studentId: string, delta: number) => {
    if (!delta || !studentById.has(studentId)) return;
    const byClass = deltas.get(studentId) || new Map<string, number>();
    byClass.set(classId, (byClass.get(classId) || 0) + delta);
    deltas.set(studentId, byClass);
  };

  const addCreditDelta = (classId: string, studentId: string, delta: number) => {
    if (!delta || !studentById.has(studentId)) return;
    const byClass = creditDeltas.get(studentId) || new Map<string, number>();
    byClass.set(classId, (byClass.get(classId) || 0) + delta);
    creditDeltas.set(studentId, byClass);
  };

  const applyPair = (previous: DemoLessonSession | undefined, next: DemoLessonSession | undefined) => {
    const sample = next || previous;
    if (!sample) return;
    const cls = classById.get(sample.classId);
    // Theo từng phía lưu: buổi nghỉ của tháng vào lớp deferred không tính phí
    // lẫn credit cho học viên đó (tháng này họ không bị thu).
    const chargeableFor = (session: DemoLessonSession | undefined, studentId: string) => (
      Boolean(session) && sessionWithinJoinRule(session!, studentClassJoinDate(studentById.get(studentId), session!.classId))
    );
    // Lớp thu khóa: buổi GV cho nghỉ không đụng vào số dư/công nợ — khóa tự
    // kéo dài một suất lịch để học bù, số buổi tồn được dựng lại theo lịch.
    if (cls && classBillingMode(cls) === "COURSE") return;
    const chargedIds = sessionChargesTuition(previous) ? sessionStudentIds(previous, cls) : new Set<string>();
    const nextIds = sessionChargesTuition(next) ? sessionStudentIds(next, cls) : new Set<string>();
    for (const studentId of new Set([...chargedIds, ...nextIds])) {
      const wasCharged = chargedIds.has(studentId) && chargeableFor(previous, studentId);
      const willCharge = nextIds.has(studentId) && chargeableFor(next, studentId);
      if (willCharge && !wasCharged) addDelta(sample.classId, studentId, -1);
      if (wasCharged && !willCharge) addDelta(sample.classId, studentId, 1);
    }
    const wasTeacherOff = Boolean(previous?.isOff && previous.offSource === "TEACHER");
    const willTeacherOff = Boolean(next?.isOff && next.offSource === "TEACHER");
    if (wasTeacherOff !== willTeacherOff) {
      const offSession = willTeacherOff ? next : previous;
      const affectedIds = sessionStudentIds(offSession, cls);
      for (const studentId of affectedIds) {
        if (chargeableFor(offSession, studentId)) addCreditDelta(sample.classId, studentId, willTeacherOff ? 1 : -1);
      }
    }
    // Buổi nghỉ GV đã có buổi dạy bù (hoặc buổi bù bị hủy/gỡ liên kết) thì tín
    // dụng buổi nghỉ phải trả lại/thu hồi tương ứng — phiếu tháng sau chỉ khấu
    // trừ những buổi nghỉ chưa được dạy bù (T16 09/10 bù 20/10, T12 14/10 bù 31/10).
    const isActiveMakeup = (row: DemoLessonSession | undefined) =>
      Boolean(row?.makeupOf && !row.isOff && row.status !== "CANCELLED");
    const wasMakeup = isActiveMakeup(previous);
    const willMakeup = isActiveMakeup(next);
    if (wasMakeup !== willMakeup) {
      const offId = (willMakeup ? next!.makeupOf : previous!.makeupOf) || "";
      const off = nextSessions.find((row) => row.id === offId) || previousSessions.find((row) => row.id === offId);
      const offCls = off ? classById.get(off.classId) : undefined;
      if (off?.isOff && off.offSource === "TEACHER" && off.status !== "CANCELLED"
        && (!offCls || classBillingMode(offCls) !== "COURSE")) {
        for (const studentId of sessionStudentIds(off, offCls)) {
          if (chargeableFor(off, studentId)) addCreditDelta(off.classId, studentId, willMakeup ? -1 : 1);
        }
      }
    }
  };

  // Tra cứu cặp buổi trước/sau theo id rồi định danh — dựng index một lần thay
  // vì quét toàn danh sách buổi cho từng bản ghi (O(n²) trước đây).
  const sessionMatcher = (list: DemoLessonSession[]) => {
    const byId = new Map<string, DemoLessonSession>();
    const byIdentity = new Map<string, DemoLessonSession>();
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
      const identity = sessionIdentity(item);
      if (!byIdentity.has(identity)) byIdentity.set(identity, item);
    }
    return (target: DemoLessonSession) => byId.get(target.id) || byIdentity.get(sessionIdentity(target));
  };
  const matchPrevious = sessionMatcher(previousSessions);
  const matchNext = sessionMatcher(nextSessions);

  const seenPrevious = new Set<string>();
  for (const next of nextSessions) {
    const previous = matchPrevious(next);
    if (previous) seenPrevious.add(previous.id);
    applyPair(previous, next);
  }
  for (const previous of previousSessions) {
    if (seenPrevious.has(previous.id)) continue;
    if (matchNext(previous)) continue;
    applyPair(previous, undefined);
  }

  const courseClassIds = classes.filter((item) => classBillingMode(item) === "COURSE").map((item) => item.id);
  const hasTuitionExemptStudent = students.some((student) => student.tuitionExempt);
  if (deltas.size === 0 && creditDeltas.size === 0 && !courseClassIds.length && !hasTuitionExemptStudent) return students;

  const updated = students.map((student) => {
    const sessionBalances = { ...(student.sessionBalances || {}) };
    for (const [classId] of deltas.get(student.id) || []) {
      const cls = classById.get(classId);
      if (!cls || classBillingMode(cls) === "COURSE") continue;
      sessionBalances[classId] = monthlyRemainingSessions(student, cls, nextSessions, ledger, now);
    }
    for (const classId of courseClassIds) {
      const cls = classById.get(classId);
      if (!cls) continue;
      if (!(cls.studentIds || []).includes(student.id) && sessionBalances[classId] == null) continue;
      sessionBalances[classId] = courseRemainingSessions(student, cls, nextSessions, ledger, now);
    }
    const tuitionCredits = { ...(student.tuitionCredits || {}) };
    for (const [classId, delta] of creditDeltas.get(student.id) || []) {
      // Giữ nguyên phần âm (nợ cũ theo buổi) — delta buổi nghỉ GV chỉ cộng/trừ
      // vào phần tín dụng dương như trước.
      const current = Math.round(Number(tuitionCredits[classId]) || 0);
      tuitionCredits[classId] = Math.min(0, current) + Math.max(0, Math.max(0, current) + delta);
    }
    return { ...student, sessionBalances, tuitionCredits };
  });
  return refreshTuitionExemptSessionBalances(updated, classes, nextSessions, now);
}

export const SESSION_BALANCE_EPOCH = COURSE_SCHEDULE_START;
export const SESSION_BALANCE_EPOCH_MONTH = SESSION_BALANCE_EPOCH.slice(0, 7);

function dateKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Số buổi tồn đã ghi nhận, chưa trừ các buổi theo lịch còn thiếu điểm danh. */
export function storedSessionBalance(
  student: { sessionBalances?: Record<string, number | string | null> },
  cls: Pick<DemoClass, "id">,
) {
  const stored = student.sessionBalances?.[cls.id];
  if (stored === undefined || stored === null || String(stored) === "") return 0;
  return Math.round(Number(stored) || 0);
}

/**
 * Buổi theo thời khóa biểu từ 01/09 đã diễn ra, kèm bản ghi đã lưu nếu có.
 * Buổi đã qua mà chưa ai lưu điểm danh vẫn coi như đã dạy, giống lớp thu khóa.
 */
export function monthlyElapsedSessions(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseStartDate">,
  sessions: DemoLessonSession[],
  now = new Date(),
) {
  return memoized2(cls, sessions, `melapsed|${dateKeyOf(now)}`, () => monthlyElapsedSessionsImpl(cls, sessions, now));
}

function monthlyElapsedSessionsImpl(
  cls: Pick<DemoClass, "id" | "teacherId" | "roomId" | "schedules" | "courseStartDate">,
  sessions: DemoLessonSession[],
  now: Date,
) {
  const todayKey = dateKeyOf(now);
  const courseStartKey = classCourseStartDate(cls);
  const storedByDate = storedSessionsByClaimDate(sessions, cls.id);
  const rows: DemoLessonSession[] = [];
  const [year, month, day] = SESSION_BALANCE_EPOCH.split("-").map(Number);
  for (
    const cursor = new Date(year, month - 1, day, 12);
    dateKeyOf(cursor) < todayKey;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = dateKeyOf(cursor);
    if (date < courseStartKey) continue;
    const daySlots = (cls.schedules || []).filter((slot) => scheduleSlotAppliesOnDate(slot, date));
    if (!daySlots.length) continue;
    const { claimed } = claimDaySlots(daySlots, storedByDate.get(date) || []);
    for (let index = 0; index < daySlots.length; index += 1) {
      const slot = daySlots[index];
      const stored = claimed[index];
      const recurrenceKey = `${cls.id}|${date}|${slot.startTime}`;
      rows.push(stored || {
        id: `recurring|${recurrenceKey}`,
        classId: cls.id,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherId: cls.teacherId,
        roomId: cls.roomId,
        status: "COMPLETED",
        isExtra: false,
        recurrenceKey,
        note: "",
        isOff: false,
        hasHomework: false,
        attendance: [],
      });
    }
  }
  return rows;
}

/** Buổi đã tính phí của lớp thu tháng, đếm theo lịch chứ không chờ điểm danh.
 * Học viên vào lớp giữa tháng (joinDate) không bị tính các buổi trước ngày vào. */
export function chargedMonthlySessions(
  student: Pick<DemoStudent, "id" | "code" | "fullName"> | string,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now = new Date(),
  joinDate?: string,
) {
  const studentId = typeof student === "string" ? student : student?.id;
  if (!studentId) return 0;
  return memoized2(cls, sessions, `chargedMonthly|${studentId}|${joinDate || ""}|${dateKeyOf(now)}`, () => chargedMonthlySessionsImpl(student, cls, sessions, now, joinDate));
}

function chargedMonthlySessionsImpl(
  student: Pick<DemoStudent, "id" | "code" | "fullName"> | string,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  now: Date,
  joinDate?: string,
) {
  const studentId = typeof student === "string" ? student : student?.id;
  if (!studentId) return 0;
  const generated = monthlyElapsedSessions(cls, sessions, now);
  const seen = new Set(generated.map((item) => sessionIdentity(item)));
  // Buổi của tháng đã được dòng nợ cũ thay thế không đếm nữa — nghĩa vụ của
  // nó nằm trong phần nợ quy ra buổi, đếm tiếp sẽ thu kép.
  const chargeable = (session: DemoLessonSession) => typeof student === "string"
    || !isSupersededDebtMonth(student, cls, String(session.date || "").slice(0, 7));
  let count = 0;
  for (const session of generated) {
    if (!sessionWithinJoinRule(session, joinDate) || !chargeable(session)) continue;
    if (!sessionChargesTuition(session) || !sessionStudentIds(session, cls).has(studentId)) continue;
    count += 1;
  }
  for (const session of sessionsOfClass(sessions, cls.id)) {
    if (session.date < SESSION_BALANCE_EPOCH) continue;
    if (!sessionWithinJoinRule(session, joinDate) || !chargeable(session)) continue;
    if (seen.has(sessionIdentity(session))) continue;
    // Buổi dạy bù học lại đúng buổi nghỉ — buổi nghỉ đã trừ tồn, không trừ lần hai.
    if (session.makeupOf) continue;
    if (!sessionChargesTuition(session) || !sessionStudentIds(session, cls).has(studentId)) continue;
    count += 1;
  }
  return count;
}

/**
 * Số buổi tồn của lớp thu tháng: đã thu bao nhiêu buổi trừ đi số buổi theo
 * lịch đã dạy. Tính thẳng từ biên lai và thời khóa biểu nên không phụ thuộc
 * bộ đếm trong KV, vốn có thể lệch khi dữ liệu được nhập bằng script.
 */
export function monthlyRemainingSessions(
  student: { id?: string; code?: string; fullName?: string; sessionBalances?: Record<string, number | string | null>; tuitionPaidThrough?: Record<string, string>; tuitionCredits?: Record<string, number | string | null>; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  ledger?: SepayLedger | null,
  now = new Date(),
) {
  return memoized3(sessions, ledger, student, `mrs|${cls.id}|${dateKeyOf(now)}`, () => monthlyRemainingSessionsImpl(student, cls, sessions, ledger, now));
}

function monthlyRemainingSessionsImpl(
  student: { id?: string; code?: string; fullName?: string; sessionBalances?: Record<string, number | string | null>; tuitionPaidThrough?: Record<string, string>; tuitionCredits?: Record<string, number | string | null>; classJoinedAt?: Record<string, string> },
  cls: DemoClass,
  sessions: DemoLessonSession[] = [],
  ledger: SepayLedger | null | undefined,
  now: Date,
) {
  if (!student.id) return storedSessionBalance(student, cls);
  const book = ledger || ({ receipts: [], payments: [], receivables: [] } as unknown as SepayLedger);
  // Nợ cũ quy ra buổi: luôn trừ trong tồn kể cả sau khi đã đóng — các buổi đó
  // đã được học thật, khoản đóng chỉ bù lại số đã tiêu. Buổi đã qua của tháng
  // superseded không đếm nữa vì nghĩa vụ của nó nằm trong con số này.
  const price = classSessionPrice(cls);
  // Tháng neo nợ áp dụng khi tháng đó đã tới (đang sống) hoặc đã được đóng.
  const anchorMonths = new Set(paidSessionMonths(student as DemoStudent, cls, book));
  for (let cursor = SESSION_BALANCE_EPOCH_MONTH; cursor <= monthKey(now); cursor = nextMonthKey(cursor)) {
    anchorMonths.add(cursor);
  }
  // Khoản chênh lệch chuyển lớp (phiếu "transfer|…") KHÔNG tính vào nợ buổi —
  // nó đã nằm trong số tiền phiếu của kỳ neo (âm = khấu trừ), không phải nợ
  // buổi riêng. Công nợ hiển thị y như các bạn cùng lớp.
  const debtAmount = studentOldDebtAmount(student, cls, [...anchorMonths]);
  const debtSessions = price > 0 ? Math.round(debtAmount / price) : 0;
  return paidSessionsSinceSeptember(student as DemoStudent, cls, sessions, book)
    - chargedMonthlySessions(student as DemoStudent, cls, sessions, now, studentClassJoinDate(student, cls.id))
    - debtSessions;
}

function receiptClassId(receipt: SepayReceipt, ledger: SepayLedger) {
  if (receipt.classId) return receipt.classId;
  const { paymentById, receivableById } = ledgerRowIndexes(ledger);
  const payment = paymentById.get(receipt.paymentId);
  const receivable = payment ? receivableById.get(payment.receivableId) : undefined;
  return receivable?.classId || "";
}

/** Tháng đã được thu học phí: mốc paidThrough + tháng ghi trên biên lai. */
function paidSessionMonths(student: DemoStudent, cls: DemoClass, ledger: SepayLedger) {
  return memoized2(ledger, student, `psm|${cls.id}`, () => {
    const months = new Set<string>();
    const paidThrough = effectivePaidThrough(student, cls, student.tuitionPaidThrough?.[cls.id]);
    if (validMonthKey(paidThrough) && paidThrough >= SESSION_BALANCE_EPOCH_MONTH) {
      let cursor = SESSION_BALANCE_EPOCH_MONTH;
      while (cursor <= paidThrough) {
        months.add(cursor);
        cursor = nextMonthKey(cursor);
      }
    }
    for (const receipt of receiptsOfStudent(ledger, student.id)) {
      if (receiptClassId(receipt, ledger) !== cls.id) continue;
      if ((receipt.billingMode || classBillingMode(cls)) === "COURSE") continue;
      for (const match of String(receipt.billingPeriod || "").matchAll(/Tháng\s+(0[1-9]|1[0-2])\/(\d{4})/g)) {
        const key = `${match[2]}-${match[1]}`;
        if (key >= SESSION_BALANCE_EPOCH_MONTH) months.add(key);
      }
    }
    return months;
  });
}

export function paidSessionsSinceSeptember(
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
) {
  return memoized3(ledger, sessions, student, `pss|${cls.id}`, () => paidSessionsSinceSeptemberImpl(student, cls, sessions, ledger));
}

function paidSessionsSinceSeptemberImpl(
  student: DemoStudent,
  cls: DemoClass,
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
) {
  const months = paidSessionMonths(student, cls, ledger);
  const price = classSessionPrice(cls);
  const oldDebtSplit = hasOldDebtBill(ledger, student.id, cls.id);
  let extraPaid = 0;
  for (const receipt of receiptsOfStudent(ledger, student.id)) {
    if (receiptClassId(receipt, ledger) !== cls.id) continue;
    const mode = receipt.billingMode || classBillingMode(cls);
    if (mode === "COURSE") {
      extraPaid += price > 0 ? Math.round(receiptTuitionAmount(receipt, joinExcessIndex(ledger).byPayment.get(receipt.paymentId) || 0) / price) : classCourseSizeAt(cls, receiptCourseIndex(receipt, ledger) || 1);
      continue;
    }
    // Biên lai gắn tháng đã nằm trong `months` — không cộng lại theo số tiền.
    if ([...String(receipt.billingPeriod || "").matchAll(/Tháng\s+(0[1-9]|1[0-2])\/(\d{4})/g)]
      .map((match) => `${match[2]}-${match[1]}`)
      .some((key) => key >= SESSION_BALANCE_EPOCH_MONTH)) continue;
    if ((receipt.issuedAt || "") >= SESSION_BALANCE_EPOCH) {
      if (price > 0) extraPaid += Math.round(receiptTuitionAmount(receipt) / price);
    }
  }
  if (classBillingMode(cls) === "COURSE") return extraPaid + appliedJoinExcessSessions(ledger, student.id, cls);
  // Mốc vào lớp: tháng trước ngày vào không tính; tháng vào chỉ tính các buổi
  // kể từ ngày nhập học (phiếu tháng đó ra ngay, không hoãn).
  const joinDate = studentClassJoinDate(student, cls.id);
  const joinMonth = joinDate?.slice(0, 7);
  return extraPaid + [...months].reduce((sum, key) => {
    if (joinMonth && key < joinMonth) return sum;
    // Tháng đã nhập vào dòng nợ cũ: buổi của nó nằm trong debtSessions của tháng
    // neo nợ, không cộng buổi theo lịch nữa.
    if (isSupersededDebtMonth(student, cls, key)) return sum;
    // Phiếu gộp nợ cũ (vd 750k = 8 buổi tháng + 7 buổi nợ): khi tháng neo đã
    // đóng thì phần nợ cũng đã được trả — cộng thêm vào buổi đã thu.
    // Đã tách phiếu nợ cũ riêng: phần nợ được trả qua biên lai của phiếu đó (cộng theo số
    // tiền ở extraPaid), không mặc nhiên coi là đã trả khi tháng neo đã đóng.
    const debtPaid = price > 0 && !oldDebtSplit ? Math.round(studentOldDebtAmount(student, cls, [key]) / price) : 0;
    return sum + billedMonthSessions(cls, sessions, key, key === joinMonth ? joinDate : undefined) + debtPaid;
  }, 0);
}

/** Một lần: buổi GV cho nghỉ đã lưu trước đây chưa trừ tồn thì trừ 1, không đụng công nợ tháng sau. */
export function backfillTeacherOffRemaining(
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
) {
  const classById = new Map(classes.map((item) => [item.id, item]));
  const deltas = new Map<string, Map<string, number>>();
  for (const session of sessions) {
    if (!sessionChargesTuition(session) || session.offSource !== "TEACHER" || !session.isOff) continue;
    const cls = classById.get(session.classId);
    if (!cls || classBillingMode(cls) === "COURSE") continue;
    for (const studentId of sessionStudentIds(session, cls)) {
      const byClass = deltas.get(studentId) || new Map<string, number>();
      byClass.set(session.classId, (byClass.get(session.classId) || 0) - 1);
      deltas.set(studentId, byClass);
    }
  }
  if (deltas.size === 0) return students;
  return students.map((student) => {
    const sessionBalances = { ...(student.sessionBalances || {}) };
    for (const [classId, delta] of deltas.get(student.id) || []) {
      const cls = classById.get(classId);
      if (!cls) continue;
      sessionBalances[classId] = storedSessionBalance(student, cls) + delta;
    }
    return { ...student, sessionBalances };
  });
}

/**
 * Lớp thu khóa không còn khấu trừ qua khóa sau — buổi GV nghỉ đã được bù bằng
 * cách kéo dài khóa. Xóa tín dụng dương sót lại của các lớp thu khóa; giữ
 * nguyên phần âm (nợ buổi cũ) và toàn bộ credit của lớp thu tháng.
 */
export function clearCourseTeacherCredits(
  students: DemoStudent[],
  classes: DemoClass[],
): DemoStudent[] {
  const courseIds = new Set(classes.filter((cls) => classBillingMode(cls) === "COURSE").map((cls) => cls.id));
  return students.map((student) => {
    const credits = student.tuitionCredits;
    if (!credits) return student;
    const next = { ...credits };
    let changed = false;
    for (const classId of courseIds) {
      if ((Math.round(Number(next[classId]) || 0)) > 0) {
        delete next[classId];
        changed = true;
      }
    }
    return changed ? { ...student, tuitionCredits: next } : student;
  });
}

/**
 * Kế toán đã tự trừ và thu các buổi GV nghỉ trước tháng 10/2026 — credit dương
 * sót lại của lớp thu tháng phải xóa để phiếu tháng 11 không trừ lại lần nữa.
 * Giữ nguyên phần âm (nợ buổi cũ) và credit của lớp thu khóa.
 */
export function clearMonthlyTeacherCredits(
  students: DemoStudent[],
  classes: DemoClass[],
): DemoStudent[] {
  const monthlyIds = new Set(classes.filter((cls) => classBillingMode(cls) === "MONTHLY").map((cls) => cls.id));
  return students.map((student) => {
    const credits = student.tuitionCredits;
    if (!credits) return student;
    const next = { ...credits };
    let changed = false;
    for (const classId of monthlyIds) {
      if ((Math.round(Number(next[classId]) || 0)) > 0) {
        delete next[classId];
        changed = true;
      }
    }
    return changed ? { ...student, tuitionCredits: next } : student;
  });
}

export function chargedSessionsSinceSeptember(
  studentId: string,
  cls: DemoClass,
  sessions: DemoLessonSession[],
) {
  let count = 0;
  for (const session of sessionsOfClass(sessions, cls.id)) {
    if (session.date < SESSION_BALANCE_EPOCH) continue;
    if (!sessionChargesTuition(session)) continue;
    if (!sessionStudentIds(session, cls).has(studentId)) continue;
    count += 1;
  }
  return count;
}

/** Đầu tháng 9: mọi lớp = 0, điểm danh đã lưu trừ 1, biên lai thu học phí cộng buổi. */
export function rebuildSeptemberSessionBalances(
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
): DemoStudent[] {
  return students.map((student) => {
    const enrolled = classes.filter((cls) => (cls.studentIds || []).includes(student.id));
    const classIds = new Set([
      ...enrolled.map((cls) => cls.id),
      ...Object.keys(student.sessionBalances || {}),
    ]);
    const sessionBalances: Record<string, number> = {};
    for (const classId of classIds) {
      const cls = classes.find((item) => item.id === classId);
      if (!cls) {
        sessionBalances[classId] = 0;
        continue;
      }
      if (classBillingMode(cls) === "COURSE") {
        sessionBalances[classId] = courseRemainingSessions(student, cls, sessions, ledger);
        continue;
      }
      sessionBalances[classId] = paidSessionsSinceSeptember(student, cls, sessions, ledger)
        - chargedSessionsSinceSeptember(student.id, cls, sessions);
    }
    const tuitionPaidThrough = { ...(student.tuitionPaidThrough || {}) };
    for (const [classId, month] of Object.entries(tuitionPaidThrough)) {
      if (String(month || "") < SESSION_BALANCE_EPOCH_MONTH) delete tuitionPaidThrough[classId];
    }
    return { ...student, sessionBalances, tuitionPaidThrough };
  });
}

export function rebuildCourseSessionBalances(
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  ledger: SepayLedger,
  now = new Date(),
): DemoStudent[] {
  return students.map((student) => {
    const sessionBalances = { ...(student.sessionBalances || {}) };
    let touched = false;
    for (const cls of classes) {
      if (student.tuitionExempt && (cls.studentIds || []).includes(student.id)) {
        sessionBalances[cls.id] = tuitionExemptRemainingSessions(cls, sessions, now);
        touched = true;
        continue;
      }
      if (classBillingMode(cls) !== "COURSE") continue;
      if (!(cls.studentIds || []).includes(student.id) && sessionBalances[cls.id] == null) continue;
      sessionBalances[cls.id] = courseRemainingSessions(student, cls, sessions, ledger, now);
      touched = true;
    }
    return touched ? { ...student, sessionBalances } : student;
  });
}

/**
 * Chuẩn hóa trạng thái học phí đầu kỳ theo hình thức thu của lớp.
 * Lớp thu tháng bắt đầu ở trạng thái chưa đóng; lớp thu khóa luôn có số dư
 * dương để thể hiện khóa hiện tại đã được thanh toán.
 */
export function initializeTuitionStatusByBillingMode(
  students: DemoStudent[],
  classes: DemoClass[],
): DemoStudent[] {
  const classesByStudent = new Map<string, DemoClass[]>();
  for (const cls of classes) {
    for (const studentId of cls.studentIds || []) {
      const enrolled = classesByStudent.get(studentId) || [];
      enrolled.push(cls);
      classesByStudent.set(studentId, enrolled);
    }
  }

  return students.map((student) => {
    const enrolled = classesByStudent.get(student.id) || [];
    if (!enrolled.length) return student;
    const sessionBalances = { ...(student.sessionBalances || {}) };
    const tuitionPaidThrough = { ...(student.tuitionPaidThrough || {}) };
    for (const cls of enrolled) {
      const current = Math.round(Number(sessionBalances[cls.id]) || 0);
      if (classBillingMode(cls) === "MONTHLY") {
        sessionBalances[cls.id] = Math.min(0, current);
        delete tuitionPaidThrough[cls.id];
      } else {
        sessionBalances[cls.id] = current > 0
          ? current
          : Math.max(1, current + classCourseSizeAt(cls, classCurrentCourseIndex(cls)));
      }
    }
    return { ...student, sessionBalances, tuitionPaidThrough };
  });
}

/**
 * Mốc "đã đóng tới tháng" của lớp thu tháng chỉ sinh ra khi thu học phí, nên nó
 * phải luôn có biên lai đi kèm. Bản cũ từng ghi đè mất biên lai mà vẫn giữ mốc,
 * khiến học viên hiện là đã thu nhưng không có phiếu ở nhật ký thu chi và cũng
 * không thu lại được. Kéo mốc về đúng tháng còn biên lai để thu lại được.
 */
export function clampPaidThroughToReceipts(
  students: DemoStudent[],
  classes: DemoClass[],
  ledger: SepayLedger,
): DemoStudent[] {
  const monthlyClassIds = new Set(
    classes.filter((cls) => classBillingMode(cls) === "MONTHLY").map((cls) => cls.id),
  );
  if (!monthlyClassIds.size) return students;
  const classIdsWithReceipt = new Map<string, Set<string>>();
  for (const receipt of ledger.receipts || []) {
    const classId = receiptClassId(receipt, ledger);
    if (!receipt.studentId || !monthlyClassIds.has(classId)) continue;
    const owned = classIdsWithReceipt.get(receipt.studentId) || new Set<string>();
    owned.add(classId);
    classIdsWithReceipt.set(receipt.studentId, owned);
  }

  return students.map((student) => {
    const marks = student.tuitionPaidThrough || {};
    const tuitionPaidThrough = { ...marks };
    let changed = false;
    for (const [classId, month] of Object.entries(marks)) {
      if (!monthlyClassIds.has(classId) || !validMonthKey(month)) continue;
      const covered = receiptMonthKeys(ledger, student.id, classId).filter(validMonthKey).sort().at(-1);
      if (covered) {
        if (covered >= month) continue;
        tuitionPaidThrough[classId] = covered;
      } else {
        // Biên lai không ghi được tháng vẫn là bằng chứng đã thu, chỉ bỏ mốc khi không còn biên lai nào.
        if (classIdsWithReceipt.get(student.id)?.has(classId)) continue;
        delete tuitionPaidThrough[classId];
      }
      changed = true;
    }
    return changed ? { ...student, tuitionPaidThrough } : student;
  });
}

export type CollectTuitionMethod = "TRANSFER" | "CASH";

export function collectMethodLabel(method: string) {
  return method === "CASH" || method === "Tiền mặt" ? "Tiền mặt" : "Chuyển khoản";
}

/**
 * Tìm khoản phải thu đúng billKey của học viên, hoặc tạo mới nếu chưa có. Dùng chung
 * cho đường thu tay (collectManualTuition) và "Gửi yêu cầu thanh toán" (Phase 4), để
 * hai đường không bao giờ tạo hai khoản khác nhau cho cùng một kỳ học phí.
 */
export function ensureReceivableForCharge(
  ledger: SepayLedger,
  student: { id: string; fullName: string; code?: string },
  cls: { id: string; code?: string },
  charge: { billKey: string; period: string; amount: number },
  now: string,
): { ledger: SepayLedger; receivable: SepayReceivable } {
  // Phiếu đã hủy không được dùng lại để ghi thu.
  const existing = receivablesOfStudent(ledger, student.id).find((row) => row.billKey === charge.billKey && row.status !== "CANCELLED");
  if (existing) return { ledger, receivable: existing };
  const friendlyCode = billPaymentCode(cls, student, charge.billKey);
  const codeTaken = Boolean(friendlyCode)
    && ledger.paymentOrders.some((row) => row.paymentCode === friendlyCode && row.status === "ACTIVE");
  const created = createReceivable({
    studentId: student.id,
    studentName: student.fullName,
    billingPeriod: charge.period,
    amountDue: charge.amount,
    usedCodes: ledger.paymentOrders.map((row) => row.paymentCode),
    paymentCode: codeTaken ? undefined : friendlyCode,
    now,
  });
  created.receivable.classId = cls.id;
  created.receivable.billKey = charge.billKey;
  const withNew: SepayLedger = {
    ...ledger,
    receivables: [created.receivable, ...ledger.receivables],
    paymentOrders: [{ ...refreshOrderQr(created.order, ledger.settings, charge.amount) }, ...ledger.paymentOrders],
  };
  // Áp tín dụng bảo lưu/tiền thừa ngay khi lập phiếu — đường thu tay phải thu
  // đúng số net như đường tự động.
  const applied = applyStudentCreditsToReceivables(withNew);
  return { ledger: applied, receivable: applied.receivables.find((row) => row.id === created.receivable.id) || created.receivable };
}

/**
 * Dựng biên lai đầy đủ field, dùng chung cho đường thu tay (collectManualTuition) và
 * đường webhook (activateSessionsForPayment) — hai đường phải sinh ra biên lai giống
 * hệt nhau về cấu trúc, khác nhau duy nhất ở method/note (Phase 5).
 */
export function buildTuitionReceipt(input: {
  receiptNumber: string;
  paymentId: string;
  student: { id: string; fullName: string; code?: string; tuitionPaidThrough?: Record<string, string> };
  cls: { id: string; name: string };
  charge: ReturnType<typeof tuitionCollectionCharge>;
  method: string;
  note: string;
  issuedAt: string;
}): SepayReceipt {
  return {
    id: `rcpt-${crypto.randomUUID()}`,
    receiptNumber: input.receiptNumber,
    paymentId: input.paymentId,
    studentId: input.student.id,
    amount: input.charge.amount,
    issuedAt: input.issuedAt,
    status: "ISSUED",
    method: input.method,
    note: input.note,
    classId: input.cls.id,
    className: input.cls.name,
    billingPeriod: input.charge.period,
    billingMode: input.charge.mode,
    studentName: input.student.fullName,
    studentCode: input.student.code || "",
    creditSessionsUsed: input.charge.creditSessions,
    materialsAmount: input.charge.materialsAmount,
    paidThroughBefore: input.student.tuitionPaidThrough?.[input.cls.id],
  };
}

export function collectManualTuition(input: {
  ledger: SepayLedger;
  student: { id: string; fullName: string; code?: string; sessionBalances?: Record<string, number | string | null>; tuitionCredits?: Record<string, number | string | null>; tuitionPaidThrough?: Record<string, string>; classJoinedAt?: Record<string, string> };
  cls: DemoClass;
  sessions: DemoLessonSession[];
  method: CollectTuitionMethod;
  note?: string;
  now?: Date;
  courseIndexOverride?: number;
  /** Số tiền tối đa ghi vào phiếu này (thu thiếu / chia khoản). Bỏ trống = thu đủ phần còn nợ. */
  amountCap?: number;
  /** Mốc tính kỳ thu (thu trước kỳ sau); biên lai vẫn ghi theo `now`. */
  chargeNow?: Date;
  /** Cho thu trước khóa chưa bắt đầu (phần tiền dư chuyển sang khóa sau). */
  allowEarly?: boolean;
}): { error: string } | {
  ledger: SepayLedger;
  charge: ReturnType<typeof tuitionCollectionCharge>;
  payment: SepayLedgerPayment;
  receipt: SepayReceipt;
  receivable: SepayReceivable;
  sessionsAdded: number;
  remainingAfter: number;
  paidThroughMonth?: string;
} {
  const now = input.now || new Date();
  const iso = now.toISOString();
  const methodLabel = collectMethodLabel(input.method);
  const chargeNow = input.chargeNow || now;
  const charge = tuitionCollectionCharge(input.student, input.cls, input.sessions, input.ledger, chargeNow, input.courseIndexOverride);
  if (charge.mode === "MONTHLY" && charge.months.length === 0) return { error: "Học phí đến tháng hiện tại đã được thanh toán." };
  if (charge.mode === "COURSE") {
    // Chỉ thu khóa đã bắt đầu và còn nợ — chặn thu trùng khóa đã đủ, chặn thu
    // trước khóa chưa mở (khóa đó chỉ xem được phiếu báo).
    const courseIndex = courseIndexOfBillKey(charge.billKey);
    const current = classCurrentCourseIndex(input.cls, now, input.sessions);
    const rows = studentCourseReceivables(input.ledger, input.student.id, input.cls).get(courseIndex) || [];
    if (courseIndex > current && !input.allowEarly && !rows.some(isRequestedEarly)) return { error: `Khóa ${courseIndex} chưa bắt đầu — chỉ xem được phiếu báo, chưa thu tiền.` };
    if (rows.length && !rows.some(isOpenWithBalance)) return { error: `Khóa ${courseIndex} đã đóng đủ học phí.` };
    if (!rows.length && isLegacyPaidCourse(input.student, input.cls, input.sessions, input.ledger, courseIndex, now)) {
      return { error: `Khóa ${courseIndex} đã thu trước khi dùng hệ thống.` };
    }
  }
  if (charge.amount <= 0) return { error: "Lớp chưa có đơn giá hoặc số buổi để thu." };

  const ensured = ensureReceivableForCharge(input.ledger, input.student, input.cls, charge, iso);
  const ledger = ensured.ledger;
  const receivable = ensured.receivable;

  // Thu đúng số còn phải trả sau trừ bảo lưu — phiếu đã áp credit thì chỉ còn
  // balanceDue; phiếu chưa áp (không có credit mở) thì thu đủ báo giá.
  const fullDue = Math.max(0, Math.round(Number(receivable.balanceDue) || 0)) || charge.amount;
  const cap = input.amountCap === undefined ? fullDue : Math.max(0, Math.round(Number(input.amountCap) || 0));
  const allocated = Math.min(fullDue, cap);
  if (allocated <= 0) return { error: "Số tiền thu phải lớn hơn 0." };
  // Lần thu đầu của phiếu mới dùng buổi khấu trừ / học liệu; các lần thu thêm
  // (trả góp) chỉ là tiền học phí còn thiếu — không trừ học liệu, khấu trừ lần hai.
  const priorPaid = Math.max(0, Math.round(Number(receivable.amountPaid) || 0));
  const receiptMaterials = Math.min(allocated, Math.max(0, Math.round(Number(charge.materialsAmount) || 0) - priorPaid));
  const receiptCreditSessions = priorPaid > 0 ? 0 : charge.creditSessions;
  const nextPaid = (receivable.amountPaid || 0) + allocated;
  const nextDue = Math.max(receivable.amountDue || 0, nextPaid);
  const nextBalance = Math.max(0, nextDue - nextPaid);
  const nextReceivable: SepayReceivable = {
    ...receivable,
    studentName: input.student.fullName,
    billingPeriod: charge.period,
    classId: input.cls.id,
    billKey: charge.billKey,
    amountDue: nextDue,
    amountPaid: nextPaid,
    balanceDue: nextBalance,
    status: nextBalance === 0 ? (nextPaid > nextDue ? "OVERPAID" : "PAID") : "PARTIALLY_PAID",
  };
  const order = ledger.paymentOrders.find((row) => row.id === receivable.paymentOrderId);
  const payment: SepayLedgerPayment = {
    id: `pay-${crypto.randomUUID()}`,
    paymentCode: order?.paymentCode || receivable.receivableCode,
    studentId: input.student.id,
    bankTransactionId: `manual-${crypto.randomUUID()}`,
    receivableId: receivable.id,
    amount: allocated,
    allocatedAmount: allocated,
    excessAmount: 0,
    status: "COMPLETED",
    paidAt: iso,
    method: methodLabel,
    note: input.note || "",
  };
  const receipt = buildTuitionReceipt({
    receiptNumber: nextReceiptNumber(ledger.receipts, now),
    paymentId: payment.id,
    student: input.student,
    cls: input.cls,
    charge: { ...charge, amount: allocated, materialsAmount: receiptMaterials, creditSessions: receiptCreditSessions },
    method: methodLabel,
    note: input.note || "",
    issuedAt: iso,
  });

  return {
    ledger: {
      ...ledger,
      receivables: ledger.receivables.map((row) => row.id === nextReceivable.id ? nextReceivable : row),
      // Thu một phần: mã thanh toán của phiếu vẫn mở để phụ huynh chuyển nốt phần còn thiếu.
      paymentOrders: nextBalance > 0 ? ledger.paymentOrders : ledger.paymentOrders.map((row) => row.id === receivable.paymentOrderId ? { ...row, status: "PAID" } : row),
      payments: [payment, ...ledger.payments],
      receipts: [receipt, ...ledger.receipts],
    },
    charge,
    payment,
    receipt,
    receivable: nextReceivable,
    sessionsAdded: charge.billed,
    // Ledger tạm phải có cả payment mới — receiptCourseIndex tra payment →
    // receivable để suy ra khóa; thiếu payment thì biên lai mới rơi về khóa 1.
    remainingAfter: charge.mode === "COURSE"
      ? courseRemainingSessions(input.student, input.cls, input.sessions, {
        ...ledger,
        payments: [payment, ...ledger.payments],
        receipts: [receipt, ...ledger.receipts],
      })
      : monthlyRemainingSessions(input.student, input.cls, input.sessions, {
        ...ledger,
        payments: [payment, ...ledger.payments],
        receipts: [receipt, ...ledger.receipts],
      }, now),
    paidThroughMonth: charge.mode === "MONTHLY" ? charge.months.at(-1) : undefined,
  };
}

/** Các tháng trong billKey phiếu tháng ("month|lớp|2026-10" / "months|lớp|2026-09,2026-10"). */
function receivableMonths(row: Pick<SepayReceivable, "billKey">) {
  const parts = String(row.billKey || "").split("|");
  if (parts[0] !== "month" && parts[0] !== "months") return [];
  return String(parts[2] || "").split(",").filter(validMonthKey).sort();
}

/**
 * Phiếu tháng đã thu một phần (trả góp / thu thiếu) còn nợ của học viên ở lớp này,
 * cũ trước. Tháng của phiếu đã được tính là đã đóng (có biên lai) nên phần thiếu
 * không nằm trong báo giá các tháng chưa đóng — phải truy thu riêng theo phiếu.
 */
export const PAST_MONTH_DEBT_FROM = "2026-10";
/** Phiếu MỘT tháng đã qua (trước tháng hiện tại) còn nợ, chưa đóng đồng nào → nợ cũ đứng riêng. */
export function isPastMonthDebtBill(row: Pick<SepayReceivable, "billKey" | "status" | "balanceDue" | "amountPaid">, currentMonth: string) {
  const parts = String(row.billKey || "").split("|");
  // Từ tháng 10/2026 (tháng đầu lập phiếu riêng từng tháng); tháng 9 trở về trước do các bản vá nợ cũ xử lý.
  return parts[0] === "month" && validMonthKey(parts[2]) && parts[2] >= PAST_MONTH_DEBT_FROM && parts[2] < currentMonth
    && (row.status === "OPEN" || row.status === "PARTIALLY_PAID") && Math.round(Number(row.balanceDue) || 0) > 0;
}

/** Tháng của một phiếu truy thu: phiếu nợ cũ riêng tính là tháng 9/2026, phiếu tháng là tháng đầu. */
export function carryReceivableMonth(row: Pick<SepayReceivable, "billKey">) {
  return isOldDebtBillKey(row.billKey) ? OLD_DEBT_SPLIT_MONTH : receivableMonths(row)[0];
}

export function monthlyCarryReceivables(ledger: SepayLedger, studentId: string, classId: string, now = new Date()) {
  // Phiếu nợ cũ riêng còn nợ luôn là khoản truy thu đầu tiên (cũ nhất), kể cả chưa thu đồng nào;
  // phiếu một tháng đã qua còn nợ (chưa đóng) cũng là nợ cũ đứng riêng.
  const carryMonth = carryReceivableMonth;
  const currentMonth = monthKey(now);
  return receivablesOfStudent(ledger, studentId)
    .filter((row) => row.classId === classId
      && ["OPEN", "PARTIALLY_PAID"].includes(String(row.status))
      && Math.round(Number(row.balanceDue) || 0) > 0
      && (isOldDebtBillKey(row.billKey)
        || isPastMonthDebtBill(row, currentMonth)
        || (Math.round(Number(row.amountPaid) || 0) > 0 && receivableMonths(row).length > 0)))
    .sort((a, b) => carryMonth(a).localeCompare(carryMonth(b)) || String(a.issueDate || "").localeCompare(String(b.issueDate || "")));
}

/** Nợ cũ in trên phiếu tháng `beforeMonth`: phiếu tháng trước còn nợ (chưa đóng / đóng thiếu) + phiếu nợ cũ riêng. */
export function monthlyPriorDebtReceivables(ledger: SepayLedger, studentId: string, classId: string, beforeMonth: string) {
  return receivablesOfStudent(ledger, studentId)
    .filter((row) => row.classId === classId
      && ["OPEN", "PARTIALLY_PAID"].includes(String(row.status))
      && Math.round(Number(row.balanceDue) || 0) > 0
      && Boolean(carryReceivableMonth(row)) && carryReceivableMonth(row) < beforeMonth)
    .sort((a, b) => carryReceivableMonth(a).localeCompare(carryReceivableMonth(b)));
}

/** Thu thêm vào đúng một phiếu đã thu một phần (truy thu phần còn thiếu). */
export function collectReceivableTopUp(input: {
  ledger: SepayLedger;
  student: { id: string; fullName: string; code?: string; tuitionPaidThrough?: Record<string, string> };
  cls: DemoClass;
  receivable: SepayReceivable;
  amountCap: number;
  method: CollectTuitionMethod;
  note?: string;
  now?: Date;
}): { error: string } | { ledger: SepayLedger; payment: SepayLedgerPayment; receipt: SepayReceipt; receivable: SepayReceivable; charge: ReturnType<typeof tuitionCollectionCharge> } {
  const now = input.now || new Date();
  const iso = now.toISOString();
  const row = input.ledger.receivables.find((item) => item.id === input.receivable.id) || input.receivable;
  const balance = Math.max(0, Math.round(Number(row.balanceDue) || 0));
  const allocated = Math.min(balance, Math.max(0, Math.round(Number(input.amountCap) || 0)));
  if (allocated <= 0) return { error: "Phiếu không còn nợ." };
  const months = receivableMonths(row);
  const mode: "MONTHLY" | "COURSE" = months.length || isOldDebtBillKey(row.billKey) ? "MONTHLY" : "COURSE";
  const methodLabel = collectMethodLabel(input.method);
  const nextPaid = Math.round(Number(row.amountPaid) || 0) + allocated;
  const nextDue = Math.max(Math.round(Number(row.amountDue) || 0), nextPaid);
  const nextBalance = Math.max(0, nextDue - nextPaid);
  const nextReceivable: SepayReceivable = { ...row, amountPaid: nextPaid, balanceDue: nextBalance, amountDue: nextDue, status: nextBalance === 0 ? "PAID" : "PARTIALLY_PAID" };
  const order = input.ledger.paymentOrders.find((item) => item.id === row.paymentOrderId);
  const payment: SepayLedgerPayment = {
    id: `pay-${crypto.randomUUID()}`,
    paymentCode: order?.paymentCode || row.receivableCode,
    studentId: input.student.id,
    bankTransactionId: `manual-${crypto.randomUUID()}`,
    receivableId: row.id,
    amount: allocated,
    allocatedAmount: allocated,
    excessAmount: 0,
    status: "COMPLETED",
    paidAt: iso,
    method: methodLabel,
    note: input.note || "",
  };
  const charge = {
    mode, months, billKey: String(row.billKey || ""), period: `${row.billingPeriod} · thu thêm phần còn thiếu`,
    amount: allocated, billed: 0, creditSessions: 0, materialsAmount: 0,
  } as unknown as ReturnType<typeof tuitionCollectionCharge>;
  const receipt = buildTuitionReceipt({
    receiptNumber: nextReceiptNumber(input.ledger.receipts, now),
    paymentId: payment.id,
    student: input.student,
    cls: input.cls,
    charge: { ...charge, period: row.billingPeriod } as ReturnType<typeof tuitionCollectionCharge>,
    method: methodLabel,
    note: input.note || "",
    issuedAt: iso,
  });
  return {
    ledger: {
      ...input.ledger,
      receivables: input.ledger.receivables.map((item) => item.id === row.id ? nextReceivable : item),
      paymentOrders: nextBalance === 0
        ? input.ledger.paymentOrders.map((item) => item.id === row.paymentOrderId ? { ...item, status: "PAID" as const } : item)
        : input.ledger.paymentOrders,
      payments: [payment, ...input.ledger.payments],
      receipts: [receipt, ...input.ledger.receipts],
    },
    payment, receipt, receivable: nextReceivable, charge,
  };
}

export type CollectAmountStep = {
  kind: "DUE" | "CARRY" | "PREPAY";
  payment: SepayLedgerPayment;
  receipt: SepayReceipt;
  receivable: SepayReceivable;
  charge: ReturnType<typeof tuitionCollectionCharge>;
};

/**
 * Thu theo SỐ TIỀN THỰC THU (chốt với trung tâm 25/10/2026). Tiền phân bổ cũ trước:
 *  1. Phần còn thiếu của các phiếu đã thu một phần (truy thu kỳ trước).
 *  2. Kỳ đang cần thu (như thu đủ theo phiếu) — thu thiếu thì phiếu ở trạng thái
 *     "Đã thu một phần", phần thiếu tự hiện thành dòng truy thu ở phiếu kỳ sau.
 *  3. Còn dư → thu trước kỳ sau (tháng sau / khóa sau): phiếu kỳ sau ghi "đã thu trước"
 *     nên chỉ còn phải nộp phần chênh — đó là khấu trừ.
 * Mỗi phần là một biên lai riêng gắn đúng phiếu, nên sổ thu chi, số buổi đã đóng và
 * doanh số theo kỳ đều khớp. Vượt quá tất cả các kỳ có thể thu thì báo lỗi, không ghi gì.
 */
export function collectTuitionAmount(input: {
  ledger: SepayLedger;
  student: Parameters<typeof collectManualTuition>[0]["student"];
  cls: DemoClass;
  sessions: DemoLessonSession[];
  method: CollectTuitionMethod;
  amount: number;
  note?: string;
  now?: Date;
  courseIndexOverride?: number;
  /** Lớp tháng: tháng kế toán chọn thu ("YYYY-MM"). Thu đúng tháng đó (kèm truy thu phần còn
   * thiếu của tháng trước đã đóng thiếu), dư thì trừ các tháng sau; tháng trước chưa đóng đồng
   * nào giữ nguyên nợ (không tự trừ vào). */
  startMonth?: string;
}): { error: string } | {
  ledger: SepayLedger;
  steps: CollectAmountStep[];
  total: number;
  remainingAfter: number;
  paidThroughMonth?: string;
  creditSessionsUsed: number;
} {
  const now = input.now || new Date();
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) return { error: "Số tiền thực thu phải lớn hơn 0." };
  let ledger = input.ledger;
  let left = amount;
  const steps: CollectAmountStep[] = [];
  let firstError = "";
  const base = { student: input.student, cls: input.cls, sessions: input.sessions, method: input.method, note: input.note, now };
  const take = (kind: CollectAmountStep["kind"], result: { ledger: SepayLedger; payment: SepayLedgerPayment; receipt: SepayReceipt; receivable: SepayReceivable; charge: ReturnType<typeof tuitionCollectionCharge> }) => {
    ledger = result.ledger;
    left -= result.payment.allocatedAmount;
    steps.push({ kind, payment: result.payment, receipt: result.receipt, receivable: result.receivable, charge: result.charge });
  };
  const topUp = (row: SepayReceivable, kind: CollectAmountStep["kind"]) => {
    const result = collectReceivableTopUp({ ledger, student: input.student, cls: input.cls, receivable: row, amountCap: left, method: input.method, note: input.note, now });
    if (!("error" in result)) take(kind, result);
  };
  const isMonthly = classBillingMode(input.cls) === "MONTHLY";
  if (isMonthly) {
    const current = monthKey(now);
    const start = validMonthKey(input.startMonth) ? input.startMonth! : "";
    if (start && start > current) return { error: `Tháng ${monthLabel(start)} chưa tới — chọn tháng hiện tại; phần đóng dư tự trừ vào tháng sau.` };
    for (const row of monthlyCarryReceivables(ledger, input.student.id, input.cls.id, now)) {
      const month = carryReceivableMonth(row);
      if (left <= 0 || month > current) continue;
      // Tháng trước tháng chọn: đã đóng thiếu → truy thu cùng tháng chọn; chưa đóng đồng nào → giữ nguyên nợ.
      if (start && month < start && !(Math.round(Number(row.amountPaid) || 0) > 0)) continue;
      topUp(row, "CARRY");
    }
    if (left > 0) {
      const due = collectManualTuition({ ...base, ledger, amountCap: left });
      if ("error" in due) firstError = due.error; else take("DUE", due);
    }
    // Đóng nhiều hơn tháng đã chọn mà còn nợ cũ (tháng trước chưa đóng — phiếu báo in kèm nợ cũ):
    // phần dư trả nợ cũ trước, còn dư nữa mới trừ tháng sau.
    if (start && left > 0) {
      for (const row of monthlyCarryReceivables(ledger, input.student.id, input.cls.id, now)) {
        if (left > 0 && carryReceivableMonth(row) < start) topUp(row, "CARRY");
      }
      for (const row of monthlyPriorDebtReceivables(ledger, input.student.id, input.cls.id, start)) {
        if (left > 0 && Math.round(Number(row.balanceDue) || 0) > 0) topUp(row, "CARRY");
      }
    }
    // Còn dư: phiếu tháng sau đã thu một phần trước đó, rồi thu trước tối đa 3 tháng kế tiếp.
    for (let step = 1; step <= 3 && left > 0; step += 1) {
      for (const row of monthlyCarryReceivables(ledger, input.student.id, input.cls.id, now)) {
        if (left > 0 && receivableMonths(row)[0] > current) topUp(row, "PREPAY");
      }
      if (left <= 0) break;
      const [year, month] = current.split("-").map(Number);
      const chargeNow = new Date(year, month - 1 + step, 1, 12);
      const ahead = collectManualTuition({ ...base, ledger, amountCap: left, chargeNow });
      if (!("error" in ahead)) take("PREPAY", ahead);
    }
  } else {
    // Lớp thu khóa: khóa kế toán chọn (hoặc khóa cũ nhất còn nợ) trước, rồi lần lượt các khóa còn nợ.
    for (let step = 0; step < 8 && left > 0; step += 1) {
      const due = collectManualTuition({ ...base, ledger, amountCap: left, courseIndexOverride: step === 0 ? input.courseIndexOverride : undefined });
      if ("error" in due) {
        // Khóa kế toán chọn không thu được (đã đủ / chưa bắt đầu) → báo đúng lỗi như thu đủ.
        if (step === 0 && input.courseIndexOverride) return { error: due.error };
        if (!firstError) firstError = due.error;
        break;
      }
      take("DUE", due);
    }
    // Còn dư: thu trước khóa sau (một khóa).
    const current = classCurrentCourseIndex(input.cls, now, input.sessions);
    for (let index = current + 1; index <= current + 1 && left > 0; index += 1) {
      const ahead = collectManualTuition({ ...base, ledger, amountCap: left, courseIndexOverride: index, allowEarly: true });
      if (!("error" in ahead)) take("PREPAY", ahead);
    }
  }
  if (!steps.length) return { error: firstError || "Không có kỳ học phí nào để thu." };
  if (left > 0) {
    return { error: `Số tiền vượt quá học phí có thể thu: tối đa ${(amount - left).toLocaleString("vi-VN")}đ (kỳ đang nợ + thu trước tối đa 3 tháng / 1 khóa sau). Phần dư ${left.toLocaleString("vi-VN")}đ chưa có kỳ để trừ.` };
  }
  const monthsPaid = steps.flatMap((item) => (item.charge.mode === "MONTHLY" && item.kind !== "CARRY" ? item.charge.months || [] : [])).sort();
  return {
    ledger,
    steps,
    total: amount,
    remainingAfter: isMonthly
      ? monthlyRemainingSessions(input.student as DemoStudent, input.cls, input.sessions, ledger, now)
      : courseRemainingSessions(input.student as DemoStudent, input.cls, input.sessions, ledger, now),
    paidThroughMonth: monthsPaid.at(-1),
    creditSessionsUsed: steps.reduce((sum, item) => sum + (Number(item.receipt.creditSessionsUsed) || 0), 0),
  };
}

export type ActivateSessionsResult =
  | { status: "ALREADY_ACTIVATED" }
  | { status: "ERROR"; error: string; reviewReason: ReviewReason }
  | { status: "OK"; ledger: SepayLedger; students: DemoStudent[]; receipt: SepayReceipt; charge: ReturnType<typeof tuitionCollectionCharge> };

/**
 * Kích hoạt số buổi ngay khi webhook khớp tiền — thuần, không đọc kho, không gọi mạng
 * (mọi I/O nằm ở worker.ts). Dùng đúng tuitionCollectionCharge như đường thu tay, nên
 * hai đường không bao giờ lệch nhau (D2, Phase 5).
 */
export function activateSessionsForPayment(input: {
  ledger: SepayLedger;
  receivable: SepayReceivable;
  payment: SepayLedgerPayment;
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  now?: Date;
}): ActivateSessionsResult {
  const now = input.now || new Date();
  const student = input.students.find((row) => row.id === input.receivable.studentId);
  const cls = input.classes.find((row) => row.id === input.receivable.classId);
  if (!student || !cls) return { status: "ERROR", error: "Không tìm thấy học viên hoặc lớp của khoản phải thu này.", reviewReason: "INVALID_RECEIVABLE" };
  if (student.tuitionExempt) return { status: "ERROR", error: "Học viên này đang được miễn học phí.", reviewReason: "TUITION_EXEMPT" };

  const existingReceipt = input.ledger.receipts.find((row) => row.paymentId === input.payment.id);
  if (!existingReceipt) return { status: "ERROR", error: "Không tìm thấy biên lai của giao dịch này.", reviewReason: "INVALID_RECEIVABLE" };
  // Biên lai đã có classId nghĩa là lượt trước đã kích hoạt xong — bỏ qua, không cộng buổi lần hai.
  if (existingReceipt.classId) return { status: "ALREADY_ACTIVATED" };

  // Tính lại đúng khóa của khoản phải thu — biên lai đang chờ chưa có classId nên
  // không thể đếm từ receipts, phải đi theo billKey của chính receivable này.
  const receivableCourse = String(input.receivable.billKey || "").startsWith(`${COURSE_MATERIAL_KEY}|`)
    ? courseIndexOfBillKey(input.receivable.billKey)
    : undefined;
  const charge = tuitionCollectionCharge(student, cls, input.sessions, input.ledger, now, receivableCourse);
  // Phiếu chênh lệch chuyển lớp lập tay theo tiền — không qua báo giá nên bỏ
  // qua đối chiếu charge.amount; biên lai ghi đúng kỳ/lớp của chính phiếu.
  // Phiếu nợ cũ riêng cũng lập theo tiền (không qua báo giá): biên lai theo chính phiếu.
  const isTransfer = isTransferBillKey(input.receivable.billKey) || isOldDebtBillKey(input.receivable.billKey);
  // Phiếu đã trừ bảo lưu/tín dụng thì số tiền thực thu = báo giá − credit đã áp.
  const appliedCreditTotal = (input.receivable.appliedCredits || [])
    .reduce((sum, item) => sum + (Math.round(Number(item.amount)) || 0), 0);
  // Phiếu thu một phần: receivable.amountPaid đã cộng lần thanh toán này, nên
  // phần đã thu trước = amountPaid − allocated lần này. Lần cuối chỉ cần khớp
  // số dư còn lại, không phải nguyên báo giá.
  const priorPaid = Math.max(0,
    Math.round(Number(input.receivable.amountPaid) || 0)
    - Math.round(Number(input.payment.allocatedAmount) || 0));
  const expectedPaid = Math.max(0, charge.amount - appliedCreditTotal - priorPaid);
  // Phiếu tháng trả góp (đã thu một phần) hoặc phiếu tháng khác kỳ đang cần thu
  // (thu trước tháng sau): biên lai ghi theo chính phiếu — tiền đã khớp đúng số dư
  // của phiếu nên không cần đối chiếu báo giá, không dùng lại khấu trừ / học liệu.
  // Chuyển thiếu (sao kê ghi nhận một phần) hoặc chuyển nốt phần còn thiếu của
  // phiếu khóa cũng ghi biên lai theo chính phiếu — như thu tay "thu thiếu".
  const ownMonths = receivableMonths(input.receivable);
  const receivableHead = String(input.receivable.billKey || "").split("|")[0];
  const balanceAfter = Math.max(0, Math.round(Number(input.receivable.balanceDue) || 0));
  // Phiếu đã gửi là số chuẩn (anh Mori 16/11/2026): phụ huynh trả ĐỦ đúng số của phiếu thì ghi biên lai /
  // số buổi theo chính phiếu đó, không tính lại theo công thức hiện tại (vd tín dụng buổi GV nghỉ được áp
  // sau khi phiếu đã gửi) — phần chênh dồn sang kỳ sau. Chỉ áp khi báo giá tính lại lệch với phiếu;
  // khớp thì đi đường cũ y nguyên.
  const settlesSentBill = Math.round(Number(input.receivable.amountDue) || 0) > 0
    && priorPaid + Math.round(Number(input.payment.allocatedAmount) || 0) === Math.round(Number(input.receivable.amountDue) || 0)
    && balanceAfter === 0
    && (ownMonths.length > 0 || receivableHead === COURSE_MATERIAL_KEY);
  const receivableBased = !isTransfer && ((ownMonths.length > 0
    ? (charge.billKey !== input.receivable.billKey || priorPaid > 0 || balanceAfter > 0)
    : receivableHead === COURSE_MATERIAL_KEY && (priorPaid > 0 || balanceAfter > 0))
    || (settlesSentBill && input.payment.allocatedAmount !== expectedPaid));
  // Học liệu thu ở phần tiền đầu tiên của phiếu, các lần sau chỉ là học phí.
  const receiptMaterials = Math.min(input.payment.allocatedAmount, Math.max(0,
    (charge.billKey === input.receivable.billKey ? Math.round(Number(charge.materialsAmount) || 0) : 0) - priorPaid));
  if (!isTransfer && !receivableBased && input.payment.allocatedAmount !== expectedPaid) {
    return { status: "ERROR", error: "Số tiền đã phân bổ lệch với số tiền cần thu, cần kế toán kiểm tra tay.", reviewReason: "AMOUNT_MISMATCH" };
  }

  const receipt: SepayReceipt = isTransfer
    ? {
      // Biên lai của phiếu chuyển lớp: số tiền và kỳ lấy từ chính khoản phải thu
      // (không chứa "Tháng MM/YYYY" nên không đánh dấu tháng đã đóng — tiền chỉ
      // cộng vào buổi đã thu theo giá lớp, bù đúng phần nợ chuyển lớp).
      id: existingReceipt.id,
      receiptNumber: existingReceipt.receiptNumber,
      paymentId: existingReceipt.paymentId,
      studentId: student.id,
      amount: input.payment.allocatedAmount,
      issuedAt: existingReceipt.issuedAt,
      status: "ISSUED",
      method: "Chuyển khoản",
      note: "Đối soát tự động qua webhook SePay",
      classId: cls.id,
      className: cls.name,
      billingPeriod: input.receivable.billingPeriod,
      billingMode: classBillingMode(cls),
      studentName: student.fullName,
      studentCode: student.code || "",
    }
    : {
      ...buildTuitionReceipt({
        receiptNumber: existingReceipt.receiptNumber,
        paymentId: existingReceipt.paymentId,
        student,
        cls,
        charge: receivableBased
          ? ({ ...charge, mode: ownMonths.length ? "MONTHLY" : "COURSE", months: ownMonths, billKey: String(input.receivable.billKey || ""), period: input.receivable.billingPeriod, amount: input.payment.allocatedAmount, creditSessions: 0, materialsAmount: receiptMaterials } as unknown as typeof charge)
          : { ...charge, amount: input.payment.allocatedAmount },
        method: "Chuyển khoản",
        note: "Đối soát tự động qua webhook SePay",
        issuedAt: existingReceipt.issuedAt,
      }),
      // Giữ nguyên id để không phá liên kết với hóa đơn (gắn theo paymentId) và dòng thu-chi.
      id: existingReceipt.id,
    };

  // Phiếu chuyển lớp neo vào kỳ này đã được gộp vào số tiền phiếu vừa thu —
  // đóng nó lại (đã áp dụng xong), giữ làm chứng từ điều chỉnh trong sổ.
  const appliedAnchors = isTransfer
    ? new Set<string>()
    : new Set(receivableBased && ownMonths.length ? ownMonths : charge.mode === "MONTHLY" ? charge.months : [`course${receivableCourse ?? courseIndexOfBillKey(input.receivable.billKey)}`]);
  const nextLedger: SepayLedger = {
    ...input.ledger,
    receivables: input.ledger.receivables.map((row) => {
      if (!isTransferBillKey(row.billKey) || row.status !== "OPEN" || row.studentId !== student.id || row.classId !== cls.id) return row;
      const parts = transferBillKeyParts(row.billKey);
      if (!parts || !appliedAnchors.has(parts.anchor)) return row;
      return { ...row, amountPaid: row.amountDue, balanceDue: 0, status: "PAID" as const };
    }),
    receipts: input.ledger.receipts.map((row) => row.id === existingReceipt.id ? receipt : row),
  };

  const paidThroughMonth = receivableBased && ownMonths.length ? ownMonths.at(-1) : !isTransfer && charge.mode === "MONTHLY" ? charge.months.at(-1) : undefined;
  const remainingAfter = classBillingMode(cls) === "COURSE"
    ? courseRemainingSessions(student, cls, input.sessions, nextLedger, now)
    : monthlyRemainingSessions(student, cls, input.sessions, nextLedger, now);

  const nextStudents = input.students.map((row) => row.id !== student.id ? row : {
    ...row,
    sessionBalances: { ...(row.sessionBalances || {}), [cls.id]: remainingAfter },
    tuitionCredits: isTransfer
      ? row.tuitionCredits
      : { ...(row.tuitionCredits || {}), [cls.id]: Math.max(0, Number(row.tuitionCredits?.[cls.id] || 0) - (Number(receipt.creditSessionsUsed) || 0)) },
    tuitionPaidThrough: paidThroughMonth
      ? { ...(row.tuitionPaidThrough || {}), [cls.id]: paidThroughMonth }
      : row.tuitionPaidThrough,
  });

  return { status: "OK", ledger: nextLedger, students: nextStudents, receipt, charge };
}

function previousMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const previous = new Date(year, month - 2, 1, 12);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function billingPeriodMonthKeys(value: string | undefined) {
  return [...String(value || "").matchAll(/(0[1-9]|1[0-2])\/(\d{4})/g)]
    .map((match) => `${match[2]}-${match[1]}`)
    .filter(validMonthKey);
}

/**
 * Xoá phiếu thu học phí là hoàn tác nghiệp vụ thu: huỷ payment, mở lại khoản phải
 * thu, bỏ biên lai và tính lại số buổi từ đầu tháng 9. Hàm thuần này cũng được
 * dùng để sửa các phiếu đã bị xoá khỏi cashbook ở phiên bản cũ.
 */
export function reverseTuitionReceipt(input: {
  ledger: SepayLedger;
  receiptId: string;
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
}): { error: string } | { ledger: SepayLedger; students: DemoStudent[]; receipt: SepayReceipt } {
  const receipt = input.ledger.receipts.find((row) => row.id === input.receiptId);
  if (!receipt) return { error: "Không tìm thấy biên lai học phí để hoàn tác." };

  const payment = input.ledger.payments.find((row) => row.id === receipt.paymentId);
  const receivable = payment
    ? input.ledger.receivables.find((row) => row.id === payment.receivableId)
    : undefined;
  const classId = receipt.classId || receivable?.classId || "";
  const cls = input.classes.find((row) => row.id === classId);

  const payments = input.ledger.payments.map((row) => (
    row.id === receipt.paymentId ? { ...row, status: "VOIDED" as const } : row
  ));
  const activePayments = receivable
    ? payments.filter((row) => row.receivableId === receivable.id && row.status !== "VOIDED" && row.status !== "REFUNDED")
    : [];
  const amountPaid = activePayments.reduce((sum, row) => sum + Math.max(0, Number(row.allocatedAmount) || 0), 0);
  const balanceDue = receivable ? Math.max(0, receivable.amountDue - amountPaid) : 0;
  const hasOverpayment = activePayments.some((row) => row.status === "OVERPAID");
  const receivableStatus: SepayReceivable["status"] = !receivable || amountPaid <= 0
    ? "OPEN"
    : balanceDue > 0
      ? "PARTIALLY_PAID"
      : hasOverpayment ? "OVERPAID" : "PAID";

  const receivables = input.ledger.receivables.map((row) => row.id !== receivable?.id ? row : {
    ...row,
    amountPaid,
    balanceDue,
    status: receivableStatus,
  });
  const paymentOrders = input.ledger.paymentOrders.map((row) => {
    if (row.id !== receivable?.paymentOrderId) return row;
    const refreshed = refreshOrderQr(row, input.ledger.settings, balanceDue || receivable.amountDue);
    return { ...refreshed, status: balanceDue > 0 ? "ACTIVE" as const : "PAID" as const };
  });
  const ledger: SepayLedger = {
    ...input.ledger,
    receivables,
    paymentOrders,
    payments,
    receipts: input.ledger.receipts.filter((row) => row.id !== receipt.id),
    bankTransactions: input.ledger.bankTransactions.map((row) => (
      row.id === payment?.bankTransactionId ? { ...row, status: "REVERSED" as const } : row
    )),
    invoices: input.ledger.invoices.map((row) => (
      row.paymentId === receipt.paymentId ? { ...row, status: "CANCELLED" as const } : row
    )),
    credits: input.ledger.credits.filter((row) => row.sourcePaymentId !== receipt.paymentId),
  };

  const adjustedStudents = input.students.map((student) => {
    if (student.id !== receipt.studentId || !cls) return student;
    const tuitionCredits = { ...(student.tuitionCredits || {}) };
    const restoredCredits = Math.max(0, Math.round(Number(receipt.creditSessionsUsed) || 0));
    if (restoredCredits) {
      // Cộng trực tiếp để phần credits âm (nợ cũ theo buổi) được trừ bớt đúng
      // thay vì bị Math.max(0, …) xoá mất.
      tuitionCredits[cls.id] = Math.round(Number(tuitionCredits[cls.id]) || 0) + restoredCredits;
    }
    if ((receipt.billingMode || classBillingMode(cls)) !== "MONTHLY") {
      return { ...student, tuitionCredits };
    }

    const tuitionPaidThrough = { ...(student.tuitionPaidThrough || {}) };
    const remainingMonths = receiptMonthKeys(ledger, student.id, cls.id).sort();
    const removedMonths = billingPeriodMonthKeys(receipt.billingPeriod).sort();
    const candidates = [remainingMonths.at(-1), receipt.paidThroughBefore].filter(validMonthKey).sort();
    const restoredPaidThrough = candidates.at(-1)
      || (removedMonths[0] ? previousMonthKey(removedMonths[0]) : undefined);
    if (restoredPaidThrough && restoredPaidThrough >= SESSION_BALANCE_EPOCH_MONTH) {
      tuitionPaidThrough[cls.id] = restoredPaidThrough;
    } else {
      delete tuitionPaidThrough[cls.id];
    }
    return { ...student, tuitionCredits, tuitionPaidThrough };
  });

  return {
    ledger,
    students: rebuildSeptemberSessionBalances(adjustedStudents, input.classes, input.sessions, ledger),
    receipt,
  };
}
