import type { DemoClass } from "./operations-types";
import type { DemoStudent } from "./people-types";

export const T2_CLASS_ID = "class-import-t2";
export const T2_OCTOBER_BILLING_MONTH = "2026-10";
export const T2_PREVIOUS_MONTH_DEBT = 400_000;

const T2_PREVIOUS_MONTH_DEBT_NAMES = [
  "kieu oanh",
  "phuong linh",
  "quynh trang",
  "gia huy",
  "thao nguyen",
  "van nhi",
];

const T2_PREVIOUS_MONTH_DEBT_CODES = new Set(["HV0567", "HV0569"]);
const T2_THUY_STUDENT_CODE = "HV0942";

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

// Tháng 9 của 3 bạn đã xử lý gọn trong phiếu tháng 10: Thảo Nguyên và Vân Nhi nợ
// nằm trong dòng nợ cũ 400k, Thúy được tính là đã đóng. Phiếu tháng 9 lẻ sót
// lại không được gộp lại vào báo giá — tránh đếm kép công nợ.
const T2_SUPERSEDED_DEBT_CODES = new Set(["HV0567", "HV0569", "HV0942"]);

/** Tháng đã được thay bằng dòng nợ / tính đã đóng trong phiếu tháng 10 của T2. */
export function t2SupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  return cls?.id === T2_CLASS_ID
    && month === "2026-09"
    && T2_SUPERSEDED_DEBT_CODES.has(String(student?.code || "").trim().toUpperCase());
}

/** Khoản nợ cũ 400.000đ chỉ gắn vào phiếu tháng 10 của các học viên được chỉ định ở lớp T2. */
export function t2PreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  if (cls?.id !== T2_CLASS_ID || !billingMonths.includes(T2_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  return (T2_PREVIOUS_MONTH_DEBT_CODES.has(code)
    || T2_PREVIOUS_MONTH_DEBT_NAMES.some((suffix) => nameEndsWith(student?.fullName, suffix)))
    ? T2_PREVIOUS_MONTH_DEBT
    : 0;
}

/** Mọi học viên lớp T2 đều được khấu trừ đủ hai buổi nghỉ trên phiếu tháng 10. */
export function t2OctoberMinimumCreditSessions(
  _student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonth: string,
) {
  return cls?.id === T2_CLASS_ID && billingMonth === T2_OCTOBER_BILLING_MONTH ? 2 : 0;
}

/** Riêng Thúy (HV0942) của T2 được tính là đã hoàn tất tháng 9, không sửa dữ liệu lớp khác. */
export function t2EffectivePaidThrough(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  paidThrough: string | undefined,
) {
  if (cls?.id !== T2_CLASS_ID) return paidThrough;
  const isThuy = String(student?.code || "").trim().toUpperCase() === T2_THUY_STUDENT_CODE
    || normalizedName(student?.fullName) === "thuy";
  if (!isThuy || String(paidThrough || "") >= "2026-09") return paidThrough;
  return "2026-09";
}

/** Migration một lần: chỉ gỡ Mỹ Tâm khỏi danh sách học viên của lớp T2. */
export function removeMyTamFromT2(classes: DemoClass[], students: DemoStudent[]) {
  const myTamIds = new Set(
    students.filter((student) => nameEndsWith(student.fullName, "my tam")).map((student) => student.id),
  );
  if (!myTamIds.size) return classes;
  return classes.map((cls) => {
    if (cls.id !== T2_CLASS_ID || !(cls.studentIds || []).some((id) => myTamIds.has(id))) return cls;
    return { ...cls, studentIds: (cls.studentIds || []).filter((id) => !myTamIds.has(id)) };
  });
}
