import type { DemoClass } from "./operations-types";

export const T1_CLASS_ID = "class-import-t1";
export const T1_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T1:
// Ý Nhi 1.958k, Hà Vy 350k — mọi học viên khác chỉ thu 300k (Hà Giang
// HV0537 Excel xác nhận không nợ — đã gỡ dòng 1.110k gán nhầm trước đó).
const T1_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0559"]), names: ["y nhi"], amount: 1_958_000 },
  { codes: new Set(["HV0556"]), names: ["ha vy"], amount: 350_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T1. */
export function t1PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T1_CLASS_ID || !billingMonths.includes(T1_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T1_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

/** Mọi học viên lớp T1 đều được khấu trừ đủ hai buổi nghỉ trên phiếu tháng 10. */
export function t1OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T1_CLASS_ID && billingMonth === T1_OCTOBER_BILLING_MONTH ? 2 : 0;
}
