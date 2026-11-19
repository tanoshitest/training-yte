import type { DemoClass } from "./operations-types";

export const T10_CLASS_ID = "class-import-t10";
export const T10_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T10:
// Anh Quân +2.394k, Thế Anh +350k — mọi học viên khác chỉ thu 450k (9 buổi
// × 50k, không khấu trừ).
const T10_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0699"]), names: ["anh quan"], amount: 2_394_000 },
  { codes: new Set(["HV0706"]), names: ["the anh"], amount: 350_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T10. */
export function t10PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T10_CLASS_ID || !billingMonths.includes(T10_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T10_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}
