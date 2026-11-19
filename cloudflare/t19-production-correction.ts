import type { DemoClass } from "./operations-types";

export const T19_CLASS_ID = "class-import-t19";
export const T19_OCTOBER_BILLING_MONTH = "2026-10";
export const T19_DANG_KHOI_STUDENT_ID = "student-import-0840";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T19: Phạm Bảo Lâm (HV0843) và Nguyễn
// Hữu Đăng Khôi (HV0840) nợ 480k mỗi bạn = 8 buổi tháng trước × 60k. Cả lớp
// tháng 10 học 8 buổi × 60k = 480k, không khấu trừ buổi nghỉ → hai bạn nợ
// thu 960k (Đăng Khôi đã chuyển khoản ngày 01/10). Khớp theo mã học viên.
const T19_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0843", "HV0840"]), amount: 480_000 },
];

// Cả 17 bạn T19 đã xử lý xong mọi khoản trước tháng 10: 15 bạn không nợ,
// 2 bạn nợ nằm trong dòng nợ cũ 480k. Khoản tháng trước sót lại trên
// production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp
// lại vào báo giá — tránh cộng thêm công nợ kép.
const T19_SUPERSEDED_DEBT_CODES = new Set([
  "HV0839", "HV0840", "HV0841", "HV0842", "HV0843", "HV0844",
  "HV0845", "HV0846", "HV0847", "HV0848", "HV0849", "HV0850",
  "HV0851", "HV0852", "HV0853", "HV0854", "HV0855",
]);

/** Mọi tháng trước tháng 10/2026 của 17 bạn T19 đã được xử lý — không tính lại. */
export function t19SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T19_CLASS_ID
    && month < T19_OCTOBER_BILLING_MONTH
    && T19_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T19. */
export function t19PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T19_CLASS_ID || !billingMonths.includes(T19_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T19_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
