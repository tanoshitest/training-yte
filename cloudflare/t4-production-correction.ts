import type { DemoClass } from "./operations-types";

export const T4_CLASS_ID = "class-import-t4";
export const T4_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T4:
// Quốc Nhật +700k; Nhật Đăng, Hương Giang, Minh Quân, Trần Tuệ Nhi +350k —
// mọi học viên khác chỉ thu 400k. Tuệ Nhi (HV0637) cùng học T7 nhưng nợ chỉ
// gắn vào phiếu T4; Lê Quỳnh Chi nợ cũ 150k.
const T4_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0601"]), names: ["quoc nhat"], amount: 700_000 },
  { codes: new Set(["HV0596"]), names: ["nhat dang"], amount: 350_000 },
  { codes: new Set(["HV0597"]), names: ["huong giang"], amount: 350_000 },
  { codes: new Set(["HV0613"]), names: ["minh quan"], amount: 350_000 },
  { codes: new Set(["HV0637"]), names: ["tue nhi"], amount: 350_000 },
  { codes: new Set(["HV1007"]), names: [], amount: 150_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T4. */
export function t4PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T4_CLASS_ID || !billingMonths.includes(T4_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T4_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

/** Mọi học viên lớp T4 được khấu trừ đúng một buổi nghỉ trên phiếu tháng 10;
 * riêng Lê Quỳnh Chi (HV1007) khấu trừ 2 buổi nghỉ theo Excel. */
export function t4OctoberMinimumCreditSessions(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  if (cls?.id !== T4_CLASS_ID || billingMonth !== T4_OCTOBER_BILLING_MONTH) return 0;
  return String(student?.code || "").trim().toUpperCase() === "HV1007" ? 2 : 1;
}
