/**
 * Tiện ích đọc & kiểm tra dữ liệu từ `FormData` trong Server Action.
 * Dùng chung cho mọi form CRUD — giữ action ngắn và thông báo lỗi tiếng Việt nhất quán.
 */

/** Kết quả trả về của mọi Server Action dạng form. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Thông báo thành công hiển thị cạnh form. */
  message?: string;
  /** Sau khi lưu thành công, form điều hướng tới URL này. */
  href?: string;
};

export const EMPTY_STATE: ActionState = {};

/** Lỗi nghiệp vụ do người dùng nhập sai — bắt trong `runAction` và trả về `ActionState`. */
export class FormError extends Error {}

export function fail(message: string): never {
  throw new FormError(message);
}

/**
 * Bọc phần thân của Server Action: đổi `FormError` thành state lỗi,
 * đổi lỗi Prisma thường gặp thành câu tiếng Việt dễ hiểu.
 */
export async function runAction(
  fn: () => Promise<string | void>,
): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof FormError) return { error: error.message };

    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return { error: "Giá trị này đã tồn tại, vui lòng dùng tên/mã khác." };
    }
    if (code === "P2003" || code === "P2014") {
      return {
        error:
          "Không xoá được vì dữ liệu đang được sử dụng ở nơi khác. Hãy gỡ các liên kết đó trước.",
      };
    }
    if (code === "P2025") {
      return { error: "Không tìm thấy bản ghi — có thể đã bị xoá." };
    }

    console.error("[action] lỗi không lường trước:", error);
    return { error: "Có lỗi xảy ra, vui lòng thử lại." };
  }
}

// ------------------------------------------------------------------
// Đọc field
// ------------------------------------------------------------------

/** Chuỗi bắt buộc, đã trim. */
export function requiredStr(fd: FormData, key: string, label: string, max = 200) {
  const value = String(fd.get(key) ?? "").trim();
  if (!value) fail(`${label} không được để trống.`);
  if (value.length > max) fail(`${label} tối đa ${max} ký tự.`);
  return value;
}

/** Chuỗi tuỳ chọn — rỗng trả `null`. */
export function optionalStr(fd: FormData, key: string, max = 500) {
  const value = String(fd.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

/** Số nguyên bắt buộc trong khoảng cho trước. */
export function requiredInt(
  fd: FormData,
  key: string,
  label: string,
  { min = 0, max = 1_000_000 }: { min?: number; max?: number } = {},
) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) fail(`${label} không được để trống.`);
  const n = Number(raw);
  if (!Number.isInteger(n)) fail(`${label} phải là số nguyên.`);
  if (n < min || n > max) fail(`${label} phải nằm trong khoảng ${min}–${max}.`);
  return n;
}

/** Số nguyên tuỳ chọn — rỗng trả `null`. */
export function optionalInt(
  fd: FormData,
  key: string,
  label: string,
  { min = 0, max = 1_000_000 }: { min?: number; max?: number } = {},
) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  return requiredInt(fd, key, label, { min, max });
}

/** Checkbox / select boolean — nhận `"true"` hoặc `"on"`. */
export function bool(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  return raw === "true" || raw === "on" || raw === "1";
}

/**
 * Số tiền → chuỗi thập phân cho Prisma `Decimal`.
 * Chấp nhận cách gõ quen tay của người Việt: `1.500.000`, `1 500 000`, `1500000`.
 *
 * Tách khỏi `money` để form gửi **nhiều ô tiền cùng tên** (bảng giá theo mức buổi)
 * đọc được từng phần tử của mảng.
 */
export function parseMoney(value: string, label: string) {
  const raw = value.trim().replace(/[.\s,]/g, "");
  if (!raw) fail(`${label} không được để trống.`);
  if (!/^\d+$/.test(raw)) fail(`${label} chỉ được chứa chữ số.`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) fail(`${label} không hợp lệ.`);
  if (n > 9_999_999_999) fail(`${label} vượt quá giới hạn cho phép.`);
  return raw;
}

/** Số tiền bắt buộc đọc từ một ô của form. */
export function money(fd: FormData, key: string, label: string) {
  return parseMoney(String(fd.get(key) ?? ""), label);
}

/** Số tiền tuỳ chọn — rỗng trả `null`. */
export function optionalMoney(fd: FormData, key: string, label: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  return money(fd, key, label);
}

/** Giờ trong ngày dạng `"HH:mm"` — export để chỗ đọc mảng giờ tự kiểm tra được. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Giờ trong ngày dạng `"HH:mm"`. */
export function requiredTime(fd: FormData, key: string, label: string) {
  const value = String(fd.get(key) ?? "").trim();
  if (!value) fail(`${label} không được để trống.`);
  if (!TIME_RE.test(value)) fail(`${label} phải có dạng HH:mm, ví dụ 08:00.`);
  return value;
}

/** Id bắt buộc (khoá ngoại từ `<select>`). */
export function requiredId(fd: FormData, key: string, label: string) {
  const value = String(fd.get(key) ?? "").trim();
  if (!value) fail(`Vui lòng chọn ${label}.`);
  return value;
}

/** Id tuỳ chọn — rỗng nghĩa là "chưa gán". */
export function optionalId(fd: FormData, key: string) {
  const value = String(fd.get(key) ?? "").trim();
  return value || null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ngày từ `<input type="date">`.
 * Lưu về nửa đêm UTC để giá trị hiển thị không lệch ngày khi đổi múi giờ.
 */
export function optionalDate(fd: FormData, key: string, label: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  if (!DATE_RE.test(raw)) fail(`${label} phải có dạng ngày/tháng/năm.`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) fail(`${label} không hợp lệ.`);
  return date;
}

export function requiredDate(fd: FormData, key: string, label: string) {
  const date = optionalDate(fd, key, label);
  if (!date) fail(`${label} không được để trống.`);
  return date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email bắt buộc, chuẩn hoá về chữ thường. */
export function requiredEmail(fd: FormData, key: string, label: string) {
  const value = String(fd.get(key) ?? "")
    .trim()
    .toLowerCase();
  if (!value) fail(`${label} không được để trống.`);
  if (!EMAIL_RE.test(value)) fail(`${label} không đúng định dạng.`);
  return value;
}

/** Mật khẩu mới do Admin đặt cho tài khoản giáo viên. */
export function requiredPassword(fd: FormData, key: string, label: string, min = 8) {
  const value = String(fd.get(key) ?? "");
  if (!value) fail(`${label} không được để trống.`);
  if (value.length < min) fail(`${label} phải có ít nhất ${min} ký tự.`);
  if (value.length > 100) fail(`${label} tối đa 100 ký tự.`);
  return value;
}
