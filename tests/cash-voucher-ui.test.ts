import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadCashVoucher() {
  let written = "";
  const popup = {
    document: {
      open: () => {},
      write: (value: string) => { written += value; },
      close: () => {},
    },
  };
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__cashVoucherTest = { state, cashbookPage, cashVoucherNumber, openCashVoucher };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {}, open: () => popup },
    location: { pathname: "/ke-toan/thu-chi" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  const api = (context as typeof context & {
    __cashVoucherTest: {
      state: Record<string, any>;
      cashbookPage: () => string;
      cashVoucherNumber: (row: any) => string;
      openCashVoucher: (id: string) => void;
    };
  }).__cashVoucherTest;
  return { api, getWritten: () => written, resetWritten: () => { written = ""; } };
}

test("cashbook adds voucher and delete columns after amount for both income and expense", () => {
  const { api } = loadCashVoucher();
  api.state.data = {
    finance: {
      debts: [],
      recon: [],
      payroll: [],
      cashbook: [
        { id: "cash-income-1", date: "2026-09-09", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí tháng 09/2026", amount: 450_000, method: "Chuyển khoản", studentName: "Khánh An" },
        { id: "cash-expense-1", date: "2026-09-09", kind: "OUT", source: "MANUAL", category: "Văn phòng phẩm", description: "Mua giấy in", amount: 320_000, method: "Tiền mặt" },
      ],
    },
  };
  api.state.cashKind = "";
  api.state.cashFrom = "";
  api.state.cashTo = "";
  api.state.cashMethod = "";
  api.state.cashBranch = "";

  const html = api.cashbookPage();
  assert.match(html, /<th>Số tiền<\/th><th>Chứng từ<\/th><th class="settings-actions-cell">Xóa<\/th>/);
  assert.match(html, /data-cash-voucher="cash-income-1">Phiếu thu<\/button>/);
  assert.match(html, /data-cash-voucher="cash-expense-1">Phiếu chi<\/button>/);
  assert.match(html, /data-cash-delete="cash-income-1" title="Xóa phiếu thu"/);
  assert.match(html, /data-cash-delete="cash-expense-1" title="Xóa phiếu chi"/);
  assert.match(api.cashVoucherNumber(api.state.data.finance.cashbook[0]), /^PT-20260909-/);
  assert.match(api.cashVoucherNumber(api.state.data.finance.cashbook[1]), /^PC-20260909-/);
  assert.match(html, /<span>Từ ngày<\/span>/);
  assert.match(html, /<span>Đến ngày<\/span>/);
  assert.match(html, /<option value="CASH"[^>]*>Tiền mặt<\/option>/);
  assert.match(html, /<option value="TRANSFER"[^>]*>Chuyển khoản<\/option>/);
  assert.match(html, /<span>Chi nhánh<\/span>/);
  assert.match(html, /class="primary-btn cashbook-add-btn"[^>]*data-cash-add/);
  assert.match(html, /class="cashbook-table"/);
  assert.match(html, /class="cashbook-filter-bar"/);
  assert.match(html, /class="cash-description-cell"[^>]*>Thu học phí tháng 09\/2026 · Khánh An<\/td>/);
  assert.doesNotMatch(html, /people-subline/);
  assert.doesNotMatch(html, /class="class-summary-grid"/);
  assert.doesNotMatch(html, /<h2>Nhật ký thu chi/);
  assert.doesNotMatch(html, /Mỗi dòng là một phiếu trong ngày/);

  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.cashbook-page \.cashbook-filters\s*\{[^}]*display:\s*flex/);
  assert.match(styles, /\.admin-content:has\(\.cashbook-page\)\s*\{[^}]*display:\s*flex[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.cashbook-ledger-card\s*\{[^}]*display:\s*flex[^}]*flex:\s*1[^}]*flex-direction:\s*column/);
  assert.match(styles, /\.cashbook-ledger-card\s*>\s*\.people-table\s*\{[^}]*max-height:\s*none[^}]*flex:\s*1/);
  assert.match(styles, /\.cashbook-table \.cash-col-index\s*\{[^}]*width:\s*64px/);
  assert.match(styles, /\.cashbook-table th:not\(:last-child\), \.cashbook-table td:not\(:last-child\)\s*\{[^}]*border-right:\s*1px solid/);
});

