import type { DemoClass } from "./operations-types";

export const T14_CLASS_ID = "class-import-t14";
export const T14_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T14:
// Dương Gia Khánh (HV0764) và Nguyễn Ngọc Phương Uyên (HV0772) +640k mỗi
// bạn (học phí tháng trước chưa đóng). Cả lớp chỉ thu 640k = 9 buổi tháng
// 10 trừ 1 buổi nghỉ tháng cũ × 80k. Khớp theo mã học viên.
const T14_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0764", "HV0772"]), names: [], amount: 640_000 },
];

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

// Cả 9 bạn T14 đã xử lý xong mọi khoản trước tháng 10: 7 bạn đã đóng tháng
// trước, 2 bạn nợ nằm trong dòng nợ cũ 640k. Khoản tháng trước sót lại trên
// production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp
// lại vào báo giá — tránh cộng thêm công nợ kép.
const T14_SUPERSEDED_DEBT_CODES = new Set([
  "HV0764", "HV0765", "HV0766", "HV0767", "HV0768",
  "HV0769", "HV0770", "HV0771", "HV0772",
]);

/** Mọi tháng trước tháng 10/2026 của 9 bạn T14 đã được xử lý — không tính lại. */
export function t14SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T14_CLASS_ID
    && month < T14_OCTOBER_BILLING_MONTH
    && T14_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T14. */
export function t14PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T14_CLASS_ID || !billingMonths.includes(T14_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T14_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

/** Mọi học viên lớp T14 được khấu trừ đúng một buổi nghỉ trên phiếu tháng 10. */
export function t14OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T14_CLASS_ID && billingMonth === T14_OCTOBER_BILLING_MONTH ? 1 : 0;
}
