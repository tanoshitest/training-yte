import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildPayrollSlipPdf, cleanPayrollSlipInput, payrollSlipDownloadName } from "../cloudflare/payroll-slip-pdf";

function loadFont(name: string) {
  return fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)).buffer;
}

/** Số liệu đúng như popup Chi tiết lương hiển thị cho cô Vân tháng 10/2026. */
function baseInput() {
  return {
    teacherCode: "GV0001",
    monthKey: "2026-10",
    title: "PHIẾU LƯƠNG · Tháng 10/2026",
    period: "Kỳ tính lương 01/10/2026 – 31/10/2026",
    issuedAt: "31/10/2026",
    center: { name: "Trung tâm Ngoại ngữ STEPS", address: "12 Đường Sample, Quận 1, TP.HCM", contact: "0900 000 000 · ngoaingusteps.edu.vn" },
    info: [
      { label: "Giáo viên", value: "Nguyễn Thị Vân (GV0001)" },
      { label: "Hợp đồng", value: "Toàn thời gian · Tháng" },
      { label: "Ngày công tính lương", value: "25 / 27 ngày" },
      { label: "Nhận lương qua TK", value: "0123456789 · Vietcombank" },
    ],
    income: [
      { label: "Lương thời gian · 25/27 ngày × 20.800.000 đ", amount: 19_259_259 },
      { label: "Thưởng doanh số · 0,5% × 2.178.380.000 đ", amount: 10_891_900 },
    ],
    deductions: [
      { label: "Bảo hiểm người lao động · 10,5% × 20.800.000 đ", amount: 2_184_000 },
      { label: "Thuế TNCN lũy tiến 5 bậc · giảm trừ 15.580.000 đ (1 người phụ thuộc)", amount: 8_380_475 },
      { label: "Tạm ứng trừ vào lương", amount: 10_000_000 },
    ],
    gross: 30_151_159,
    totalDeduct: 20_564_475,
    net: 9_586_684,
    note: "",
  };
}

test("phiếu lương PDF: một trang A4, đủ tiền, có logo", async () => {
  const input = { ...baseInput(), logoPng: new Uint8Array(fs.readFileSync(new URL("../cloudflare/public/steps-wordmark.png", import.meta.url))) };
  const bytes = await buildPayrollSlipPdf({ regular: loadFont("Roboto-Regular.ttf"), medium: loadFont("Roboto-Medium.ttf") }, input);
  assert.ok(bytes.length > 20_000, "file PDF có dung lượng hợp lý");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1, "vừa một trang A4");
  const page = pdf.getPage(0);
  const box = page.getSize();
  assert.ok(Math.abs(box.width - 595) < 1 && Math.abs(box.height - 842) < 1, "khổ A4 dọc");
  assert.match(String(pdf.getTitle()), /PHIẾU LƯƠNG · Tháng 10\/2026/);
});

test("phiếu lương PDF: thiếu logo hoặc trống khoản vẫn dựng được", async () => {
  const empty = { ...baseInput(), income: [], deductions: [], info: [], gross: 0, totalDeduct: 0, net: 0, logoPng: undefined };
  const bytes = await buildPayrollSlipPdf({ regular: loadFont("Roboto-Regular.ttf"), medium: loadFont("Roboto-Medium.ttf") }, empty);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});

test("làm sạch payload phiếu lương: chặn ký điều khiển, giới hạn mảng, số nguyên tuyệt đối", () => {
  const dirty = {
    teacherCode: "GV\u00000001",
    monthKey: "2026-10",
    title: "x".repeat(200),
    info: Array.from({ length: 50 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    income: Array.from({ length: 60 }, () => ({ label: "a", amount: "1e30" })),
    deductions: [{ label: "b", amount: Number.NaN }],
    gross: 1.9,
    totalDeduct: "abc",
    net: -2e20,
    note: "ghi\u0000 chú",
  };
  const clean = cleanPayrollSlipInput(dirty as unknown as Record<string, unknown>);
  assert.equal(clean.teacherCode, "GV 0001");
  assert.equal(clean.title.length, 60);
  assert.equal(clean.info.length, 24);
  assert.equal(clean.income.length, 40);
  assert.equal(clean.gross, 2);
  assert.equal(clean.totalDeduct, 0);
  assert.equal(clean.net, -1e13, "chống tràn số");
  assert.ok(!/[\u0000-\u001f]/.test(clean.note), "không còn ký tự điều khiển");
  assert.equal(clean.center.name, "Trung tâm Ngoại ngữ STEPS");
});

test("tên file tải về: không chứa ký tự lạ, luôn có số thứ tự kỳ", () => {
  assert.equal(payrollSlipDownloadName("GV/../0001", "2026-10"), "phieu-luong-gv0001-2026-10.pdf");
  assert.equal(payrollSlipDownloadName("", ""), "phieu-luong-gv.pdf");
});
