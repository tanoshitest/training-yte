import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Báo cáo thu chi (PDF, A4 ngang) theo bộ lọc đang xem ở trang Quản lý thu chi.
 * Mỗi trang: đầu trang logo + tên trung tâm + vạch xanh mảnh; chân trang vạch xanh
 * mảnh + tên trung tâm + số trang (đồng bộ trên dưới). Trang đầu có cụm tiêu đề
 * căn trái và 4 dòng tổng; bảng kê lặp dòng tiêu đề khi sang trang; cuối là ký tên.
 */
const PAGE = { width: 842, height: 595 };
const MARGIN = 28;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const GRID = rgb(0.78, 0.8, 0.83);
const HEAD_FILL = rgb(0.925, 0.937, 0.953);
const SOFT_FILL = rgb(0.965, 0.969, 0.976);
const RED = rgb(0.725, 0.11, 0.11);
const RULE = 0.5;
/** Vạch đầu / chân trang và chữ chân trang: xanh nhạt, mảnh. */
const ACCENT = rgb(0.231, 0.443, 0.859);
const CENTER = "TRUNG TÂM NGOẠI NGỮ STEPS";
const CENTER_SHORT = "Trung tâm Ngoại ngữ STEPS";
const HEADER_BOTTOM = PAGE.height - 66;
const FOOTER_TOP = 34;

export interface CashbookReportLine {
  date: string;
  voucherDate: string;
  kind: string;
  source: string;
  category: string;
  description: string;
  studentName: string;
  method: string;
  amount: number;
}

export interface CashbookReportInput {
  period: string;
  filters: string;
  exportedAt: string;
  signDate: string;
  sums: { inCash: number; inTransfer: number; outCash: number; outTransfer: number };
  lines: CashbookReportLine[];
  logoPng?: Uint8Array;
}

const str = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const num = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(-1e13, Math.min(1e13, n)) : 0;
};

/** Làm sạch dữ liệu client gửi lên — chỉ dùng để vẽ, không ghi gì. */
export function cleanCashbookReportInput(body: Record<string, unknown>): CashbookReportInput {
  const sums = (body.sums || {}) as Record<string, unknown>;
  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 5000).map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return {
      date: str(item.date, 20), voucherDate: str(item.voucherDate, 20), kind: str(item.kind, 10),
      source: str(item.source, 20), category: str(item.category, 60), description: str(item.description, 300),
      studentName: str(item.studentName, 80), method: str(item.method, 30), amount: num(item.amount),
    };
  });
  return {
    period: str(body.period, 80) || "Báo cáo thu chi",
    filters: str(body.filters, 300),
    exportedAt: str(body.exportedAt, 40),
    signDate: str(body.signDate, 60),
    sums: { inCash: num(sums.inCash), inTransfer: num(sums.inTransfer), outCash: num(sums.outCash), outTransfer: num(sums.outTransfer) },
    lines,
  };
}

export function cashbookReportDownloadName(period: string) {
  const digits = String(period || "").match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const iso = digits.map((d) => d.split("/").reverse().join("-"));
  const stamp = iso.length >= 2 && iso[0] !== iso[1] ? `${iso[0]}_${iso[1]}` : iso[0] || "tong-hop";
  return `bao-cao-thu-chi-${stamp}.pdf`;
}

const money = (value: number) => `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("vi-VN").replace(/,/g, ".")}`;

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  const raw = value || "";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }
    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= maxWidth ? word : fit(font, word, size, maxWidth);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type Align = "left" | "center" | "right";
function put(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: Align = "left") {
  const width = font.widthOfTextAtSize(value, size);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  page.drawText(value, { x: left, y, size, font, color });
}

