import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Phiếu lương A4 dọc của một giáo viên trong một kỳ — máy chủ vẽ từ dữ liệu bảng
 * lương đang xem (client tính, server chỉ dựng hình) để bấm "Tải phiếu lương" là
 * ra file PDF lưu về máy, không qua hộp thoại in.
 */
const PAGE = { width: 595, height: 842 };
const MARGIN = 36;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const GRID = rgb(0.78, 0.8, 0.83);
const HEAD_FILL = rgb(0.925, 0.937, 0.953);
const SOFT_FILL = rgb(0.965, 0.969, 0.976);
const WHITE = rgb(1, 1, 1);
const ACCENT = rgb(0.231, 0.443, 0.859);
const RULE = 0.5;
const CENTER_SHORT = "Trung tâm Ngoại ngữ STEPS";
const HEADER_BOTTOM = PAGE.height - 78;
const FOOTER_TOP = 34;

export interface PayrollSlipLine {
  label: string;
  amount: number;
}

export interface PayrollSlipInput {
  teacherCode: string;
  monthKey: string;
  title: string;
  period: string;
  issuedAt: string;
  center: { name: string; address: string; contact: string };
  info: Array<{ label: string; value: string }>;
  income: PayrollSlipLine[];
  deductions: PayrollSlipLine[];
  gross: number;
  totalDeduct: number;
  net: number;
  note: string;
  logoPng?: Uint8Array;
}

const str = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const num = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(-1e13, Math.min(1e13, n)) : 0;
};
const lines = (value: unknown, max: number) => (Array.isArray(value) ? value : []).slice(0, max).map((row) => {
  const item = (row || {}) as Record<string, unknown>;
  return { label: str(item.label, 160), value: str(item.value, 160), amount: num(item.amount) };
});

/** Làm sạch payload phiếu lương — chỉ dùng để vẽ PDF, không ghi vào dữ liệu nào. */
export function cleanPayrollSlipInput(body: Record<string, unknown>): PayrollSlipInput {
  const center = (body.center || {}) as Record<string, unknown>;
  return {
    teacherCode: str(body.teacherCode, 20),
    monthKey: str(body.monthKey, 10),
    title: str(body.title, 60) || "PHIẾU LƯƠNG",
    period: str(body.period, 120),
    issuedAt: str(body.issuedAt, 40),
    center: {
      name: str(center.name, 120) || CENTER_SHORT,
      address: str(center.address, 200),
      contact: str(center.contact, 200),
    },
    info: lines(body.info, 24).map((item) => ({ label: item.label, value: item.value })),
    income: lines(body.income, 40).map((item) => ({ label: item.label, amount: item.amount })),
    deductions: lines(body.deductions, 40).map((item) => ({ label: item.label, amount: item.amount })),
    gross: num(body.gross),
    totalDeduct: num(body.totalDeduct),
    net: num(body.net),
    note: str(body.note, 500),
  };
}

export function payrollSlipDownloadName(teacherCode: string, monthKey: string) {
  const code = (teacherCode || "GV").replace(/[^\w-]/g, "").slice(0, 20) || "GV";
  const month = (monthKey || "").replace(/[^\d-]/g, "").slice(0, 10);
  return `phieu-luong-${code.toLowerCase()}${month ? `-${month}` : ""}.pdf`;
}

const money = (value: number) => `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("vi-VN").replace(/,/g, ".")}`;

