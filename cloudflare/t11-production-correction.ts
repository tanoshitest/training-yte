import type { DemoClass } from "./operations-types";

export const T11_CLASS_ID = "class-import-t11";
export const T11_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T11:
// Bảo Trâm, Bảo Trang, Thảo Đan, Đại Hoàng +350k — mọi học viên khác chỉ thu
// 450k (9 buổi × 50k, không khấu trừ). Chỉ khớp theo mã học viên.
const T11_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0727"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0728"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0729"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0940"]), names: [], amount: 350_000 },
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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T11. */
export function t11PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T11_CLASS_ID || !billingMonths.includes(T11_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T11_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

// Cả 18 bạn T11 đã xử lý xong mọi khoản trước tháng 10: các bạn không nợ thu
// đúng 9 suất, 4 bạn nợ nằm trong dòng nợ cũ — phiếu tháng trước sót lại
// trên production không được gộp lại vào báo giá, tránh đếm kép.
const T11_SUPERSEDED_DEBT_CODES = new Set([
  "HV0713", "HV0714", "HV0715", "HV0716", "HV0717", "HV0718",
  "HV0719", "HV0720", "HV0721", "HV0722", "HV0723", "HV0724",
  "HV0725", "HV0726", "HV0727", "HV0728", "HV0729", "HV0940",
]);

/** Mọi tháng trước tháng 10/2026 của 18 bạn T11 đã được xử lý — không tính lại. */
export function t11SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T11_CLASS_ID
    && month < T11_OCTOBER_BILLING_MONTH
    && T11_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Excel sửa lại: phiếu tháng 10 T11 không còn khấu trừ — thu đủ 9 buổi. */
export function t11OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T11_CLASS_ID && billingMonth === T11_OCTOBER_BILLING_MONTH ? 0 : 0;
}
