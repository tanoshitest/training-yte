import type { DemoClass } from "./operations-types";
import { t2EffectivePaidThrough } from "./t2-production-correction";

export const T3_CLASS_ID = "class-import-t3";
export const T3_SEPTEMBER_BILLING_MONTH = "2026-09";
export const T3_OCTOBER_BILLING_MONTH = "2026-10";

// Bốn bạn học T3 từ tháng 9 nhưng chưa đóng tháng nào — nợ đúng một tháng
// (400k, 8 suất như các bạn đã đóng) cộng vào phiếu tháng 10 thành 800k.
const T3_SEPTEMBER_DEBT_NAMES = [
  "phuong linh",
  "kieu oanh",
  "quynh trang",
  "gia huy",
];
const T3_SEPTEMBER_DEBT_CODES = new Set(["HV0579", "HV0582", "HV0583", "HV0593"]);
const T3_SEPTEMBER_DEBT_AMOUNT = 400_000;

// Phạm Kim Oanh đã đóng tháng 9 nhưng dữ liệu thiếu mốc (ghi mốc không biên lai
// sẽ bị clampPaidThroughToReceipts gỡ), nên vá bằng code như Thúy của T2.
const T3_SEPTEMBER_PAID_NAMES = ["kim oanh"];
const T3_SEPTEMBER_PAID_CODES = new Set(["HV0581"]);

function normalizedName(value: string | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[Đđ]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function nameEndsWith(value: string | undefined, suffix: string) {
  const name = normalizedName(value);
  return name === suffix || name.endsWith(` ${suffix}`);
}

function matchesAny(
  student: { code?: string; fullName?: string } | null | undefined,
  codes: Set<string>,
  names: string[],
) {
  const code = String(student?.code || "").trim().toUpperCase();
  return codes.has(code) || names.some((suffix) => nameEndsWith(student?.fullName, suffix));
}

// Tháng 9 của 5 bạn đã xử lý gọn trong phiếu tháng 10: 4 bạn nợ nằm trong dòng
// nợ cũ 400k, Kim Oanh được tính là đã đóng. Phiếu tháng 9 lẻ sót lại không
// được gộp lại vào báo giá — tránh đếm kép công nợ.
const T3_SUPERSEDED_DEBT_CODES = new Set(["HV0579", "HV0582", "HV0583", "HV0593", "HV0581"]);

/** Tháng đã được thay bằng dòng nợ / tính đã đóng trong phiếu tháng 10 của T3. */
export function t3SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T3_CLASS_ID
    && month === T3_SEPTEMBER_BILLING_MONTH
    && T3_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Nợ học phí tháng 9 gộp vào phiếu tháng 10 của 4 bạn chưa đóng ở lớp T3. */
export function t3PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T3_CLASS_ID || !billingMonths.includes(T3_OCTOBER_BILLING_MONTH)) return 0;
  return matchesAny(student, T3_SEPTEMBER_DEBT_CODES, T3_SEPTEMBER_DEBT_NAMES)
    ? T3_SEPTEMBER_DEBT_AMOUNT
    : 0;
}

/** Riêng Kim Oanh (HV0581) của T3 được tính là đã hoàn tất tháng 9. */
export function t3EffectivePaidThrough(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  paidThrough: string | undefined,
) {
  if (cls?.id !== T3_CLASS_ID) return paidThrough;
  if (!matchesAny(student, T3_SEPTEMBER_PAID_CODES, T3_SEPTEMBER_PAID_NAMES)) return paidThrough;
  if (String(paidThrough || "") >= T3_SEPTEMBER_BILLING_MONTH) return paidThrough;
  return T3_SEPTEMBER_BILLING_MONTH;
}

/** paidThrough đã vá cho mọi lớp import có ngoại lệ dữ liệu (T2 Thúy, T3 Kim Oanh). */
export function effectivePaidThrough(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  paidThrough: string | undefined,
) {
  return t3EffectivePaidThrough(student, cls, t2EffectivePaidThrough(student, cls, paidThrough));
}
