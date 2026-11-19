import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// Thư báo cáo định kỳ khổ A4 dọc, layout giống mẫu "Thông báo tình hình học tập".
const PAGE = { width: 595, height: 842 };
const MARGIN = 44;
const FOOTER_Y = 30;
const FOOTER_CLEAR = 58;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.278, 0.333, 0.412);
const LINE = rgb(0.796, 0.835, 0.882);
const ACCENT = rgb(0.145, 0.388, 0.922);
const SCORE_RED = rgb(0.725, 0.11, 0.11);
const BOX_BG = rgb(0.973, 0.98, 0.988);
const WHITE = rgb(1, 1, 1);

const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15.5;

export interface PeriodicReportPdfScores {
  listening: number | null;
  speaking: number | null;
  reading: number | null;
  writing: number | null;
}

export interface PeriodicReportPdfInput {
  className: string;
  periodLabel: string;
  fromLabel: string;
  toLabel: string;
  studentName: string;
  studentCode: string;
  /** Chuỗi chuyên cần đã tổng hợp sẵn trên client. */
  attendance: string;
  attitudeComment: string;
  scores: PeriodicReportPdfScores;
  skillComments: { listening: string; speaking: string; reading: string; writing: string };
  comment: string;
  logoPng?: Uint8Array;
}

export function draw(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK, align: "left" | "center" | "right" = "left") {
  const raw = String(value || "");
  const width = font.widthOfTextAtSize(raw, size);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  page.drawText(raw, { x: left, y, size, font, color });
}

/** In một dòng canh đều hai lề: dãn khoảng trắng giữa các từ cho vừa bề ngang. */
export function drawSpread(page: PDFPage, font: PDFFont, line: string, x: number, y: number, size: number, color: typeof INK, avail: number) {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    if (words[0]) draw(page, font, words[0], x, y, size, color);
    return;
  }
  const sum = words.reduce((total, word) => total + font.widthOfTextAtSize(word, size), 0);
  const extra = (avail - sum) / (words.length - 1);
  if (extra <= 0 || extra > size * 1.5) {
    draw(page, font, line, x, y, size, color);
    return;
  }
  let cursor = x;
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(word, size) + extra;
  }
}

interface ParagraphOp {
  label?: string;
  text: string;
  indent: boolean;
  justify: boolean;
}

/** Ngắt đoạn thành các dòng, dòng đầu chừa chỗ cho nhãn in đậm. */
export function paragraphOps(regular: PDFFont, medium: PDFFont, label: string | undefined, content: string, width: number, size: number) {
  const ops: ParagraphOp[] = [];
  const labelW = label ? medium.widthOfTextAtSize(`${label} `, size) : 0;
  let pendingLabel = Boolean(label);
  for (const para of String(content || "—").split(/\r?\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      ops.push({ label: pendingLabel ? label : undefined, text: "", indent: pendingLabel, justify: false });
      pendingLabel = false;
      continue;
    }
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const maxW = width - (pendingLabel && lines.length === 0 ? labelW : 0);
      const candidate = current ? `${current} ${word}` : word;
      if (regular.widthOfTextAtSize(candidate, size) <= maxW) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = "";
      }
    }
    if (current) lines.push(current);
    lines.forEach((line, index) => {
      const indent = pendingLabel && index === 0;
      ops.push({ label: indent ? label : undefined, text: line, indent, justify: index !== lines.length - 1 });
      if (index === 0) pendingLabel = false;
    });
  }
  return ops;
}

