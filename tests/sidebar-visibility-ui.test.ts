import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadSidebar() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__sidebarTest = { state, adminShell, financePage, adminPageTitle, financeForecastRows, forecastDueStatus };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/dashboard" },
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
    __sidebarTest: {
      state: { role: string; route: string; data: Record<string, unknown>; financeModal: null | Record<string, string> };
      adminShell: (content: string, teacher?: boolean, student?: boolean) => string;
      financePage: () => string;
      adminPageTitle: () => string;
      financeForecastRows: (today?: string) => Array<Record<string, any>>;
      forecastDueStatus: (row: Record<string, unknown>, today?: string) => { key: string; label: string; days: number | null };
    };
  }).__sidebarTest;
}

const visibleAdminPaths = [
  "/dashboard",
  "/lop-hoc",
  "/lich-day",
  "/bao-cao/chuyen-can",
  "/bao-cao/hoc-vu",
  "/bao-cao/dinh-ky",
  "/bao-cao/cham-phieu",
  "/bao-cao/cham-video",
  "/ke-toan/hoc-phi",
  "/ke-toan/hoa-don",
  "/ke-toan/sepay",
  "/ke-toan/can-duyet",
  "/ke-toan/thu-chi",
  "/ke-toan/du-thu-du-chi",
  "/ke-toan/doi-soat",
  "/ke-toan/cham-cong",
  "/ke-toan/luong",
  "/syllabus",
  "/hoc-vien",
  "/giao-vien",
  "/ke-toan-vien",
  "/tro-giang",
  "/nhat-ky",
  "/cai-dat",
];

const hiddenPaths = [
  "/bao-cao/buoi-hoc",
  "/cai-dat/tai-khoan",
];

const adminOnlyPaths = ["/syllabus", "/tro-giang"];

function prepare(role: string) {
  const ui = loadSidebar();
  ui.state.role = role;
  ui.state.route = role === "TEACHER" ? "/gv" : role === "ASSISTANT" ? "/gv/bao-cao-hoc-vu" : "/dashboard";
  ui.state.data = { user: { name: "Test user" } };
  return ui;
}

test("admin sidebar shows the enabled navigation modules", () => {
  const ui = prepare("ADMIN");
  const html = ui.adminShell("content");
  for (const path of visibleAdminPaths) assert.match(html, new RegExp(`data-nav="${path}"`));
  for (const path of hiddenPaths) assert.doesNotMatch(html, new RegExp(`data-nav="${path}"`));
});

