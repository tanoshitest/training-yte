import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDashboard() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__dashTest = { state, dashboardOverview, branchTuitionSummary, dashboardBranchMonth, branchTuitionMonthOptions, vnMonthKey };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/" },
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
  return (context as any).__dashTest as {
    state: Record<string, any>;
    dashboardOverview: () => string;
    branchTuitionSummary: (branchId: string, month: string) => {
      classCount: number; enrollment: number; due: number;
      receiptCount: number; receiptTotal: number; invoiceCount: number; invoiceTotal: number; remaining: number;
    };
    dashboardBranchMonth: (branchId: string) => string;
    branchTuitionMonthOptions: () => string[];
    vnMonthKey: (value: string) => string;
  };
}

function seed(dash: ReturnType<typeof loadDashboard>) {
  dash.state.data = {
    settings: { branches: [
      { id: "branch-steps-1", name: "CHI NHÁNH THÀNH SEN" },
      { id: "branch-steps-2", name: "CHI NHÁNH THẠCH KHÊ" },
    ] },
    students: [
      { id: "s1", code: "HV01", status: "STUDYING" },
      { id: "s2", code: "HV02", status: "STUDYING" },
      { id: "s3", code: "HV03", status: "STUDYING" },
      { id: "s4", code: "HV04", status: "STUDYING" },
    ],
    classes: [
      // Lớp khóa 4 buổi bắt đầu T2 3/8/2026: khóa 1 = 3,10,17,24/8 → kết thúc T8;
      // khóa 2 = 31/8,7,14,21/9 → kết thúc T9.
      { id: "cS1", code: "S1", branchId: "branch-steps-1", billingMode: "COURSE", courseSessions: 4, courseStartDate: "2026-08-03", schedules: [{ weekday: 1, startTime: "18:00", endTime: "19:30" }], studentIds: ["s1", "s2", "ghost-student"] },
      { id: "cT1", code: "T1", branchId: "branch-steps-2", billingMode: "MONTHLY", studentIds: ["s3"] },
      { id: "cT2", code: "T2", branchId: "branch-steps-2", billingMode: "MONTHLY", studentIds: ["s4"] },
      { id: "cOther", code: "X1", branchId: "branch-other", billingMode: "MONTHLY", studentIds: ["s1"] },
    ],
    finance: { sepay: {
      receivables: [
        { id: "r1", studentId: "s3", classId: "cT1", billKey: "month|cT1|2026-10", amountDue: 450000, status: "OPEN", issueDate: "2026-10-01" },
        { id: "r2", studentId: "s4", classId: "cT2", billKey: "months|cT2|2026-09,2026-10", amountDue: 900000, status: "OPEN", issueDate: "2026-10-02" },
        { id: "r3", studentId: "s3", classId: "cT1", billKey: "month|cT1|2026-09", amountDue: 450000, status: "PAID", issueDate: "2026-09-01" },
        { id: "r4", studentId: "s1", classId: "cS1", billKey: "course|cS1|2", amountDue: 1560000, status: "OPEN", issueDate: "2026-10-03" },
        { id: "r5", studentId: "s2", classId: "cS1", billKey: "course|cS1", amountDue: 1560000, status: "OPEN", issueDate: "2026-09-15" },
        { id: "r8", studentId: "s1", classId: "cS1", billKey: "course|cS1|3", amountDue: 1560000, status: "OPEN", issueDate: "2026-10-03" },
        { id: "r6", studentId: "s3", classId: "cT1", billKey: "month|cT1|2026-10|dup", amountDue: 999000, status: "CANCELLED", issueDate: "2026-10-01" },
        { id: "r7", studentId: "s1", classId: "cOther", billKey: "month|cOther|2026-10", amountDue: 700000, status: "OPEN", issueDate: "2026-10-01" },
      ],
      paymentOrders: [],
      payments: [
        { id: "p1", receivableId: "r3", amount: 450000, status: "COMPLETED" },
        { id: "p2", receivableId: "r1", amount: 450000, status: "COMPLETED" },
      ],
      receipts: [
        { id: "rc1", paymentId: "p1", studentId: "s3", classId: "cT1", amount: 450000, issuedAt: "2026-09-15T02:30:00Z" },
        { id: "rc2", paymentId: "p2", studentId: "s3", classId: "cT1", amount: 450000, issuedAt: "2026-10-05T10:00:00+07:00" },
      ],
      invoices: [
        { id: "i1", paymentId: "p1", receivableId: "r3", status: "ISSUED" },
        { id: "i2", paymentId: "p2", receivableId: "r1", status: "PENDING" },
      ],
      credits: [], bankTransactions: [], webhookLogs: [], settings: {},
    } },
  };
  return dash;
}

