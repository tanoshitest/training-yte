/**
 * Thông số hóa đơn MISA mà admin tự chỉnh ở Cài đặt → Tích hợp → MISA (không cần sửa code):
 * mẫu tên dòng hàng, đơn vị tính, hình thức thanh toán, nguồn tên người mua. Hóa đơn có email thì
 * MISA luôn tự gửi email (không có công tắc). Thuế suất / ký hiệu / mẫu số vẫn nằm ở cấu hình MISA gốc.
 *
 * Cấu hình cũ đã lưu chưa có khối này nên mọi nơi đọc đều đi qua `normalizeMisaInvoiceFields`
 * để luôn nhận đủ giá trị (thiếu hoặc rỗng thì dùng mặc định).
 */

import type { MisaInvoiceBuyer } from "./misa-invoice-payload";

export interface MisaInvoiceFields {
  /** Mẫu tên dòng hàng; hỗ trợ các biến trong `MISA_ITEM_NAME_VARIABLES`. */
  itemNameTemplate: string;
  unitNameCourse: string;
  unitNameMonthly: string;
  paymentMethodName: string;
  /** PARENT = ghi tên phụ huynh (không có thì dùng tên học viên), STUDENT = ghi tên học viên. */
  buyerNameSource: "PARENT" | "STUDENT";
}

export const DEFAULT_MISA_INVOICE_FIELDS: MisaInvoiceFields = {
  itemNameTemplate: "Học phí {period} - {studentName}",
  unitNameCourse: "Khóa",
  unitNameMonthly: "Tháng",
  paymentMethodName: "TM/CK",
  buyerNameSource: "PARENT",
};

/** Các biến dùng được trong mẫu tên dòng hàng, hiển thị làm gợi ý ở màn cấu hình. */
export const MISA_ITEM_NAME_VARIABLES = ["period", "studentName", "studentCode", "parentName", "className"] as const;
export type MisaItemNameVariable = typeof MISA_ITEM_NAME_VARIABLES[number];

const MAX_TEMPLATE_LENGTH = 300;
const MAX_SHORT_LENGTH = 50;

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return trimmed || fallback;
}

export function normalizeMisaInvoiceFields(raw?: Partial<MisaInvoiceFields> | null): MisaInvoiceFields {
  const source = raw && typeof raw === "object" ? raw : {};
  const defaults = DEFAULT_MISA_INVOICE_FIELDS;
  return {
    itemNameTemplate: cleanText(source.itemNameTemplate, defaults.itemNameTemplate, MAX_TEMPLATE_LENGTH),
    unitNameCourse: cleanText(source.unitNameCourse, defaults.unitNameCourse, MAX_SHORT_LENGTH),
    unitNameMonthly: cleanText(source.unitNameMonthly, defaults.unitNameMonthly, MAX_SHORT_LENGTH),
    paymentMethodName: cleanText(source.paymentMethodName, defaults.paymentMethodName, MAX_SHORT_LENGTH),
    buyerNameSource: source.buyerNameSource === "STUDENT" ? "STUDENT" : "PARENT",
  };
}

/** Thay `{biến}` bằng giá trị thật; biến lạ bị bỏ, khoảng trắng thừa được gọn lại, rỗng thì về "Học phí". */
export function renderMisaItemName(template: string, values: Partial<Record<MisaItemNameVariable, string>>): string {
  const rendered = template.replace(/\{(\w+)\}/g, (_match, key: string) => String((values as Record<string, string | undefined>)[key] ?? "").trim());
  return rendered.replace(/\s+/g, " ").trim() || "Học phí";
}

const sameName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * Tên người mua thực sự gửi lên MISA. Hóa đơn tự động luôn được tạo với tên học viên (Zalo dùng
 * chính trường đó làm "tên học viên"), nên ở chế độ PARENT chỉ thay bằng tên phụ huynh khi tên
 * trên hóa đơn vẫn là tên học viên; tên kế toán đã sửa tay ở modal xuất hóa đơn được giữ nguyên.
 */
export function resolveMisaBuyerName(input: {
  source: MisaInvoiceFields["buyerNameSource"];
  invoiceBuyerName: string;
  parentName?: string;
  studentNames: string[];
}): string {
  const parentName = (input.parentName || "").trim();
  if (input.source !== "PARENT" || !parentName) return input.invoiceBuyerName;
  const untouched = input.studentNames.some((name) => name && sameName(name, input.invoiceBuyerName));
  return untouched ? parentName : input.invoiceBuyerName;
}

