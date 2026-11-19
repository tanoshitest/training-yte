import type { DemoClass } from "./operations-types";

export const THANH_SEN_OCTOBER_BILLING_MONTH = "2026-10";
export const S1_CLASS_ID = "class-import-s1";
/** Tuấn Dũng (HV0020, S1): Excel nợ cũ 0 — phiếu gộp T9+T10 1.100k trên
 * production phải về phiếu T10 đơn 585k (xem withS1TuanDungOctoberBill). */
export const S1_TUAN_DUNG_STUDENT_ID = "student-import-0020";

// Nợ cũ gắn vào phiếu tháng 10 của 13 lớp cơ sở Thành Sen theo bảng Excel —
// khớp theo mã học viên, chỉ áp khi báo giá chứa tháng 10/2026. S8 thu đủ 9
// buổi theo xác nhận của anh (Excel tính nhầm 8). Trà My (S4) đóng dư 25k
// nên nợ cũ âm — phiếu T10 còn 625k. Minh Khang (S8) nghỉ học: bỏ qua, không
// gắn nợ. Hoàng Quyên (Excel S3) không có trong hệ thống: tạm bỏ qua.
const THANH_SEN_PREVIOUS_MONTH_DEBTS: Readonly<Record<string, ReadonlyArray<{
  codes: ReadonlySet<string>;
  names?: readonly string[];
  amount: number;
}>>> = {
  "class-import-s1": [
    { codes: new Set(["HV0009", "HV0016", "HV0019"]), amount: 915_000 },
    { codes: new Set(["HV0010", "HV0017"]), amount: 455_000 },
  ],
  "class-import-s2": [{ codes: new Set(["HV0022", "HV0029"]), amount: 520_000 }],
  "class-import-s3": [
    { codes: new Set(["HV0035"]), amount: 600_000 },
    // Bảo Trâm vào lớp sau ngày snapshot nên chưa có mã — khớp theo tên.
    { codes: new Set<string>(), names: ["bao tram"], amount: 75_000 },
  ],
  "class-import-s4": [
    { codes: new Set(["HV0042"]), amount: 455_000 },
    { codes: new Set(["HV0056"]), amount: -25_000 },
  ],
  "class-import-s5": [
    { codes: new Set(["HV0057", "HV0062", "HV0064"]), amount: 520_000 },
    { codes: new Set(["HV0061"]), amount: 5_000 },
  ],
  "class-import-s6": [{ codes: new Set(["HV0075", "HV0076"]), amount: 600_000 }],
  "class-import-s7": [{ codes: new Set(["HV0082", "HV0087", "HV0098"]), amount: 520_000 }],
  "class-import-s8": [
    { codes: new Set(["HV0100", "HV0108"]), amount: 455_000 },
    { codes: new Set(["HV0101"]), amount: 1_495_000 },
  ],
  "class-import-s9": [
    { codes: new Set(["HV0117", "HV0119", "HV0120"]), amount: 520_000 },
    { codes: new Set(["HV0124"]), amount: 1_105_000 },
  ],
  "class-import-s10": [{ codes: new Set(["HV0139", "HV0143", "HV0144"]), amount: 520_000 }],
  "class-import-s31": [{ codes: new Set(["HV0409"]), amount: 240_000 }],
  "class-import-s38": [{ codes: new Set(["HV0479"]), amount: 1_159_000 }],
};

