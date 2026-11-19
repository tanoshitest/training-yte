/**
 * Chuẩn hoá số điện thoại Việt Nam sang định dạng Zalo yêu cầu cho API gửi qua SĐT
 * (quốc gia `84` + số thuê bao, không dấu `+`, không số 0 đầu — cùng quy ước với ZNS).
 *
 * Trả `null` thay vì đoán khi không chắc — gửi nhầm số là gửi thông tin học phí cho
 * người lạ (R16 của plan). Thống kê định dạng thật trên dữ liệu production (Bước 1b
 * của Phase 7) CHƯA chạy được trong phiên này vì cần quyền truy vấn CSDL production
 * trực tiếp; hàm dưới đây xử lý mọi dạng phổ biến đã biết của số di động Việt Nam,
 * xác nhận lại bằng thống kê thật trước khi bật `zalo.enabled` trên production.
 */

// Đầu số di động Việt Nam còn hoạt động (2 chữ số sau số 0 đầu / mã quốc gia 84).
const MOBILE_PREFIXES = [
  "32", "33", "34", "35", "36", "37", "38", "39", "86", "96", "97", "98", // Viettel
  "81", "82", "83", "84", "85", "88", "91", "94", // Vinaphone
  "70", "76", "77", "78", "79", "89", "90", "93", // Mobifone
  "52", "56", "58", "92", // Vietnamobile
  "59", "99", // Gmobile
  "87", // Itelecom
  "55", // Reddi
];

export function toZaloPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  // Bỏ khoảng trắng, dấu chấm, gạch ngang, ngoặc đơn thường gặp khi nhân viên nhập tay.
  const cleaned = raw.replace(/[\s.\-()]/g, "");
  if (!cleaned) return null;

  let national: string | null = null;
  if (/^0\d{9}$/.test(cleaned)) national = cleaned.slice(1);
  else if (/^\+84\d{9}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^84\d{9}$/.test(cleaned)) national = cleaned.slice(2);
  else if (/^\d{9}$/.test(cleaned)) national = cleaned; // đã bỏ số 0 đầu từ trước

  if (!national) return null;
  const prefix = national.slice(0, 2);
  if (!MOBILE_PREFIXES.includes(prefix)) return null;
  return `84${national}`;
}
