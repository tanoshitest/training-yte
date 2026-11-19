import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadInvoicesPage() {
  const exported: { blob?: Blob; name?: string } = {};
  const toastStub = { textContent: "", classList: { add: () => {}, remove: () => {} } };
  const TestURL = class extends URL {
    static createObjectURL(blob: Blob) { exported.blob = blob; return "blob:test"; }
    static revokeObjectURL() {}
  };
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__invoiceTest = { state, invoicesPage, invoiceQueueRows, invoiceRowStage, invoiceVisibleRows, exportSalesMisaExcel, tuitionCollectionQuote };\n");
  // Hôm nay cố định 23/10/2026 — doanh số chỉ hiện kỳ đã phát sinh tới hôm nay.
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 9, 23, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 9, 23, 12).getTime(); }
  };
  const context = vm.createContext({
    console,
    Blob,
    document: {
      querySelector: (sel: string) => (sel === "#toast" ? toastStub : null),
      querySelectorAll: () => [],
      createElement: () => {
        const el = { href: "", download: "", click: () => {} };
        exported.name = undefined;
        Object.defineProperty(el, "download", { set: (v: string) => { exported.name = v; }, get: () => exported.name });
        return el;
      },
      body: { appendChild: () => {} },
    },
    window: { addEventListener: () => {}, open: () => null },
    location: { pathname: "/ke-toan/hoa-don" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date: FixedDate,
    URL: TestURL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  const exposed = (context as typeof context & {
    __invoiceTest: {
      state: Record<string, any>;
      invoicesPage: () => string;
      invoiceQueueRows: () => any[];
      invoiceRowStage: (row: any) => string;
      invoiceVisibleRows: () => { visible: any[] };
      exportSalesMisaExcel: () => void;
    };
  }).__invoiceTest;
  return Object.assign(exposed, { exported, toast: toastStub });
}

function seed(ui: ReturnType<typeof loadInvoicesPage>, options: { invoices?: any[]; classCode?: string; branchId?: string } = {}) {
  const classCode = options.classCode || "S1";
  const branchId = options.branchId ?? "b2";
  ui.state.invoiceBranch = "";
  ui.state.invoiceClass = "";
  ui.state.invoiceMonth = "";
  ui.state.data = {
    students: [
      { id: "student-1", code: "HV0730", fullName: "Hạ An", parentName: "Trần Thị Mẹ" },
      { id: "student-2", code: "HV0731", fullName: "Bảo Nam" },
    ],
    classes: [{ id: "class-1", code: classCode, name: `${classCode}-9.1-2012`, billingMode: "MONTHLY", sessionPrice: 65_000, branchId }],
    settings: { branches: [{ id: "b1", name: "CHI NHÁNH THÀNH SEN" }, { id: "b2", name: "CHI NHÁNH THẠCH KHÊ" }] },
    finance: {
      sepay: {
        settings: {},
        receivables: [{ id: "recv-1", studentId: "student-2", studentName: "Bảo Nam", billKey: "month|class-1|2026-10", billingPeriod: `Tháng 10/2026 · ${classCode}-9.1-2012`, classId: "class-1", amountDue: 455_000, amountPaid: 455_000, balanceDue: 0, status: "PAID" }],
        paymentOrders: [],
        bankTransactions: [],
        payments: [{ id: "pay-1", receivableId: "recv-1", allocatedAmount: 455_000, status: "PAID" }],
        receipts: [
          {
            id: "rcpt-1",
            receiptNumber: "PT-202609-000001",
            paymentId: "pay-manual",
            studentId: "student-1",
            studentName: "Hạ An",
            studentCode: "HV0730",
            amount: 515_000,
            issuedAt: "2026-10-17T04:10:00.000Z",
            status: "ISSUED",
            classId: "class-1",
            className: `${classCode}-9.1-2012`,
            billingPeriod: `Tháng 10/2026 · ${classCode}-9.1-2012`,
            billingMode: "MONTHLY",
          },
          {
            id: "rcpt-2",
            receiptNumber: "PT-202608-000009",
            paymentId: "pay-1",
            studentId: "student-2",
            studentName: "Bảo Nam",
            amount: 455_000,
            issuedAt: "2026-10-12T04:10:00.000Z",
            status: "ISSUED",
          },
        ],
        invoices: options.invoices || [],
        credits: [],
        webhookLogs: [],
      },
    },
  };
}

test("trang Quản lý doanh số: không còn chip lọc, nút xuất từng dòng, Import Misa hay lọc trạng thái", () => {
  const ui = loadInvoicesPage();
  seed(ui);
  const html = ui.invoicesPage();
  assert.match(html, /<h1>Quản lý doanh số<\/h1>/);
  assert.match(html, /<h2>Doanh số Thạch Khê \(2\)<\/h2>/);
  assert.doesNotMatch(html, /data-invoice-filter|invoice-filter-chip/, "đã bỏ chip Tất cả / Chưa có HĐ / Đang xuất…");
  assert.doesNotMatch(html, /data-einvoice-issue|einvoice-issue-form/, "đã bỏ nút xuất hóa đơn từng dòng và modal");
  assert.doesNotMatch(html, /data-misa-import|data-invoice-select/, "MISA tự lấy qua API — không còn nút import và tick chọn");
  assert.doesNotMatch(html, /data-invoice-status|data-invoice-misa/, "đã bỏ 2 bộ lọc trạng thái");
  assert.match(html, /data-invoice-export/, "có nút Export placeholder");
});

test("bảng 8 cột: STT, PT, Ngày thu, Học sinh, Nội dung, Số tiền, Trạng thái HĐ, Tải hóa đơn", () => {
  const ui = loadInvoicesPage();
  seed(ui);
  const html = ui.invoicesPage();
  for (const col of ["<th>STT</th>", "<th>PT</th>", "<th>Ngày thu</th>", "<th>Học sinh</th>", "<th>Nội dung</th>", "<th>Số tiền</th>", "<th>Trạng thái HĐ</th>"]) {
    assert.match(html, new RegExp(col.replace(/[<>/]/g, (c) => `\\${c}`)), `thiếu cột ${col}`);
  }
  assert.match(html, /Tải hóa đơn<\/th>/);
  assert.doesNotMatch(html, /<th>Người mua<\/th>|<th>Trạng thái MISA<\/th>|<th>Chứng từ Misa<\/th>/, "đã gỡ cột người mua và 2 cột MISA");
  assert.match(html, /PT-202609-000001/);
  assert.match(html, /PT-202608-000009/);
});

test("hóa đơn ISSUED: badge đã xuất + nút tải PDF thật", () => {
  const ui = loadInvoicesPage();
  seed(ui, { invoices: [{ id: "inv-1", paymentId: "pay-1", receivableId: "recv-1", status: "ISSUED", invoiceNumber: "0000123", invoiceSeries: "1C26TYY", amount: 455_000, buyerName: "Bảo Nam", retryCount: 0, createdAt: "2026-10-12T04:20:00.000Z" }] });
  const html = ui.invoicesPage();
  assert.match(html, /Đã xuất hóa đơn<\/span>/);
  assert.match(html, /data-einvoice-pdf="inv-1"/);
});

test("hóa đơn FAILED: trạng thái HĐ báo lỗi chờ xuất lại", () => {
  const ui = loadInvoicesPage();
  seed(ui, { invoices: [{ id: "inv-1", paymentId: "pay-1", receivableId: "recv-1", status: "FAILED", amount: 455_000, buyerName: "Bảo Nam", retryCount: 1, lastError: "UNAUTHORIZED: token hết hạn", createdAt: "2026-10-12T04:20:00.000Z" }] });
  const html = ui.invoicesPage();
  assert.match(html, /Lỗi — chờ xuất lại<\/span>/);
});

test("lớp T1–T5 đã xuất ngoài: badge đã xuất, nút tải tĩnh không thao tác", () => {
  const ui = loadInvoicesPage();
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.match(source, /INVOICE_ROSTER_ISSUED_CLASSES = new Set\(\["T1", "T2", "T3", "T4", "T5"\]\)/);
  seed(ui, { classCode: "T1", branchId: "b2" });
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.finance.sepay.receipts = [];
  ui.state.data.finance.sepay.receivables = [{ id: "recv-9", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billingPeriod: "Tháng 10/2026", amountDue: 500_000, issueDate: "2026-10-01", status: "OPEN" }];
  const rows = ui.invoiceQueueRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rosterIssued, true);
  const html = ui.invoicesPage();
  assert.match(html, /Đã xuất hóa đơn<\/span>/);
  assert.match(html, /disabled title="Hóa đơn đã xuất ngoài hệ thống/, "nút tải tĩnh vì chưa kết nối");
  assert.doesNotMatch(html, /data-einvoice-pdf/, "không có hóa đơn thật nên không có nút tải thật");
});

test("phiếu tháng sau lập sẵn không phải doanh số tháng này — kể cả đã gửi yêu cầu", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.finance.sepay.receipts = [];
  ui.state.data.finance.sepay.receivables = [
    { id: "r-oct", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "month|class-1|2026-10", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 520_000, balanceDue: 520_000, issueDate: "2026-10-01", status: "OPEN" },
    { id: "r-nov", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "month|class-1|2026-11", billingPeriod: "Tháng 11/2026 · T9-9.1-2012", amountDue: 585_000, balanceDue: 585_000, issueDate: "2026-10-06", status: "OPEN", frozenAt: "2026-10-06" },
  ];
  const rows = ui.invoiceQueueRows();
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /Tháng 10\/2026/);
  assert.equal(rows[0].amount, 520_000, "số tiền theo phiếu T10");
  ui.state.data.finance.sepay.receivables[0].status = "PAID";
  ui.state.data.finance.sepay.receivables[0].amountPaid = 520_000;
  ui.state.data.finance.sepay.receivables[0].balanceDue = 0;
  assert.equal(ui.invoiceQueueRows().filter((row) => !row.receipt && row.amount > 0).length, 0, "T10 đã tất toán; T11 chưa tới tháng — không lên dòng");
});

