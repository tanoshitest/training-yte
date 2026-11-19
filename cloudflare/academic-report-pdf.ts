import fontkit from "@pdf-lib/fontkit";
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// A4 khổ ngang — nhiều cột điểm hơn; khớp với phiếu ngang trên web.
const PAGE = { width: 842, height: 595 };
const MARGIN = 28;
const NAVY = rgb(0.118, 0.227, 0.541);
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.2, 0.255, 0.333);
const LINE = rgb(0.392, 0.455, 0.545);
const HEADER = rgb(0, 0.471, 0.831);
const WHITE = rgb(1, 1, 1);
const CLIP_GREEN = rgb(0.082, 0.502, 0.239);
const SCORE_RED = rgb(1, 0, 0);
const SCORE_YELLOW = rgb(1, 1, 0);
const SCORE_GREEN = rgb(0, 1, 0);
const SCORE_LEGEND = [
  [SCORE_RED, "Cần chú ý nhiều"],
  [SCORE_YELLOW, "Khá"],
  [SCORE_GREEN, "Giỏi"],
] as const;

// Điểm được nhập tự do, thường là "a/b" hoặc một số; đổi về tỉ lệ để tô màu.
function scoreRatio(value: string) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const fraction = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const bottom = Number(fraction[2]);
    return bottom > 0 ? Number(fraction[1]) / bottom : null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const score = Number(raw);
  if (score <= 10) return score / 10;
  if (score <= 100) return score / 100;
  return null;
}

function scoreTone(value: string) {
  const ratio = scoreRatio(value);
  if (ratio === null) return null;
  if (ratio < 0.5) return SCORE_RED;
  if (ratio < 0.8) return SCORE_YELLOW;
  return SCORE_GREEN;
}

// Roboto không có glyph ✓ nên phải vẽ bằng nét, nếu không phiếu in ra bị lỗi ký tự.
function drawCheck(page: PDFPage, cx: number, cy: number, size: number) {
  const options = { thickness: 1.2, color: CLIP_GREEN, lineCap: LineCapStyle.Round };
  const elbow = { x: cx - size * 0.1, y: cy - size * 0.32 };
  page.drawLine({ start: { x: cx - size * 0.42, y: cy + size * 0.04 }, end: elbow, ...options });
  page.drawLine({ start: elbow, end: { x: cx + size * 0.42, y: cy + size * 0.42 }, ...options });
}

export interface AcademicReportPdfColumn {
  id: string;
  name: string;
}

export interface AcademicReportPdfRow {
  code: string;
  fullName: string;
  status: string;
  clipDone: boolean;
  worksheetDone?: boolean;
  vocabulary: string;
  scores: string[];
  note: string;
}

export interface AcademicReportPdfInput {
  className: string;
  sequence: string;
  dateLabel: string;
  timeLabel: string;
  teacherName: string;
  columns: AcademicReportPdfColumn[];
  rows: AcademicReportPdfRow[];
  logoPng?: Uint8Array;
  /** Cột không có dữ liệu được bỏ khỏi phiếu, khớp với popup trên web. */
  showClip?: boolean;
  showWorksheet?: boolean;
  showVocabulary?: boolean;
  showNote?: boolean;
  /** Thứ tự cột đã kéo-thả trên màn hình điểm danh. */
  columnOrder?: string[];
}

