import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Báo cáo buổi dạy (PDF, A4 dọc) — nút Xuất PDF ở Báo cáo chấm công. Đơn giản:
 * bảng tổng mỗi giáo viên bao nhiêu buổi / giờ trong khoảng ngày, rồi danh sách
 * từng buổi của từng giáo viên kèm loại buổi. Đầu / chân trang giống báo cáo thu chi.
 * Máy chủ chỉ vẽ dữ liệu client gửi lên (đã tính sẵn), không đọc hay ghi gì.
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
const PAD = 4;
const LINE_H = 10.5;

export interface TimesheetReportSession {
  date: string;
  weekday: string;
  time: string;
  className: string;
  type: string;
  hours: string;
  /** false: dòng chỉ để đối chiếu (Nghỉ không lương / Nghỉ lễ / Đã hủy) — không tính vào tổng giờ. */
  counted: boolean;
}

export interface TimesheetReportTeacher {
  name: string;
  code: string;
  regular: number;
  makeup: number;
  substitute: number;
  support: number;
  /** Tách riêng từng loại bổ trợ (lịch thêm ngoài lịch lớp). */
  testSpeaking: number;
  kemSpeaking: number;
  kemCaNhan: number;
  kemLop: number;
  count: number;
  hours: string;
  sessions: TimesheetReportSession[];
}

export interface TimesheetReportInput {
  period: string;
  filter: string;
  exportedAt: string;
  totalCount: number;
  totalHours: string;
  teachers: TimesheetReportTeacher[];
  logoPng?: Uint8Array;
}

const str = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const int = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(1e6, n)) : 0;
};

/** Làm sạch dữ liệu client gửi lên — chỉ dùng để vẽ. */
export function cleanTimesheetReportInput(body: Record<string, unknown>): TimesheetReportInput {
  const teachers = (Array.isArray(body.teachers) ? body.teachers : []).slice(0, 300).map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    const byType = ((item.byType && typeof item.byType === "object" ? item.byType : {}) as Record<string, unknown>);
    return {
      name: str(item.name, 80), code: str(item.code, 20),
      regular: int(item.regular), makeup: int(item.makeup), substitute: int(item.substitute), support: int(item.support),
      testSpeaking: int(byType.TEST_SPEAKING), kemSpeaking: int(byType.KEM_SPEAKING), kemCaNhan: int(byType.KEM_CA_NHAN), kemLop: int(byType.KEM_LOP),
      count: int(item.count), hours: str(item.hours, 12),
      sessions: (Array.isArray(item.sessions) ? item.sessions : []).slice(0, 2000).map((entry) => {
        const s = (entry || {}) as Record<string, unknown>;
        return { date: str(s.date, 12), weekday: str(s.weekday, 8), time: str(s.time, 20), className: str(s.className, 300), type: str(s.type, 30), hours: str(s.hours, 12), counted: s.counted !== false };
      }),
    };
  });
  return {
    period: str(body.period, 80) || "Báo cáo buổi dạy",
    filter: str(body.filter, 120),
    exportedAt: str(body.exportedAt, 40),
    totalCount: int(body.totalCount),
    totalHours: str(body.totalHours, 12),
    teachers,
  };
}

