import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { draw, drawLetterhead, drawSpread, paragraphOps } from "./periodic-report-pdf";

// Phiếu kết quả bài kiểm tra của một học viên (A4 dọc), cùng bộ chữ và đầu thư với báo cáo định kỳ.
const PAGE = { width: 595, height: 842 };
const MARGIN = 44;
const FOOTER_Y = 30;
const FOOTER_CLEAR = 58;
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.278, 0.333, 0.412);
const LINE = rgb(0.796, 0.835, 0.882);
const GOOD = rgb(0.027, 0.463, 0.278);
const BAD = rgb(0.725, 0.11, 0.11);
const BOX_BG = rgb(0.973, 0.98, 0.988);
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15.5;

export interface GradingReportWrongAnswer {
  number: number;
  studentAnswer: string;
  /** Câu đã sửa lại cho đúng (hoặc đáp án chuẩn khi học viên bỏ trống). */
  correction: string;
  /** Giải thích sai ở đâu, vì sao. */
  comment: string;
}

export interface GradingReportPdfInput {
  studentName: string;
  className: string;
  testName: string;
  dateLabel: string;
  earned: number;
  total: number;
  feedback: string;
  wrong: GradingReportWrongAnswer[];
  logoPng?: Uint8Array;
}

export function gradingReportDownloadName(studentName: string, testName: string) {
  const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
  return `phieu-ket-qua-${slug(studentName) || "hoc-vien"}-${slug(testName) || "bai-kiem-tra"}.pdf`;
}

export async function buildGradingReportPdf(fonts: { regular: ArrayBuffer; medium: ArrayBuffer }, data: GradingReportPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular);
  const medium = await pdf.embedFont(fonts.medium);
  const logo = data.logoPng ? await pdf.embedPng(data.logoPng).catch(() => undefined) : undefined;
  const contentWidth = PAGE.width - MARGIN * 2;

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = drawLetterhead(page, { regular, medium, logo });
  const ensure = (need: number) => {
    if (y - need >= FOOTER_CLEAR) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  const paragraph = (label: string | undefined, content: string, labelFont: PDFFont = medium) => {
    for (const op of paragraphOps(regular, labelFont, label, content, contentWidth, BODY_SIZE)) {
      ensure(LINE_HEIGHT);
      const indentW = op.indent ? labelFont.widthOfTextAtSize(`${op.label} `, BODY_SIZE) : 0;
      if (op.label) draw(page, labelFont, op.label, MARGIN, y, BODY_SIZE, INK);
      if (op.text) {
        if (op.justify) drawSpread(page, regular, op.text, MARGIN + indentW, y, BODY_SIZE, INK, contentWidth - indentW);
        else draw(page, regular, op.text, MARGIN + indentW, y, BODY_SIZE, INK);
      }
      y -= LINE_HEIGHT;
    }
  };
  const section = (label: string) => {
    ensure(40);
    draw(page, medium, label, MARGIN, y, 11.5, INK);
    y -= 18;
  };

  draw(page, medium, "PHIẾU KẾT QUẢ BÀI KIỂM TRA", PAGE.width / 2, y, 16, INK, "center");
  y -= 18;
  draw(page, medium, data.testName || "—", PAGE.width / 2, y, 11, INK, "center");
  y -= 24;
  draw(page, medium, `Học viên: ${data.studentName || "—"}`, MARGIN, y, BODY_SIZE, INK);
  y -= LINE_HEIGHT;
  draw(page, regular, `${data.className || "—"}${data.dateLabel ? ` · Chấm ngày ${data.dateLabel}` : ""}`, MARGIN, y, 9.5, MUTED);
  y -= 22;

  // Khung điểm: số câu đúng / tổng câu.
  page.drawRectangle({ x: MARGIN, y: y - 30, width: contentWidth, height: 38, color: BOX_BG, borderColor: LINE, borderWidth: 0.7 });
  draw(page, regular, "Kết quả:", MARGIN + 12, y - 16, BODY_SIZE, INK);
  const scoreText = `${data.earned}/${data.total} câu đúng`;
  draw(page, medium, scoreText, MARGIN + 12 + regular.widthOfTextAtSize("Kết quả: ", BODY_SIZE), y - 16, 14, data.earned === data.total ? GOOD : BAD);
  y -= 54;

  section("I/ GÓP Ý CỦA GIÁO VIÊN:");
  paragraph(undefined, data.feedback || "Chưa có góp ý.");
  y -= 10;

  section(data.wrong.length ? `II/ CÁC CÂU CẦN SỬA (${data.wrong.length} câu):` : "II/ CÁC CÂU CẦN SỬA:");
  if (!data.wrong.length) {
    paragraph(undefined, "Em làm đúng tất cả các câu. Chúc mừng em!");
  }
  for (const item of data.wrong) {
    ensure(LINE_HEIGHT * 4 + 8);
    draw(page, medium, `Câu ${item.number}`, MARGIN, y, BODY_SIZE, INK);
    y -= LINE_HEIGHT;
    paragraph("Em viết:", item.studentAnswer || "(bỏ trống)");
    if (item.correction) paragraph("Sửa lại:", item.correction);
    if (item.comment) paragraph("Giải thích:", item.comment);
    y -= 7;
  }

  ensure(50);
  y -= 6;
  draw(page, regular, "Em hãy xem lại các câu trên và luyện tập thêm nhé. Chúc em học tốt!", PAGE.width / 2, y, BODY_SIZE, INK, "center");

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: FOOTER_Y + 10 }, end: { x: PAGE.width - MARGIN, y: FOOTER_Y + 10 }, thickness: 0.7, color: LINE });
    draw(item, regular, "Trung Tâm Ngoại Ngữ STEPS", MARGIN, FOOTER_Y, 8.5, MUTED);
    draw(item, regular, `Trang ${index + 1}/${pages.length}`, PAGE.width - MARGIN, FOOTER_Y, 8.5, MUTED, "right");
  });
  return pdf.save();
}