function text(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const raw = String(value ?? "").trim() || "—";
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Xuống dòng nhưng không làm mất nội dung, kể cả một từ dài hơn bề ngang ô. */
function wrapText(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const raw = String(value ?? "").trim() || "—";
  const lines: string[] = [];

  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const character of Array.from(word)) {
      const candidate = `${chunk}${character}`;
      if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    return chunk;
  };

  for (const paragraph of raw.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = font.widthOfTextAtSize(word, size) <= maxWidth ? word : pushLongWord(word);
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : ["—"];
}

function draw(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  options: { align?: "left" | "center" | "right"; maxWidth?: number } = {},
) {
  const raw = options.maxWidth ? text(font, value, size, options.maxWidth) : String(value || "—");
  const width = font.widthOfTextAtSize(raw, size);
  let left = x;
  if (options.align === "center") left = x - width / 2;
  if (options.align === "right") left = x - width;
  page.drawText(raw, { x: left, y, size, font, color });
}

function drawLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  x: number,
  bottom: number,
  height: number,
  size: number,
  color = INK,
  align: "left" | "center" = "center",
) {
  const lineHeight = size + 2;
  const blockHeight = lines.length * lineHeight;
  let baseline = bottom + (height - blockHeight) / 2 + blockHeight - size;
  for (const line of lines) {
    draw(page, font, line || " ", x, baseline, size, color, { align });
    baseline -= lineHeight;
  }
}

function columnLayout(weights: number[], contentWidth: number) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let x = MARGIN;
  return weights.map((weight) => {
    const width = (weight / total) * contentWidth;
    const left = x;
    x += width;
    return { left, width };
  });
}

export function academicReportDownloadName(className: string, dateLabel: string, sequence: string) {
  const who = String(className || "lop").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const date = String(dateLabel || "ngay").replace(/[^0-9]/g, "");
  const buoi = String(sequence || "x").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `bao-cao-hoc-vu-${who}-${date || "ngay"}-buoi-${buoi}.pdf`;
}