test("cashbook combines date range, kind, and payment method filters", () => {
  const { api } = loadCashVoucher();
  api.state.data = {
    finance: {
      debts: [],
      recon: [],
      payroll: [],
      cashbook: [
        { id: "transfer-income", date: "2026-09-08", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí", amount: 450_000, method: "Chuyển khoản" },
        { id: "cash-expense", date: "2026-09-09", kind: "OUT", source: "MANUAL", category: "Văn phòng phẩm", description: "Mua giấy", amount: 320_000, method: "Tiền mặt" },
        { id: "transfer-expense", date: "2026-09-11", kind: "OUT", source: "MANUAL", category: "Điện nước", description: "Tiền điện", amount: 800_000, method: "Chuyển khoản" },
      ],
    },
  };
  api.state.cashFrom = "2026-09-09";
  api.state.cashTo = "2026-09-10";
  api.state.cashKind = "OUT";
  api.state.cashMethod = "CASH";
  api.state.cashBranch = "";

  const html = api.cashbookPage();
  assert.equal((html.match(/data-cash-voucher=/g) || []).length, 1);
  assert.match(html, /data-cash-voucher="cash-expense"/);
  assert.doesNotMatch(html, /data-cash-voucher="transfer-income"/);
  assert.doesNotMatch(html, /data-cash-voucher="transfer-expense"/);
});

test("cashbook filters tuition and manual entries by branch", () => {
  const { api } = loadCashVoucher();
  api.state.data = {
    settings: { branches: [{ id: "branch-1", name: "Chi nhánh Thành Sen" }, { id: "branch-2", name: "Chi nhánh Thạch Khê" }] },
    classes: [{ id: "class-1", branchId: "branch-1" }, { id: "class-2", branchId: "branch-2" }],
    finance: {
      debts: [],
      recon: [],
      payroll: [],
      cashbook: [
        { id: "tuition-branch-1", receiptId: "receipt-1", date: "2026-09-09", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu lớp 1", amount: 450_000, method: "Chuyển khoản" },
        { id: "manual-branch-2", branchId: "branch-2", date: "2026-09-09", kind: "OUT", source: "MANUAL", category: "Điện nước", description: "Chi lớp 2", amount: 200_000, method: "Tiền mặt" },
      ],
      sepay: {
        settings: {}, paymentOrders: [], bankTransactions: [], invoices: [], credits: [], webhookLogs: [], receivables: [], payments: [],
        receipts: [{ id: "receipt-1", classId: "class-1" }],
      },
    },
  };
  api.state.cashFrom = "";
  api.state.cashTo = "";
  api.state.cashKind = "";
  api.state.cashMethod = "";
  api.state.cashBranch = "branch-1";

  const html = api.cashbookPage();
  assert.match(html, /data-cash-voucher="tuition-branch-1"/);
  assert.doesNotMatch(html, /data-cash-voucher="manual-branch-2"/);
  assert.match(html, /value="branch-1" selected>Chi nhánh Thành Sen/);
});

test("cash vouchers in theo mẫu STEPS 01-TT / 02-TT (đầu trang, chân trang STEPS), không Quyển số / Số / Nợ / Có", () => {
  const fixture = loadCashVoucher();
  fixture.api.state.data = {
    students: [],
    finance: {
      debts: [],
      recon: [],
      payroll: [],
      cashbook: [
        { id: "cash-income-1", date: "2026-09-09", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí tháng 09/2026", amount: 450_000, method: "Chuyển khoản", studentName: "Khánh An" },
        { id: "cash-expense-1", date: "2026-09-09", kind: "OUT", source: "MANUAL", category: "Điện nước", description: "Thanh toán điện tháng 8", amount: 8_640_000, method: "Tiền mặt" },
      ],
    },
  };

  fixture.api.openCashVoucher("cash-income-1");
  const receipt = fixture.getWritten();
  assert.match(receipt, /<h1 class="title">PHIẾU THU<\/h1>/);
  assert.match(receipt, /CÔNG TY TNHH ĐẦU TƯ GIÁO DỤC STEPS/);
  assert.match(receipt, /Mẫu số: 01 - TT/);
  assert.match(receipt, /Ngày 09 tháng 09 năm 2026/);
  assert.match(receipt, /Họ tên người nộp tiền:<\/dt><dd>Khánh An/);
  assert.match(receipt, /Lý do nộp:<\/dt><dd>Thu học phí tháng 09\/2026/);
  assert.match(receipt, /450\.000 VND/);
  assert.match(receipt, /Bốn trăm năm mươi nghìn đồng\./);
  assert.match(receipt, /Người nộp tiền<\/strong><small>\(Ký, họ tên\)<\/small><span class="sign-name">Khánh An/);
  assert.match(receipt, /onclick="window\.print\(\)">In phiếu thu/);
  assert.doesNotMatch(receipt, /Quyển số|Nợ:|Có:|Số: P/);
  assert.match(receipt, /steps-wordmark-transparent\.png/);
  assert.match(receipt, /Hotline 0813\.661\.668/);
  assert.match(receipt, /<footer class="footer">/);
  assert.match(receipt, /Số phiếu thu: <b>PT-20260909-/);
  assert.doesNotMatch(receipt, /italic|<em|Kèm theo/);

  fixture.resetWritten();
  fixture.api.openCashVoucher("cash-expense-1");
  const payment = fixture.getWritten();
  assert.match(payment, /<h1 class="title">PHIẾU CHI<\/h1>/);
  assert.match(payment, /Mẫu số: 02 - TT/);
  assert.match(payment, /Họ tên người nhận tiền:/);
  assert.match(payment, /Số phiếu chi: <b>PC-20260909-/);
  assert.match(payment, /Lý do chi:<\/dt><dd>Thanh toán điện tháng 8/);
  assert.match(payment, /8\.640\.000 VND/);
  assert.match(payment, /Tám triệu sáu trăm bốn mươi nghìn đồng\./);
  assert.match(payment, /onclick="window\.print\(\)">In phiếu chi/);
  assert.doesNotMatch(payment, /Quyển số|Nợ:|Có:/);
});
