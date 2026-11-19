import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadTuitionPage() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__tuitionTest = { state, tuitionPage, tuitionFilteredStudents, tuitionStatusText, tuitionCollectionQuote };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/hoc-phi" },
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
  return (context as typeof context & {
    __tuitionTest: {
      state: Record<string, unknown> & { data: { students: Array<{ id: string; code: string }> } };
      tuitionPage: () => string;
      tuitionFilteredStudents: () => Array<{ id: string; code: string }>;
      tuitionStatusText: (student: { id: string }) => string;
      tuitionCollectionQuote: (student: { id: string }, cls: unknown) => { amount: number };
    };
  }).__tuitionTest;
}

function seed(ui: ReturnType<typeof loadTuitionPage>) {
  const clsA = {
    id: "c1", code: "S11", name: "S11-FLYERS VIP", branchId: "b1",
    billingMode: "COURSE", sessionPrice: 50_000, courseSessions: 24,
    // Lớp có từ trước khi dùng hệ thống: khóa 1 không phiếu = đã thu ngoài hệ thống.
    courseStartDate: "2026-08-26",
    schedules: [{ weekday: 3, startTime: "17:00", endTime: "19:00" }],
    studentIds: ["s1", "s2"],
  };
  const clsB = {
    id: "c2", code: "S22", name: "S22-JUMP", branchId: "b2",
    billingMode: "COURSE", sessionPrice: 50_000, courseSessions: 24,
    courseStartDate: "2026-07-01",
    schedules: [{ weekday: 3, startTime: "17:00", endTime: "19:00" }],
    studentIds: ["s3", "s4"],
  };
  ui.state.data = {
    students: [
      { id: "s1", code: "HV1", fullName: "An", status: "STUDYING", sessionBalances: {} },
      { id: "s2", code: "HV2", fullName: "Bình", status: "STUDYING", sessionBalances: {} },
      { id: "s3", code: "HV3", fullName: "Chi", status: "STUDYING", sessionBalances: {} },
      { id: "s4", code: "HV4", fullName: "Dung", status: "STUDYING", sessionBalances: {}, tuitionExempt: true },
    ],
    classes: [clsA, clsB],
    lessonSessions: [],
    finance: {
      sepay: {
        receivables: [
          { id: "r1", studentId: "s1", billKey: "course|c1", status: "OPEN" },
          { id: "r2", studentId: "s3", billKey: "course|c2|2", status: "OPEN" },
        ],
        receipts: [],
        paymentOrders: [],
      },
    },
    settings: { branches: [{ id: "b1", name: "CN 1" }, { id: "b2", name: "CN 2" }], rooms: [], classTypes: [], lessonPeriods: [] },
  };
  ui.state.financeQuery = "";
  ui.state.financeBranch = "";
  ui.state.financeClass = "";
  ui.state.financeDebt = "";
}

test("trang học phí có nút Xuất Excel trong thanh lọc", () => {
  const ui = loadTuitionPage();
  seed(ui);
  const html = ui.tuitionPage();
  assert.equal((html.match(/data-export-tuition/g) || []).length, 1);
  assert.ok(html.includes("Xuất Excel"));
});

test("bộ lọc tái dùng cho export: không lọc thì xuất tất cả (miễn phí vẫn hiện), lọc lớp chỉ xuất lớp đó", () => {
  const ui = loadTuitionPage();
  seed(ui);
  assert.deepEqual(ui.tuitionFilteredStudents().map((s) => s.code), ["HV1", "HV2", "HV3", "HV4"]);

  ui.state.financeClass = "c1";
  assert.deepEqual(ui.tuitionFilteredStudents().map((s) => s.code), ["HV1", "HV2"]);

  ui.state.financeClass = "";
  ui.state.financeDebt = "debt";
  assert.deepEqual(ui.tuitionFilteredStudents().map((s) => s.code), ["HV1"]);

  ui.state.financeDebt = "paid";
  assert.deepEqual(ui.tuitionFilteredStudents().map((s) => s.code).sort(), ["HV2", "HV3"]);
});

test("nhãn tình trạng trong file export khớp bảng hiển thị", () => {
  const ui = loadTuitionPage();
  seed(ui);
  const byId = new Map(ui.state.data.students.map((s: { id: string }) => [s.id, s]));
  assert.equal(ui.tuitionStatusText(byId.get("s1")), "Công nợ");
  assert.equal(ui.tuitionStatusText(byId.get("s2")), "Đã đóng học phí");
  assert.equal(ui.tuitionStatusText(byId.get("s4")), "Miễn học phí");
});