test("phiếu gộp T9+T10: tháng 10 chỉ lấy phần của tháng 10; có dòng tổng kết", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.classes[0].schedules = [{ weekday: 3, startTime: "18:00", endTime: "19:30" }];
  ui.state.data.finance.sepay.receipts = [];
  ui.state.data.finance.sepay.receivables = [
    { id: "r-old", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "months|class-1|2026-09,2026-10", billingPeriod: "Tháng 09/2026 + Tháng 10/2026 · T9-9.1-2012", amountDue: 1_100_000, balanceDue: 1_100_000, issueDate: "2026-09-28", status: "OPEN", frozenAt: "2026-09-28" },
  ];
  const rows = ui.invoiceQueueRows();
  assert.equal(rows.length, 2, "phần tháng 9 là dòng doanh số tháng 9, phần tháng 10 là dòng tháng 10");
  const oct = rows.find((row: any) => /Tháng 10\/2026/.test(row.detail));
  const sep = rows.find((row: any) => /Tháng 09\/2026/.test(row.detail));
  assert.ok(oct.amount > 0 && oct.amount < 1_100_000);
  assert.equal(oct.amount + sep.amount, 1_100_000);
  const html = ui.invoicesPage();
  for (const label of ["Tổng doanh số", "Giảm doanh số", "Doanh số thuần", "Đã thu", "Chưa thu"]) assert.match(html, new RegExp(`<strong>${label}</strong>`));
});

