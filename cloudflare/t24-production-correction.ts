import type { DemoClass } from "./operations-types";

export const T24_CLASS_ID = "class-import-t24";
export const T24_OCTOBER_BILLING_MONTH = "2026-10";
/** Bảo Minh (HV0931) Excel ghi đã đóng đủ 960k — migration ghi nhận thu. */
export const T24_BAO_MINH_STUDENT_ID = "student-import-0931";

// Phiếu tháng 10 của T24: cột "Trừ hp nghỉ" của Excel trừ đúng 1 buổi cho
// toàn lớp → 9 suất − 1 = 8 suất × 60k = 480k còn lại mỗi bạn.
export function t24OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T24_CLASS_ID && billingMonth === T24_OCTOBER_BILLING_MONTH ? 1 : 0;
}

// Nợ cũ gắn vào phiếu tháng 10: Bảo Minh nợ 480k → tổng thu 960k (đã đóng);
// Nhật Đam dư/nợ lẻ 20k → tổng thu 500k. Khớp theo mã HV.
const T24_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0931"]), amount: 480_000 },
  { codes: new Set(["HV0933"]), amount: 20_000 },
];

// Cả 17 bạn T24 đã xử lý xong mọi khoản trước tháng 10 — khoản tháng trước
// sót lại trên production không được gộp lại vào báo giá, tránh đếm kép.
const T24_SUPERSEDED_DEBT_CODES = new Set([
  "HV0923", "HV0924", "HV0925", "HV0926", "HV0927", "HV0928",
  "HV0929", "HV0930", "HV0931", "HV0932", "HV0933", "HV0934",
  "HV0935", "HV0936", "HV0937", "HV0938", "HV0939",
]);

/** Mọi tháng trước tháng 10/2026 của 17 bạn T24 đã được xử lý — không tính lại. */
export function t24SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T24_CLASS_ID
    && month < T24_OCTOBER_BILLING_MONTH
    && T24_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T24. */
export function t24PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T24_CLASS_ID || !billingMonths.includes(T24_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T24_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