test("học viên miễn học phí vẫn hiện trong bảng nhưng đóng băng mọi thao tác", () => {
  const ui = loadTuitionPage();
  seed(ui);
  const html = ui.tuitionPage();
  const exemptRow = html.split("</tr>").find((chunk) => chunk.includes(">Dung<")) || "";
  assert.ok(exemptRow.includes("tuition-exempt-row"), "dòng miễn phí mang class đóng băng");
  assert.ok(exemptRow.includes("S22-JUMP"), "vẫn hiện tên lớp");
  assert.ok(exemptRow.includes("Miễn học phí"), "cột tình trạng hiện Miễn học phí");
  assert.ok(!exemptRow.includes("data-tuition-select"), "không có ô chọn gửi yêu cầu");
  assert.ok(!exemptRow.includes("data-collect-tuition"), "không có nút Thu học phí");
  assert.ok(!exemptRow.includes("data-nav"), "tên không phải link");
  assert.ok(!/-\d/.test(exemptRow), "công nợ để trống");
  // Chỉ lọc "Tất cả" mới thấy; lọc công nợ/đã đóng thì bạn miễn phí không chen vào.
  ui.state.financeDebt = "debt";
  assert.ok(!ui.tuitionFilteredStudents().some((s) => s.code === "HV4"));
  ui.state.financeDebt = "paid";
  assert.ok(!ui.tuitionFilteredStudents().some((s) => s.code === "HV4"));
});

test("chỉ học viên đang nợ có ô chọn; chọn tất cả và nút gửi hàng loạt đếm đúng số đã chọn", () => {
  const ui = loadTuitionPage();
  seed(ui);
  let html = ui.tuitionPage();
  assert.equal((html.match(/data-tuition-select="/g) || []).length, 1);
  assert.ok(html.includes('data-tuition-select="s1|c1"'));
  assert.match(html, /data-bulk-request-payment disabled/);

  ui.state.tuitionSelected = ["s1|c1", "s2|c1"];
  html = ui.tuitionPage();
  assert.match(html, /data-tuition-select="s1\|c1"\s+aria-label="[^"]*" checked/);
  assert.ok(html.includes("Gửi yêu cầu thanh toán (1)"), "khóa của học viên không còn nợ bị loại khỏi số đã chọn");
  assert.match(html, /data-tuition-select-all[^>]* checked/);
});

test("cột yêu cầu thanh toán: Chưa gửi → Đã gửi / Gửi lỗi theo nhật ký Zalo, đã đóng thì hiện Đã thu", () => {
  const ui = loadTuitionPage();
  seed(ui);
  const state = ui.state as unknown as { data: { classes: unknown[]; students: Array<{ id: string }>; finance: { sepay: { receivables: unknown[] } }; zaloMessages?: unknown[] } };
  const debt = ui.tuitionCollectionQuote(state.data.students[0], state.data.classes[0]).amount;
  assert.ok(debt > 0);
  let html = ui.tuitionPage();
  assert.ok(html.includes("Chưa gửi"));
  assert.ok(html.includes("Đã thu"));

  state.data.finance.sepay.receivables = [{ id: "r1", studentId: "s1", classId: "c1", billKey: "course|c1", status: "OPEN", frozenAt: "2026-10-01T00:00:00.000Z", balanceDue: debt }];
  state.data.zaloMessages = [{ id: "z1", kind: "PAYMENT_REQUEST", receivableId: "r1", studentId: "s1", status: "SENT" }];
  html = ui.tuitionPage();
  assert.ok(html.includes("Đã gửi") && !html.includes("Chưa gửi"));

  state.data.zaloMessages = [{ id: "z1", kind: "PAYMENT_REQUEST", receivableId: "r1", studentId: "s1", status: "FAILED", errorMessage: "Sai số" }];
  html = ui.tuitionPage();
  assert.ok(html.includes("Gửi lỗi") && html.includes('title="Sai số"'));

  state.data.finance.sepay.receivables = [{ id: "r1", studentId: "s1", classId: "c1", billKey: "course|c1", status: "OPEN", frozenAt: "2026-10-01T00:00:00.000Z", balanceDue: debt - 1 }];
  assert.ok(ui.tuitionPage().includes("Chưa gửi"), "số tiền đã chốt lệch số phải thu hiện tại thì coi là chưa gửi");
});
