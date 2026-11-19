import type { DemoClass } from "./operations-types";

export const T12_CLASS_ID = "class-import-t12";
export const T12_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T12:
// Hạ An, Ngọc Hân, Gia Hân +350k (nợ tháng 9 theo bảng công nợ Excel) —
// mọi học viên khác chỉ thu 400k (8 buổi × 50k, không khấu trừ).
// Chỉ khớp theo mã học viên.
const T12_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0730"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0735"]), names: [], amount: 350_000 },
  { codes: new Set(["HV0736"]), names: [], amount: 350_000 },
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

export const T12_SUPERSEDED_DEBT_MONTH = "2026-09";

// Khoản tháng 9 của 4 bạn đã xử lý gọn trong phiếu tháng 10: 3 bạn nợ nằm trong
// dòng nợ cũ 350k, Gia Huy theo Excel không còn nợ. Phiếu tháng 9 lẻ sót lại
// (hoặc mốc đã đóng sớm, ngày vào lớp tháng 9) không được gộp lại vào báo giá —
// nếu không công nợ sẽ đếm kép thành 1.150k/800k thay vì 750k/400k.
const T12_SUPERSEDED_DEBT_CODES = new Set(["HV0730", "HV0735", "HV0736", "HV0748"]);

/** Tháng đã được thay bằng dòng nợ trong phiếu tháng 10 — báo giá loại khỏi công nợ. */
export function t12SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T12_CLASS_ID
    && month === T12_SUPERSEDED_DEBT_MONTH
    && T12_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T12. */
export function t12PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T12_CLASS_ID || !billingMonths.includes(T12_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T12_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}
