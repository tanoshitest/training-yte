import type { DemoClass } from "./operations-types";

export const T22_CLASS_ID = "class-import-t22";
export const T22_OCTOBER_BILLING_MONTH = "2026-10";

// Cả 15 bạn T22 không ai công nợ — mọi khoản trước tháng 10 đã xử lý xong.
// Phiếu tháng trước sót lại trên production không được gộp vào báo giá.
const T22_SUPERSEDED_DEBT_CODES = new Set([
  "HV0892", "HV0893", "HV0894", "HV0895", "HV0896", "HV0897",
  "HV0898", "HV0899", "HV0900", "HV0901", "HV0902", "HV0903",
  "HV0904", "HV0905", "HV0906",
]);

/** Mọi tháng trước tháng 10/2026 của 15 bạn T22 đã được xử lý — không tính lại. */
export function t22SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T22_CLASS_ID
    && month < T22_OCTOBER_BILLING_MONTH
    && T22_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}
