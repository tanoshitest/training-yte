import type { DemoClass } from "./operations-types";

export const T7_CLASS_ID = "class-import-t7";
export const T7_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T7:
// Đình Nam +750k, Minh Đức +350k — mọi học viên khác chỉ thu 400k.
const T7_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0652"]), names: ["dinh nam"], amount: 750_000 },
  { codes: new Set(["HV0643"]), names: ["minh duc"], amount: 350_000 },
];

function normalizedName(value: string | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function nameEndsWith(value: string | undefined, suffix: string) {
  const name = normalizedName(value);
  return name === suffix || name.endsWith(` ${suffix}`);
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T7. */
export function t7PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T7_CLASS_ID || !billingMonths.includes(T7_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T7_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

// Cả 15 bạn T7 đã xử lý xong mọi khoản trước tháng 10: các bạn không nợ thu
// đúng 9 suất, Đình Nam/Minh Đức nợ nằm trong dòng nợ cũ — phiếu tháng trước
// sót lại trên production không được gộp lại vào báo giá, tránh đếm kép.
const T7_SUPERSEDED_DEBT_CODES = new Set([
  "HV0635", "HV0637", "HV0638", "HV0641", "HV0642", "HV0643",
  "HV0644", "HV0645", "HV0648", "HV0649", "HV0652", "HV0659",
  "HV0662", "HV0663", "HV0665",
]);

/** Mọi tháng trước tháng 10/2026 của 15 bạn T7 đã được xử lý — không tính lại. */
export function t7SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T7_CLASS_ID
    && month < T7_OCTOBER_BILLING_MONTH
    && T7_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Excel sửa lại: phiếu tháng 10 T7 không còn khấu trừ — thu đủ 9 buổi. */
export function t7OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T7_CLASS_ID && billingMonth === T7_OCTOBER_BILLING_MONTH ? 0 : 0;
}