export async function buildAcademicReportPdf(
  fonts: { regular: ArrayBuffer; medium: ArrayBuffer },
  data: AcademicReportPdfInput,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular);
  const medium = await pdf.embedFont(fonts.medium);
  const logo = data.logoPng ? await pdf.embedPng(data.logoPng).catch(() => undefined) : undefined;
  const columns = (data.columns || []).slice(0, 12);
  const spec: { label: string; weight: number; left?: boolean; kind?: "clip" | "worksheet" | "score" | "note"; value: (row: AcademicReportPdfRow, index: number) => string }[] = [
    { label: "STT", weight: 0, value: (_row, index) => String(index + 1) },
    { label: "Tên", weight: 0, left: true, value: (row) => row.fullName || "Học viên" },
  ];
  const dynamicSpec = new Map<string, (typeof spec)[number]>();
  if (data.showClip !== false) dynamicSpec.set("clip", { label: "Clip ở nhà", weight: 0.8, kind: "clip", value: (row) => (row.clipDone ? "" : "—") });
  if (data.showWorksheet === true) dynamicSpec.set("worksheet", { label: "Phiếu bài tập", weight: 0.8, kind: "worksheet", value: (row) => (row.worksheetDone ? "" : "—") });
  if (data.showVocabulary !== false) dynamicSpec.set("vocabulary", { label: "Từ vựng", weight: 1, kind: "score", value: (row) => row.vocabulary || "—" });
  columns.forEach((column, scoreIndex) => dynamicSpec.set(`assessment:${column.id}`, {
    label: column.name || "Cột điểm",
    weight: 1,
    kind: "score",
    value: (row) => row.scores?.[scoreIndex] || "—",
  }));
  dynamicSpec.set("status", { label: "Điểm danh", weight: 0.9, value: (row) => row.status || "—" });
  if (data.showNote !== false) dynamicSpec.set("note", { label: "Nhận xét", weight: 2.6, left: true, kind: "note", value: (row) => row.note || "—" });
  const defaultOrder = [...dynamicSpec.keys()];
  const requestedOrder = Array.isArray(data.columnOrder) ? data.columnOrder : [];
  const orderedKeys = [
    ...requestedOrder.filter((key, index) => dynamicSpec.has(key) && requestedOrder.indexOf(key) === index),
    ...defaultOrder.filter((key) => !requestedOrder.includes(key)),
  ];
  spec.push(...orderedKeys.map((key) => dynamicSpec.get(key)!));
  const headers = spec.map((column) => column.label);
  const rows = (data.rows || []).slice(0, 80);
  const contentWidth = PAGE.width - MARGIN * 2;
  // STT cố định; cột Tên vừa đủ tên dài nhất (không thừa khoảng trống), phần còn lại
  // chia theo trọng số — Nhận xét rộng nhất vì là chữ.
  const sttWidth = 26;
  const longestName = Math.max(medium.widthOfTextAtSize("Tên", 8), ...rows.map((row) => regular.widthOfTextAtSize(String(row.fullName || "Học viên").trim(), 8)));
  const nameWidth = Math.min(contentWidth * 0.28, Math.max(70, longestName + 12));
  const restWidth = contentWidth - sttWidth - nameWidth;
  const restWeights = spec.slice(2).map((column) => column.weight);
  const restTotal = restWeights.reduce((sum, value) => sum + value, 0) || 1;
  const cols = columnLayout([sttWidth, nameWidth, ...restWeights.map((weight) => (weight / restTotal) * restWidth)], contentWidth);
  const minimumRowHeight = 18;
  const lineHeight = 10;
  const leftAlign = new Set(spec.flatMap((column, index) => (column.left ? [index] : [])));
  const headerLines = headers.map((label, index) => wrapText(medium, label, 8, cols[index].width - 8));
  const headerHeight = Math.max(20, Math.max(...headerLines.map((lines) => lines.length)) * 10 + 8);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = drawLetterhead(page, { regular, medium, logo });
  // Khổ dọc hẹp hơn nên tách phần mô tả buổi thành hai dòng thay vì cắt bớt.
  draw(page, medium, `Báo cáo học vụ · ${data.className || "Lớp học"} · Buổi ${data.sequence || "—"}`, MARGIN, y, 10, INK, { maxWidth: contentWidth });
  y -= 13;
  draw(page, regular, `${data.dateLabel || "—"} · ${data.timeLabel || "—"} · GV ${data.teacherName || "Chưa phân công"}`, MARGIN, y, 9, MUTED, { maxWidth: contentWidth });
  y -= 16;

  const drawTableHead = () => {
    const top = y;
    const bottom = top - headerHeight;
    page.drawRectangle({ x: MARGIN, y: bottom, width: contentWidth, height: headerHeight, color: HEADER });
    headerLines.forEach((lines, index) => {
      const col = cols[index];
      const size = 8;
      const cx = leftAlign.has(index) ? col.left + 4 : col.left + col.width / 2;
      drawLines(page, medium, lines, cx, bottom, headerHeight, size, WHITE, leftAlign.has(index) ? "left" : "center");
      page.drawLine({ start: { x: col.left, y: top }, end: { x: col.left, y: bottom }, thickness: 0.6, color: LINE });
    });
    page.drawLine({ start: { x: MARGIN + contentWidth, y: top }, end: { x: MARGIN + contentWidth, y: bottom }, thickness: 0.6, color: LINE });
    y = bottom;
  };

  drawTableHead();

  rows.forEach((row, index) => {
    const checkDone = (column: (typeof spec)[number]) =>
      column.kind === "clip" ? row.clipDone : column.kind === "worksheet" ? Boolean(row.worksheetDone) : false;
    const values = spec.map((column) => column.value(row, index));
    const valueLines = values.map((value, colIndex) => {
      const column = spec[colIndex];
      if ((column.kind === "clip" || column.kind === "worksheet") && checkDone(column)) return [];
      return wrapText(regular, value, 8, cols[colIndex].width - 8);
    });
    const rowHeight = Math.max(minimumRowHeight, Math.max(1, ...valueLines.map((lines) => lines.length)) * lineHeight + 8);
    if (y < MARGIN + rowHeight + 8) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
      drawTableHead();
    }
    const top = y;
    const bottom = y - rowHeight;
    page.drawRectangle({ x: MARGIN, y: bottom, width: contentWidth, height: rowHeight, borderColor: LINE, borderWidth: 0.6, color: WHITE });
    values.forEach((value, colIndex) => {
      const col = cols[colIndex];
      const column = spec[colIndex];
      const size = 8;
      const cx = leftAlign.has(colIndex) ? col.left + 4 : col.left + col.width / 2;
      let ink = INK;
      let font = regular;
      if (column.kind === "score") {
        const tone = scoreTone(value);
        if (tone) page.drawRectangle({ x: col.left + 0.6, y: bottom + 0.6, width: col.width - 1.2, height: rowHeight - 1.2, color: tone });
        // Ô đỏ: chữ trắng đậm cho dễ đọc.
        if (tone === SCORE_RED) { ink = WHITE; font = medium; }
      }
      if ((column.kind === "clip" || column.kind === "worksheet") && checkDone(column)) {
        drawCheck(page, col.left + col.width / 2, bottom + rowHeight / 2, 9);
      } else {
        drawLines(page, font, valueLines[colIndex], cx, bottom, rowHeight, size, ink, leftAlign.has(colIndex) ? "left" : "center");
      }
      if (colIndex > 0) page.drawLine({ start: { x: col.left, y: top }, end: { x: col.left, y: bottom }, thickness: 0.6, color: LINE });
    });
    y = bottom;
  });

  if (!rows.length) {
    page.drawRectangle({ x: MARGIN, y: y - minimumRowHeight, width: contentWidth, height: minimumRowHeight, borderColor: LINE, borderWidth: 0.6, color: WHITE });
    draw(page, regular, "Buổi học chưa có dữ liệu học viên.", PAGE.width / 2, y - 12, 9, MUTED, { align: "center" });
    y -= minimumRowHeight;
  }

  // Chú thích màu điểm, chỉ in khi phiếu thật sự có cột điểm.
  if (spec.some((column) => column.kind === "score")) {
    y -= 14;
    for (const [tone, label] of SCORE_LEGEND) {
      if (y < MARGIN + 12) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - MARGIN;
      }
      page.drawRectangle({ x: MARGIN, y: y - 8, width: 15, height: 9, color: tone, borderColor: LINE, borderWidth: 0.5 });
      draw(page, regular, label, MARGIN + 21, y - 7, 8.5, INK);
      y -= 13;
    }
  }

  return pdf.save();
}

