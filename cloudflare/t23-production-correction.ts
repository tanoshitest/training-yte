import type { DemoClass } from "./operations-types";

export const T23_CLASS_ID = "class-import-t23";
export const T23_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T23: Quỳnh Anh, Khả Di, Bảo Khang,
// Anh Thư nợ 480k mỗi bạn (Uyên Nhi HV0908 đã bỏ theo bảng Excel 30/10) = 8 buổi tháng trước × 60k → tổng thu
// 1.020k. Khớp theo mã HV.
const T23_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0907", "HV0910", "HV0917", "HV0921"]), amount: 480_000 },
];

// Cả 16 bạn T23 đã xử lý xong mọi khoản trước tháng 10: 11 bạn không nợ,
// 5 bạn nợ nằm trong dòng nợ cũ 480k. Khoản tháng trước sót lại trên
// production không được gộp lại vào báo giá — tránh đếm kép.
const T23_SUPERSEDED_DEBT_CODES = new Set([
  "HV0907", "HV0908", "HV0909", "HV0910", "HV0911", "HV0912",
  "HV0913", "HV0914", "HV0915", "HV0916", "HV0917", "HV0918",
  "HV0919", "HV0920", "HV0921", "HV0922",
]);

/** Mọi tháng trước tháng 10/2026 của 16 bạn T23 đã được xử lý — không tính lại. */
export function t23SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T23_CLASS_ID
    && month < T23_OCTOBER_BILLING_MONTH
    && T23_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T23. */
export function t23PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T23_CLASS_ID || !billingMonths.includes(T23_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T23_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