test("month options cover 2026-10 through 2027-12", () => {
  const dash = loadDashboard();
  const options = dash.branchTuitionMonthOptions();
  assert.equal(options.length, 15);
  assert.equal(options[0], "2026-10");
  assert.equal(options.at(-1), "2027-12");
  assert.ok(options.includes("2027-06"));
});

test("branch month defaults to current month and clamps into range", () => {
  const dash = seed(loadDashboard());
  const current = new Date();
  const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const expected = key < "2026-10" ? "2026-10" : key > "2027-12" ? "2027-12" : key;
  assert.equal(dash.dashboardBranchMonth("branch-steps-2"), expected);
  dash.state.dashTuitionMonth["branch-steps-2"] = "2026-11";
  assert.equal(dash.dashboardBranchMonth("branch-steps-2"), "2026-11");
  dash.state.dashTuitionMonth["branch-steps-2"] = "2030-01";
  assert.equal(dash.dashboardBranchMonth("branch-steps-2"), expected);
});

test("branch summary counts classes, live enrollments and monthly due correctly", () => {
  const dash = seed(loadDashboard());
  const oct = dash.branchTuitionSummary("branch-steps-2", "2026-10");
  assert.equal(oct.classCount, 2);
  assert.equal(oct.enrollment, 2);
  assert.equal(oct.due, 450000 + 900000); // r1 + phiếu gộp r2 (gộp T9+T10 tính vào T10)
  assert.equal(oct.receiptCount, 1);      // rc2 phát hành T10
  assert.equal(oct.receiptTotal, 450000);
  // Đã xuất HĐ = dòng doanh số ISSUED của chi nhánh (mọi kỳ từ 09/2026): s4 ở lớp T2 tháng 9 +
  // tháng 10 (T1–T5 đã xuất ngoài hệ thống) và rc1 tháng 9 (i1 đã xuất). i2 chỉ PENDING.
  assert.equal(oct.invoiceCount, 3);
  assert.equal(oct.invoiceTotal, 4);      // s3 T9 (rc1) + T10 (rc2) + s4 phiếu gộp tách T9, T10
  assert.equal(oct.remaining, 1350000 - 450000);

  const sep = dash.branchTuitionSummary("branch-steps-2", "2026-09");
  assert.equal(sep.due, 450000 + 900000); // r3 (month|2026-09) + r2 (gộp có 2026-09)
  assert.equal(sep.receiptCount, 1);
  assert.equal(sep.invoiceCount, 3);      // không phụ thuộc tháng — vẫn s4 (T2) đã xuất ngoài
});

test("course receivables are attributed by previous-course end month; phantom links excluded", () => {
  const dash = seed(loadDashboard());
  const aug = dash.branchTuitionSummary("branch-steps-1", "2026-08");
  assert.equal(aug.classCount, 1);
  assert.equal(aug.enrollment, 2); // s1 + s2, "ghost-student" bị loại
  // Khóa 1 kết thúc 24/8 → phiếu khóa 1 (r5, khai giảng T8) và phiếu khóa 2 (r4) đều đến hạn T8.
  assert.equal(aug.due, 1560000 + 1560000);
  // Khóa 2 kết thúc 21/9 → phiếu khóa 3 (r8) đến hạn T9.
  const sep = dash.branchTuitionSummary("branch-steps-1", "2026-09");
  assert.equal(sep.due, 1560000);
  // Phiếu phát hành sớm T10 nhưng không xếp vào T10.
  const oct = dash.branchTuitionSummary("branch-steps-1", "2026-10");
  assert.equal(oct.due, 0);
});

test("vnMonthKey converts UTC timestamps to VN month", () => {
  const dash = loadDashboard();
  assert.equal(dash.vnMonthKey("2026-09-30T18:30:00Z"), "2026-10"); // 01:30 ngày 1/10 giờ VN
  assert.equal(dash.vnMonthKey("2026-10-05T10:00:00+07:00"), "2026-10");
  assert.equal(dash.vnMonthKey("2026-11-01"), "2026-11");
  assert.equal(dash.vnMonthKey(""), "");
});

test("overview renders two branch cards with titles and month filters", () => {
  const dash = seed(loadDashboard());
  const html = dash.dashboardOverview();
  assert.match(html, /dashboard-branch-grid/);
  assert.match(html, /Học phí chi nhánh Thành Sen/);
  assert.match(html, /Học phí chi nhánh Thạch Khê/);
  assert.equal((html.match(/data-branch-tuition-month=/g) || []).length, 2);
  assert.ok(!html.includes("Số lượng học viên theo loại lớp"));
  for (const label of ["Số lớp", "Tổng sĩ số", "Công nợ phải thu tháng này", "Đã thu", "Đã xuất hoá đơn", "Còn lại"]) {
    assert.ok(html.includes(label), `missing ${label}`);
  }
});
