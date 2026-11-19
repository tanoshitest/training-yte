import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Báo cáo học viên cần bổ trợ (PDF, A4 dọc) — Dashboard › tab Bổ trợ: học viên vắng có
 * phép trong tháng. Bảng STT · Tên · Mã HV · Lớp · Ngày vắng · Số buổi. Máy chủ chỉ vẽ dữ
 * liệu client gửi lên, không đọc hay ghi gì.
 */
const PAGE = { width: 595, height: 842 };
const MARGIN = 32;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const GRID = rgb(0.78, 0.8, 0.83);
const HEAD_FILL = rgb(0.925, 0.937, 0.953);
const SOFT_FILL = rgb(0.965, 0.969, 0.976);
const ACCENT = rgb(0.231, 0.443, 0.859);
const CENTER = "TRUNG TÂM NGOẠI NGỮ STEPS";
const CENTER_SHORT = "Trung tâm Ngoại ngữ STEPS";
const HEADER_BOTTOM = PAGE.height - 66;
const FOOTER_TOP = 34;
const SIZE = 8.5;
const LINE_H = 10.5;
const PAD = 4;

export interface SupportReportRow {
  name: string;
  code: string;
  className: string;
  dates: string[];
}

export interface SupportReportInput {
  month: string;
  filter: string;
  exportedAt: string;
  rows: SupportReportRow[];
  logoPng?: Uint8Array;
}

const str = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export function cleanSupportReportInput(body: Record<string, unknown>): SupportReportInput {
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 3000).map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return {
      name: str(item.name, 80), code: str(item.code, 20), className: str(item.className, 80),
      dates: (Array.isArray(item.dates) ? item.dates : []).slice(0, 40).map((date) => str(date, 12)),
    };
  });
  return { month: str(body.month, 40) || "Bổ trợ", filter: str(body.filter, 120), exportedAt: str(body.exportedAt, 40), rows };
}

export function supportReportDownloadName(month: string) {
  const match = String(month || "").match(/(\d{2})\/(\d{4})/);
  return `hoc-vien-can-bo-tro-${match ? `${match[2]}-${match[1]}` : "tong-hop"}.pdf`;
}

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  const raw = value || "";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Ngắt danh sách ngày (cách nhau dấu phẩy) thành nhiều dòng vừa cột. */
function wrapList(font: PDFFont, items: string[], size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  items.forEach((item, index) => {
    const piece = index < items.length - 1 ? `${item},` : item;
    const candidate = current ? `${current} ${piece}` : piece;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else { lines.push(current); current = piece; }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type Align = "left" | "center" | "right";
function put(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: Align = "left") {
  const width = font.widthOfTextAtSize(value, size);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  page.drawText(value, { x: left, y, size, font, color });
}

export async function buildSupportReportPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: SupportReportInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  pdf.setTitle(`Học viên cần bổ trợ — ${data.month}`);
  pdf.setAuthor(CENTER_SHORT);

  const right = PAGE.width - MARGIN;
  const contentW = right - MARGIN;
  const bottomLimit = FOOTER_TOP + 14;
  const pages: PDFPage[] = [];
  const newPage = () => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    if (logo) {
      const h = 30;
      page.drawImage(logo, { x: MARGIN, y: HEADER_BOTTOM + 8, width: (logo.width / logo.height) * h, height: h });
    } else {
      put(page, medium, "STEPS", MARGIN, HEADER_BOTTOM + 16, 18, NAVY);
    }
    put(page, medium, CENTER, right, HEADER_BOTTOM + 24, 11, NAVY, "right");
    put(page, regular, "ngoaingusteps.edu.vn", right, HEADER_BOTTOM + 11, 8, MUTED, "right");
    page.drawLine({ start: { x: MARGIN, y: HEADER_BOTTOM }, end: { x: right, y: HEADER_BOTTOM }, thickness: 0.5, color: ACCENT });
    return page;
  };
  let page = newPage();
  let y = HEADER_BOTTOM - 30;
  put(page, medium, "HỌC VIÊN CẦN BỔ TRỢ", MARGIN, y, 17, NAVY);
  y -= 17;
  put(page, medium, `Vắng có phép · ${data.month}`, MARGIN, y, 11, INK);
  y -= 13;
  const total = data.rows.reduce((sum, row) => sum + row.dates.length, 0);
  put(page, regular, fit(regular, `${data.filter} · ${data.rows.length} học viên · ${total} buổi vắng có phép`, 9, contentW), MARGIN, y, 9, INK);
  y -= 12;
  put(page, regular, `Ngày xuất: ${data.exportedAt} · Không tính buổi cả lớp nghỉ.`, MARGIN, y, 8, MUTED);
  y -= 16;

  const headers = ["STT", "Tên học viên", "Mã HV", "Lớp", "Ngày vắng", "Số buổi"];
  const weights = [28, 130, 52, 110, 170, 40];
  const sum = weights.reduce((a, b) => a + b, 0);
  let cx = MARGIN;
  const cols = weights.map((w) => { const width = (w / sum) * contentW; const col = { left: cx, width }; cx += width; return col; });
  const aligns: Align[] = ["center", "left", "center", "left", "left", "center"];
  const drawHead = () => {
    const h = 20;
    headers.forEach((label, i) => {
      const col = cols[i]!;
      page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: HEAD_FILL, borderColor: GRID, borderWidth: 0.5 });
      put(page, medium, label, col.left + col.width / 2, y - 13, SIZE, INK, "center");
    });
    y -= h;
  };
  drawHead();
  if (!data.rows.length) {
    page.drawRectangle({ x: MARGIN, y: y - 22, width: contentW, height: 22, borderColor: GRID, borderWidth: 0.5 });
    put(page, regular, "Không có học viên vắng có phép.", MARGIN + contentW / 2, y - 14, SIZE, MUTED, "center");
    y -= 22;
  }
  data.rows.forEach((row, index) => {
    const dateLines = wrapList(regular, row.dates, SIZE, cols[4]!.width - PAD * 2);
    const h = dateLines.length * LINE_H + 7;
    if (y - h < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 20; drawHead(); }
    const cells = [[String(index + 1)], [row.name], [row.code], [row.className], dateLines, [String(row.dates.length)]];
    cells.forEach((lines, i) => {
      const col = cols[i]!;
      page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: index % 2 ? SOFT_FILL : undefined, borderColor: GRID, borderWidth: 0.5 });
      const anchor = aligns[i] === "center" ? col.left + col.width / 2 : col.left + PAD;
      let base = y - 11;
      for (const line of lines) {
        put(page, i === 1 ? medium : regular, fit(i === 1 ? medium : regular, line, SIZE, col.width - PAD * 2), anchor, base, SIZE, INK, aligns[i]);
        base -= LINE_H;
      }
    });
    y -= h;
  });

  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: 0.5, color: ACCENT });
    put(item, regular, `${CENTER_SHORT} · Học viên cần bổ trợ ${data.month}`, MARGIN, FOOTER_TOP - 13, 8, ACCENT);
    put(item, regular, `Trang ${index + 1} / ${pages.length}`, right, FOOTER_TOP - 13, 8, ACCENT, "right");
  });
  return pdf.save();
}
