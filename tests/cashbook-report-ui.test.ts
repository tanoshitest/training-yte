import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCashbookReportPdf, cleanCashbookReportInput, cashbookReportDownloadName } from "../cloudflare/cashbook-report-pdf";
import test from "node:test";
import vm from "node:vm";

function loadApp() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, cashbookReportData, cashbookPage };\n");
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/thu-chi" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as any).__t;
}

const entry = (id: string, date: string, kind: "IN" | "OUT", method: string, amount: number, studentName = "") =>
  ({ id, date, kind, source: kind === "IN" ? "TUITION" : "MANUAL", category: kind === "IN" ? "Học phí" : "Văn phòng phẩm", description: `Phiếu ${id}`, amount, method, studentName });

function seed(t: any) {
  t.state.role = "ADMIN";
  t.state.data = {
    user: { role: "ADMIN" }, students: [], classes: [], lessonSessions: [], teachers: [],
    settings: { branches: [] },
    finance: { debts: [], recon: [], reconEntries: [], payroll: [], forecasts: [], sepay: {}, cashbook: [
      entry("a", "2026-10-24", "IN", "Tiền mặt", 500_000, "Mai Chi"),
      entry("b", "2026-10-24", "IN", "Chuyển khoản", 1_600_000, "Thảo Nhiên"),
      entry("c", "2026-10-24", "OUT", "Tiền mặt", 120_000),
      entry("d", "2026-10-24", "OUT", "Chuyển khoản", 300_000),
      entry("e", "2026-10-23", "IN", "Chuyển khoản", 900_000, "Gia Phú"),
    ] },
  };
}

test("báo cáo thu chi theo bộ lọc: tách thu/chi tiền mặt, chuyển khoản", () => {
  const t = loadApp();
  seed(t);
  t.state.cashFrom = "2026-10-24";
  t.state.cashTo = "2026-10-24";
  const data = t.cashbookReportData(new Date(2026, 9, 25, 21, 5));
  assert.equal(data.period, "Ngày 24/10/2026");
  assert.deepEqual({ ...data.sums }, { inCash: 500_000, inTransfer: 1_600_000, outCash: 120_000, outTransfer: 300_000 });
  assert.equal(data.lines.length, 4);
  assert.equal(data.fileName, "bao-cao-thu-chi-2026-10-24.pdf");
  assert.ok(t.cashbookPage().includes("data-cash-export"));

  t.state.cashFrom = "2026-10-23";
  t.state.cashQuery = "gia phu";
  const searched = t.cashbookReportData(new Date(2026, 9, 25));
  assert.equal(searched.lines.length, 1);
  assert.match(searched.filters, /Tìm kiếm/);
  assert.equal(searched.period, "Từ ngày 23/10/2026 đến ngày 24/10/2026");
});

test("PDF báo cáo: A4 ngang, nhiều trang khi bảng kê dài, tên file theo kỳ", async () => {
  const t = loadApp();
  seed(t);
  const data = JSON.parse(JSON.stringify(t.cashbookReportData(new Date(2026, 9, 25))));
  data.lines = Array.from({ length: 80 }, (_, i) => ({ ...data.lines[i % data.lines.length], description: "Thu học phí Khóa kế tiếp 24 buổi · Khóa 2 · S41 2020 CAMBRIDGE STARTERS nhóm chiều" }));
  const input = cleanCashbookReportInput(data);
  const fonts = {
    regular: fs.readFileSync(new URL("../cloudflare/public/fonts/Roboto-Regular.ttf", import.meta.url)).buffer as ArrayBuffer,
    medium: fs.readFileSync(new URL("../cloudflare/public/fonts/Roboto-Medium.ttf", import.meta.url)).buffer as ArrayBuffer,
  };
  const bytes = await buildCashbookReportPdf(fonts, { ...input, logoPng: new Uint8Array(fs.readFileSync(new URL("../cloudflare/public/steps-wordmark.png", import.meta.url))) });
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3);
  const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
  assert.ok(w > h, "A4 ngang");
  assert.equal(cashbookReportDownloadName("Từ ngày 23/10/2026 đến ngày 24/10/2026"), "bao-cao-thu-chi-2026-10-23_2026-10-24.pdf");
  assert.equal(cashbookReportDownloadName("Ngày 24/10/2026"), "bao-cao-thu-chi-2026-10-24.pdf");
});
