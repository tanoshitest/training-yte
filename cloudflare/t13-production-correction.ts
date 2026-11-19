import type { DemoClass } from "./operations-types";

export const T13_CLASS_ID = "class-import-t13";
export const T13_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T13:
// Nguyễn Gia Hân, Tuệ Nhi, Nhật Quang +350k; Ngọc Lê +1.400k — mọi học viên
// khác chỉ thu 400k (9 buổi − 1 khấu trừ = 8 × 50k). Chỉ khớp theo mã học
// viên vì lớp có hai bạn cùng tên "Gia Hân" (Trương Gia Hân không nợ).
const T13_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0749"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0752"]), names: [], amount: 1_400_000 },
  { codes: new Set(["HV0759"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0763"]), names: [], amount: 350_000 },
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

// 8 bạn T13 đã xử lý xong mọi khoản trước tháng 10: 4 bạn nợ nằm trong dòng nợ
// cũ, 4 bạn theo Excel chỉ còn phải đóng tháng 10. Khoản tháng trước sót lại
// trên production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp
// lại vào báo giá — tránh cộng thêm công nợ kép (đang thấy +500k mỗi bạn).
const T13_SUPERSEDED_DEBT_CODES = new Set([
  "HV0749", "HV0750", "HV0751", "HV0752", "HV0757", "HV0758", "HV0759", "HV0763",
]);

/** Mọi tháng trước tháng 10/2026 của 8 bạn chỉ định đã được xử lý — không tính lại. */
export function t13SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T13_CLASS_ID
    && month < T13_OCTOBER_BILLING_MONTH
    && T13_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T13. */
export function t13PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T13_CLASS_ID || !billingMonths.includes(T13_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T13_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

/** Mọi học viên lớp T13 được khấu trừ đúng một buổi nghỉ trên phiếu tháng 10. */
export function t13OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T13_CLASS_ID && billingMonth === T13_OCTOBER_BILLING_MONTH ? 1 : 0;
}
