import type { DemoClass } from "./operations-types";

export const T16_CLASS_ID = "class-import-t16";
export const T16_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T16:
// Hoàng Đình Đăng Khoa, Trần Tuệ Lâm, Nguyễn Nguyên Khôi, Hồ Lê Ngọc Tuyền,
// Trần Hạo Doanh +480k mỗi bạn (học phí tháng 9: 8 buổi × 60k chưa đóng).
// Cả lớp chỉ thu 540k = 9 buổi tháng 10 × 60k — không khấu trừ buổi nghỉ.
// Khớp theo mã học viên.
const T16_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0800", "HV0801", "HV0796", "HV0804", "HV0803"]), names: [], amount: 480_000 },
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

// Cả 21 bạn T16 đã xử lý xong mọi khoản trước tháng 10: 16 bạn đã đóng tháng
// trước, 5 bạn nợ nằm trong dòng nợ cũ 480k. Khoản tháng trước sót lại trên
// production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp
// lại vào báo giá — tránh cộng thêm công nợ kép.
const T16_SUPERSEDED_DEBT_CODES = new Set([
  "HV0790", "HV0791", "HV0792", "HV0793", "HV0794", "HV0795", "HV0796",
  "HV0797", "HV0798", "HV0799", "HV0800", "HV0801", "HV0802", "HV0803",
  "HV0804", "HV0805", "HV0806", "HV0807", "HV0808", "HV0809", "HV0821",
]);

/** Mọi tháng trước tháng 10/2026 của 21 bạn T16 đã được xử lý — không tính lại. */
export function t16SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T16_CLASS_ID
    && month < T16_OCTOBER_BILLING_MONTH
    && T16_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T16. */
export function t16PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T16_CLASS_ID || !billingMonths.includes(T16_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T16_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}
