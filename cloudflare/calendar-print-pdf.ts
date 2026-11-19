import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * In lịch dạy ra PDF (A4 ngang) — nút In lịch ở trang Lịch dạy. Tuần: lưới khung giờ
 * × 7 ngày như màn hình; ngày / tháng: danh sách theo từng ngày. Máy chủ chỉ vẽ dữ
 * liệu client gửi lên (đã lọc sẵn theo bộ lọc đang chọn), không đọc hay ghi gì.
 */
const PAGE = { width: 842, height: 595 };
const MARGIN = 24;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const FAINT = rgb(0.6, 0.63, 0.68);
const GRID = rgb(0.78, 0.8, 0.83);
const HEAD_FILL = rgb(0.91, 0.933, 0.969);
const ITEM_FILL = rgb(0.945, 0.957, 0.976);
const ITEM_BAR = rgb(0.145, 0.388, 0.922);
const NOTE = rgb(0.706, 0.325, 0.035);
const ACCENT = rgb(0.231, 0.443, 0.859);
const CENTER = "TRUNG TÂM NGOẠI NGỮ STEPS";
const CENTER_SHORT = "Trung tâm Ngoại ngữ STEPS";
const HEADER_BOTTOM = PAGE.height - 58;
const FOOTER_TOP = 28;
const PAD = 4;

export interface CalendarPrintRow {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  teacher: string;
  room: string;
  note: string;
  muted: boolean;
}

export interface CalendarPrintInput {
  mode: "day" | "week" | "month";
  title: string;
  filter: string;
  exportedAt: string;
  days: Array<{ key: string; weekday: string; date: string }>;
  rows: CalendarPrintRow[];
  logoPng?: Uint8Array;
}

const str = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export function cleanCalendarPrintInput(body: Record<string, unknown>): CalendarPrintInput {
  const mode = body.mode === "day" || body.mode === "month" ? body.mode : "week";
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, 42).map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return { key: str(item.key, 10), weekday: str(item.weekday, 12), date: str(item.date, 12) };
  });
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 5000).map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return {
      date: str(item.date, 10), startTime: str(item.startTime, 5), endTime: str(item.endTime, 5),
      title: str(item.title, 80), teacher: str(item.teacher, 60), room: str(item.room, 40), note: str(item.note, 80), muted: Boolean(item.muted),
    };
  });
  return { mode, title: str(body.title, 100) || "LỊCH DẠY", filter: str(body.filter, 160), exportedAt: str(body.exportedAt, 40), days, rows };
}

export function calendarPrintDownloadName(input: Pick<CalendarPrintInput, "mode" | "days">) {
  const first = input.days[0]?.key || "";
  const last = input.days[input.days.length - 1]?.key || first;
  if (input.mode === "month") return `lich-day-thang-${first.slice(0, 7) || "tong-hop"}.pdf`;
  if (input.mode === "day") return `lich-day-ngay-${first || "tong-hop"}.pdf`;
  return `lich-day-tuan-${first}_${last}.pdf`;
}

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  const raw = value || "";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

type Align = "left" | "center" | "right";
function put(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: Align = "left") {
  const width = font.widthOfTextAtSize(value, size);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  page.drawText(value, { x: left, y, size, font, color });
}