test("kỳ đã thu một phần: dòng biên lai + dòng Chưa thu phần còn lại", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.classes[0].studentIds = ["student-1"];
  const sepay = ui.state.data.finance.sepay;
  sepay.receivables.push({ id: "r-oct", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "month|class-1|2026-10", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 715_000, amountPaid: 515_000, balanceDue: 200_000, issueDate: "2026-10-01", status: "PARTIALLY_PAID" });
  sepay.payments.push({ id: "pay-manual", receivableId: "r-oct", allocatedAmount: 515_000, status: "COMPLETED" });
  const rows = ui.invoiceQueueRows().filter((row) => row.studentId === "student-1");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => [row.receipt?.receiptNumber || "Chưa thu", row.amount]))), [["PT-202609-000001", 515_000], ["Chưa thu", 200_000]]);
});

test("học viên miễn học phí vẫn là dòng doanh số thường: chưa xuất HĐ, số tiền 0đ", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.students[0].tuitionExempt = true;
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.finance.sepay.receipts = [];
  const html = ui.invoicesPage();
  assert.match(html, /Hạ An/);
  assert.match(html, /Chưa xuất hóa đơn<\/span>/, "miễn phí vẫn hiện trạng thái hóa đơn bình thường");
  assert.doesNotMatch(html, /Miễn học phí/, "không còn badge miễn học phí riêng");
  assert.match(html, /<td>0\s*₫<\/td>/, "cột số tiền hiện 0đ");
});