function drawLetterhead(
  page: PDFPage,
  assets: { regular: PDFFont; medium: PDFFont; logo?: PDFImage },
) {
  const logoHeight = 46;
  let logoWidth = 124;
  let cursor = PAGE.height - MARGIN;
  if (assets.logo) {
    const fitted = assets.logo.scaleToFit(160, logoHeight);
    logoWidth = fitted.width;
    page.drawImage(assets.logo, {
      x: MARGIN,
      y: cursor - fitted.height,
      width: fitted.width,
      height: fitted.height,
    });
  }
  const copyX = MARGIN + logoWidth + 14;
  const lines = [
    ["Trung tâm Ngoại ngữ STEPS", assets.medium, 13, NAVY],
    ["CS1: 57 Trương Quốc Dụng, P. Thành Sen, Hà Tĩnh", assets.regular, 9, MUTED],
    ["CS2: Thôn Đồng Giang, xã Thạch Khê, Hà Tĩnh", assets.regular, 9, MUTED],
    ["Hotline: 0813.661.668", assets.regular, 9, MUTED],
  ] as const;
  const gap = (logoHeight - 13 - 9 * 3) / 3;
  let textY = cursor - 12;
  for (const [label, font, size, color] of lines) {
    draw(page, font, label, copyX, textY, size, color);
    textY -= size + gap;
  }
  cursor -= logoHeight + 12;
  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: PAGE.width - MARGIN, y: cursor }, thickness: 0.7, color: LINE });
  return cursor - 16;
}
