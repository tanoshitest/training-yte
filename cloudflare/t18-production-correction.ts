import type { DemoClass } from "./operations-types";

export const T18_CLASS_ID = "class-import-t18";
export const T18_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của lớp T18: Bảo Hân, Anh Thơ, Hà Phương nợ
// 455k mỗi bạn; Tuệ An nợ 2.839k (nhiều tháng dồn). Cả lớp tháng 10 học
// 10 buổi × 65k = 650k, không khấu trừ buổi nghỉ → các bạn không nợ thu
// 650k. Khớp theo mã học viên.
const T18_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  amount: number;
}> = [
  { codes: new Set(["HV0826", "HV0836", "HV0838"]), amount: 455_000 },
  { codes: new Set(["HV0834"]), amount: 2_839_000 },
];

// Cả 16 bạn T18 đã xử lý xong mọi khoản trước tháng 10: 12 bạn không nợ,
// 4 bạn nợ nằm trong dòng nợ cũ. Khoản tháng trước sót lại trên production
// (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp lại vào báo
// giá — tránh cộng thêm công nợ kép.
const T18_SUPERSEDED_DEBT_CODES = new Set([
  "HV0823", "HV0824", "HV0825", "HV0826", "HV0827", "HV0828",
  "HV0829", "HV0830", "HV0831", "HV0832", "HV0833", "HV0834",
  "HV0835", "HV0836", "HV0837", "HV0838",
]);

/** Mọi tháng trước tháng 10/2026 của 16 bạn T18 đã được xử lý — không tính lại. */
export function t18SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T18_CLASS_ID
    && month < T18_OCTOBER_BILLING_MONTH
    && T18_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T18. */
export function t18PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T18_CLASS_ID || !billingMonths.includes(T18_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T18_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code)) return debt.amount;
  }
  return 0;
}
