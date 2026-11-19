import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Báo cáo thu học phí TOÀN TRUNG TÂM (PDF A4) — nút "Tải báo cáo" ở Đối soát thu chi (admin).
 * Cùng mẫu báo cáo thu học phí Thạch Khê: tổng hợp → theo chi nhánh → theo ngày → danh sách
 * phiếu thu từng ngày → các khoản chi. Kỳ báo cáo từ 01/11/2026 tới ngày được chọn.
 * Máy chủ chỉ vẽ số liệu trình duyệt đã tính (cùng hàm công nợ của màn Quản lý học phí),
 * không đọc hay ghi dữ liệu.
 */
const PAGE = { width: 595, height: 842 };
const MARGIN = 28;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const GRID = rgb(0.78, 0.8, 0.83);
const HEAD_FILL = rgb(0.925, 0.937, 0.953);
const SOFT_FILL = rgb(0.965, 0.969, 0.976);
const ACCENT = rgb(0.231, 0.443, 0.859);
const GREEN = rgb(0.086, 0.494, 0.278);
const CENTER = "TRUNG TÂM NGOẠI NGỮ STEPS";
const HEADER_BOTTOM = PAGE.height - 66;
const FOOTER_TOP = 34;
const SIZE = 8;
const PAD = 3.5;
const LINE_H = 10;

export interface DailyReportBranch { name: string; students: number; exempt: number; classes: number; open: number; paid: number; close: number; cleared: number; owing: number }
export interface DailyReportDay { date: string; open: number; transfer: number; cash: number; count: number; otherIn: number; outTransfer: number; outCash: number; close: number }
export interface DailyReportReceipt { date: string; branch: string; cls: string; code: string; name: string; period: string; method: string; amount: number }
export interface DailyReportExpense { date: string; category: string; description: string; method: string; amount: number }
export interface DailyReportInput {
  fromDate: string;
  toDate: string;
  exportedAt: string;
  debtNow: number;
  paidAfter: number;
  branches: DailyReportBranch[];
  days: DailyReportDay[];
  receipts: DailyReportReceipt[];
  expenses: DailyReportExpense[];
  logoPng?: Uint8Array;
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
const str = (value: unknown, max = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isoDate = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : "");
const list = <T>(value: unknown, limit: number, map: (row: Record<string, unknown>) => T): T[] =>
  (Array.isArray(value) ? value : []).slice(0, limit).map((row) => map((row || {}) as Record<string, unknown>));

export function cleanDailyReportInput(body: Record<string, unknown>): DailyReportInput {
  return {
    fromDate: isoDate(body.fromDate) || "2026-11-01",
    toDate: isoDate(body.toDate) || "2026-11-01",
    exportedAt: str(body.exportedAt, 40),
    debtNow: num(body.debtNow),
    paidAfter: num(body.paidAfter),
    branches: list(body.branches, 40, (row) => ({ name: str(row.name, 60), students: num(row.students), exempt: num(row.exempt), classes: num(row.classes), open: num(row.open), paid: num(row.paid), close: num(row.close), cleared: num(row.cleared), owing: num(row.owing) })),
    days: list(body.days, 62, (row) => ({ date: isoDate(row.date), open: num(row.open), transfer: num(row.transfer), cash: num(row.cash), count: num(row.count), otherIn: num(row.otherIn), outTransfer: num(row.outTransfer), outCash: num(row.outCash), close: num(row.close) })).filter((row) => row.date),
    receipts: list(body.receipts, 5000, (row) => ({ date: isoDate(row.date), branch: str(row.branch, 40), cls: str(row.cls, 30), code: str(row.code, 20), name: str(row.name, 80), period: str(row.period, 40), method: str(row.method, 20), amount: num(row.amount) })).filter((row) => row.date),
    expenses: list(body.expenses, 1000, (row) => ({ date: isoDate(row.date), category: str(row.category, 80), description: str(row.description, 160), method: str(row.method, 20), amount: num(row.amount) })).filter((row) => row.date),
  };
}

const vnd = (value: number) => `${Math.round(value).toLocaleString("vi-VN")} đ`;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function dailyReportDownloadName(input: DailyReportInput) {
  if (input.fromDate === input.toDate) return `thuyet-minh-thu-chi-toan-trung-tam-ngay-${dmy(input.toDate).replace(/\//g, "-")}.pdf`;
  return `thuyet-minh-thu-chi-toan-trung-tam-${dm(input.fromDate).replace("/", "-")}-den-${dmy(input.toDate).replace(/\//g, "-")}.pdf`;
}

export async function buildDailyReportPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: DailyReportInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  const oneDay = data.fromDate === data.toDate;
  const title = oneDay ? `Thuyết minh thu chi toàn trung tâm ngày ${dmy(data.toDate)}` : `Thuyết minh thu chi toàn trung tâm ${dmy(data.fromDate)} – ${dmy(data.toDate)}`;
  pdf.setTitle(title);
  pdf.setAuthor("Trung tâm Ngoại ngữ STEPS");