test("học viên miễn học phí có phiếu còn mở: dòng doanh số vẫn hiện 0đ, không đếm Chưa thu", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.students[0].tuitionExempt = true;
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.classes[0].schedules = [{ weekday: 3, startTime: "18:00", endTime: "19:30" }];
  ui.state.data.finance.sepay.receipts = [];
  // Phiếu T10 lập trước khi tick miễn vẫn OPEN — không được cộng vào Chưa thu.
  ui.state.data.finance.sepay.receivables = [
    { id: "r-oct", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "month|class-1|2026-10", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 720_000, balanceDue: 720_000, issueDate: "2026-10-01", status: "OPEN" },
  ];
  const rows = ui.invoiceQueueRows();
  assert.equal(rows.length, 1, "miễn phí vẫn hiện dòng cho đủ sĩ số");
  assert.equal(rows[0].amount, 0, "số tiền 0đ dù phiếu OPEN 720k");
  const html = ui.invoicesPage();
  const dueRow = html.match(/Chưa thu<\/strong><\/td><td><\/td><td class="tabular"><strong>([^<]*)<\/strong>/)?.[1] || "";
  assert.match(dueRow.replace(/[.\s]/g, ""), /^0/, "tổng Chưa thu = 0 — khớp công nợ");
});

test("phiếu đã tất toán (PAID) không còn lên dòng Chưa thu — kể cả tất toán không qua biên lai", () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9", branchId: "b2" });
  ui.state.data.classes[0].studentIds = ["student-1"];
  ui.state.data.finance.sepay.receipts = [];
  ui.state.data.finance.sepay.receivables = [
    { id: "r-oct", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billKey: "month|class-1|2026-10", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 520_000, balanceDue: 0, amountPaid: 520_000, issueDate: "2026-10-01", status: "PAID", frozenAt: "2026-10-01" },
  ];
  assert.equal(ui.invoiceQueueRows().filter((row) => !row.receipt && row.amount > 0).length, 0);
  ui.state.data.finance.sepay.receivables[0].status = "PARTIALLY_PAID";
  ui.state.data.finance.sepay.receivables[0].amountPaid = 320_000;
  ui.state.data.finance.sepay.receivables[0].balanceDue = 200_000;
  const partial = ui.invoiceQueueRows().filter((row) => !row.receipt);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].amount, 200_000, "chỉ phần còn lại");
});

