import type { DemoClass } from "./operations-types";

export const T17_CLASS_ID = "class-import-t17";
export const T17_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T17: mọi bạn trừ Minh Đức (HV0820) có
// nợ học phí tháng trước 480k = 8 buổi × 60k. Cả lớp tháng 10 học 8 buổi
// × 60k = 480k và được khấu trừ 3 buổi nghỉ tháng cũ (−180k) → các bạn có
// nợ thu 780k, Minh Đức chỉ thu 300k. Khớp theo mã học viên.
const T17_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  {
    codes: new Set([
      "HV0810", // Phạm Quang Hiếu
      "HV0811", // Võ Tá Anh
      "HV0812", // Nguyễn Thị Thùy Trang
      "HV0813", // Võ Thị Quỳnh Như
      "HV0815", // Phan Thảo Nhi
      "HV0816", // Nguyễn Như An Huy
      "HV0817", // Phạm Quang Khải
      "HV0818", // Ngô Đức Nhân
      "HV0819", // Trương Thiện Nhân
      "HV0822", // Gia Hưng
    ]),
    names: [],
    amount: 480_000,
  },
];

// Cả 11 bạn T17 đã xử lý xong mọi khoản trước tháng 10: Minh Đức không nợ,
// 10 bạn còn lại nợ nằm trong dòng nợ cũ 480k. Khoản tháng trước sót lại
// trên production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được
// gộp lại vào báo giá — tránh cộng thêm công nợ kép.
const T17_SUPERSEDED_DEBT_CODES = new Set([
  "HV0810", "HV0811", "HV0812", "HV0813", "HV0815",
  "HV0816", "HV0817", "HV0818", "HV0819", "HV0820",
  "HV0822",
]);

/** Mọi tháng trước tháng 10/2026 của 11 bạn T17 đã được xử lý — không tính lại. */
export function t17SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T17_CLASS_ID
    && month < T17_OCTOBER_BILLING_MONTH
    && T17_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T17. */
export function t17PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T17_CLASS_ID || !billingMonths.includes(T17_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T17_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}

/** Mọi học viên lớp T17 được khấu trừ đúng ba buổi nghỉ trên phiếu tháng 10. */
export function t17OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T17_CLASS_ID && billingMonth === T17_OCTOBER_BILLING_MONTH ? 3 : 0;
}
