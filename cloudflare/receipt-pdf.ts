import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { moneyInWords } from "../src/lib/money-words";
import { vietQrModules } from "./vietqr";

const PAGE = { width: 419.53, height: 595.28 };
const MARGIN = 28;
const BLUE = rgb(0.145, 0.388, 0.922);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.392, 0.455, 0.545);
const LABEL = rgb(0.58, 0.639, 0.722);
const LINE = rgb(0.886, 0.91, 0.941);
const PANEL = rgb(0.973, 0.98, 0.988);
const WASH = rgb(0.937, 0.965, 1);

export interface ReceiptPdfInput {
  centerName: string;
  contact: string;
  receiptNumber: string;
  paidAt: string;
  studentName: string;
  studentCode: string;
  className: string;
  classCode: string;
  parentName: string;
  parentPhone: string;
  address: string;
  originalAmount: number;
  packageAmount: number;
  collected: number;
  method: string;
  invoiceRef: string;
  coverageFrom: string;
  collectorName: string;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(value || 0))} ₫`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  options: { align?: "left" | "center" | "right"; maxWidth?: number } = {},
) {
  const value = String(text || "—");
  const width = font.widthOfTextAtSize(value, size);
  let left = x;
  if (options.align === "center") left = x - width / 2;
  if (options.align === "right") left = x - width;
  page.drawText(value, { x: left, y, size, font, color, maxWidth: options.maxWidth });
  return width;
}

export async function buildTuitionReceiptPdf(
  fonts: { regular: ArrayBuffer; medium: ArrayBuffer },
  data: ReceiptPdfInput,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular);
  const medium = await pdf.embedFont(fonts.medium);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const left = MARGIN;
  const right = PAGE.width - MARGIN;
  const contentWidth = right - left;
  let y = PAGE.height - 36;

  page.drawRectangle({ x: left, y: y - 28, width: 36, height: 36, color: BLUE });
  drawText(page, medium, "ST", left + 18, y - 18, 14, rgb(1, 1, 1), { align: "center" });
  drawText(page, medium, (data.centerName || "STEPS Education").toUpperCase(), left + 46, y - 6, 11, INK);
  drawText(page, regular, data.contact || " ", left + 46, y - 20, 7, MUTED, { maxWidth: contentWidth - 46 });

  y -= 42;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: LINE });
  y -= 18;
  drawText(page, medium, "P H I Ế U   T H U", PAGE.width / 2, y, 8, BLUE, { align: "center" });
  y -= 18;
  drawText(page, medium, "BIÊN LAI THU HỌC PHÍ", PAGE.width / 2, y, 16, INK, { align: "center" });
  y -= 14;
  drawText(page, regular, `Số ${data.receiptNumber}`, PAGE.width / 2, y, 8, MUTED, { align: "center" });
  y -= 12;
  drawText(page, regular, `Ngày thu: ${formatDate(data.paidAt)}`, PAGE.width / 2, y, 8, MUTED, { align: "center" });

  y -= 16;
  const boxHeight = 72;
  page.drawRectangle({ x: left, y: y - boxHeight, width: contentWidth, height: boxHeight, color: PANEL });
  const col = contentWidth / 2;
  const fields: Array<[string, string, number, number]> = [
    ["Học viên", data.studentName, left + 8, y - 14],
    ["Mã học viên", data.studentCode, left + col + 8, y - 14],
    ["Lớp", data.classCode ? `${data.className} (${data.classCode})` : data.className, left + 8, y - 38],
    ["Phụ huynh", data.parentName || "—", left + col + 8, y - 38],
    ["SĐT phụ huynh", data.parentPhone || "—", left + 8, y - 62],
  ];
  for (const [label, value, x, top] of fields) {
    drawText(page, regular, label, x, top, 7, LABEL);
    drawText(page, medium, value || "—", x, top - 12, 9, INK, { maxWidth: col - 16 });
  }

  y -= boxHeight + 14;
  drawText(page, medium, "NỘI DUNG", left, y, 7, MUTED);
  drawText(page, medium, "SỐ TIỀN", right, y, 7, MUTED, { align: "right" });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: LINE });

  const moneyRows: Array<[string, string]> = [
    ["Học phí gốc", data.originalAmount > 0 ? formatMoney(data.originalAmount) : "—"],
    ["Học phí áp dụng", formatMoney(data.packageAmount || data.collected)],
    ["Miễn giảm", "—"],
    ["Giáo trình", "—"],
  ];
  for (const [label, value] of moneyRows) {
    y -= 16;
    drawText(page, regular, label, left, y, 9, INK);
    drawText(page, regular, value, right, y, 9, INK, { align: "right" });
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: LINE });
  }
  y -= 18;
  drawText(page, medium, "Số tiền thực thu", left, y, 9, INK);
  drawText(page, medium, formatMoney(data.collected), right, y, 11, BLUE, { align: "right" });

  y -= 20;
  page.drawRectangle({ x: left, y: y - 6, width: contentWidth, height: 22, color: WASH });
  drawText(page, medium, "Bằng chữ: ", left + 7, y + 1, 8, MUTED);
  const wordsLabel = medium.widthOfTextAtSize("Bằng chữ: ", 8);
  drawText(page, regular, moneyInWords(data.collected), left + 7 + wordsLabel, y + 1, 8, INK, { maxWidth: contentWidth - 20 - wordsLabel });

  y -= 28;
  const meta = [
    ["Ngày thu tiền", formatDate(data.paidAt)],
    ["Học phí bắt đầu từ", formatDate(data.coverageFrom || data.paidAt)],
    ["Hình thức", data.method || "—"],
    ["Số hoá đơn", data.invoiceRef || "—"],
  ];
  const metaWidth = contentWidth / 4;
  meta.forEach(([label, value], index) => {
    const x = left + index * metaWidth;
    drawText(page, regular, label, x, y, 7, LABEL);
    drawText(page, medium, value, x, y - 12, 8, INK, { maxWidth: metaWidth - 6 });
  });

  y -= 48;
  const signWidth = contentWidth / 2;
  ["Người nộp tiền", "Người thu tiền"].forEach((title, index) => {
    const x = left + signWidth * index + signWidth / 2;
    drawText(page, medium, title, x, y, 9, INK, { align: "center" });
    drawText(page, regular, "Ký, ghi rõ họ tên", x, y - 11, 7, LABEL, { align: "center" });
    const signer = index === 0 ? (data.parentName || data.studentName) : (data.collectorName || "………………");
    drawText(page, medium, signer, x, y - 46, 9, INK, { align: "center" });
  });

  const footer = `Biên lai dùng để đối chiếu với phụ huynh.${data.address ? ` Địa chỉ: ${data.address}` : ""}`;
  drawText(page, regular, footer, PAGE.width / 2, 22, 6.5, LABEL, { align: "center", maxWidth: contentWidth });

  return pdf.save();
}

export function receiptDownloadName(paidAt: string, studentCode: string) {
  const date = (paidAt || "").slice(0, 10) || "bien-lai";
  const code = String(studentCode || "HV").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `bien-lai-${date}-${code}.pdf`;
}

const NOTICE_PAGE = { width: 595.28, height: 841.89 };

export interface TuitionNoticePdfInput {
  centerName: string;
  branchName: string;
  label: string;
  periodLabel: string;
  contentLabel: string;
  className: string;
  recipientLeftLabel: string;
  recipientLeftValue: string;
  recipientRightLabel: string;
  recipientRightValue: string;
  sessions: number;
  unitPrice: number;
  /** Tiền học phí thuần, chưa cộng học liệu. Bỏ trống thì lấy bằng amount. */
  tuitionAmount?: number;
  /** Buổi nghỉ GV của tháng trước được khấu trừ trên phiếu này; 0 thì không in dòng. */
  offCreditSessions?: number;
  offCreditAmount?: number;
  offCreditLabel?: string;
  offCreditPeriodLabel?: string;
  /** Buổi đã học của tháng vào lớp (vào sau ngày 5 → không lập phiếu riêng) cộng
   * vào phiếu này; 0 thì không in dòng. */
  carryInSessions?: number;
  carryInAmount?: number;
  carryInLabel?: string;
  carryInPeriodLabel?: string;
  /** Học liệu thu thêm của kỳ này; 0 nghĩa là không in dòng học liệu. */
  materialsAmount?: number;
  materialsLabel?: string;
  /** Nợ cũ mang sang (buổi đã học chưa thu); 0 nghĩa là không in dòng. */
  oldDebtSessions?: number;
  oldDebtAmount?: number;
  oldDebtLabel?: string;
  oldDebtPeriodLabel?: string;
  /** Chênh lệch/nợ chuyển lớp neo vào kỳ này (phiếu riêng); 0 nghĩa là không in dòng. */
  transferAmount?: number;
  transferLabel?: string;
  transferPeriodLabel?: string;
  /** Bảo lưu học phí đã trừ vào phiếu này; 0 nghĩa là không in dòng. */
  preservedApplied?: number;
  /** Phần còn thiếu của phiếu tháng trước đã thu một phần (truy thu). */
  carryDebtAmount?: number;
  carryDebtLabel?: string;
  carryDebtPeriodLabel?: string;
  /** Số tiền phiếu kỳ này đã thu trước (thu dư kỳ trước / trả góp). */
  priorPaidAmount?: number;
  /** Phiếu kỳ đang chạy đã chốt lúc học viên rời lớp: số đã xuất trừ buổi chưa học. */
  leftClass?: { billedSessions: number; deductionSessions: number; deductionAmount: number };
  /** Số tiền phiếu lúc xuất (trước khấu trừ buổi chưa học). */
  issuedAmount?: number;
  tuitionExempt?: boolean;
  amount: number;
  bankName: string;
  bankId?: string;
  accountNumber: string;
  accountName: string;
  paymentContent: string;
  issuedDate: string;
  qrPng?: Uint8Array;
  qrJpg?: Uint8Array;
}

export async function buildTuitionNoticePdf(
  fonts: { regular: ArrayBuffer; medium: ArrayBuffer },
  data: TuitionNoticePdfInput,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular);
  const medium = await pdf.embedFont(fonts.medium);
  const page = pdf.addPage([NOTICE_PAGE.width, NOTICE_PAGE.height]);
  const left = 36;
  const right = NOTICE_PAGE.width - 36;
  const contentWidth = right - left;
  let y = NOTICE_PAGE.height;

  page.drawRectangle({ x: 0, y: y - 88, width: NOTICE_PAGE.width, height: 88, color: BLUE });
  drawText(page, medium, data.centerName || "STEPS LMS", left, y - 38, 16, rgb(1, 1, 1));
  drawText(page, regular, data.branchName || "Trung tâm STEPS", left, y - 56, 10, rgb(0.85, 0.9, 1));
  drawText(page, medium, "PHIẾU BÁO HỌC PHÍ", right, y - 38, 18, rgb(1, 1, 1), { align: "right" });
  drawText(page, regular, data.label || "", right, y - 56, 10, rgb(0.85, 0.9, 1), { align: "right" });
  y -= 118;

  const meta = [
    [data.recipientLeftLabel, data.recipientLeftValue],
    [data.recipientRightLabel, data.recipientRightValue],
    ["Lớp", data.className],
    ["Kỳ học phí", data.periodLabel],
  ];
  meta.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = left + col * (contentWidth / 2);
    const top = y - row * 28;
    drawText(page, regular, label, x, top, 9, MUTED);
    drawText(page, medium, value || "—", x + 118, top, 10, INK, { maxWidth: contentWidth / 2 - 128 });
  });
  y -= 72;

  const columns = [
    { title: "NỘI DUNG", x: left + 8, width: 150, align: "left" as const },
    { title: "THỜI GIAN", x: left + 190, width: 150, align: "left" as const },
    { title: "SỐ BUỔI", x: left + 360, width: 50, align: "right" as const },
    { title: "ĐƠN GIÁ/BUỔI", x: left + 430, width: 70, align: "right" as const },
    { title: "THÀNH TIỀN", x: right - 8, width: 80, align: "right" as const },
  ];
  page.drawRectangle({ x: left, y: y - 8, width: contentWidth, height: 26, color: PANEL, borderColor: LINE, borderWidth: 0.8 });
  for (const column of columns) {
    drawText(page, medium, column.title, column.x, y, 8, MUTED, { align: column.align });
  }
  y -= 34;
  const exempt = Boolean(data.tuitionExempt);
  const materialsAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.materialsAmount) || 0));
  const tuitionAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.tuitionAmount ?? data.amount - materialsAmount)));
  const issuedAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.issuedAmount ?? tuitionAmount) || 0));
  const feeRows: Array<Array<readonly [string, number, "left" | "right"]>> = [[
    [data.contentLabel, left + 8, "left"],
    [data.periodLabel, left + 190, "left"],
    [String(data.sessions), left + 360, "right"],
    [formatMoney(data.unitPrice), left + 430, "right"],
    [formatMoney(issuedAmount), right - 8, "right"],
  ]];
  // Học viên rời lớp giữa tháng: in rõ số đã xuất → phần khấu trừ buổi chưa học
  // → phần còn lại, để phụ huynh thấy ngay công nợ lúc nghỉ.
  const leftDeductionSessions = exempt ? 0 : Math.max(0, Math.round(Number(data.leftClass?.deductionSessions) || 0));
  const leftDeductionAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.leftClass?.deductionAmount) || 0));
  if (leftDeductionSessions && leftDeductionAmount) {
    feeRows.push([
      [`Học phí khấu trừ (${leftDeductionSessions} buổi chưa học)`, left + 8, "left"],
      [data.periodLabel, left + 190, "left"],
      [`-${leftDeductionSessions}`, left + 360, "right"],
      [formatMoney(data.unitPrice), left + 430, "right"],
      [`-${formatMoney(leftDeductionAmount)}`, right - 8, "right"],
    ]);
  }
  const carryInSessions = exempt ? 0 : Math.max(0, Math.round(Number(data.carryInSessions) || 0));
  const carryInAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.carryInAmount) || 0));
  if (carryInSessions && carryInAmount) {
    feeRows.push([
      [data.carryInLabel || "Học phí buổi đã học tháng trước", left + 8, "left"],
      [data.carryInPeriodLabel || data.periodLabel, left + 190, "left"],
      [`+${carryInSessions}`, left + 360, "right"],
      [formatMoney(data.unitPrice), left + 430, "right"],
      [`+${formatMoney(carryInAmount)}`, right - 8, "right"],
    ]);
  }
  const offCreditSessions = exempt ? 0 : Math.max(0, Math.round(Number(data.offCreditSessions) || 0));
  const offCreditAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.offCreditAmount) || 0));
  if (offCreditSessions && offCreditAmount) {
    feeRows.push([
      [data.offCreditLabel || "Khấu trừ buổi nghỉ tháng trước", left + 8, "left"],
      [data.offCreditPeriodLabel || data.periodLabel, left + 190, "left"],
      [`-${offCreditSessions}`, left + 360, "right"],
      [formatMoney(data.unitPrice), left + 430, "right"],
      [`-${formatMoney(offCreditAmount)}`, right - 8, "right"],
    ]);
  }
  if (materialsAmount) {
    feeRows.push([
      [data.materialsLabel || "Học liệu", left + 8, "left"],
      [data.periodLabel, left + 190, "left"],
      ["—", left + 360, "right"],
      ["—", left + 430, "right"],
      [formatMoney(materialsAmount), right - 8, "right"],
    ]);
  }
  const oldDebtSessions = exempt ? 0 : Math.max(0, Math.round(Number(data.oldDebtSessions) || 0));
  // Giữ cả số âm: học viên đóng dư kỳ trước (vd Trà My S4 −25k) vẫn in dòng
  // "Đã đóng dư" để tổng phiếu khớp phép tính.
  const oldDebtAmount = exempt ? 0 : Math.round(Number(data.oldDebtAmount) || 0);
  if (oldDebtAmount) {
    feeRows.push([
      [data.oldDebtLabel || "Nợ học phí khóa cũ", left + 8, "left"],
      [data.oldDebtPeriodLabel || "Khóa trước", left + 190, "left"],
      [oldDebtSessions ? `+${oldDebtSessions}` : "—", left + 360, "right"],
      [oldDebtSessions ? formatMoney(data.unitPrice) : "—", left + 430, "right"],
      [formatMoney(oldDebtAmount), right - 8, "right"],
    ]);
  }
  const transferAmount = exempt ? 0 : Math.round(Number(data.transferAmount) || 0);
  if (transferAmount) {
    feeRows.push([
      [data.transferLabel || "Chênh lệch chuyển lớp", left + 8, "left"],
      [data.transferPeriodLabel || data.periodLabel, left + 190, "left"],
      ["—", left + 360, "right"],
      ["—", left + 430, "right"],
      [formatMoney(transferAmount), right - 8, "right"],
    ]);
  }
  const preservedApplied = exempt ? 0 : Math.max(0, Math.round(Number(data.preservedApplied) || 0));
  if (preservedApplied) {
    feeRows.push([
      ["Trừ bảo lưu học phí", left + 8, "left"],
      ["Đã đóng dư từ lớp trước", left + 190, "left"],
      ["—", left + 360, "right"],
      ["—", left + 430, "right"],
      [`-${formatMoney(preservedApplied)}`, right - 8, "right"],
    ]);
  }
  const carryDebtAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.carryDebtAmount) || 0));
  if (carryDebtAmount) {
    feeRows.push([
      [data.carryDebtLabel || "Truy thu học phí kỳ trước", left + 8, "left"],
      [data.carryDebtPeriodLabel || "Kỳ trước", left + 190, "left"],
      ["—", left + 360, "right"],
      ["—", left + 430, "right"],
      [`+${formatMoney(carryDebtAmount)}`, right - 8, "right"],
    ]);
  }
  const priorPaidAmount = exempt ? 0 : Math.max(0, Math.round(Number(data.priorPaidAmount) || 0));
  if (priorPaidAmount) {
    feeRows.push([
      ["Đã thu trước", left + 8, "left"],
      [data.label || data.periodLabel, left + 190, "left"],
      ["—", left + 360, "right"],
      ["—", left + 430, "right"],
      [`-${formatMoney(priorPaidAmount)}`, right - 8, "right"],
    ]);
  }
  for (const rowValues of feeRows) {
    page.drawRectangle({ x: left, y: y - 10, width: contentWidth, height: 28, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.8 });
    for (const [value, x, align] of rowValues) {
      // Cột NỘI DUNG rộng tới trước cột THỜI GIAN (left+190) nên được nới maxWidth.
      drawText(page, regular, value, x, y, 10, INK, { align, maxWidth: x === left + 8 ? 176 : 148 });
    }
    y -= 28;
  }
  y -= 14;
  const payable = exempt ? 0 : data.amount;
  drawText(page, regular, carryDebtAmount || priorPaidAmount ? "Còn phải nộp" : leftDeductionAmount ? "Học phí còn lại" : materialsAmount || oldDebtAmount || transferAmount || preservedApplied ? "Tổng thu" : "Tổng học phí", right - 150, y, 12, INK, { align: "right" });
  drawText(page, medium, formatMoney(payable), right, y, 16, BLUE, { align: "right" });
  y -= 28;

  const boxHeight = 148;
  page.drawRectangle({ x: left, y: y - boxHeight, width: contentWidth, height: boxHeight, color: WASH, borderColor: rgb(0.749, 0.859, 0.996), borderWidth: 1 });
  const qrLeft = left + 14;
  const qrBottom = y - boxHeight + 18;
  const qrBox = 112;
  const generated = vietQrModules({
    bankId: data.bankId || "",
    accountNumber: data.accountNumber,
    accountName: data.accountName,
    amount: payable,
    addInfo: data.paymentContent,
  });
  page.drawRectangle({ x: qrLeft, y: qrBottom, width: qrBox, height: qrBox, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.8 });
  if (generated) {
    const cell = qrBox / generated.size;
    for (let row = 0; row < generated.size; row += 1) {
      for (let col = 0; col < generated.size; col += 1) {
        if (!generated.data[row]?.[col]) continue;
        page.drawRectangle({
          x: qrLeft + col * cell,
          y: qrBottom + (generated.size - 1 - row) * cell,
          width: cell,
          height: cell,
          color: rgb(0, 0, 0),
        });
      }
    }
  } else if (data.qrPng || data.qrJpg) {
    try {
      const qr = data.qrPng ? await pdf.embedPng(data.qrPng) : await pdf.embedJpg(data.qrJpg!);
      page.drawImage(qr, { x: qrLeft, y: qrBottom, width: qrBox, height: qrBox });
    } catch {
      drawText(page, regular, "QR", qrLeft + 56, qrBottom + 52, 10, MUTED, { align: "center" });
    }
  } else {
    drawText(page, regular, "Chưa cấu hình QR", qrLeft + 56, qrBottom + 52, 8, MUTED, { align: "center" });
  }
  const payX = left + 146;
  drawText(page, medium, "Thông tin chuyển khoản", payX, y - 22, 12, INK);
  const payRows = [
    ["Ngân hàng", data.bankName],
    ["Số tài khoản", data.accountNumber],
    ["Chủ tài khoản", data.accountName],
    ["Nội dung", data.paymentContent],
    ["Số tiền", formatMoney(payable)],
    ...(exempt ? [["Ghi chú", "Học viên được miễn học phí"]] : []),
  ];
  payRows.forEach(([label, value], index) => {
    const top = y - 44 - index * 18;
    drawText(page, regular, label, payX, top, 9, MUTED);
    drawText(page, medium, value || "—", payX + 110, top, 10, INK, { maxWidth: contentWidth - 280 });
  });
  y -= boxHeight + 24;

  drawText(
    page,
    regular,
    exempt
      ? "Học viên được miễn học phí kỳ này — phiếu chỉ mang tính thông báo, phụ huynh không cần chuyển khoản."
      : "Phụ huynh vui lòng quét đúng mã QR hoặc chuyển khoản theo thông tin trên phiếu. Ghi đúng nội dung chuyển khoản để trung tâm đối chiếu học phí.",
    left,
    y,
    9,
    MUTED,
    { maxWidth: contentWidth },
  );
  y -= 48;
  drawText(page, medium, "Trung tâm STEPS", right, y, 11, INK, { align: "right" });
  drawText(page, regular, `Ngày lập: ${data.issuedDate}`, right, y - 16, 9, MUTED, { align: "right" });

  return pdf.save();
}

export function tuitionNoticeDownloadName(className: string, period: string, studentCode = "") {
  const who = String(studentCode || className || "lop").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const stamp = String(period || "ky").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `phieu-bao-hoc-phi-${who}-${stamp}.pdf`;
}
