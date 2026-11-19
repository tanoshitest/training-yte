import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Quản lý doanh số = doanh số PHÁT SINH theo tháng (chốt với trung tâm 23/10/2026):
 * lớp tháng → học phí tháng M thuộc tháng M; lớp khóa → khóa k thuộc tháng có buổi 1;
 * giảm doanh số (nghỉ học, chuyển lớp) thuộc tháng xảy ra; kỳ chưa phát sinh không hiện.
 * Hôm nay cố định 23/10/2026.
 */
function load() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, invoiceQueueRows, invoiceVisibleRows, invoicesPage, invoiceMonthChoices, classNewCourseThisMonth, dashboardScheduleTab };\n");
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 9, 23, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 9, 23, 12).getTime(); }
  };
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/hoa-don" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date: FixedDate, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  const t = (context as any).__t;
  t.state.invoiceBranch = "ALL";
  t.state.invoiceClass = "";
  t.state.invoiceScope = "ALL";
  return t;
}

const emptyLedger = () => ({ settings: {}, receivables: [] as any[], paymentOrders: [], bankTransactions: [], payments: [] as any[], receipts: [] as any[], invoices: [], credits: [], webhookLogs: [] });
const receivable = (id: string, studentId: string, classId: string, billKey: string, amountDue: number, paid = 0, extra: Record<string, unknown> = {}) => ({
  id, studentId, studentName: studentId, classId, billKey, billingPeriod: billKey, amountDue, amountPaid: paid, balanceDue: amountDue - paid,
  status: paid >= amountDue ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN", issueDate: "2026-10-01", ...extra,
});
function pay(ledger: any, id: string, receivableId: string, studentId: string, amount: number, issuedAt: string, status = "ISSUED") {
  ledger.payments.push({ id: `pay-${id}`, receivableId, studentId, amount, allocatedAmount: amount, status: "COMPLETED", paidAt: issuedAt });
  ledger.receipts.push({ id: `rc-${id}`, receiptNumber: `PT-${id}`, paymentId: `pay-${id}`, studentId, amount, issuedAt, status });
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const sum = (rows: any[]) => rows.reduce((total, row) => total + row.amount, 0);
const visible = (t: any, month: string) => { t.state.invoiceMonth = month; return t.invoiceVisibleRows().visible; };

test("lọc tháng chỉ có từ 09/2026 tới tháng hiện tại — tháng sau chưa phát sinh không chọn được", () => {
  const t = load();
  assert.deepEqual(plain(t.invoiceMonthChoices()), ["2026-09", "2026-10"]);
});

test("lớp tháng: tiền tháng 9 thu trong tháng 10 không thuộc tháng 10; phiếu tháng 11 lập sẵn không hiện", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("sep", "a", "m1", "month|m1|2026-09", 500_000, 500_000),
    receivable("oct", "a", "m1", "month|m1|2026-10", 520_000),
    receivable("nov", "a", "m1", "month|m1|2026-11", 450_000),
  );
  pay(ledger, "sep", "sep", "a", 500_000, "2026-10-05T03:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }],
    classes: [{ id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] }],
    lessonSessions: [], settings: { branches: [{ id: "b", name: "CN" }] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  assert.equal(rows.length, 1, "chỉ dòng học phí Tháng 10");
  assert.match(rows[0].detail, /Tháng 10\/2026/);
  assert.equal(rows[0].receipt, null);
  assert.equal(rows[0].amount, 520_000);
});

