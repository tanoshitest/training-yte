import type { DemoClass } from "./operations-types";

export const T8_CLASS_ID = "class-import-t8";
export const T8_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T8:
// Huyền Trang +350k, Trần Thảo Nguyên +350k — mọi học viên khác chỉ thu 400k.
// Lớp có hai bạn Thảo Nguyên (HV0666 Nguyễn Trần, HV0667 Trần) nên chỉ khớp mã.
const T8_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0657"]), names: ["huyen trang"], amount: 350_000 },
  { codes: new Set(["HV0667"]), names: [], amount: 350_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T8. */
export function t8PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T8_CLASS_ID || !billingMonths.includes(T8_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T8_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}