test("admin sidebar keeps Dashboard standalone and nests the other modules in parent folders", () => {
  const ui = prepare("ADMIN");
  const html = ui.adminShell("content");
  const standalone = html.match(/<section class="nav-group">([\s\S]*?)<\/section>/)?.[1] || "";
  const folders = [...html.matchAll(/<section class="nav-folder[^"]*">([\s\S]*?)<\/section>/g)]
    .map((match) => [...match[1].matchAll(/data-nav="([^"]+)"/g)].map((item) => item[1]));

  assert.match(standalone, /data-nav="\/dashboard"/);
  assert.doesNotMatch(folders.flat().join(" "), /\/dashboard/);
  assert.deepEqual(folders, [
    ["/syllabus", "/lop-hoc", "/lich-day"],
    ["/bao-cao/chuyen-can", "/bao-cao/hoc-vu", "/bao-cao/dinh-ky", "/bao-cao/cham-phieu", "/bao-cao/cham-video"],
    ["/ke-toan/hoc-phi", "/ke-toan/hoa-don", "/ke-toan/tin-zalo", "/ke-toan/sepay", "/ke-toan/can-duyet", "/ke-toan/thu-chi", "/ke-toan/cham-cong", "/ke-toan/luong", "/ke-toan/du-thu-du-chi", "/ke-toan/doi-soat"],
    ["/hoc-vien", "/giao-vien", "/ke-toan-vien", "/tro-giang"],
    ["/nhat-ky", "/cai-dat"],
  ]);
});

test("assistant only gets the academic report entry and the Trợ giảng role label", () => {
  const ui = prepare("ASSISTANT");
  const html = ui.adminShell("content", true);
  const navPaths = [...html.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(navPaths, ["/gv/bao-cao-hoc-vu"]);
  assert.match(html, /<small>Trợ giảng<\/small>/);
  for (const path of [...hiddenPaths, ...adminOnlyPaths, "/gv/lich-day", "/gv/task", "/gv/lop-hoc", "/hoc-vien"]) {
    assert.doesNotMatch(html, new RegExp(`data-nav="${path}"`));
  }
});

test("teacher keeps the relevant role menu without hidden admin modules", () => {
  const ui = prepare("TEACHER");
  const html = ui.adminShell("content", true);
  for (const path of ["/gv", "/gv/lich-day", "/gv/lop-hoc", "/gv/task"]) assert.match(html, new RegExp(`data-nav="${path}"`));
  for (const path of [...hiddenPaths, ...adminOnlyPaths]) assert.doesNotMatch(html, new RegExp(`data-nav="${path}"`));
  for (const path of visibleAdminPaths.filter((item) => item.startsWith("/ke-toan/"))) assert.doesNotMatch(html, new RegExp(`data-nav="${path}"`));
  assert.doesNotMatch(html, /data-nav="\/bao-cao\/hoc-vu"/);
  assert.doesNotMatch(html, /data-nav="\/bao-cao\/dinh-ky"/);
});

test("accountant sees finance plus class schedule and student management", () => {
  const ui = prepare("ACCOUNTANT");
  const html = ui.adminShell("content");
  for (const path of ["/lop-hoc", "/lich-day", "/hoc-vien", "/ke-toan/hoc-phi", "/ke-toan/hoa-don", "/ke-toan/sepay", "/ke-toan/can-duyet", "/ke-toan/thu-chi", "/ke-toan/du-thu-du-chi", "/ke-toan/doi-soat", "/ke-toan/cham-cong", "/ke-toan/luong"]) {
    assert.match(html, new RegExp(`data-nav="${path}"`));
  }
  for (const path of [...hiddenPaths, ...adminOnlyPaths]) assert.doesNotMatch(html, new RegExp(`data-nav="${path}"`));
  assert.doesNotMatch(html, /data-nav="\/bao-cao\/hoc-vu"/);
  assert.doesNotMatch(html, /data-nav="\/bao-cao\/dinh-ky"/);
  assert.doesNotMatch(html, /data-nav="\/giao-vien"/);
  assert.doesNotMatch(html, /data-nav="\/ke-toan-vien"/);
  assert.doesNotMatch(html, /data-nav="\/dashboard"/);
  assert.doesNotMatch(html, /Quản lý người dùng/);
  const folders = [...html.matchAll(/<section class="nav-folder[^"]*">([\s\S]*?)<\/section>/g)]
    .map((match) => [...match[1].matchAll(/data-nav="([^"]+)"/g)].map((item) => item[1]));
  assert.equal(folders.length, 2);
  assert.deepEqual(folders[0], ["/lop-hoc", "/lich-day", "/hoc-vien"]);
});

test("enabled reconciliation route renders the reconciliation page", () => {
  const ui = prepare("ADMIN");
  ui.state.route = "/ke-toan/doi-soat";
  const html = ui.financePage();
  assert.match(html, /<h1>Đối soát thu chi<\/h1>/);
  assert.match(html, /id="recon-filter-form"/);
});

test("finance sidebar uses report labels and keeps forecast above reconciliation", () => {
  const ui = prepare("ADMIN");
  const html = ui.adminShell("content");
  assert.match(html, />Quản lý doanh số<\/button>/);
  assert.match(html, />Báo cáo lương<\/button>/);
  assert.match(html, />Dự thu - Dự chi<\/button>/);
  assert.match(html, />Đối soát thu chi<\/button>/);
  assert.ok(html.indexOf('data-nav="/ke-toan/hoc-phi"') < html.indexOf('data-nav="/ke-toan/hoa-don"'));
  assert.ok(html.indexOf('data-nav="/ke-toan/hoa-don"') < html.indexOf('data-nav="/ke-toan/thu-chi"'));
  assert.ok(html.indexOf('data-nav="/ke-toan/luong"') < html.indexOf('data-nav="/ke-toan/du-thu-du-chi"'));
  assert.ok(html.indexOf('data-nav="/ke-toan/du-thu-du-chi"') < html.indexOf('data-nav="/ke-toan/doi-soat"'));
  ui.state.route = "/ke-toan/luong";
  assert.equal(ui.adminPageTitle(), "Báo cáo lương");
  ui.state.route = "/ke-toan/du-thu-du-chi";
  assert.equal(ui.adminPageTitle(), "Dự thu - Dự chi");
  ui.state.route = "/ke-toan/doi-soat";
  assert.equal(ui.adminPageTitle(), "Đối soát thu chi");
});

test("forecast page is read-only, highlights risks, and opens a detail popup", () => {
  const ui = prepare("ADMIN");
  ui.state.route = "/ke-toan/du-thu-du-chi";
  ui.state.data = {
    user: { name: "Admin" },
    classes: [],
    students: [],
    teachers: [],
    lessonSessions: [],
    settings: { branches: [] },
    finance: {
      debts: [], cashbook: [], recon: [], payroll: [], sepay: {},
      forecasts: [
        { id: "forecast-in", kind: "IN", category: "Khoản phải thu", description: "Đối tác còn nợ", amount: 5000000, dueDate: "2020-01-01", status: "PLANNED" },
        { id: "forecast-out", kind: "OUT", category: "Tiền thuê nhà", description: "Thuê cơ sở", amount: 8000000, dueDate: "2099-12-31", status: "PLANNED" },
      ],
    },
  };
  const html = ui.financePage();
  assert.match(html, /Phải thu tháng này/);
  assert.match(html, /Phải trả tháng này/);
  assert.match(html, /Khoản thu quá hạn/);
  assert.doesNotMatch(html, /<small>Phải thu<\/small>/);
  assert.match(html, /Đối tác còn nợ/);
  assert.match(html, /data-forecast-view="forecast-in">Xem<\/button>/);
  assert.doesNotMatch(html, /data-forecast-(?:add|edit|toggle|delete)/);
  assert.doesNotMatch(html, /data-nav="\/ke-toan\/(?:hoc-phi|luong)"/);
  ui.state.financeModal = { kind: "forecast-view", id: "forecast-in" };
  const popup = ui.financePage();
  assert.match(popup, /Chi tiết khoản dự thu/);
  assert.match(popup, /Thông tin chỉ đọc/);
  assert.match(popup, /5\.000\.000/);
  assert.doesNotMatch(popup, /Lưu khoản dự kiến/);
  assert.equal(ui.forecastDueStatus({ dueDate: "2026-09-01", status: "PLANNED" }, "2026-09-13").key, "OVERDUE");
  assert.equal(ui.forecastDueStatus({ dueDate: "2026-09-17", status: "PLANNED" }, "2026-09-13").key, "DUE_SOON");
});

test("forecast layout rules load last and keep desktop filters on one row", () => {
  const css = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  const forecastRules = css.lastIndexOf("/* Dự thu - Dự chi: compact, read-only financial overview.");
  assert.ok(forecastRules > css.indexOf("* { box-sizing"));
  assert.match(css.slice(forecastRules), /grid-template-columns: minmax\(220px,1\.7fr\)[\s\S]*repeat/);
  assert.match(css.slice(forecastRules), /\.forecast-list-card \{[^}]*flex: 1/);
});

test("forecast rows automatically include unpaid monthly tuition and accrued teacher salary", () => {
  const ui = prepare("ADMIN");
  ui.state.data = {
    user: { name: "Admin" },
    students: [{ id: "student-1", code: "HV001", fullName: "Học viên tháng", status: "STUDYING" }],
    teachers: [{ id: "teacher-1", code: "GV001", fullName: "Giáo viên A" }],
    classes: [{
      id: "class-monthly", code: "M1", name: "Lớp tháng", status: "ACTIVE", billingMode: "MONTHLY",
      billingEnabled: true, sessionPrice: 100000, studentIds: ["student-1"], teacherId: "teacher-1", roomId: "",
      schedules: [{ weekday: 6, startTime: "09:00", endTime: "11:00", periodId: "period-1" }],
    }],
    lessonSessions: [{
      id: "session-1", classId: "class-monthly", date: "2026-09-05", startTime: "09:00", endTime: "11:00",
      teacherId: "teacher-1", roomId: "", status: "COMPLETED", isExtra: false,
      recurrenceKey: "class-monthly|2026-09-05|09:00", note: "", isOff: false, attendance: [],
    }],
    settings: { branches: [] },
    finance: { debts: [], cashbook: [], recon: [], payroll: [], forecasts: [], sepay: {} },
    // Dự chi lương theo hợp đồng: giáo viên A 20,8tr/tháng → 100k/giờ.
    payrollConfig: { teachers: { "teacher-1": { contractType: "SERVICE", contractSalary: 20_800_000 } }, months: {} },
  };
  const rows = ui.financeForecastRows("2026-09-13");
  const tuition = rows.find((row) => row.source === "TUITION");
  const payroll = rows.find((row) => row.source === "PAYROLL");
  assert.equal(tuition?.kind, "IN");
  assert.equal(tuition?.dueDate, "2026-09-10");
  assert.equal(tuition?.due.key, "OVERDUE");
  assert.ok(Number(tuition?.amount) > 0);
  assert.equal(payroll?.kind, "OUT");
  assert.equal(payroll?.dueDate, "2026-09-30");
  assert.ok(Number(payroll?.amount) > 0);
});