// Mọi học viên của 13 lớp Thành Sen đã xử lý xong các khoản trước tháng 10 —
// khoản tháng trước sót lại trên production không được gộp lại vào báo giá,
// tránh đếm kép (Tuấn Dũng S1 nằm trong danh sách này: T9 của bạn ấy đã xong
// theo Excel, dòng nợ cũ phiếu gộp được vá riêng bằng migration).
const THANH_SEN_SUPERSEDED_CODES: Readonly<Record<string, ReadonlySet<string>>> = {
  "class-import-s1": new Set([
    "HV0001", "HV0002", "HV0003", "HV0004", "HV0005", "HV0006", "HV0007",
    "HV0008", "HV0009", "HV0010", "HV0011", "HV0012", "HV0013", "HV0014",
    "HV0015", "HV0016", "HV0017", "HV0018", "HV0019", "HV0020",
  ]),
  "class-import-s2": new Set([
    "HV0021", "HV0022", "HV0023", "HV0024", "HV0026", "HV0027", "HV0028", "HV0029",
  ]),
  "class-import-s3": new Set([
    "HV0030", "HV0031", "HV0032", "HV0033", "HV0034", "HV0035", "HV0036",
    "HV0037", "HV0039", "HV0040", "HV0041",
  ]),
  "class-import-s4": new Set([
    "HV0042", "HV0043", "HV0044", "HV0045", "HV0046", "HV0047", "HV0048",
    "HV0049", "HV0050", "HV0051", "HV0052", "HV0053", "HV0054", "HV0055", "HV0056",
  ]),
  "class-import-s5": new Set([
    "HV0057", "HV0058", "HV0060", "HV0061", "HV0062", "HV0063", "HV0064",
    "HV0065", "HV0066", "HV0067", "HV0068",
  ]),
  "class-import-s6": new Set([
    "HV0069", "HV0070", "HV0071", "HV0072", "HV0073", "HV0074", "HV0075",
    "HV0076", "HV0077", "HV0078", "HV0079", "HV0080", "HV0081", "HV0093",
    "HV0944", "HV0948",
  ]),
  "class-import-s7": new Set([
    "HV0082", "HV0083", "HV0084", "HV0085", "HV0086", "HV0087", "HV0088",
    "HV0089", "HV0090", "HV0091", "HV0092", "HV0094", "HV0095", "HV0096",
    "HV0097", "HV0098", "HV0099",
  ]),
  "class-import-s8": new Set([
    "HV0100", "HV0101", "HV0102", "HV0104", "HV0105", "HV0106", "HV0107",
    "HV0108", "HV0109", "HV0110", "HV0111", "HV0112", "HV0113", "HV0114",
    "HV0115", "HV0947",
  ]),
  "class-import-s9": new Set([
    "HV0116", "HV0117", "HV0118", "HV0119", "HV0120", "HV0121", "HV0122",
    "HV0123", "HV0124", "HV0125", "HV0126", "HV0127", "HV0128", "HV0129",
  ]),
  "class-import-s10": new Set([
    "HV0131", "HV0132", "HV0133", "HV0134", "HV0135", "HV0136", "HV0137",
    "HV0138", "HV0139", "HV0140", "HV0142", "HV0143", "HV0144", "HV0145",
  ]),
  "class-import-s11": new Set([
    "HV0146", "HV0147", "HV0148", "HV0149", "HV0150", "HV0151", "HV0152",
    "HV0153", "HV0154", "HV0155", "HV0156",
  ]),
  "class-import-s31": new Set([
    "HV0400", "HV0401", "HV0403", "HV0404", "HV0405", "HV0406", "HV0407",
    "HV0408", "HV0409", "HV0410",
  ]),
  "class-import-s38": new Set([
    "HV0476", "HV0477", "HV0478", "HV0479", "HV0480", "HV0481", "HV0482",
    "HV0483", "HV0484", "HV0485", "HV0486", "HV0487", "HV0488", "HV0489",
  ]),
};

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

/** Khoản nợ cũ gắn vào phiếu tháng 10 của học viên được chỉ định ở các lớp Thành Sen. */
export function thanhSenPreviousMonthDebtAmount(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  billingMonths: string[],
) {
  const debts = cls?.id ? THANH_SEN_PREVIOUS_MONTH_DEBTS[cls.id] : undefined;
  if (!debts || !billingMonths.includes(THANH_SEN_OCTOBER_BILLING_MONTH)) return 0;
  const code = String(student?.code || "").trim().toUpperCase();
  for (const debt of debts) {
    if (debt.codes.has(code)
      || (debt.names || []).some((suffix) => nameEndsWith(student?.fullName, suffix))) {
      return debt.amount;
    }
  }
  return 0;
}

// Học viên vào lớp sau ngày snapshot chưa có mã trong bản vá — supersede theo tên.
const THANH_SEN_SUPERSEDED_NAMES: Readonly<Record<string, readonly string[]>> = {
  "class-import-s3": ["bao tram"],
};

/** Mọi tháng trước tháng 10/2026 của học viên 13 lớp Thành Sen đã được xử lý — không tính lại. */
export function thanhSenSupersededDebtMonth(
  student: { code?: string; fullName?: string } | null | undefined,
  cls: Pick<DemoClass, "id"> | null | undefined,
  month: string,
) {
  if (!cls?.id || month >= THANH_SEN_OCTOBER_BILLING_MONTH) return false;
  const codes = THANH_SEN_SUPERSEDED_CODES[cls.id];
  if (codes?.has(String(student?.code || "").trim().toUpperCase())) return true;
  const names = THANH_SEN_SUPERSEDED_NAMES[cls.id];
  return Boolean(names?.some((suffix) => nameEndsWith(student?.fullName, suffix)));
}
