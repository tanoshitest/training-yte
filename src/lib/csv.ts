/**
 * Xuất báo cáo dạng CSV — PRD §19.
 *
 * Vì sao CSV chứ không phải `.xlsx`: Excel mở CSV trực tiếp, còn sinh xlsx cần thêm
 * thư viện nặng vào bundle server. Hai chi tiết bắt buộc để Excel bản tiếng Việt
 * đọc đúng file:
 *   1. **BOM UTF-8** ở đầu file, nếu không dấu tiếng Việt sẽ thành ký tự lạ.
 *   2. Dòng `sep=;` mở đầu, vì Excel theo locale VN mặc định tách cột bằng dấu chấm phẩy.
 */

const BOM = "﻿";
const SEP = ";";

export type CsvColumn<T> = {
  header: string;
  /** Trả về chuỗi đã sẵn sàng ghi; số/ngày nên format trước cho khớp locale VN. */
  value: (row: T) => string | number | null | undefined;
};

/**
 * Bọc một ô CSV.
 * Ô bắt đầu bằng `= + - @` bị Excel hiểu là công thức (CSV injection), nên thêm
 * dấu nháy đơn ở đầu để ép về text.
 */
function cell(raw: string | number | null | undefined) {
  if (raw === null || raw === undefined) return "";
  let text = String(raw);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  const lines = [
    `sep=${SEP}`,
    columns.map((c) => cell(c.header)).join(SEP),
    ...rows.map((row) => columns.map((c) => cell(c.value(row))).join(SEP)),
  ];
  return BOM + lines.join("\r\n");
}

/** Đáp ứng HTTP tải file, tên file gắn ngày để không đè lên nhau trong thư mục Downloads. */
export function csvResponse(filename: string, body: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Ngày dạng dd/mm/yyyy cho Excel VN. */
export function csvDate(date: Date | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