export function timesheetReportDownloadName(period: string) {
  const digits = String(period || "").match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const iso = digits.map((d) => d.split("/").reverse().join("-"));
  const month = String(period || "").match(/(\d{2})\/(\d{4})/);
  const stamp = iso.length >= 2 && iso[0] !== iso[1] ? `${iso[0]}_${iso[1]}` : iso[0] || (month ? `${month[2]}-${month[1]}` : "tong-hop");
  return `bao-cao-buoi-day-${stamp}.pdf`;
}

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  const raw = value || "";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Ngắt chữ thành nhiều dòng vừa cột (theo từ; từ quá dài thì cắt theo ký tự). */
export function wrapText(font: PDFFont, value: string, size: number, maxWidth: number) {
  const width = (text: string) => font.widthOfTextAtSize(text, size);
  const lines: string[] = [];
  let current = "";
  for (const word of String(value || "").split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= maxWidth) { current = candidate; continue; }
    if (current) lines.push(current);
    let rest = word;
    while (width(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && width(rest.slice(0, cut)) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
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

export async function buildTimesheetReportPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: TimesheetReportInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  pdf.setTitle(`Báo cáo buổi dạy — ${data.period}`);
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

  // Tiêu đề.
  put(page, medium, "BÁO CÁO BUỔI DẠY", MARGIN, y, 17, NAVY);
  y -= 17;
  put(page, medium, data.period, MARGIN, y, 11, INK);
  if (data.filter) { y -= 13; put(page, regular, fit(regular, data.filter, 9, contentW), MARGIN, y, 9, INK); }
  y -= 12;
  put(page, regular, `Ngày xuất: ${data.exportedAt} · Chỉ tính buổi đã dạy (đã qua giờ kết thúc).`, MARGIN, y, 8, MUTED);
  y -= 18;

  /** Vẽ một bảng: tự sang trang và lặp lại dòng tiêu đề. Cột trong `wrap` tự xuống dòng (dòng cao lên). */
  const table = (headers: string[], weights: number[], aligns: Align[], rows: string[][], options: { totalRow?: string[]; keepWith?: number; wrap?: number[]; mutedRows?: boolean[]; rowMin?: number } = {}) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    let cx = MARGIN;
    const cols = weights.map((w) => { const width = (w / sum) * contentW; const col = { left: cx, width }; cx += width; return col; });
    const headH = 20;
    const rowH = options.rowMin || 16;
    const wrapCols = new Set(options.wrap || []);
    const layout = (cells: string[], font: PDFFont, wrapAll = false) => cells.map((value, i) => {
      const inner = cols[i]!.width - PAD * 2;
      return wrapAll || wrapCols.has(i) ? wrapText(font, value, SIZE, inner) : [fit(font, value, SIZE, inner)];
    });
    const heightOf = (lines: string[][], min: number) => Math.max(min, Math.max(...lines.map((l) => l.length)) * LINE_H + 6);
    const drawCells = (cells: string[], min: number, font: PDFFont, fill?: typeof SOFT_FILL, center = false, wrapAll = false, muted = false) => {
      const lines = layout(cells, font, wrapAll);
      const h = heightOf(lines, min);
      lines.forEach((cellLines, i) => {
        const col = cols[i]!;
        page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: fill, borderColor: GRID, borderWidth: 0.5 });
        const align = center ? "center" : aligns[i]!;
        const anchor = align === "center" ? col.left + col.width / 2 : align === "right" ? col.left + col.width - PAD : col.left + PAD;
        let base = y - (h - cellLines.length * LINE_H) / 2 - LINE_H + 2.5;
        for (const line of cellLines) { put(page, font, line, anchor, base, SIZE, muted ? MUTED : INK, align); base -= LINE_H; }
      });
      y -= h;
    };
    const head = () => drawCells(headers, headH, medium, HEAD_FILL, true, true);
    // Không để tiêu đề bảng nằm trơ cuối trang.
    if (y - headH - rowH * Math.min(rows.length || 1, 2) - (options.keepWith || 0) < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 20; }
    head();
    if (!rows.length) {
      page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, borderColor: GRID, borderWidth: 0.5 });
      put(page, regular, "Không có buổi dạy nào.", MARGIN + contentW / 2, y - rowH / 2 - 3, SIZE, MUTED, "center");
      y -= rowH;
    }
    for (const [rowIndex, cells] of rows.entries()) {
      if (y - heightOf(layout(cells, regular), rowH) < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 20; head(); }
      const muted = Boolean(options.mutedRows?.[rowIndex]);
      drawCells(cells, rowH, regular, muted ? SOFT_FILL : undefined, false, false, muted);
    }
    if (options.totalRow) {
      if (y - rowH < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 20; head(); }
      drawCells(options.totalRow, rowH, medium, SOFT_FILL);
    }
  };

  // 1. Tổng hợp theo giáo viên.
  put(page, medium, "1. TỔNG HỢP THEO GIÁO VIÊN", MARGIN, y, 10.5, NAVY);
  y -= 8;
  type SumKey = "regular" | "makeup" | "substitute" | "testSpeaking" | "kemSpeaking" | "kemCaNhan" | "kemLop";
  const sum = (key: SumKey) => String(data.teachers.reduce((total, t) => total + t[key], 0));
  const KEYS: SumKey[] = ["regular", "makeup", "substitute", "testSpeaking", "kemSpeaking", "kemCaNhan", "kemLop"];
  table(
    ["STT", "Giáo viên", "Mã GV", "Theo lịch", "Dạy bù", "Dạy thay", "Test speaking", "Kèm speaking", "Kèm cá nhân", "Kèm lớp", "Tổng buổi", "Tổng giờ", "Ký xác nhận"],
    [24, 70, 40, 36, 30, 34, 48, 48, 36, 30, 32, 32, 68],
    ["center", "left", "center", "center", "center", "center", "center", "center", "center", "center", "center", "center", "center"],
    data.teachers.map((t, i) => [String(i + 1), t.name, t.code, ...KEYS.map((key) => String(t[key])), String(t.count), t.hours, ""]),
    { totalRow: data.teachers.length ? ["", "Tổng cộng", "", ...KEYS.map(sum), String(data.totalCount), data.totalHours, ""] : undefined, wrap: [1], rowMin: 28 },
  );
  y -= 6;
  put(page, regular, "Theo lịch gồm cả buổi không tính phí. Test speaking, Kèm speaking, Kèm cá nhân, Kèm lớp: lịch thêm ngoài lịch lớp.", MARGIN, y - 4, 7.5, MUTED);
  y -= 26;

  // 2. Chi tiết từng giáo viên.
  if (y - 60 < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 26; }
  put(page, medium, "2. CHI TIẾT TỪNG GIÁO VIÊN", MARGIN, y, 10.5, NAVY);
  y -= 13;
  put(page, regular, "Dòng chữ xám (Nghỉ không lương, Nghỉ lễ, Đã hủy) hiện để đối chiếu với trang web, không tính vào số buổi và tổng giờ.", MARGIN, y, 7.5, MUTED);
  y -= 14;
  data.teachers.forEach((t, index) => {
    if (y - 60 < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 26; }
    put(page, medium, `${index + 1}. ${t.name}${t.code ? ` (${t.code})` : ""}`, MARGIN, y, 10, INK);
    put(page, regular, `${t.count} buổi · ${t.hours} giờ`, right, y, 9, INK, "right");
    y -= 7;
    // Cột "Loại buổi" vừa đủ chữ dài nhất; phần còn lại dồn cho "Lớp / Lịch" (dài thì xuống dòng).
    const typeW = Math.max(medium.widthOfTextAtSize("Loại buổi", SIZE), ...t.sessions.map((s) => regular.widthOfTextAtSize(s.type || "", SIZE))) + PAD * 2 + 2;
    const fixed = 24 + 56 + 36 + 64 + 38;
    table(
      ["STT", "Ngày", "Thứ", "Giờ", "Lớp / Lịch", "Loại buổi", "Số giờ"],
      [24, 56, 36, 64, Math.max(120, contentW - fixed - typeW), typeW, 38],
      ["center", "center", "center", "center", "left", "left", "center"],
      t.sessions.map((s, i) => [String(i + 1), s.date, s.weekday, s.time, s.className, s.type, s.hours]),
      { wrap: [4], mutedRows: t.sessions.map((s) => !s.counted) },
    );
    y -= 18;
  });

  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: 0.5, color: ACCENT });
    put(item, regular, `${CENTER_SHORT} · Báo cáo buổi dạy ${data.period}`, MARGIN, FOOTER_TOP - 13, 8, ACCENT);
    put(item, regular, `Trang ${index + 1} / ${pages.length}`, right, FOOTER_TOP - 13, 8, ACCENT, "right");
  });
  return pdf.save();
}