export function drawLetterhead(page: PDFPage, assets: { regular: PDFFont; medium: PDFFont; logo?: PDFImage }) {
  const logoHeight = 50;
  let logoWidth = 136;
  let cursor = PAGE.height - MARGIN;
  if (assets.logo) {
    const fitted = assets.logo.scaleToFit(170, logoHeight);
    logoWidth = fitted.width;
    page.drawImage(assets.logo, { x: MARGIN, y: cursor - fitted.height, width: fitted.width, height: fitted.height });
  }
  const copyX = MARGIN + logoWidth + 16;
  const lines = [
    ["Trung tâm Ngoại ngữ STEPS", assets.medium, 14, NAVY],
    ["CS1: 57 Trương Quốc Dụng, P. Thành Sen, Hà Tĩnh", assets.regular, 9.5, MUTED],
    ["CS2: Thôn Đồng Giang, xã Thạch Khê, Hà Tĩnh", assets.regular, 9.5, MUTED],
    ["Hotline: 0813.661.668", assets.regular, 9.5, MUTED],
  ] as const;
  const gap = (logoHeight - 14 - 9.5 * 3) / 3;
  let textY = cursor - 13;
  for (const [label, font, size, color] of lines) {
    draw(page, font, label, copyX, textY, size, color);
    textY -= size + gap;
  }
  cursor -= logoHeight + 14;
  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: PAGE.width - MARGIN, y: cursor }, thickness: 0.8, color: LINE });
  return cursor - 16;
}

export function periodicReportDownloadName(studentCode: string, periodLabel: string) {
  const who = String(studentCode || "hv").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 24);
  const period = String(periodLabel || "ky").replace(/[^0-9]/g, "").slice(0, 8);
  return `bao-cao-dinh-ky-${who}-${period || "ky"}.pdf`;
}

