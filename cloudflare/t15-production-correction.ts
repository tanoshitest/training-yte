import type { DemoClass } from "./operations-types";

export const T15_CLASS_ID = "class-import-t15";
export const T15_OCTOBER_BILLING_MONTH = "2026-10";

// Nợ cũ gắn vào phiếu tháng 10 của từng học viên được chỉ định ở lớp T15:
// Trương Gia Khang, Minh Vy, Bảo Long +480k mỗi bạn (học phí tháng 9: 8 buổi
// × 60k chưa đóng). Hoàng Đăng Khoa (HV0786) đã bỏ khỏi danh sách theo bảng
// Excel 30/10: chỉ đóng 540k tháng 10, không còn nợ cũ. Cả lớp chỉ thu 540k =
// 9 buổi tháng 10 × 60k — không khấu trừ buổi nghỉ. Khớp theo mã học viên.
const T15_PREVIOUS_MONTH_DEBTS: ReadonlyArray<{
  codes: ReadonlySet<string>;
  names: readonly string[];
  amount: number;
}> = [
  { codes: new Set(["HV0779", "HV0781", "HV0788"]), names: [], amount: 480_000 },
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

// Cả 17 bạn T15 đã xử lý xong mọi khoản trước tháng 10: 13 bạn đã đóng tháng
// trước, 4 bạn nợ nằm trong dòng nợ cũ 480k. Khoản tháng trước sót lại trên
// production (phiếu OPEN cũ, mốc đã đóng sớm, ngày vào lớp) không được gộp
// lại vào báo giá — tránh cộng thêm công nợ kép.
const T15_SUPERSEDED_DEBT_CODES = new Set([
  "HV0773", "HV0774", "HV0775", "HV0776", "HV0777", "HV0778", "HV0779",
  "HV0780", "HV0781", "HV0782", "HV0783", "HV0784", "HV0785", "HV0786",
  "HV0787", "HV0788", "HV0789",
]);

/** Mọi tháng trước tháng 10/2026 của 17 bạn T15 đã được xử lý — không tính lại. */
export function t15SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T15_CLASS_ID
    && month < T15_OCTOBER_BILLING_MONTH
    && T15_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T15. */
export function t15PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T15_CLASS_ID || !billingMonths.includes(T15_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of T15_PREVIOUS_MONTH_DEBTS) {
    if (debt.codes.has(code) || debt.names.some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}