export async function buildCalendarPrintPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: CalendarPrintInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  pdf.setTitle(data.title);
  pdf.setAuthor(CENTER_SHORT);

  const right = PAGE.width - MARGIN;
  const contentW = right - MARGIN;
  const bottomLimit = FOOTER_TOP + 10;
  const pages: PDFPage[] = [];
  const newPage = () => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    if (logo) {
      const h = 26;
      page.drawImage(logo, { x: MARGIN, y: HEADER_BOTTOM + 7, width: (logo.width / logo.height) * h, height: h });
    } else {
      put(page, medium, "STEPS", MARGIN, HEADER_BOTTOM + 14, 16, NAVY);
    }
    put(page, medium, CENTER, right, HEADER_BOTTOM + 20, 10, NAVY, "right");
    put(page, regular, "ngoaingusteps.edu.vn", right, HEADER_BOTTOM + 9, 7.5, MUTED, "right");
    page.drawLine({ start: { x: MARGIN, y: HEADER_BOTTOM }, end: { x: right, y: HEADER_BOTTOM }, thickness: 0.5, color: ACCENT });
    return page;
  };
  let page = newPage();
  let y = HEADER_BOTTOM - 24;
  put(page, medium, data.title, MARGIN, y, 15, NAVY);
  y -= 14;
  const counted = data.rows.filter((row) => !row.muted).length;
  put(page, regular, fit(regular, `${data.filter} · ${counted} buổi · In lúc ${data.exportedAt}`, 8.5, contentW), MARGIN, y, 8.5, MUTED);
  y -= 12;

  if (data.mode === "week") {
    // Lưới: cột giờ + 7 ngày; mỗi ô liệt kê lịch cùng khung giờ (tên lớp / giáo viên / ghi chú).
    const timeW = 62;
    const dayW = (contentW - timeW) / Math.max(1, data.days.length);
    const colX = (index: number) => MARGIN + timeW + index * dayW;
    const headH = 24;
    const drawHead = () => {
      page.drawRectangle({ x: MARGIN, y: y - headH, width: timeW, height: headH, color: HEAD_FILL, borderColor: GRID, borderWidth: 0.5 });
      put(page, medium, "Giờ", MARGIN + timeW / 2, y - 15, 8.5, INK, "center");
      data.days.forEach((day, index) => {
        page.drawRectangle({ x: colX(index), y: y - headH, width: dayW, height: headH, color: HEAD_FILL, borderColor: GRID, borderWidth: 0.5 });
        put(page, medium, day.weekday, colX(index) + dayW / 2, y - 11, 8.5, INK, "center");
        put(page, regular, day.date, colX(index) + dayW / 2, y - 20, 7, MUTED, "center");
      });
      y -= headH;
    };
    drawHead();
    const slots = [...new Set(data.rows.map((row) => `${row.startTime}–${row.endTime}`))].sort();
    const ITEM_H = 25;
    const textW = dayW - PAD * 2 - 6;
    if (!slots.length) {
      page.drawRectangle({ x: MARGIN, y: y - 30, width: contentW, height: 30, borderColor: GRID, borderWidth: 0.5 });
      put(page, regular, "Không có lịch dạy trong tuần này.", MARGIN + contentW / 2, y - 18, 9, MUTED, "center");
    }
    for (const slot of slots) {
      const cells = data.days.map((day) => data.rows.filter((row) => row.date === day.key && `${row.startTime}–${row.endTime}` === slot));
      const most = Math.max(1, ...cells.map((list) => list.length));
      let remaining = cells.map((list) => [...list]);
      let first = true;
      // Khung giờ quá dài so với phần còn lại của trang thì vẽ tiếp sang trang sau.
      while (first || remaining.some((list) => list.length)) {
        const room = Math.floor((y - bottomLimit - PAD * 2) / ITEM_H);
        if (room < Math.min(most, 2)) { page = newPage(); y = HEADER_BOTTOM - 14; drawHead(); continue; }
        const take = Math.min(room, Math.max(1, ...remaining.map((list) => list.length)));
        const h = take * ITEM_H + PAD * 2 - 2;
        page.drawRectangle({ x: MARGIN, y: y - h, width: timeW, height: h, borderColor: GRID, borderWidth: 0.5 });
        put(page, medium, slot, MARGIN + PAD, y - 12, 8, INK);
        remaining.forEach((list, index) => {
          page.drawRectangle({ x: colX(index), y: y - h, width: dayW, height: h, borderColor: GRID, borderWidth: 0.5 });
          list.slice(0, take).forEach((row, k) => {
            const top = y - PAD - k * ITEM_H;
            page.drawRectangle({ x: colX(index) + PAD, y: top - ITEM_H + 3, width: dayW - PAD * 2, height: ITEM_H - 3, color: ITEM_FILL });
            page.drawRectangle({ x: colX(index) + PAD, y: top - ITEM_H + 3, width: 2, height: ITEM_H - 3, color: row.muted ? FAINT : ITEM_BAR });
            const x = colX(index) + PAD + 5;
            put(page, medium, fit(medium, row.title, 7.5, textW), x, top - 9, 7.5, row.muted ? FAINT : INK);
            const sub = [row.teacher, row.room].filter(Boolean).join(" · ");
            put(page, regular, fit(regular, row.note ? `${sub} · ${row.note}` : sub, 6.5, textW), x, top - 18, 6.5, row.muted ? FAINT : row.note ? NOTE : MUTED);
          });
        });
        remaining = remaining.map((list) => list.slice(take));
        y -= h;
        first = false;
      }
    }
  } else {
    // Ngày / tháng: mỗi ngày một bảng nhỏ.
    const headers = ["STT", "Giờ", "Lớp / Lịch", "Giáo viên", "Phòng", "Ghi chú"];
    const weights = [30, 70, 250, 170, 80, 194];
    const sum = weights.reduce((a, b) => a + b, 0);
    let cx = MARGIN;
    const cols = weights.map((w) => { const width = (w / sum) * contentW; const col = { left: cx, width }; cx += width; return col; });
    const aligns: Align[] = ["center", "center", "left", "left", "left", "left"];
    const rowH = 15;
    const drawCells = (cells: string[], h: number, font: PDFFont, fill?: typeof HEAD_FILL, color = INK, center = false) => {
      cells.forEach((value, i) => {
        const col = cols[i]!;
        page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: fill, borderColor: GRID, borderWidth: 0.5 });
        const align = center ? "center" : aligns[i]!;
        const anchor = align === "center" ? col.left + col.width / 2 : col.left + PAD;
        put(page, font, fit(font, value, 8, col.width - PAD * 2), anchor, y - h / 2 - 3, 8, color, align);
      });
      y -= h;
    };
    let any = false;
    for (const day of data.days) {
      const list = data.rows.filter((row) => row.date === day.key);
      if (!list.length) continue;
      any = true;
      if (y - 18 - rowH * 3 < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 16; }
      y -= 6;
      put(page, medium, `${day.weekday}, ${day.date}`, MARGIN, y - 4, 10, NAVY);
      put(page, regular, `${list.length} lịch`, MARGIN + medium.widthOfTextAtSize(`${day.weekday}, ${day.date}`, 10) + 6, y - 4, 8, MUTED);
      y -= 10;
      drawCells(headers, 16, medium, HEAD_FILL, INK, true);
      list.forEach((row, index) => {
        if (y - rowH < bottomLimit) { page = newPage(); y = HEADER_BOTTOM - 16; drawCells(headers, 16, medium, HEAD_FILL, INK, true); }
        drawCells([String(index + 1), `${row.startTime}–${row.endTime}`, row.title, row.teacher, row.room, row.note], rowH, regular, undefined, row.muted ? FAINT : INK);
      });
    }
    if (!any) {
      page.drawRectangle({ x: MARGIN, y: y - 30, width: contentW, height: 30, borderColor: GRID, borderWidth: 0.5 });
      put(page, regular, "Không có lịch dạy trong khoảng này.", MARGIN + contentW / 2, y - 18, 9, MUTED, "center");
    }
  }

  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: 0.5, color: ACCENT });
    put(item, regular, `${CENTER_SHORT} · ${data.title}`, MARGIN, FOOTER_TOP - 12, 7.5, ACCENT);
    put(item, regular, `Trang ${index + 1} / ${pages.length}`, right, FOOTER_TOP - 12, 7.5, ACCENT, "right");
  });
  return pdf.save();
}