export async function buildCashbookReportPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: CashbookReportInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  pdf.setTitle(`Báo cáo thu chi — ${data.period}`);
  pdf.setAuthor(CENTER_SHORT);

  const right = PAGE.width - MARGIN;
  const pages: PDFPage[] = [];
  const newPage = () => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    // Đầu trang
    if (logo) {
      const h = 30;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: HEADER_BOTTOM + 8, width: w, height: h });
    } else {
      put(page, medium, "STEPS", MARGIN, HEADER_BOTTOM + 16, 18, NAVY);
    }
    put(page, medium, CENTER, right, HEADER_BOTTOM + 24, 11, NAVY, "right");
    put(page, regular, "ngoaingusteps.edu.vn", right, HEADER_BOTTOM + 11, 8, MUTED, "right");
    page.drawLine({ start: { x: MARGIN, y: HEADER_BOTTOM }, end: { x: right, y: HEADER_BOTTOM }, thickness: RULE, color: ACCENT });
    return page;
  };

  let page = newPage();
  let y = HEADER_BOTTOM - 30;

  // Cụm tiêu đề — căn trái.
  put(page, medium, "BÁO CÁO THU CHI", MARGIN, y, 17, NAVY);
  y -= 17;
  put(page, medium, data.period, MARGIN, y, 11, INK);
  if (data.filters) { y -= 13; put(page, regular, fit(regular, data.filters, 8.5, right - MARGIN), MARGIN, y, 8.5, MUTED); }
  y -= 12;
  put(page, regular, `Ngày xuất: ${data.exportedAt}`, MARGIN, y, 8, MUTED);

  // 4 dòng tổng — bảng nhỏ bên trái.
  y -= 16;
  const sumRows: Array<[string, number]> = [
    ["Thu tiền mặt", data.sums.inCash],
    ["Thu chuyển khoản", data.sums.inTransfer],
    ["Chi tiền mặt", data.sums.outCash],
    ["Chi chuyển khoản", data.sums.outTransfer],
  ];
  const labelW = 130;
  const valueW = 120;
  const sumH = 17;
  for (const [label, value] of sumRows) {
    page.drawRectangle({ x: MARGIN, y: y - sumH, width: labelW, height: sumH, color: SOFT_FILL, borderColor: GRID, borderWidth: 0.5 });
    page.drawRectangle({ x: MARGIN + labelW, y: y - sumH, width: valueW, height: sumH, borderColor: GRID, borderWidth: 0.5 });
    put(page, medium, label, MARGIN + 8, y - 12, 9, INK);
    put(page, medium, `${money(value)} đ`, MARGIN + labelW + valueW - 8, y - 12, 9, INK, "right");
    y -= sumH;
  }

  // Bảng kê chi tiết.
  y -= 20;
  put(page, medium, "BẢNG KÊ CHI TIẾT", MARGIN, y, 10, NAVY);
  y -= 8;
  const headers = ["STT", "Ngày cập nhật", "Ngày chứng từ", "Thu/Chi", "Nguồn", "Khoản mục", "Nội dung", "Tên HV", "Hình thức", "Số tiền (đ)"];
  const weights = [26, 58, 58, 38, 48, 62, 226, 122, 68, 80];
  const total = weights.reduce((a, b) => a + b, 0);
  const contentW = right - MARGIN;
  let cx = MARGIN;
  const cols = weights.map((w) => { const width = (w / total) * contentW; const col = { left: cx, width }; cx += width; return col; });
  const aligns: Align[] = ["center", "center", "center", "center", "left", "left", "left", "left", "left", "right"];
  const SIZE = 8;
  const LINE_H = 10;
  const PAD = 4;
  const bottomLimit = FOOTER_TOP + 12;

  const drawHead = () => {
    const h = 26;
    headers.forEach((label, i) => {
      const col = cols[i]!;
      page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: HEAD_FILL, borderColor: GRID, borderWidth: 0.5 });
      const lines = wrap(medium, label, SIZE, col.width - PAD * 2);
      let base = y - h / 2 + ((lines.length - 1) * LINE_H) / 2 - 3;
      for (const line of lines) { put(page, medium, line, col.left + col.width / 2, base, SIZE, INK, "center"); base -= LINE_H; }
    });
    y -= h;
  };
  drawHead();

  const rowHeight = (cells: string[], font: PDFFont = regular) =>
    Math.max(...cells.map((value, i) => ((i === 6 || i === 7) ? wrap(font, value, SIZE, cols[i]!.width - PAD * 2).length : 1))) * LINE_H + 7;
  const SIGN_BLOCK = 100;
  const drawRow = (cells: string[], options: { font?: PDFFont; fill?: typeof SOFT_FILL; colors?: Array<typeof INK | undefined>; merge?: boolean } = {}) => {
    const font = options.font || regular;
    const wrapped = cells.map((value, i) => (i === 6 || i === 7) ? wrap(font, value, SIZE, cols[i]!.width - PAD * 2) : [fit(font, value, SIZE, cols[i]!.width - PAD * 2)]);
    const h = Math.max(...wrapped.map((lines) => lines.length)) * LINE_H + 7;
    if (y - h < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 16; drawHead(); }
    if (options.merge) {
      // Dòng tổng: gộp 9 cột đầu, nhãn căn phải.
      const span = cols[8]!.left + cols[8]!.width - MARGIN;
      page.drawRectangle({ x: MARGIN, y: y - h, width: span, height: h, color: options.fill, borderColor: GRID, borderWidth: 0.5 });
      page.drawRectangle({ x: cols[9]!.left, y: y - h, width: cols[9]!.width, height: h, color: options.fill, borderColor: GRID, borderWidth: 0.5 });
      put(page, font, cells[0]!, MARGIN + span - PAD, y - h + 5, SIZE, INK, "right");
      put(page, font, cells[9]!, cols[9]!.left + cols[9]!.width - PAD, y - h + 5, SIZE, INK, "right");
      y -= h;
      return;
    }
    cells.forEach((_, i) => {
      const col = cols[i]!;
      page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: options.fill, borderColor: GRID, borderWidth: 0.5 });
      let base = y - 11;
      const anchor = aligns[i] === "center" ? col.left + col.width / 2 : aligns[i] === "right" ? col.left + col.width - PAD : col.left + PAD;
      for (const line of wrapped[i]!) { put(page, font, line, anchor, base, SIZE, options.colors?.[i] || INK, aligns[i]); base -= LINE_H; }
    });
    y -= h;
  };

  if (!data.lines.length) {
    const h = 20;
    page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, borderColor: GRID, borderWidth: 0.5 });
    put(page, regular, "Không có phiếu thu chi phù hợp bộ lọc.", MARGIN + contentW / 2, y - 13, SIZE, MUTED, "center");
    y -= h;
  }
  const lineCells = data.lines.map((line, index) => [String(index + 1), line.date, line.voucherDate, line.kind, line.source, line.category, line.description, line.studentName, line.method, money(line.amount)]);
  const totalsHeight = rowHeight(["Tổng thu"], medium) * 2;
  // Giữ 3 dòng cuối + dòng tổng + ký tên cùng một trang, tránh trang chỉ có chữ ký.
  const tailStart = Math.max(0, lineCells.length - 3);
  const tailHeight = lineCells.slice(tailStart).reduce((sum, cells) => sum + rowHeight(cells), 0) + totalsHeight + SIGN_BLOCK;
  let rowsOnPage = 0;
  let pageRef = page;
  data.lines.forEach((line, index) => {
    if (pageRef !== page) { pageRef = page; rowsOnPage = 0; }
    if (index === tailStart && rowsOnPage > 0 && y - tailHeight < bottomLimit) { page = newPage(); pageRef = page; rowsOnPage = 0; y = HEADER_BOTTOM - 16; drawHead(); }
    rowsOnPage += 1;
    drawRow(
      [String(index + 1), line.date, line.voucherDate, line.kind, line.source, line.category, line.description, line.studentName, line.method, money(line.amount)],
      { colors: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, line.kind === "Chi" ? RED : undefined] },
    );
  });
  const totalIn = data.sums.inCash + data.sums.inTransfer;
  const totalOut = data.sums.outCash + data.sums.outTransfer;
  drawRow(["Tổng thu", "", "", "", "", "", "", "", "", money(totalIn)], { font: medium, fill: SOFT_FILL, merge: true });
  drawRow(["Tổng chi", "", "", "", "", "", "", "", "", money(totalOut)], { font: medium, fill: SOFT_FILL, merge: true });

  // Ký tên — giữ nguyên cụm, không tách trang.
  if (y - SIGN_BLOCK < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 10; }
  y -= 26;
  const leftX = MARGIN + 130;
  const rightX = right - 130;
  if (data.signDate) put(page, regular, data.signDate, rightX, y, 9, INK, "center");
  y -= 15;
  put(page, medium, "KẾ TOÁN", leftX, y, 10, INK, "center");
  put(page, medium, "GIÁM ĐỐC", rightX, y, 10, INK, "center");
  y -= 12;
  put(page, regular, "(Ký, ghi rõ họ tên)", leftX, y, 8, MUTED, "center");
  put(page, regular, "(Ký, ghi rõ họ tên)", rightX, y, 8, MUTED, "center");

  // Chân trang — vạch xanh mảnh như đầu trang, chữ xanh nhỏ.
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: RULE, color: ACCENT });
    put(item, regular, CENTER_SHORT, MARGIN, FOOTER_TOP - 13, 8, ACCENT);
    put(item, regular, `Trang ${index + 1} / ${pages.length}`, right, FOOTER_TOP - 13, 8, ACCENT, "right");
  });

  return pdf.save();
}