/** Tên người mua in trên hóa đơn khi phụ huynh chưa cung cấp đủ thông tin (giống hóa đơn xuất tay ở MISA). */
export const MISA_ANONYMOUS_BUYER_NAME = "Khách hàng chưa cung cấp thông tin";

/** CCCD 12 số hợp lệ (bỏ dấu cách/chấm/gạch); sai định dạng coi như chưa có. Dùng cho công cụ thử MISA, hóa đơn thật dùng `normalizeParentTaxId`. */
export function normalizeCitizenId(value?: string): string {
  const digits = (value || "").replace(/[\s.-]/g, "");
  return /^\d{12}$/.test(digits) ? digits : "";
}

/**
 * CCCD hoặc mã số thuế của người đóng tiền (phụ huynh), lưu ở `students.nationalId`. Hợp lệ: CCCD 12 số,
 * hoặc MST 10 số / 13 số (13 số ghi dạng `0101243150-733` như MISA yêu cầu). Bỏ dấu cách/chấm/gạch trước
 * khi kiểm tra; sai độ dài coi như chưa có.
 */
export function normalizeParentTaxId(value?: string): string {
  const digits = (value || "").replace(/[\s.-]/g, "");
  if (/^\d{10}$|^\d{12}$/.test(digits)) return digits;
  if (/^\d{13}$/.test(digits)) return `${digits.slice(0, 10)}-${digits.slice(10)}`;
  return "";
}

/**
 * Chọn mẫu hóa đơn và dựng thông tin người mua:
 * - Có mã số thuế (kế toán nhập ở modal) → hóa đơn đơn vị, giữ nguyên thông tin đã nhập.
 * - Có đủ tên phụ huynh + địa chỉ + CCCD/MST của phụ huynh (người đóng tiền, `students.nationalId`) → mẫu "có
 *   thông tin": tên phụ huynh, địa chỉ, số đó điền vào mã số thuế (`BuyerTaxCode`, giống ô "Mã số thuế" ở form
 *   xuất hóa đơn nên bản nháp tự dựng và bản kế toán xem khớp nhau).
 * - Thiếu một trong ba → mẫu "không thông tin": tên cố định, không gửi địa chỉ/CCCD/SĐT/mã khách.
 * Email (nếu có) được giữ ở cả hai mẫu để MISA gửi hóa đơn cho người mua.
 */
export function resolveMisaBuyer(input: {
  source: MisaInvoiceFields["buyerNameSource"];
  invoice: { buyerName: string; buyerTaxCode?: string; buyerAddress?: string; buyerEmail?: string };
  student?: { parentName?: string; address?: string; nationalId?: string; parentPhone1?: string; loginEmail?: string };
  studentNames: string[];
  studentCode?: string;
}): MisaInvoiceBuyer {
  const { invoice, student } = input;
  const email = (invoice.buyerEmail || student?.loginEmail || "").trim();
  const address = (invoice.buyerAddress || student?.address || "").trim();
  const fullName = resolveMisaBuyerName({
    source: input.source, invoiceBuyerName: invoice.buyerName, parentName: student?.parentName, studentNames: input.studentNames,
  });
  // Không gửi mã khách hàng (BuyerCode): MISA dùng nó tra danh mục khách hàng và có thể tự điền ô "Tên đơn vị"; kế toán xuất tay ở MISA cũng để trống.
  const common = { email, phone: (student?.parentPhone1 || "").trim() };
  const taxCode = (invoice.buyerTaxCode || "").trim();
  if (taxCode) return { ...common, fullName, taxCode, address };

  // Tên kế toán đã sửa tay ở modal (không còn là tên học viên) cũng tính là đã có tên người mua.
  const hasBuyerName = Boolean((student?.parentName || "").trim())
    || (Boolean(invoice.buyerName.trim()) && !input.studentNames.some((name) => name && sameName(name, invoice.buyerName)));
  const parentTaxId = normalizeParentTaxId(student?.nationalId);
  if (hasBuyerName && address && parentTaxId) return { ...common, fullName, taxCode: parentTaxId, address };
  return { fullName: MISA_ANONYMOUS_BUYER_NAME, email };
}
