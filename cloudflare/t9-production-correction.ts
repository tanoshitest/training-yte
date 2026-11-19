import type { DemoClass } from "./operations-types";

export const T9_CLASS_ID = "class-import-t9";
export const T9_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T9:
// Quỳnh Thơ, Hoàng Phan Anh Thư, Hồ Ngọc Anh Thư +480k; Phan Nguyễn Anh Thư
// +420k — mọi học viên khác chỉ thu 480k (9 buổi − 1 khấu trừ = 8 × 60k).
// Ba bạn Anh Thư trùng tên gần giống nhau nên chỉ khớp theo mã học viên.
const T9_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0681"]), names: [], amount: 480_000 },
  { codes: new Set(["HV0686"]), names: [], amount: 480_000 },
  { codes: new Set(["HV0684"]), names: [], amount: 480_000 },
  { codes: new Set(["HV0672"]), names: [], amount: 420_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T9. */
export function t9PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T9_CLASS_ID || !billingMonths.includes(T9_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T9_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

/** Mọi học viên lớp T9 được khấu trừ đúng một buổi nghỉ trên phiếu tháng 10. */
export function t9OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T9_CLASS_ID && billingMonth === T9_OCTOBER_BILLING_MONTH ? 1 : 0;
}