function fit(font: PDFFont, value: string, size: number, maxWidth: number) {
  const raw = value || "";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function put(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: "left" | "center" | "right" = "left") {
  const width = font.widthOfTextAtSize(value, size);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  page.drawText(value, { x: left, y, size, font, color });
}

export async function buildPayrollSlipPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: PayrollSlipInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const medium = await pdf.embedFont(fonts.medium, { subset: true });
  let logo: PDFImage | null = null;
  if (data.logoPng?.length) { try { logo = await pdf.embedPng(data.logoPng); } catch { logo = null; } }
  pdf.setTitle(`${data.title} — ${data.period || data.monthKey}`.trim());
  pdf.setAuthor(CENTER_SHORT);

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const right = PAGE.width - MARGIN;
  const contentW = right - MARGIN;

  // Đầu trang: logo trái, thông tin trung tâm phải, vạch xanh mảnh.
  if (logo) {
    const height = 30;
    page.drawImage(logo, { x: MARGIN, y: HEADER_BOTTOM + 10, width: (logo.width / logo.height) * height, height });
  } else {
    put(page, medium, "STEPS", MARGIN, HEADER_BOTTOM + 18, 18, NAVY);
  }
  put(page, medium, data.center.name.toUpperCase(), right, HEADER_BOTTOM + 26, 10, NAVY, "right");
  if (data.center.address) put(page, regular, fit(regular, data.center.address, 8, contentW / 2), right, HEADER_BOTTOM + 15, 8, MUTED, "right");
  if (data.center.contact) put(page, regular, fit(regular, data.center.contact, 8, contentW / 2), right, HEADER_BOTTOM + 5, 8, MUTED, "right");
  page.drawLine({ start: { x: MARGIN, y: HEADER_BOTTOM }, end: { x: right, y: HEADER_BOTTOM }, thickness: RULE, color: ACCENT });

  let y = HEADER_BOTTOM - 30;
  put(page, medium, data.title, PAGE.width / 2, y, 17, NAVY, "center");
  y -= 16;
  put(page, medium, data.period, PAGE.width / 2, y, 9.5, INK, "center");
  if (data.issuedAt) { y -= 12; put(page, regular, `Ngày lập phiếu: ${data.issuedAt}`, PAGE.width / 2, y, 8, MUTED, "center"); }

  // Khối thông tin giáo viên — 2 cột trong khung nhạt.
  y -= 14;
  const rowH = 15;
  const rows = Math.ceil(data.info.length / 2);
  const boxH = rows * rowH + 12;
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: contentW, height: boxH, color: SOFT_FILL, borderColor: GRID, borderWidth: RULE });
  const colW = contentW / 2;
  data.info.forEach((item, index) => {
    const column = index % 2;
    const base = y - 12 - Math.floor(index / 2) * rowH;
    const x = MARGIN + 10 + column * colW;
    put(page, regular, item.label, x, base, 8, MUTED);
    put(page, medium, fit(medium, item.value, 8.5, colW - 130), x + 122, base, 8.5, INK);
  });
  y -= boxH + 16;

  const moneyCols = { idx: 26, amount: 108 };
  const drawMoneyTable = (heading: string, items: PayrollSlipLine[], totalLabel: string, total: number) => {
    put(page, medium, heading, MARGIN, y, 10, NAVY);
    y -= 8;
    const headH = 16;
    page.drawRectangle({ x: MARGIN, y: y - headH, width: contentW, height: headH, color: HEAD_FILL, borderColor: GRID, borderWidth: RULE });
    put(page, medium, "STT", MARGIN + moneyCols.idx / 2, y - 11, 8, INK, "center");
    put(page, medium, "KHOẢN MỤC", MARGIN + moneyCols.idx + 6, y - 11, 8, INK);
    put(page, medium, "SỐ TIỀN (đ)", right - 6, y - 11, 8, INK, "right");
    y -= headH;
    const body = items.length ? items : [{ label: "Không có khoản nào.", amount: 0 }];
    body.forEach((item, index) => {
      const h = 17;
      page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, borderColor: GRID, borderWidth: RULE });
      put(page, regular, String(index + 1), MARGIN + moneyCols.idx / 2, y - 11.5, 8.5, MUTED, "center");
      put(page, regular, fit(regular, item.label, 8.5, contentW - moneyCols.idx - moneyCols.amount - 12), MARGIN + moneyCols.idx + 6, y - 11.5, 8.5, INK);
      put(page, regular, money(item.amount), right - 6, y - 11.5, 8.5, INK, "right");
      y -= h;
    });
    const h = 18;
    page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, color: SOFT_FILL, borderColor: GRID, borderWidth: RULE });
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1.2, color: NAVY });
    put(page, medium, totalLabel, right - moneyCols.amount - 8, y - 12.5, 9, INK, "right");
    put(page, medium, `${money(total)} đ`, right - 6, y - 12.5, 9.5, INK, "right");
    y -= h + 14;
  };

  drawMoneyTable("A. THU NHẬP", data.income, "Tổng thu nhập (A)", data.gross);
  drawMoneyTable("B. KHẤU TRỪ", data.deductions, "Tổng khấu trừ (B)", data.totalDeduct);

  // Dải thực nhận nổi bật.
  const bandH = 30;
  page.drawRectangle({ x: MARGIN, y: y - bandH, width: contentW, height: bandH, color: NAVY, borderRadius: 6 });
  put(page, medium, "THỰC NHẬN (A – B)", MARGIN + 12, y - 19, 10, WHITE);
  put(page, medium, `${money(data.net)} đ`, right - 12, y - 20, 15, WHITE, "right");
  y -= bandH + 10;
  put(page, regular, fit(regular, data.note || "Phiếu lương in từ hệ thống STEPS LMS, đối chiếu theo chấm công và hồ sơ lương của tháng.", 8, contentW), MARGIN, y, 8, MUTED);

  // Ký tên.
  const leftX = MARGIN + colW / 2;
  const rightX = right - colW / 2;
  const signY = 120;
  put(page, medium, "KẾ TOÁN TIỀN LƯƠNG", leftX, signY, 9.5, INK, "center");
  put(page, medium, "NGƯỜI LAO ĐỘNG", rightX, signY, 9.5, INK, "center");
  put(page, regular, "(Ký, ghi rõ họ tên)", leftX, signY - 12, 8, MUTED, "center");
  put(page, regular, "(Ký xác nhận đã nhận đủ lương)", rightX, signY - 12, 8, MUTED, "center");

  // Chân trang.
  page.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP }, thickness: RULE, color: ACCENT });
  put(page, regular, CENTER_SHORT, MARGIN, FOOTER_TOP - 13, 8, ACCENT);
  put(page, regular, `${data.teacherCode} · ${data.monthKey}`, right, FOOTER_TOP - 13, 8, ACCENT, "right");

  return pdf.save();
}