  const right = PAGE.width - MARGIN;
  const contentW = right - MARGIN;
  const pages: PDFPage[] = [];
  const put = (page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: "left" | "center" | "right" = "left") => {
    const w = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: align === "center" ? x - w / 2 : align === "right" ? x - w : x, y, size, font, color });
  };
  const wrap = (font: PDFFont, value: string, size: number, max: number) => {
    const out: string[] = []; let cur = "";
    for (const word of value.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) cur = next;
      else { if (cur) out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };
  const newPage = () => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    if (logo) { const h = 30; page.drawImage(logo, { x: MARGIN, y: HEADER_BOTTOM + 8, width: (logo.width / logo.height) * h, height: h }); }
    else put(page, medium, "STEPS", MARGIN, HEADER_BOTTOM + 16, 18, NAVY);
    put(page, medium, CENTER, right, HEADER_BOTTOM + 24, 11, NAVY, "right");
    put(page, regular, "ngoaingusteps.edu.vn", right, HEADER_BOTTOM + 11, 8, MUTED, "right");
    page.drawLine({ start: { x: MARGIN, y: HEADER_BOTTOM }, end: { x: right, y: HEADER_BOTTOM }, thickness: 0.5, color: ACCENT });
    return page;
  };
  let page = newPage();
  let y = HEADER_BOTTOM - 30;
  const ensure = (h: number) => { if (y - h < FOOTER_TOP + 14) { page = newPage(); y = HEADER_BOTTOM - 24; } };
  const section = (text: string) => { ensure(100); put(page, medium, text, MARGIN, y, 11.5, NAVY); y -= 16; };
  const note = (text: string, size = 8, color = MUTED) => { for (const line of wrap(regular, text, size, contentW)) { ensure(12); put(page, regular, line, MARGIN, y, size, color); y -= size + 3; } };
  type Align = "left" | "center" | "right";
  const table = (headers: string[], weights: number[], aligns: Align[], rows: string[][], opts: { total?: string[]; bold?: number[]; wrapCols?: number[]; rowH?: number } = {}) => {
    const sumW = weights.reduce((a, b) => a + b, 0);
    let cx = MARGIN;
    const cols = weights.map((w) => { const width = (w / sumW) * contentW; const col = { left: cx, width }; cx += width; return col; });
    const draw = (cells: string[], hMin: number, font: PDFFont, fill?: typeof HEAD_FILL, header = false, extra = 0) => {
      const lines = cells.map((value, i) => (header || (opts.wrapCols || []).includes(i) ? wrap(font, value, SIZE, cols[i]!.width - PAD * 2) : [value]));
      const h = Math.max(hMin, Math.max(...lines.map((l) => l.length)) * LINE_H + 6);
      if (y - h - extra < FOOTER_TOP + 14) {
        page = newPage(); y = HEADER_BOTTOM - 24;
        if (!header) draw(headers, 20, medium, HEAD_FILL, true);
      }
      lines.forEach((ls, i) => {
        const col = cols[i]!;
        page.drawRectangle({ x: col.left, y: y - h, width: col.width, height: h, color: fill, borderColor: GRID, borderWidth: 0.5 });
        const align = header ? "center" : aligns[i]!;
        const x = align === "center" ? col.left + col.width / 2 : align === "right" ? col.left + col.width - PAD : col.left + PAD;
        const top = y - (h - ls.length * LINE_H) / 2 - SIZE + 1;
        ls.forEach((line, k) => put(page, font, line, x, top - k * LINE_H, SIZE, INK, align));
      });
      y -= h;
    };
    ensure(20 + 16 * Math.min(3, Math.max(1, rows.length)));
    draw(headers, 20, medium, HEAD_FILL, true);
    rows.forEach((row, index) => draw(row, opts.rowH || 15, (opts.bold || []).includes(index) ? medium : regular, index % 2 ? SOFT_FILL : undefined, false, opts.total && index === rows.length - 1 ? 17 : 0));
    if (opts.total) draw(opts.total, 17, medium, HEAD_FILL);
    y -= 18;
  };

  const days = data.days;
  const open = days[0]?.open ?? 0;
  const close = days[days.length - 1]?.close ?? 0;
  const paid = data.receipts.reduce((sum, row) => sum + row.amount, 0);
  const isCash = (method: string) => /mặt|cash/i.test(method);
  const paidCash = data.receipts.filter((row) => isCash(row.method)).reduce((sum, row) => sum + row.amount, 0);
  const students = data.branches.reduce((sum, row) => sum + row.students, 0);
  const exempt = data.branches.reduce((sum, row) => sum + row.exempt, 0);
  const classes = data.branches.reduce((sum, row) => sum + row.classes, 0);

  put(page, medium, "THUYẾT MINH THU CHI", MARGIN, y, 17, NAVY); y -= 17;
  put(page, medium, (oneDay ? `Toàn trung tâm · Ngày ${dmy(data.toDate)}` : `Toàn trung tâm · Từ ${dmy(data.fromDate)} đến ${dmy(data.toDate)}`), MARGIN, y, 11); y -= 13;
  put(page, regular, `Sĩ số ${students} học viên (${students - exempt} đóng học phí, ${exempt} miễn học phí) · ${classes} lớp · ${data.branches.length} chi nhánh`, MARGIN, y, 9); y -= 12;
  put(page, regular, `Ngày lập: ${data.exportedAt} · Số liệu hệ thống STEPS LMS (sổ thu chi + công nợ học phí).`, MARGIN, y, 8, MUTED); y -= 20;

  section("1. TỔNG HỢP");
  table(
    ["", "Số tiền"],
    [160, 120],
    ["left", "right"],
    [
      [oneDay ? `Phải thu đầu ngày ${dmy(data.fromDate)}` : `Phải thu đầu kỳ (${dmy(data.fromDate)})`, vnd(open)],
      [oneDay ? `Đã thu trong ngày (${data.receipts.length} phiếu)` : `Đã thu ${dm(data.fromDate)} – ${dm(data.toDate)} (${data.receipts.length} phiếu)`, vnd(paid)],
      ["     Chuyển khoản", vnd(paid - paidCash)],
      ["     Tiền mặt", vnd(paidCash)],
      [`Còn lại cuối ngày ${dmy(data.toDate)}`, vnd(close)],
    ],
    { bold: [0, 4], rowH: 17 },
  );
  note(`Phải thu đầu ${oneDay ? "ngày" : "kỳ"} = công nợ học phí hiện tại (${vnd(data.debtNow)}) + học phí đã thu từ ${dmy(data.fromDate)} tới lúc lập báo cáo (${vnd(paid + data.paidAfter)}). Còn lại cuối ngày = phải thu đầu ngày − học phí thu trong ngày.`);
  y -= 8;

  section("2. THEO CHI NHÁNH");
  table(
    ["Chi nhánh", "Sĩ số", "Lớp", `Phải thu đầu ngày ${dm(data.fromDate)}`, oneDay ? `Đã thu ${dm(data.toDate)}` : `Đã thu đến ${dm(data.toDate)}`, `Còn lại ${dm(data.toDate)}`, "Hết nợ / Còn nợ (hiện tại)"],
    [80, 58, 28, 76, 76, 76, 66],
    ["left", "right", "right", "right", "right", "right", "center"],
    data.branches.map((row) => [row.name, `${row.students}${row.exempt ? ` (${row.exempt} miễn)` : ""}`, String(row.classes), vnd(row.open), vnd(row.paid), vnd(row.close), `${row.cleared} / ${row.owing}`]),
    {
      wrapCols: [0, 1],
      total: ["Toàn trung tâm", String(students), String(classes), vnd(open), vnd(paid), vnd(close), `${data.branches.reduce((s, r) => s + r.cleared, 0)} / ${data.branches.reduce((s, r) => s + r.owing, 0)}`],
    },
  );

  let no = 2;
  if (!oneDay) {
    section(`${++no}. THEO NGÀY`);
    table(
    ["Ngày", "Phải thu đầu ngày", "Thu CK", "Thu TM", "Tổng thu (phiếu)", "Chi trong ngày", "Còn lại cuối ngày"],
    [44, 82, 70, 64, 84, 74, 82],
    ["center", "right", "right", "right", "right", "right", "right"],
    days.map((row) => [dm(row.date), vnd(row.open), vnd(row.transfer), vnd(row.cash), `${vnd(row.transfer + row.cash)} (${row.count})`, row.outTransfer + row.outCash ? `−${vnd(row.outTransfer + row.outCash)}` : "0 đ", vnd(row.close)]),
    {
      total: ["Tổng", "", vnd(paid - paidCash), vnd(paidCash), `${vnd(paid)} (${data.receipts.length})`, `−${vnd(days.reduce((s, r) => s + r.outTransfer + r.outCash, 0))}`, vnd(close)],
    },
  );
  }
  const otherIn = days.reduce((sum, row) => sum + row.otherIn, 0);
  if (otherIn) { note(`Ngoài học phí còn thu khác ${vnd(otherIn)} (không tính vào công nợ học phí).`); y -= 8; }

  const receiptNo = ++no;
  section(oneDay ? `${receiptNo}. PHIẾU THU HỌC PHÍ` : `${receiptNo}. PHIẾU THU HỌC PHÍ TỪNG NGÀY`);
  let sectionNo = 0;
  for (const day of days) {
    const rows = data.receipts.filter((row) => row.date === day.date);
    sectionNo += 1;
    ensure(70);
    if (!oneDay) { put(page, medium, `${receiptNo}.${sectionNo}. Ngày ${dmy(day.date)}`, MARGIN, y, 10, INK); y -= 13; }
    put(page, regular, `Phải thu: ${vnd(day.open)}   ·   Đã thu: ${vnd(day.transfer + day.cash)} (${rows.length} phiếu)   ·   Còn lại: ${vnd(day.close)}`, MARGIN, y, 8.5); y -= 12;
    if (!rows.length) { put(page, regular, "Không có phiếu thu học phí.", MARGIN, y, 8, MUTED); y -= 18; continue; }
    table(
      ["STT", "Chi nhánh", "Lớp", "Mã HV", "Học viên", "Khoản thu", "Hình thức", "Số tiền"],
      [24, 62, 36, 44, 120, 74, 62, 62],
      ["center", "left", "center", "center", "left", "left", "left", "right"],
      rows.map((row, index) => [String(index + 1), row.branch, row.cls, row.code, row.name, row.period, row.method, vnd(row.amount)]),
      { wrapCols: [1, 4, 5], total: ["", "", "", "", `Tổng ${rows.length} phiếu`, "", "", vnd(rows.reduce((s, r) => s + r.amount, 0))] },
    );
  }

  if (data.expenses.length) {
    section(oneDay ? `${++no}. CÁC KHOẢN CHI TRONG NGÀY` : `${++no}. CÁC KHOẢN CHI TRONG KỲ`);
    table(
      ["STT", "Ngày", "Hạng mục", "Nội dung", "Hình thức", "Số tiền"],
      [24, 40, 100, 200, 60, 70],
      ["center", "center", "left", "left", "left", "right"],
      data.expenses.map((row, index) => [String(index + 1), dm(row.date), row.category, row.description, row.method, `−${vnd(row.amount)}`]),
      { wrapCols: [2, 3], total: ["", "", "", `Tổng ${data.expenses.length} khoản chi`, "", `−${vnd(data.expenses.reduce((s, r) => s + r.amount, 0))}`] },
    );
  }

  ensure(30);
  put(page, medium, `Còn lại công nợ học phí cuối ngày ${dmy(data.toDate)}: ${vnd(close)}`, MARGIN, y, 11, GREEN); y -= 14;
  note(`Kiểm tra: ${vnd(open)} − ${vnd(paid)} = ${vnd(close)}.`, 8.5);

  pages.forEach((p, index) => {
    p.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: 0.5, color: GRID });
    put(p, regular, `Trung tâm Ngoại ngữ STEPS · ${title}`, MARGIN, FOOTER_TOP - 12, 7.5, MUTED);
    put(p, regular, `Trang ${index + 1}/${pages.length}`, right, FOOTER_TOP - 12, 7.5, MUTED, "right");
  });
  return pdf.save();
}