test("lớp tháng: phiếu tháng 10 trả trước (biên lai tháng 9) vẫn là doanh số tháng 10 — Đã thu", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(receivable("oct", "a", "m1", "month|m1|2026-10", 520_000, 520_000));
  pay(ledger, "oct", "oct", "a", 520_000, "2026-09-28T03:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }],
    classes: [{ id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receipt?.receiptNumber, "PT-oct");
  assert.equal(rows[0].amount, 520_000);
});

test("lớp tháng: phiếu lập trùng tháng 10 (phiếu riêng + phiếu gộp T9+T10) không nhân đôi doanh số", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("oct", "a", "m1", "month|m1|2026-10", 520_000, 520_000),
    receivable("both", "a", "m1", "months|m1|2026-09,2026-10", 1_040_000),
  );
  pay(ledger, "oct", "oct", "a", 520_000, "2026-10-03T03:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }],
    classes: [{ id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  assert.equal(sum(rows), 520_000, "tháng 10 tính một lần");
  assert.deepEqual(plain(rows.map((row: any) => Boolean(row.receipt))), [true], "đã thu đủ — không còn dòng Chưa thu");
});

// Lớp khóa 4 buổi, học thứ 3 + thứ 7 từ 19/09: K1 19–29/09, K2 03–13/10, K3 17–27/10, K4 từ 31/10.
const courseClass = { id: "c1", code: "S1X", name: "S1X", billingMode: "COURSE", sessionPrice: 100_000, courseSessions: 4, courseStartDate: "2026-09-19", branchId: "b",
  schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }, { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" }] };

test("lớp khóa: tháng 10 có mọi khóa có buổi 1 trong tháng (khóa 2, 3 và khóa 4 bắt đầu 31/10) cho cả lớp; khóa 1 (tháng 9) và khóa 5 (tháng 11) không hiện", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("k1", "a", "c1", "course|c1", 400_000, 400_000),
    receivable("k2", "a", "c1", "course|c1|2", 400_000, 400_000),
    receivable("k4", "a", "c1", "course|c1|4", 400_000, 400_000),
    receivable("k5", "a", "c1", "course|c1|5", 400_000, 400_000),
  );
  pay(ledger, "k1", "k1", "a", 400_000, "2026-10-02T03:00:00Z");
  pay(ledger, "k2", "k2", "a", 400_000, "2026-09-20T03:00:00Z");
  pay(ledger, "k4", "k4", "a", 400_000, "2026-10-20T03:00:00Z");
  pay(ledger, "k5", "k5", "a", 400_000, "2026-10-21T03:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }, { id: "b2", code: "HV2", fullName: "Bình" }],
    classes: [{ ...courseClass, studentIds: ["a", "b2"] }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  const line = (row: any) => `${row.buyerCode} ${row.detail.replace("S1X · ", "")} ${row.receipt ? row.receipt.receiptNumber : "Chưa thu"} ${row.amount}`;
  assert.deepEqual(plain(rows.map(line)), [
    "HV1 Khóa 2 · 4 buổi PT-k2 400000",
    "HV1 Khóa 3 · 4 buổi Chưa thu 400000",
    "HV1 Khóa 4 · 4 buổi PT-k4 400000",
    "HV2 Khóa 2 · 4 buổi Chưa thu 400000",
    "HV2 Khóa 3 · 4 buổi Chưa thu 400000",
    "HV2 Khóa 4 · 4 buổi Chưa thu 400000",
  ], "khóa 2 trả trước từ tháng 9 vẫn là doanh số tháng 10; khóa 5 (tháng 11) trả trước chưa tính");
});

test("lớp khóa: phiếu khóa gộp nợ khóa trước — tháng 10 chỉ tính phần của khóa 2, biên lai trả khóa cũ trước", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(receivable("k2", "a", "c1", "course|c1|2", 800_000, 400_000));
  pay(ledger, "old", "k2", "a", 400_000, "2026-10-01T03:00:00Z", "UNRECORDED");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }],
    classes: [{ ...courseClass, studentIds: ["a"], courseStartDate: "2026-09-19" }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const k2 = visible(t, "2026-10").filter((row: any) => /Khóa 2/.test(row.detail));
  assert.deepEqual(plain(k2.map((row: any) => [row.receipt?.receiptNumber || "Chưa thu", row.amount])), [["Chưa thu", 400_000]],
    "400k đã trả là của khóa 1 (tháng 9) — khóa 2 còn chưa thu đủ 400k");
});

test("nghỉ học: giảm doanh số nằm ở tháng học viên rời lớp", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(receivable("oct", "a", "m1", "month|m1|2026-10", 800_000, 0, { frozenAt: "2026-10-01" }));
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An", status: "UNASSIGNED", classJoinedAt: { "class-waiting": "2026-10-10" } }],
    classes: [
      { id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 100_000, branchId: "b", studentIds: [],
        schedules: [{ weekday: 2, periodId: "tue", startTime: "17:00", endTime: "19:00" }, { weekday: 6, periodId: "sat", startTime: "09:00", endTime: "11:00" }] },
      { id: "class-waiting", code: "LC", name: "Lớp chờ", studentIds: ["a"] },
    ],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  const adjust = rows.filter((row: any) => row.isAdjustment);
  assert.equal(adjust.length, 1);
  assert.ok(adjust[0].amount < 0);
  assert.match(adjust[0].detail, /^Rời lớp T1X ngày 10\/10\/2026 \(về Lớp chờ\) · Tháng 10\/2026 thực học \d+\/\d+ buổi/);
  assert.equal(adjust[0].eventDate, "2026-10-10", "ngày xảy ra nghiệp vụ hiện ở cột ngày");
  const html = t.invoicesPage();
  for (const label of ["Tổng doanh số", "Giảm doanh số", "Doanh số thuần", "Đã thu", "Chưa thu"]) assert.match(html, new RegExp(`<strong>${label}</strong>`));
});