export async function buildPeriodicReportPdf(
  fonts: { regular: ArrayBuffer; medium: ArrayBuffer },
  data: PeriodicReportPdfInput,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular);
  const medium = await pdf.embedFont(fonts.medium);
  const logo = data.logoPng ? await pdf.embedPng(data.logoPng).catch(() => undefined) : undefined;
  const contentWidth = PAGE.width - MARGIN * 2;
  const fontsPack = { regular, medium, logo };

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = drawLetterhead(page, fontsPack);
  const ensure = (need: number) => {
    if (y - need >= FOOTER_CLEAR) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  ensure(30);
  draw(page, medium, `Báo cáo định kỳ · ${data.className || "Lớp học"} · ${data.periodLabel || "—"}`, MARGIN, y, 10.5, INK);
  y -= 14;
  draw(page, regular, `${data.fromLabel || "—"} – ${data.toLabel || "—"} · Học viên ${data.studentName || "—"} (${data.studentCode || "—"})`, MARGIN, y, 9.5, MUTED);
  y -= 24;

  draw(page, medium, "THÔNG BÁO TÌNH HÌNH HỌC TẬP", PAGE.width / 2, y, 16, INK, "center");
  y -= 17;
  draw(page, medium, data.periodLabel || "—", PAGE.width / 2, y, 11, INK, "center");
  y -= 26;

  draw(page, medium, `Kính gửi: Phụ huynh học sinh ${String(data.studentName || "—").toUpperCase()}`, MARGIN, y, BODY_SIZE, INK);
  y -= LINE_HEIGHT + 2;

  const introLines = [
    "Lời đầu tiên Trung Tâm Ngoại Ngữ STEPS trân trọng cảm ơn Quý vị phụ huynh đã tin tưởng và đồng hành cùng Trung Tâm thời gian vừa qua.",
    `Trung tâm xin gửi tới quý vị phụ huynh lời nhận xét về bạn ${data.studentName || "học viên"} trong ${String(data.periodLabel || "kỳ").toLowerCase()} vừa qua như sau:`,
  ];
  for (const intro of introLines) {
    for (const op of paragraphOps(regular, medium, undefined, intro, contentWidth, BODY_SIZE)) {
      ensure(LINE_HEIGHT);
      if (op.justify) drawSpread(page, regular, op.text, MARGIN, y, BODY_SIZE, INK, contentWidth);
      else draw(page, regular, op.text, MARGIN, y, BODY_SIZE, INK);
      y -= LINE_HEIGHT;
    }
    y -= 3;
  }
  y -= 2;

  // Khung meta: lớp · kỳ báo cáo · chuyên cần.
  ensure(26);
  const metaText = `Thông tin chuyên cần: ${data.attendance || "—"}`;
  page.drawRectangle({ x: MARGIN, y: y - 18, width: contentWidth, height: 24, color: BOX_BG, borderColor: LINE, borderWidth: 0.7 });
  draw(page, regular, metaText, MARGIN + 10, y - 10, 9.5, INK);
  y -= 24 + 16;

  const section = (label: string) => {
    ensure(34);
    draw(page, medium, label, MARGIN, y, 11.5, INK);
    y -= 18;
  };

  const paragraph = (label: string | undefined, content: string) => {
    for (const op of paragraphOps(regular, medium, label, content, contentWidth, BODY_SIZE)) {
      ensure(LINE_HEIGHT);
      const indentW = op.indent ? medium.widthOfTextAtSize(`${op.label} `, BODY_SIZE) : 0;
      if (op.label) draw(page, medium, op.label, MARGIN, y, BODY_SIZE, INK);
      const startX = MARGIN + indentW;
      if (op.text) {
        if (op.justify) drawSpread(page, regular, op.text, startX, y, BODY_SIZE, INK, contentWidth - indentW);
        else draw(page, regular, op.text, startX, y, BODY_SIZE, INK);
      }
      y -= LINE_HEIGHT;
    }
    y -= 4;
  };

  section("I/ NHẬN XÉT CHUNG:");
  const skillSpec: [keyof PeriodicReportPdfScores, string][] = [
    ["listening", "nghe/Listening"],
    ["speaking", "nói/Speaking"],
    ["reading", "đọc/Reading"],
    ["writing", "viết/Writing"],
  ];
  paragraph("1. Về thái độ học tập:", data.attitudeComment || "—");
  skillSpec.forEach(([key, label], index) => {
    const score = data.scores?.[key];
    const scoreText = score !== null && score !== undefined ? ` – ${score}/10` : "";
    paragraph(`${index + 2}. Về phần ${label}${scoreText}:`, data.skillComments?.[key] || "—");
  });
  const generalComment = String(data.comment || "").trim();
  if (generalComment) paragraph("Nhận xét chung:", generalComment);

  section("II/ KẾT QUẢ HỌC TẬP (THANG 10):");
  // Bảng điểm canh lề trái, 2 cột × 2 hàng giống mẫu giấy.
  const cellW = 214;
  const cellH = 24;
  const tableRows: [keyof PeriodicReportPdfScores, string][][] = [
    [skillSpec[0], skillSpec[1]],
    [skillSpec[2], skillSpec[3]],
  ];
  for (const row of tableRows) {
    ensure(cellH + 4);
    const top = y;
    row.forEach(([key, label], colIndex) => {
      const left = MARGIN + colIndex * cellW;
      page.drawRectangle({ x: left, y: top - cellH, width: cellW, height: cellH, borderColor: INK, borderWidth: 0.7, color: WHITE });
      const score = data.scores?.[key];
      let cx = left + 10;
      const labelText = `${label}: `;
      draw(page, regular, labelText, cx, top - 16, 10, INK);
      cx += regular.widthOfTextAtSize(labelText, 10);
      const scoreText = score !== null && score !== undefined ? String(score) : "—";
      draw(page, medium, scoreText, cx, top - 16, 10, SCORE_RED);
      cx += medium.widthOfTextAtSize(scoreText, 10);
      draw(page, regular, "/10", cx, top - 16, 8, MUTED);
    });
    y = top - cellH;
  }
  y -= 22;

  ensure(60);
  draw(page, regular, "Trung tâm rất mong tiếp nhận được sự tin tưởng và đồng hành của quý phụ huynh trong thời gian sắp tới.", PAGE.width / 2, y, BODY_SIZE, INK, "center");
  y -= LINE_HEIGHT + 4;
  draw(page, regular, "Xin trân trọng cảm ơn!", PAGE.width / 2, y, BODY_SIZE, INK, "center");

  // Footer mọi trang: gạch ngang + tên trung tâm + số trang thật.
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_Y + 10 }, end: { x: PAGE.width - MARGIN, y: FOOTER_Y + 10 }, thickness: 0.7, color: LINE });
    draw(item, regular, "Trung Tâm Ngoại Ngữ STEPS", MARGIN, FOOTER_Y, 8.5, MUTED);
    draw(item, regular, `Trang ${index + 1}/${pages.length}`, PAGE.width - MARGIN, FOOTER_Y, 8.5, MUTED, "right");
  });

  return pdf.save();
}
