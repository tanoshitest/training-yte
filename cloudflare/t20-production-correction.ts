import type { DemoClass } from "./operations-types";

export const T20_CLASS_ID = "class-import-t20";
export const T20_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T20: Hà Giang, Tú Uyên, An Nhiên nợ
// 400k mỗi bạn = 8 buổi tháng trước × 50k → tổng thu 800k. Khớp theo mã HV.
const T20_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0866", "HV0871", "HV0858"]), amount: 400_000 },
];

// Cả 16 bạn T20 đã xử lý xong mọi khoản trước tháng 10: 13 bạn không nợ,
// 3 bạn nợ nằm trong dòng nợ cũ 400k. Khoản tháng trước sót lại trên
// production không được gộp lại vào báo giá — tránh đếm kép.
const T20_SUPERSEDED_DEBT_CODES = new Set([
  "HV0856", "HV0857", "HV0858", "HV0859", "HV0860", "HV0861",
  "HV0862", "HV0863", "HV0864", "HV0865", "HV0866", "HV0867",
  "HV0868", "HV0869", "HV0870", "HV0871",
]);

/** Mọi tháng trước tháng 10/2026 của 16 bạn T20 đã được xử lý — không tính lại. */
export function t20SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T20_CLASS_ID
    && month < T20_OCTOBER_BILLING_MONTH
    && T20_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T20. */
export function t20PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T20_CLASS_ID || !billingMonths.includes(T20_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T20_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