test("chuyển lớp: chênh lệch là điều chỉnh của tháng chuyển; kỳ neo giữ học phí gốc", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("tr", "a", "m2", "transfer|m2|m1|2026-11", -350_000, 0, { issueDate: "2026-10-18", billingPeriod: "Chênh lệch chuyển lớp T1X→T2X · kỳ 11/2026" }),
    receivable("oct", "a", "m1", "month|m1|2026-10", 800_000, 0, { frozenAt: "2026-10-01" }),
  );
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An", status: "STUDYING" }],
    classes: [
      { id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 100_000, branchId: "b", studentIds: [] },
      { id: "m2", code: "T2X", name: "T2X", billingMode: "MONTHLY", sessionPrice: 50_000, branchId: "b", studentIds: ["a"] },
    ],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  assert.deepEqual(plain(rows.map((row: any) => [row.isAdjustment ? "điều chỉnh" : "học phí", row.amount]).sort()), [["học phí", 800_000], ["điều chỉnh", -350_000]].sort());
});

test("Class Schedule tô đỏ lớp khóa có khóa mới bắt đầu trong tháng (kể cả sắp bắt đầu), không tô lớp đang học dở khóa", () => {
  const t = load();
  const midCourse = { ...courseClass, id: "c2", code: "S2X", name: "S2X", courseSessions: 24, courseStartDate: "2026-09-19" };
  const endsThisMonth = { ...courseClass, id: "c3", code: "S3X", name: "S3X", courseSessions: 12, courseStartDate: "2026-09-08" };
  t.state.data = {
    students: [], teachers: [], lessonSessions: [], settings: { branches: [] }, finance: { sepay: emptyLedger(), cashbook: [] },
    classes: [{ ...courseClass, studentIds: [] }, { ...midCourse, studentIds: [] }, { ...endsThisMonth, studentIds: [] }],
  };
  const [c1, c2, c3] = t.state.data.classes;
  assert.deepEqual(plain(t.classNewCourseThisMonth(c1)), { index: 2, start: "2026-10-03" }, "khóa 2 bắt đầu 03/10 (khóa 3 cũng trong tháng — lấy khóa đầu tiên)");
  assert.equal(t.classNewCourseThisMonth(c2), null, "khóa 1 bắt đầu tháng 9, khóa 2 tháng 12 — không tô");
  assert.equal(plain(t.classNewCourseThisMonth(c3))?.index, 2, "khóa 2 bắt đầu cuối tháng này — vẫn tô để báo trước");
  t.state.dashboardScheduleMode = "COURSE";
  const html = t.dashboardScheduleTab();
  assert.equal((html.match(/Có phiếu HP khóa/g) || []).length, 2);
});

test("lọc lớp chỉ có lớp có doanh số trong tháng, tách nhóm lớp thu tháng / lớp thu khóa", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(receivable("oct", "a", "m1", "month|m1|2026-10", 520_000));
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An" }, { id: "b2", code: "HV2", fullName: "Bình" }],
    classes: [
      { id: "m1", code: "S1", name: "S1", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] },
      { ...courseClass, studentIds: ["b2"] },
      { ...courseClass, id: "c9", code: "S9X", name: "S9X", courseStartDate: "2026-08-01", courseSessions: 40, studentIds: ["b2"] },
    ],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  t.state.invoiceMonth = "2026-10";
  const html = t.invoicesPage();
  const select = html.match(/<select[^>]*data-invoice-class[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  assert.match(select, /<optgroup label="Lớp thu tháng \(1\)"><option value="m1" >S1<\/option><\/optgroup>/, "S1 là lớp thu tháng");
  assert.match(select, /<optgroup label="Lớp thu khóa \(1\)"><option value="c1" >S1X<\/option><\/optgroup>/);
  assert.doesNotMatch(select, /S9X/, "lớp khóa đang học dở (không có khóa mới trong tháng) không có trong lọc");
});

test("chuyển lớp: điều chỉnh nằm ở tháng học viên vào lớp mới, không phải tháng lập phiếu chênh lệch", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("tr", "a", "m2", "transfer|m2|m1|2026-11", -200_000, 0, { issueDate: "2026-11-05", billingPeriod: "Chênh lệch chuyển lớp T1X→T2X · kỳ 11/2026" }),
  );
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An", status: "STUDYING", classJoinedAt: { m2: "2026-10-20" } }],
    classes: [
      { id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 100_000, branchId: "b", studentIds: [] },
      { id: "m2", code: "T2X", name: "T2X", billingMode: "MONTHLY", sessionPrice: 50_000, branchId: "b", studentIds: ["a"] },
    ],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const adjust = visible(t, "2026-10").filter((row: any) => row.isAdjustment);
  assert.equal(adjust.length, 1);
  assert.equal(adjust[0].amount, -200_000);
  assert.equal(adjust[0].eventDate, "2026-10-20");
  assert.match(adjust[0].detail, /^Chuyển lớp ngày 20\/10\/2026: T1X → T2X · giảm 200\.000/);
});