test("bộ lọc chi nhánh: mặc định Thạch Khê, chọn ALL hoặc chi nhánh khác đổi đúng danh sách và tiêu đề", () => {
  const ui = loadInvoicesPage();
  seed(ui);
  // Thêm một lớp Thành Sen với 1 học viên để kiểm tra lọc chi nhánh.
  ui.state.data.students.push({ id: "student-3", code: "HV0001", fullName: "Sen Nhỏ" });
  ui.state.data.classes.push({ id: "class-2", code: "S9", name: "S9-x", billingMode: "MONTHLY", branchId: "b1", studentIds: ["student-3"] });
  ui.state.data.finance.sepay.receivables.push({ id: "recv-2", studentId: "student-3", studentName: "Sen Nhỏ", classId: "class-2", billKey: "month|class-2|2026-10", billingPeriod: "Tháng 10/2026", amountDue: 1_560_000, issueDate: "2026-10-02", status: "OPEN" });

  let html = ui.invoicesPage();
  assert.match(html, /Doanh số Thạch Khê/, "mặc định là chi nhánh Thạch Khê");
  assert.doesNotMatch(html, /HV0001/, "học viên Thành Sen không lẫn vào");
  assert.match(html, /data-invoice-branch/);
  const branchSel = html.match(/<select[^>]*data-invoice-branch[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  assert.match(branchSel, /Tất cả chi nhánh/);
  assert.match(branchSel, /Thành Sen/);
  assert.match(branchSel, /Thạch Khê/);

  ui.state.invoiceBranch = "b1";
  html = ui.invoicesPage();
  assert.match(html, /Doanh số Thành Sen/);
  assert.match(html, /HV0001/);
  assert.doesNotMatch(html, /PT-202609-000001/, "phiếu thu Thạch Khê bị lọc bỏ");
  const classSel = html.match(/<select[^>]*data-invoice-class[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  assert.match(classSel, /S9/);
  assert.doesNotMatch(classSel, /T1-9\.1/, "lọc lớp chỉ còn lớp của chi nhánh đang chọn");

  ui.state.invoiceBranch = "ALL";
  html = ui.invoicesPage();
  assert.match(html, /Doanh số tất cả chi nhánh/);
  assert.match(html, /HV0001/);
  assert.match(html, /PT-202609-000001/, "ALL hiện cả hai chi nhánh");
});

test("bộ lọc lớp và lọc tháng: chỉ từ 09/2026 tới tháng hiện tại", () => {
  const ui = loadInvoicesPage();
  seed(ui);
  const html = ui.invoicesPage();
  assert.match(html, /data-invoice-class/);
  assert.match(html, /data-invoice-month/);
  assert.doesNotMatch(html, /data-invoice-date/, "đã thay lọc ngày bằng lọc tháng");
  const monthSel = html.match(/<select[^>]*data-invoice-month[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  assert.match(monthSel, /Tất cả kỳ/);
  assert.match(monthSel, /Tháng 09\/2026/, "tháng đầu tiên");
  assert.match(monthSel, /Tháng 10\/2026/);
  assert.doesNotMatch(monthSel, /Tháng 11\/2026|Tháng 0?8\/2026/, "tháng chưa tới / trước khi dùng hệ thống không có");
  ui.state.invoiceMonth = "2026-10";
  const oct = ui.invoicesPage();
  assert.match(oct, /PT-202609-000001/);
  assert.match(oct, /PT-202608-000009/);
  assert.match(oct, /Doanh số Thạch Khê \(2\)/);
});

test("cột học sinh hiện tên học viên kèm mã, không hiện tên phụ huynh", () => {
  const ui = loadInvoicesPage();
  seed(ui);
  const html = ui.invoicesPage();
  assert.match(html, /Hạ An · HV0730|Hạ An<span class="muted"> · HV0730<\/span>/);
  assert.match(html, /Bảo Nam/);
  assert.doesNotMatch(html, /Trần Thị Mẹ/, "không hiện tên phụ huynh ở cột học sinh");
});

test("hồ sơ học viên ghi nhãn CCCD / MST phụ huynh (số của người đóng tiền)", () => {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.match(source, /<span>CCCD \/ MST phụ huynh<\/span><input class="input" name="nationalId"/);
});

function parseSalesExport(html: string) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  return rows.map((tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()));
}

test("Export xuất đúng file mẫu MISA: 34 cột, mỗi học viên một chứng từ, tôn trọng bộ lọc", async () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T9" });
  const sepay = ui.state.data.finance.sepay;
  ui.state.data.students.push({ id: "student-3", code: "HV0732", fullName: "Nghi Dung", tuitionExempt: true });
  ui.state.data.classes[0].studentIds = ["student-1", "student-2", "student-3"];
  ui.state.data.classes[0].schedules = [{ weekday: 3, startTime: "18:00", endTime: "19:30" }];
  sepay.receipts = [];
  sepay.receivables = [
    { id: "r1", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 300_000, issueDate: "2026-10-01", status: "OPEN" },
    { id: "r2", studentId: "student-2", studentName: "Bảo Nam", classId: "class-1", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 455_000, issueDate: "2026-10-01", status: "OPEN" },
    { id: "r3", studentId: "student-3", studentName: "Nghi Dung", classId: "class-1", billingPeriod: "Tháng 10/2026 · T9-9.1-2012", amountDue: 0, issueDate: "2026-10-01", status: "OPEN" },
  ];
  sepay.invoices = [{ id: "inv-1", receivableId: "r2", status: "ISSUED", invoiceNumber: "0000123", invoiceSeries: "1C26TYY", amount: 455_000, createdAt: "2026-10-12T04:20:00.000Z" }];

  ui.exportSalesMisaExcel();
  assert.ok(ui.exported.blob, "phải tạo file tải về");
  const grid = parseSalesExport(await ui.exported.blob.text());
  const [headers, ...data] = grid;
  assert.equal(headers.length, 34, "đủ 34 cột A→AH như file mẫu");
  assert.equal(headers[6], "Ngày hạch toán (*)");
  assert.equal(headers[19], "Mã hàng");
  assert.equal(headers[33], "Hình thức thanh toán");
  assert.equal(data.length, 3);
  assert.match(ui.exported.name || "", /\.xls$/);

  const today = `${String(new Date().getDate()).padStart(2, "0")}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
  const [r1, r2, r3] = data;
  // Cột cố định theo file mẫu.
  assert.deepEqual([r1[0], r1[1], r1[2], r1[3], r1[4]], ["Bán hàng hóa trong nước", "Chưa thu tiền", "Không", "Có", "Không"]);
  assert.equal(r1[5], "Chưa lập", "chưa xuất HĐ → Chưa lập");
  assert.equal(r1[6], today, "ngày hạch toán = hôm nay");
  assert.equal(r1[7], today);
  assert.equal(r1[13], today);
  assert.equal(r1[10], "1");
  assert.equal(r1[11], "1C26TST");
  assert.equal(r1[14], "HV0730", "mã KH = mã HV");
  assert.equal(r1[15], "Trần Thị Mẹ", "tên KH = tên phụ huynh");
  assert.equal(r1[18], "Nộp học phí cho bạn Hạ An - Lớp T9 - Tháng 10/2026");
  assert.equal(r1[19], "TKT9", "mã hàng = chữ đầu chi nhánh + mã lớp");
  assert.equal(r1[20], "Lớp T9");
  assert.equal(r1[23], "131");
  assert.equal(r1[24], "3387CN");
  assert.equal(r1[26], "1");
  assert.equal(r1[27], "300000", "đơn giá = số tiền dòng doanh số (phiếu tháng 10)");
  assert.equal(r1[28], "300000", "thành tiền = SL × đơn giá");
  assert.equal(r1[29], "KCT");
  assert.equal(r1[30], "0");
  assert.equal(r1[31], "33311");
  assert.equal(r1[32], "Không");
  assert.equal(r1[33], "TM/CK");

  // Đã xuất thật → Đã lập + số hóa đơn; mỗi dòng một số chứng từ riêng.
  assert.equal(r2[5], "Đã lập");
  assert.equal(r2[12], "0000123");
  assert.equal(r2[15], "Chưa có TT Phụ Huynh", "thiếu phụ huynh → text chuẩn");
  assert.notEqual(r1[8], r2[8], "số chứng từ phải duy nhất mỗi dòng");
  assert.match(r1[8], /^BHHV0730$/);
  assert.match(r2[8], /^BHHV0731$/);

  // Học viên miễn phí: hóa đơn 0đ — không còn cột chiết khấu trong mẫu mới.
  assert.equal(r3[27], "0");
  assert.equal(r3[28], "0");
  assert.equal(r3[5], "Chưa lập");

  // Bộ lọc lớp quyết định dòng nào được xuất — lọc lớp không có dòng nào thì chỉ báo toast, không xuất file.
  ui.state.invoiceClass = "class-khac";
  ui.exported.blob = undefined;
  ui.exportSalesMisaExcel();
  assert.equal(ui.exported.blob, undefined, "không có dòng khớp lọc thì không xuất file");
  assert.match(ui.toast.textContent, /Không có dòng doanh số nào/);
  ui.state.invoiceClass = "class-1";
  ui.exportSalesMisaExcel();
  const filtered = parseSalesExport(await ui.exported.blob!.text());
  assert.equal(filtered.length, 4, "lọc lại đúng lớp → đủ 3 dòng + header");
});

test("Export: lớp T1–T5 đã xuất ngoài vẫn ra cột Đã lập hóa đơn", async () => {
  const ui = loadInvoicesPage();
  seed(ui, { classCode: "T1" });
  const sepay = ui.state.data.finance.sepay;
  ui.state.data.classes[0].studentIds = ["student-1"];
  sepay.receipts = [];
  sepay.receivables = [{ id: "r1", studentId: "student-1", studentName: "Hạ An", classId: "class-1", billingPeriod: "Tháng 10/2026 · T1-9.1-2012", amountDue: 500_000, issueDate: "2026-10-01", status: "OPEN" }];

  ui.exportSalesMisaExcel();
  const grid = parseSalesExport(await ui.exported.blob!.text());
  const row = grid[1];
  assert.equal(row[5], "Đã lập", "roster-issued T1–T5 → Đã lập hóa đơn");
  assert.equal(row[12], "", "không có số HĐ trong hệ thống thì để trống");
});
