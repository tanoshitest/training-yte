import type { DemoClass } from "./operations-types";

export const T21_CLASS_ID = "class-import-t21";
export const T21_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T21: Gia Phú nợ 450k = 9 buổi tháng
// trước × 50k → tổng thu 900k. Khớp theo mã HV.
const T21_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0881"]), amount: 450_000 },
  { codes: new Set(["HV0951"]), amount: 200_000 },
];

// Cả 21 bạn T21 đã xử lý xong mọi khoản trước tháng 10: 20 bạn không nợ,
// Gia Phú nợ nằm trong dòng nợ cũ 450k. Khoản tháng trước sót lại trên
// production không được gộp lại vào báo giá — tránh đếm kép.
const T21_SUPERSEDED_DEBT_CODES = new Set([
  "HV0872", "HV0873", "HV0874", "HV0875", "HV0876", "HV0877",
  "HV0878", "HV0879", "HV0880", "HV0881", "HV0882", "HV0883",
  "HV0884", "HV0885", "HV0886", "HV0887", "HV0888", "HV0889",
  "HV0890", "HV0891", "HV0951",
]);

/** Mọi tháng trước tháng 10/2026 của 21 bạn T21 đã được xử lý — không tính lại. */
export function t21SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T21_CLASS_ID
    && month < T21_OCTOBER_BILLING_MONTH
    && T21_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T21. */
export function t21PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T21_CLASS_ID || !billingMonths.includes(T21_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T21_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