test("phiếu nợ cũ riêng là kỳ riêng (không gộp lấy số lớn với phiếu tháng); lập muộn vẫn thuộc tháng 10", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("od", "a", "m1", "olddebt|m1|2026-09", 800_000, 800_000, { issueDate: "2026-10-20T03:00:00Z", billingPeriod: "Nợ cũ · T1X" }),
    receivable("oct", "a", "m1", "month|m1|2026-10", 455_000, 0, { issueDate: "2026-10-20T03:00:00Z" }),
  );
  pay(ledger, "p1", "od", "a", 345_000, "2026-10-21T03:00:00Z");
  pay(ledger, "p2", "od", "a", 455_000, "2026-10-21T04:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An", status: "STUDYING" }],
    classes: [{ id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const rows = visible(t, "2026-10");
  const old = rows.filter((row: any) => row.period.kind === "olddebt");
  const oct = rows.filter((row: any) => row.period.kind === "month");
  assert.equal(sum(old), 800_000, "nợ cũ đủ 800.000 (2 biên lai)");
  assert.equal(sum(oct), 455_000, "phiếu T10 455.000 vẫn Chưa thu — không bị biên lai nợ cũ lấp");
  assert.equal(oct[0].receipt, null);
});

test("hồ sơ học viên đã xoá: phần đã thu vẫn là doanh số, phần chưa thu không tính", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("sep", "gone", "m1", "month|m1|2026-09", 515_000, 515_000),
    receivable("oct", "gone", "m1", "month|m1|2026-10", 520_000),
  );
  pay(ledger, "g1", "sep", "gone", 515_000, "2026-09-21T03:00:00Z");
  ledger.receipts[0].studentName = "Hoàng Quân";
  ledger.receipts[0].studentCode = "HV0955";
  t.state.data = {
    students: [],
    classes: [{ id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: [] }],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const sep = visible(t, "2026-09");
  assert.equal(sep.length, 1);
  assert.equal(sep[0].amount, 515_000);
  assert.equal(sep[0].buyerCode, "HV0955");
  assert.match(sep[0].studentName, /Hoàng Quân \(hồ sơ đã xoá\)/);
  assert.equal(visible(t, "2026-10").length, 0, "phiếu chưa thu của hồ sơ đã xoá không là doanh số");
});

test("chuyển lớp: phiếu lớp cũ cho kỳ học ở lớp mới hiện ở lớp mới; kỳ học dở ở lớp cũ giữ lớp cũ", () => {
  const t = load();
  const ledger = emptyLedger();
  ledger.receivables.push(
    receivable("sep", "a", "m1", "month|m1|2026-09", 500_000, 500_000),
    receivable("oct", "a", "m1", "month|m1|2026-10", 520_000),
    receivable("tr", "a", "m2", "transfer|m2|m1|2026-11", 0, 0, { issueDate: "2026-10-02", billingPeriod: "Chênh lệch chuyển lớp T1X→T2X · kỳ 11/2026" }),
  );
  pay(ledger, "sep", "sep", "a", 500_000, "2026-09-05T03:00:00Z");
  t.state.data = {
    students: [{ id: "a", code: "HV1", fullName: "An", status: "STUDYING", classJoinedAt: { m2: "2026-10-01" } }],
    classes: [
      { id: "m1", code: "T1X", name: "T1X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: [] },
      { id: "m2", code: "T2X", name: "T2X", billingMode: "MONTHLY", sessionPrice: 65_000, branchId: "b", studentIds: ["a"] },
    ],
    lessonSessions: [], settings: { branches: [] }, finance: { sepay: ledger, cashbook: [] },
  };
  const oct = visible(t, "2026-10");
  assert.equal(oct.length, 1);
  assert.equal(oct[0].classId, "m2", "Tháng 10 học ở T2X → doanh số của T2X");
  assert.match(oct[0].detail, /phiếu lớp T1X, chuyển sang T2X ngày 01\/10\/2026/);
  const sep = visible(t, "2026-09");
  assert.equal(sep[0].classId, "m1", "Tháng 9 học ở T1X → giữ T1X");
});
