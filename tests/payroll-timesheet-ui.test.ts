import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { defaultPayrollPolicy, hydratePayrollConfig } from "../cloudflare/finance-types";

function loadPayroll() {
  const written: string[] = [];
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__payrollTest = { state, timesheetSessions, timesheetTeacherRows, timesheetMonthKeys, timesheetPage, payrollMonthRows, payrollRowFor, progressiveTax, teacherDetailPage, accountantDetailPage, attendanceKpi, openTeacherContract, payrollPage, payrollWorkingDays, payrollPolicy, payrollHourlyRate, payrollSlipPayload, payrollExportHtml, payrollImportKey, payrollImportContracts, payrollPolicySettingsPage, payrollStaff };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      addEventListener: () => {},
      open: () => ({ document: { open: () => {}, write: (html: string) => { written.push(html); }, close: () => {} } }),
    },
    location: { pathname: "/ke-toan/luong" },
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
    __payrollTest: {
      state: Record<string, any>;
      timesheetSessions: (teacherId?: string, range?: { from: string; to: string }) => any[];
      timesheetTeacherRows: (sessions: any[]) => any[];
      timesheetMonthKeys: () => string[];
      timesheetPage: () => string;
      payrollMonthRows: (month?: string, range?: { from: string; to: string }) => any[];
      payrollRowFor: (teacher: any, actualMinutes: number, month: string, context?: any) => any;
      progressiveTax: (taxable: number) => number;
      teacherDetailPage: (teacher: any, tab?: string, staffKind?: string) => string;
      accountantDetailPage: (row: any, tab?: string) => string;
      attendanceKpi: (teacherId: string, range?: { from: string; to: string }) => any;
      openTeacherContract: (teacherId: string) => void;
      payrollPage: () => string;
      payrollWorkingDays: (month: string) => number;
      payrollPolicy: () => Record<string, any>;
      payrollHourlyRate: (contract: any, policy?: any) => number;
      payrollSlipPayload: (row: any) => Record<string, any>;
      payrollExportHtml: () => { html: string; fileName: string };
      payrollImportKey: (value: unknown) => string;
      payrollImportContracts: (raw: unknown) => { contracts: Record<string, any>; policy: Record<string, number>; applied: string[]; missing: string[]; invalid: string[] };
      payrollPolicySettingsPage: () => string;
      payrollStaff: () => any[];
    };
  }).__payrollTest;
  return { ...api, written };
}

// Lớp T2 + T4, 90 phút/buổi: tháng 9/2026 có 9 suất (4 T2 + 5 T4).
function fixtureClass() {
  return {
    id: "class-t1", code: "T1", name: "T1-TEST", teacherId: "teacher-1", roomId: "",
    billingMode: "MONTHLY", sessionPrice: 50_000, studentIds: [],
    schedules: [
      { weekday: 1, startTime: "17:00", endTime: "18:30" },
      { weekday: 3, startTime: "17:00", endTime: "18:30" },
    ],
  };
}

/** Giờ công chuẩn 100.000 đ/giờ × hệ số 1 = đơn giá giờ 100.000 đ, tháng đủ công 208 giờ = 20.800.000 đ. */
const STANDARD_HOURLY_RATE = 100_000;

function fixture(overrides: { teachers?: any[]; accountants?: any[]; assistants?: any[]; contract?: any; policy?: any; months?: any } = {}) {
  const cls = fixtureClass();
  const teacherOff = {
    id: "off-1", classId: cls.id, date: "2026-09-07", startTime: "17:00", endTime: "18:30",
    teacherId: cls.teacherId, roomId: "", status: "SCHEDULED", isExtra: false,
    recurrenceKey: "class-t1|2026-09-07|17:00", isOff: true, offSource: "TEACHER", attendance: [],
  };
  const cancelled = {
    id: "cxl-1", classId: cls.id, date: "2026-09-09", startTime: "17:00", endTime: "18:30",
    teacherId: cls.teacherId, roomId: "", status: "CANCELLED", isExtra: false,
    recurrenceKey: "class-t1|2026-09-09|17:00", isOff: false, attendance: [],
  };
  return {
    lessonSessions: [teacherOff, cancelled],
    students: [],
    classes: [cls],
    teachers: overrides.teachers ?? [{ id: "teacher-1", code: "GV0001", fullName: "Cô Test", phone: "", address: "", email: "t@x.vn", assignedClasses: [] }],
    accountants: overrides.accountants ?? [],
    assistants: overrides.assistants ?? [],
    settings: { branches: [], rooms: [], classTypes: [], lessonPeriods: [] },
    payrollConfig: {
      teachers: { "teacher-1": overrides.contract ?? {} },
      months: overrides.months ?? {},
      policy: { standardHourlyRate: STANDARD_HOURLY_RATE, ...overrides.policy },
    },
  };
}

test("timesheet: lý thuyết − nghỉ không lương; buổi hủy vào cột nghỉ lễ (không lương)", () => {
  const ui = loadPayroll();
  ui.state.data = fixture();
  ui.state.timesheetTeacher = "";

  const range = { from: "2026-09-01", to: "2026-09-30" };
  const sessions = ui.timesheetSessions("", range);
  assert.equal(sessions.length, 9);

  const [row] = ui.timesheetTeacherRows(sessions);
  // Lý thuyết: 8 buổi theo lịch × 90 phút = 12 giờ (buổi hủy nằm ở cột nghỉ lễ).
  assert.equal(row.total, 720);
  assert.equal(row.holiday, 90);
  // Nghỉ không lương: 1 buổi GV tick nghỉ.
  assert.equal(row.off, 90);
  // Chấm công thực tế = lý thuyết − nghỉ không lương + dạy bù + không tính phí.
  assert.equal(row.actual, 630);
});

test("đơn giá giờ = giờ công chuẩn × hệ số lương; giáo viên nào cũng có", () => {
  const ui = loadPayroll();
  ui.state.data = fixture();
  const policy = ui.payrollPolicy();
  assert.equal(policy.standardHourlyRate, STANDARD_HOURLY_RATE);
  // Không còn tỷ lệ thưởng doanh số trong chính sách.
  assert.equal(policy.bonusRate, undefined);
  assert.equal(ui.payrollHourlyRate({ salaryCoefficient: 2 }, policy), 200_000);
  // Bỏ trống hệ số = 1; không còn ô đơn giá giờ nhập tay theo giáo viên.
  assert.equal(ui.payrollHourlyRate({ hourlyRate: 500_000 }, policy), 100_000);
  assert.equal(ui.payrollHourlyRate({ salaryCoefficient: 1.5 }, policy), 150_000);
});

test("payroll SERVICE contract: lương giờ = giờ × đơn giá + phụ cấp nguyên mức; thuế dịch vụ 10% từ 5tr", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    contract: { department: "Giáo viên", contractType: "SERVICE", dependents: 0 },
    months: { "2026-09": { "teacher-1": { allowance: 200_000 } } },
  });
  // 10,5 giờ × 100.000 = 1.050.000, cộng phụ cấp nguyên mức tháng (không chia ngày công),
  // lương năng suất = lương cơ bản × % định mức giờ (10,5/208), không BH.
  const [row] = ui.payrollMonthRows("2026-09");
  assert.equal(row.salary, 1_050_000);
  assert.equal(row.autoAllowance, 2_240_000); // ăn 40k × 26 ngày T9 + điện thoại 300k + xăng xe 500k + đồng phục 400k
  assert.equal(row.allowance, 200_000);
  assert.equal(row.productivityPay, Math.round(1_050_000 * (10.5 / 208)));
  assert.equal(row.bonus, undefined);
  assert.equal(row.insurance, 0);
  assert.equal(row.gross, 1_050_000 + row.productivityPay + 2_240_000 + 200_000);
  assert.equal(row.tax, 0); // dưới ngưỡng 5tr
  assert.equal(row.net, row.gross);

  // 50 giờ → 5tr lương + 50/208 năng suất + 2,4tr phụ cấp + 200k nhập tay ≥ ngưỡng → khấu trừ 10%.
  const rich = ui.payrollRowFor({ id: "teacher-1" }, 3000, "2026-09");
  assert.equal(rich.salary, 5_000_000);
  assert.equal(rich.productivityPay, Math.round(5_000_000 * (50 / 208)));
  assert.equal(rich.gross, 5_000_000 + rich.productivityPay + 2_240_000 + 200_000);
  assert.equal(rich.tax, Math.round(rich.gross * 0.1));
  assert.equal(rich.net, rich.gross - rich.tax);
});

test("payroll LABOR contract: lương giờ — phụ cấp nguyên mức, BH tính trên lương giờ", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    contract: { department: "Giáo viên", contractKind: "TT", contractType: "LABOR", dependents: 1 },
    months: { "2026-09": { "teacher-1": { allowance: 200_000, advance: 300_000 } } },
  });
  const [row] = ui.payrollMonthRows("2026-09");
  assert.equal(row.salary, 1_050_000);
  // BH NLD = 10,5% × lương giờ thực tế (không lấy mức hợp đồng).
  assert.equal(row.insuranceBase, 1_050_000);
  assert.equal(row.insurance, 110_250);
  assert.equal(row.deduction, 15_500_000 + 6_200_000); // bản thân + 1 NPT
  assert.equal(row.productivityPay, Math.round(1_050_000 * (10.5 / 208)));
  assert.equal(row.gross, 1_050_000 + row.productivityPay + 2_240_000 + 200_000);
  assert.equal(row.taxableIncome, 0); // thu nhập < giảm trừ
  assert.equal(row.tax, 0);
  assert.equal(row.net, row.gross - 110_250 - 300_000);
});

test("progressive tax brackets match the 5-step ladder", () => {
  const ui = loadPayroll();
  assert.equal(ui.progressiveTax(0), 0);
  assert.equal(ui.progressiveTax(5_000_000), 250_000);
  assert.equal(ui.progressiveTax(10_000_000), 500_000); // 10tr × 5%
  assert.equal(ui.progressiveTax(22_316_000), 1_731_600); // 10tr×5% + 12,316tr×10%
  assert.equal(ui.progressiveTax(150_000_000), 38_000_000); // 10tr×5% + 20tr×10% + 30tr×20% + 40tr×30% + 50tr×35%
});

test("timesheet filter: dropdown tháng từ 10/2026 tới 12/2027 + lọc từ ngày–đến ngày", () => {
  const ui = loadPayroll();
  ui.state.data = fixture();
  const keys = ui.timesheetMonthKeys();
  assert.equal(keys[0], "2026-10", "chấm công bắt đầu từ tháng 10/2026");
  assert.equal(keys.at(-1), "2027-12");
  const html = ui.timesheetPage();
  assert.match(html, /<select class="input" name="month"[^>]*>/, "bộ lọc là dropdown tháng");
  assert.match(html, /Tháng 10\/2026/);
  assert.doesNotMatch(html, /Tháng 09\/2026/, "không còn tháng 9");
  assert.match(html, /Tháng 12\/2027/);
  assert.match(html, /type="date" name="from" value="\d{4}-\d{2}-01"/, "mặc định từ ngày = đầu tháng");
  assert.match(html, /type="date" name="to" value="\d{4}-\d{2}-\d{2}"/);
});

test("payroll rows include teachers without a contract or sessions — lương 0, không báo lỗi", () => {
  const ui = loadPayroll();
  const idle = { id: "teacher-2", code: "GV0002", fullName: "Cô Nhàn", phone: "", address: "", email: "n@x.vn", assignedClasses: [] };
  ui.state.data = fixture({ teachers: [...fixture().teachers, idle] });
  ui.state.data.payrollConfig.teachers = {};
  const rows = ui.payrollMonthRows("2026-09");
  assert.equal(rows.length, 2);
  const idleRow = rows.find((row: any) => row.teacher.id === "teacher-2");
  assert.equal(idleRow.hours, 0);
  assert.equal(idleRow.net, 0);
});

test("lương tháng = đơn giá giờ × (8 giờ × ngày công), nghỉ không lương trừ nguyên ngày", () => {
  const ui = loadPayroll();
  const teacher = fixture().teachers[0];
  const kpi = { eligible: 0, late: 0, onTimeRate: 1, lateSessions: [] };
  const contract = { contractKind: "TT", payMode: "MONTHLY", dependents: 0 };
  ui.state.data = fixture({ contract, months: {} });

  // Chưa cấu hình nghỉ không lương → đủ ngày công chuẩn, dù chấm công có buổi nghỉ.
  const full = ui.payrollRowFor(teacher, 630, "2026-10", { kpi });
  assert.equal(full.workingDays, 27); // T10/2026 = 31 ngày − 4 Chủ nhật
  assert.equal(full.quotaHours, 216); // 8 giờ × 27 ngày
  assert.equal(full.salaryHours, 216);
  assert.equal(full.unpaidLeaveDays, 0);
  assert.equal(full.paidDays, 27);
  assert.equal(full.salary, 21_600_000); // 100.000 × 216
  assert.equal(full.overridePaidDays, false);

  // Cấu hình 2 ngày nghỉ → trừ nguyên 2 ngày (không quy đổi phút).
  ui.state.data = fixture({ contract, months: { "2026-10": { "teacher-1": { unpaidLeaveDays: 2 } } } });
  const left = ui.payrollRowFor(teacher, 630, "2026-10", { kpi });
  assert.equal(left.unpaidLeaveDays, 2);
  assert.equal(left.paidDays, 25);
  assert.equal(left.salaryHours, 200);
  assert.equal(left.salary, 20_000_000); // 100.000 × 200

  // Chốt tay ngày công vẫn thắng cấu hình.
  ui.state.data = fixture({ contract, months: { "2026-10": { "teacher-1": { unpaidLeaveDays: 2, paidDays: 26 } } } });
  const pinned = ui.payrollRowFor(teacher, 630, "2026-10", { kpi });
  assert.equal(pinned.overridePaidDays, true);
  assert.equal(pinned.paidDays, 26);
  assert.equal(pinned.salary, 20_800_000); // 100.000 × 208

  // Hệ số lương riêng làm thay đổi cả lương tháng lẫn lương giờ.
  ui.state.data = fixture({ contract: { ...contract, salaryCoefficient: 1.5 }, months: {} });
  assert.equal(ui.payrollRowFor(teacher, 630, "2026-10", { kpi }).salary, 32_400_000); // 150.000 × 216
});

test("lương năng suất = lương cơ bản × (% đúng hạn + % định mức giờ), cộng thẳng không trần", () => {
  const ui = loadPayroll();
  const teacher = fixture().teachers[0];
  const kpi = (onTimeRate: number) => ({ eligible: 4, late: 0, onTimeRate, lateSessions: [] });
  // Đơn giá 125.000 đ/giờ × 216 giờ (8 giờ × 27 ngày) = 27.000.000 đ.
  const contract = { contractKind: "TT", payMode: "MONTHLY", dependents: 0 };
  ui.state.data = fixture({ contract, policy: { standardHourlyRate: 125_000 } });

  // Không dạy giờ nào: chỉ còn % đúng hạn.
  assert.equal(ui.payrollRowFor(teacher, 0, "2026-10", { kpi: kpi(1) }).productivityPay, 27_000_000);
  assert.equal(ui.payrollRowFor(teacher, 0, "2026-10", { kpi: kpi(0.5) }).productivityPay, 13_500_000);

  // 108/216 giờ = 50% định mức; cộng thẳng với 100% đúng hạn → 150% lương cơ bản.
  const half = ui.payrollRowFor(teacher, 108 * 60, "2026-10", { kpi: kpi(1) });
  assert.equal(half.quotaRate, 0.5);
  assert.equal(half.productivityRate, 1.5);
  assert.equal(half.productivityPay, 40_500_000);
  // Vượt định mức vẫn không bị chặn trần: 250/216 giờ + 100% đúng hạn.
  const over = ui.payrollRowFor(teacher, 250 * 60, "2026-10", { kpi: kpi(1) });
  assert.ok(Math.abs(over.quotaRate - 250 / 216) < 1e-9);
  assert.ok(over.productivityPay > 27_000_000);

  // Lương giờ cũng hưởng năng suất: 108 giờ × 125.000 = 13.500.000, định mức vẫn 216 giờ.
  ui.state.data = fixture({ contract: { contractKind: "BTG", payMode: "HOURLY" }, policy: { standardHourlyRate: 125_000 } });
  const hourly = ui.payrollRowFor(teacher, 108 * 60, "2026-10", { kpi: kpi(1) });
  assert.equal(hourly.salary, 13_500_000);
  assert.equal(hourly.quotaHours, 216);
  assert.equal(hourly.productivityRate, 1.5);
  assert.equal(hourly.productivityPay, 20_250_000);
});

test("KPI: đếm buổi trễ hạn nộp điểm danh — tỷ lệ đúng hạn là một phần của lương năng suất", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "HOURLY" } });
  const range = { from: "2026-09-01", to: "2026-09-30" };
  const kpi = ui.attendanceKpi("teacher-1", range);
  // 7 buổi dạy đã qua chưa lưu điểm danh → cả 7 buổi trễ.
  assert.equal(kpi.eligible, 7);
  assert.equal(kpi.late, 7);
  assert.equal(kpi.onTimeRate, 0);

  // T9/2026 = 26 ngày công chuẩn → định mức 208 giờ; thực dạy 7 × 90 phút = 10,5 giờ.
  const [row] = ui.payrollMonthRows("2026-09");
  assert.equal(row.onTimeRate, 0);
  assert.ok(Math.abs(row.quotaRate - 10.5 / 208) < 1e-9);
  // Lương giờ vẫn có năng suất: chỉ còn phần % định mức.
  assert.equal(row.productivityPay, Math.round(row.salary * (10.5 / 208)));

  // Cùng KPI đó với giáo viên lương tháng: lương cơ bản gấp 208/10,5 lần nên năng suất = đúng 10,5 giờ × đơn giá.
  ui.state.data.payrollConfig.teachers["teacher-1"] = { contractKind: "TT", payMode: "MONTHLY" };
  const [monthlyRow] = ui.payrollMonthRows("2026-09");
  assert.equal(monthlyRow.salary, 20_800_000); // 100.000 × 8 giờ × 26 ngày
  assert.equal(monthlyRow.productivityPay, 1_050_000); // 20,8tr × 10,5/208
});

test("teacher detail: tab hợp đồng có hệ số lương cho mọi hình thức trả lương", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE", contractNo: "HĐ-001" } });
  const teacher = ui.state.data.teachers[0];
  const overview = ui.teacherDetailPage(teacher);
  assert.match(overview, /Tổng quan/);
  assert.match(overview, /Hợp đồng/);
  assert.match(overview, /Lương &amp; KPI/);
  assert.match(overview, /data-print-contract="teacher-1"/);
  assert.match(overview, /<small>Đơn giá giờ<\/small>/);

  const contractTab = ui.teacherDetailPage(teacher, "hop-dong");
  assert.match(contractTab, /id="teacher-contract-form"/);
  assert.match(contractTab, /name="contractNo"/);
  assert.match(contractTab, /value="HĐ-001"/);
  // Hệ số lương là ô nhập duy nhất quyết định đơn giá — không còn lương tháng / đơn giá tay.
  assert.match(contractTab, /name="salaryCoefficient"/);
  // Giờ dạy cam kết nhập ngay trong hợp đồng từng giáo viên.
  assert.match(contractTab, /Giờ dạy cam kết \/ tháng/);
  assert.match(contractTab, /name="committedHours"/);
  assert.doesNotMatch(contractTab, /name="monthlySalary"/);
  assert.doesNotMatch(contractTab, /name="hourlyRate"/);

  const payrollTab = ui.teacherDetailPage(teacher, "luong");
  assert.match(payrollTab, /Bảng tính lương/);
  assert.match(payrollTab, /KPI đúng hạn/);
  assert.doesNotMatch(payrollTab, /<dt>Thưởng tháng<\/dt>/);
});

test("print contract popup: đơn giá giờ theo giờ công chuẩn × hệ số, phụ cấp nguyên mức cho cả lương giờ", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    contract: {
      contractKind: "TT", payMode: "HOURLY", status: "ACTIVE", contractNo: "HĐ-001",
      salaryCoefficient: 2, dependents: 1,
      mealAllowancePerDay: 50_000, bankAccount: "0123456789", bankName: "Vietcombank",
      nationalId: "079123456789", jobTitle: "Giáo viên tiếng Anh",
    },
  });
  ui.openTeacherContract("teacher-1");
  assert.equal(ui.written.length, 1);
  const html = ui.written[0];
  assert.match(html, /HỢP ĐỒNG LAO ĐỘNG/);
  assert.match(html, /Cô Test/);
  // 100.000 đ/giờ × hệ số 2 = 200.000 đ/giờ.
  assert.match(html, /đơn giá giờ 200\.000\s?₫\/giờ/);
  assert.match(html, /50\.000/); // phụ cấp ăn trưa/ngày ghi đè
  assert.match(html, /400\.000/); // phụ cấp đồng phục nguyên mức tháng
  assert.match(html, /không chia theo ngày công/);
  assert.match(html, /0123456789/);
  assert.match(html, /Vietcombank/);
  assert.match(html, /Điều 3\. Lương, phụ cấp và lương năng suất/);
  assert.doesNotMatch(html, /thưởng doanh số/i);
  assert.match(html, /window\.print\(\)/);
});

test("payroll report: phụ cấp nguyên mức cho cả lương giờ, không còn cột Thưởng", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-10";
  ui.state.payrollQuery = "";
  ui.state.data = fixture({
    contract: { contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE", dependents: 1 },
    months: { "2026-10": { "teacher-1": { paidDays: 24.5 } } },
  });
  const page = ui.payrollPage();
  // Lương tháng: Lương cơ bản = lương cứng 8 giờ × 27 ngày × 100.000; Ngày công/Giờ công
  // = 27 ngày công chuẩn của tháng; Lương theo công = 8 × 24,5 ngày × 100.000.
  assert.match(page, /<td>21\.600\.000\s?₫<\/td>/);
  assert.match(page, /<td>27<\/td><td>—<\/td><td>—<\/td><td>19\.600\.000\s?₫<\/td>/);
  assert.match(page, /class="payroll-table"/);
  assert.match(page, /Lương cơ bản/);
  assert.match(page, /<th>Phụ cấp điện thoại<\/th><th>Phụ cấp ăn trưa<\/th><th>Phụ cấp xăng xe<\/th><th>Phụ cấp đồng phục<\/th><th>% đúng hạn<\/th><th>Định mức giờ<\/th><th>Lương năng suất<\/th>/);
  assert.doesNotMatch(page, /<th>Thưởng<\/th>/, "đã bỏ thưởng doanh số khỏi bảng lương");
  assert.doesNotMatch(page, /Phụ cấp khác/);
  assert.match(page, /Lương năng suất/);
  // Cột "Lương cơ bản" thay "Đơn giá giờ": lương tháng hiện lương cứng cả tháng.
  assert.match(page, /<th>Lương cơ bản<\/th><th>Hệ số lương<\/th>/);
  // Phụ cấp KHÔNG chia theo ngày công: paidDays 24,5/27 vẫn giữ nguyên mức tháng.
  assert.equal(ui.payrollWorkingDays("2026-10"), 27); // 31 ngày − 4 Chủ nhật
  assert.equal(ui.payrollWorkingDays("2026-11"), 25); // 30 ngày − 5 Chủ nhật
  assert.match(page, /<td>300\.000\s?₫<\/td>/);
  assert.match(page, /<td>1\.200\.000\s?₫<\/td>/);
  assert.match(page, /<td>500\.000\s?₫<\/td>/, "phụ cấp xăng xe nguyên mức 500.000 đ");
  assert.match(page, /<td>400\.000\s?₫<\/td>/);
  assert.doesNotMatch(page, /272\.222|1\.088\.889|378\.086/, "không còn phụ cấp chia theo ngày công");
  // Bỏ 4 ô tổng hợp phía trên bảng.
  assert.doesNotMatch(page, /class="class-summary-grid"/);
  assert.doesNotMatch(page, /Tổng thu nhập/);
});

test("báo cáo lương: cột Nghỉ phép / Nghỉ không lương, popup sửa 3 khoản, chi tiết nằm ngang", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-10";
  ui.state.payrollQuery = "";
  ui.state.payrollDetail = "";
  ui.state.payrollEdit = "";
  ui.state.data = fixture({
    contract: { contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE" },
    months: { "2026-10": { "teacher-1": { paidLeaveDays: 2, unpaidLeaveDays: 3, advance: 1_000_000 } } },
  });
  const page = ui.payrollPage();
  // Ngày công/Giờ công đứng ngay sau Hệ số lương, hai cột nghỉ ngay sau đó.
  assert.match(page, /<th>Ngày công\/Giờ công<\/th><th>Nghỉ phép<\/th><th>Nghỉ không lương<\/th><th>Lương theo công<\/th>/);
  // Dòng: 27 ngày công chuẩn; nghỉ phép 2, nghỉ không lương 3; lương theo công = 27 − 3 ngày.
  assert.match(page, /<td>27<\/td><td>2<\/td><td>3<\/td><td>19\.200\.000\s?₫<\/td>/);
  assert.match(page, /<th>Tạm ứng<\/th><th>Thực lĩnh<\/th><th class="settings-actions-cell">Thao tác<\/th>/);
  // Header đúng 23 cột (24 cột cũ bỏ Lương theo giờ vì đã gộp vào Ngày công/Giờ công).
  assert.equal((page.match(/<\/th>/g) || []).length, 23);

  // Bút chì mở popup chỉ có đúng ba khoản biến động — không còn form hồ sơ lương.
  ui.state.payrollEdit = "teacher-1";
  const editPage = ui.payrollPage();
  assert.match(editPage, /<form id="payroll-edit-form"/);
  assert.match(editPage, /name="paidLeaveDays" value="2"/);
  assert.match(editPage, /name="unpaidLeaveDays" value="3"/);
  assert.match(editPage, /name="advance" value="1000000"/);
  for (const removed of ["name=\"monthlySalary\"", "name=\"hourlyRate\"", "name=\"contractKind\"", "name=\"payMode\"", "name=\"paidDays\"", "name=\"bonus\"", "name=\"dependents\""]) {
    assert.doesNotMatch(editPage, new RegExp(removed), `popup không còn ô ${removed}`);
  }
  assert.doesNotMatch(editPage, /Hồ sơ lương/);
  ui.state.payrollEdit = "";

  // Chi tiết lương: bố cục ngang, trái là bảng kê, phải là danh sách chấm công cuộn.
  ui.state.payrollDetail = "teacher-1";
  const detailPage = ui.payrollPage();
  assert.match(detailPage, /class="payroll-detail-body payroll-detail-split"/);
  assert.match(detailPage, /<div class="payroll-detail-info"><dl class="session-view-grid">/);
  assert.match(detailPage, /<aside class="payroll-attendance-panel">/);
  assert.match(detailPage, /Chấm công thực tế Tháng 10\/2026/);
  assert.match(detailPage, /<div class="payroll-attendance-list"><table><thead><tr><th>STT<\/th><th>Ngày<\/th>/);
  // Bỏ dòng "Phụ cấp nhập tay" (dư), "Kỳ lương"/"Giáo viên" (đã ở tiêu đề) và thưởng doanh số.
  assert.doesNotMatch(detailPage, /Phụ cấp nhập tay/);
  assert.doesNotMatch(detailPage, /<dt>Thưởng<\/dt>/);
  assert.doesNotMatch(detailPage, /<dt>Kỳ lương<\/dt>/);
  assert.doesNotMatch(detailPage, /<dt>Giáo viên<\/dt>/);
  assert.match(detailPage, /<dt>Đơn giá giờ<\/dt>/);
  assert.match(detailPage, /<dt>Hệ số lương<\/dt>/);
  assert.match(detailPage, /<p>Cô Test · GV0001 · Tháng 10\/2026 \(01\/10\/2026 – 31\/10\/2026\)<\/p>/);
  // Nút tải phiếu lương nằm ở footer popup.
  assert.match(detailPage, /<button class="primary-btn" type="button" data-payroll-slip="teacher-1">/);
  assert.match(detailPage, /Tải phiếu lương/);
  ui.state.payrollDetail = "";
});

test("payload phiếu lương: đủ thông tin kỳ, lọc khoản bằng 0, tiền khớp dòng báo cáo", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-10";
  ui.state.data = fixture({
    contract: {
      contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE", dependents: 1,
      bankAccount: "0123456789", bankName: "Vietcombank", taxCode: "0123456789",
    },
    months: { "2026-10": { "teacher-1": { paidLeaveDays: 2, unpaidLeaveDays: 2, advance: 1_000_000 } } },
    // Đơn giá cao để thu nhập vượt giảm trừ gia cảnh → phiếu có dòng thuế kèm số người phụ thuộc.
    policy: { standardHourlyRate: 150_000 },
  });
  const row = ui.payrollMonthRows("2026-10").find((item: any) => item.teacher.id === "teacher-1");
  const slip = ui.payrollSlipPayload(row);
  assert.equal(slip.teacherCode, "GV0001");
  assert.equal(slip.monthKey, "2026-10");
  assert.equal(slip.title, "PHIẾU LƯƠNG · Tháng 10/2026");
  assert.equal(slip.period, "Kỳ tính lương 01/10/2026 – 31/10/2026");
  assert.match(slip.issuedAt, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(slip.center.name, "Trung tâm Ngoại ngữ STEPS");
  const info = slip.info.map((item: any) => `${item.label}=${item.value}`);
  assert.ok(info.includes("Giáo viên=Cô Test (GV0001)"), info.join(" | "));
  assert.ok(info.includes("Ngày công tính lương=25 / 27 ngày"), info.join(" | "));
  assert.ok(info.includes("Hệ số lương=1"), info.join(" | "));
  assert.ok(info.includes("Đơn giá giờ=150.000 đ/giờ · hệ số 1"), info.join(" | "));
  assert.ok(info.includes("Nghỉ phép / nghỉ không lương=2 / 2 ngày"), info.join(" | "));
  assert.ok(info.some((item) => item.startsWith("Định mức giờ=200 giờ · đạt ")), info.join(" | "));
  assert.ok(info.includes("Nhận lương qua TK=0123456789 · Vietcombank"), info.join(" | "));
  assert.ok(info.includes("Mã số thuế=0123456789"), info.join(" | "));
  // Tiền: gross/net lấy từ dòng báo cáo, tổng khấu trừ = BH + thuế + tạm ứng.
  assert.equal(slip.gross, Math.round(row.gross));
  assert.equal(slip.net, Math.round(row.net));
  assert.equal(slip.totalDeduct, Math.round(row.insurance) + Math.round(row.tax) + Math.round(row.advance));
  assert.equal(slip.gross - slip.totalDeduct, slip.net);
  // Nhãn có giải thích công thức và không dùng glyph "₫" (font PDF không có).
  const income = slip.income as Array<{ label: string; amount: number }>;
  assert.equal(income[0].amount, Math.round(row.salary));
  assert.match(income[0].label, /^Lương cơ bản · 150\.000 đ × 200 giờ \(8 giờ × 25 ngày công\)$/);
  assert.ok(income.every((item) => !item.label.includes("₫") && !/[^\x00-\uFFFF]/.test(item.label)), "nhãn chỉ dùng ký tự có trong Roboto");
  // Phụ cấp nguyên mức luôn có mặt; không còn dòng thưởng doanh số.
  assert.ok(income.some((item) => item.label === "Phụ cấp ăn trưa" && item.amount === 1_080_000));
  assert.ok(income.some((item) => item.label === "Phụ cấp xăng xe" && item.amount === 500_000));
  assert.ok(income.some((item) => item.label === "Phụ cấp đồng phục" && item.amount === 400_000));
  assert.ok(!income.some((item) => item.label.startsWith("Thưởng")), income.map((item) => item.label).join(" | "));
  // Khoản bằng 0 bị loại — lương tháng không có dòng lương giờ.
  assert.ok(income.every((item) => item.amount > 0));
  assert.ok(!income.some((item) => item.label.startsWith("Lương giờ")));
  assert.ok(!income.some((item) => item.label === "Phụ cấp khác"));
  const deductions = slip.deductions as Array<{ label: string; amount: number }>;
  assert.ok(deductions.some((item) => item.label === "Tạm ứng trừ vào lương" && item.amount === 1_000_000));
  assert.ok(deductions.some((item) => /1 người phụ thuộc/.test(item.label)));
  assert.equal(slip.note, "");
});

test("payroll report: cột Hệ số lương sau Lương cơ bản, Lương năng suất tách % và tiền", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-10";
  ui.state.payrollQuery = "";
  ui.state.data = fixture({
    contract: { contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE", salaryCoefficient: 1.5, dependents: 1 },
    months: { "2026-10": { "teacher-1": { paidDays: 24.5 } } },
  });
  const page = ui.payrollPage();
  // Thứ tự cột: Lương cơ bản → Hệ số lương → Ngày công/Giờ công.
  assert.match(page, /<th>Lương cơ bản<\/th><th>Hệ số lương<\/th><th>Ngày công\/Giờ công<\/th>/);
  // Lương cứng = 150.000 × 8 giờ × 27 ngày; ngày công hiện 27 (không phải 24,5 ngày kế toán sửa).
  assert.match(page, /<td>32\.400\.000\s?₫<\/td><td>1,5<\/td><td>27<\/td>/);
  // Lương giờ: Lương cơ bản là tiền 1 giờ dạy; Ngày công/Giờ công là số giờ thực tế.
  ui.state.data = fixture({ contract: { contractKind: "BTG", payMode: "HOURLY", salaryCoefficient: 1.5 } });
  assert.match(ui.payrollPage(), /<td>150\.000\s?₫<\/td><td>1,5<\/td><td>12<\/td><td>—<\/td><td>—<\/td><td>1\.800\.000\s?₫<\/td>/);
  // Lương năng suất: % đúng hạn, % định mức giờ rồi mới tới số tiền.
  assert.match(page, /<th>% đúng hạn<\/th><th>Định mức giờ<\/th><th>Lương năng suất<\/th>/);
  assert.doesNotMatch(page, /people-subline">\d[\d.]*\s*₫<\/small>/, "không còn tiền nằm dưới % trong một ô");
  assert.doesNotMatch(page, /colspan="24"/);
});

test("chưa cấu hình giờ công chuẩn → đơn giá 0, chi tiết lương báo rõ nguyên nhân", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-10";
  ui.state.payrollQuery = "";
  ui.state.payrollDetail = "teacher-1";
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "MONTHLY" }, policy: { standardHourlyRate: 0 } });
  const [row] = ui.payrollMonthRows("2026-10");
  assert.equal(row.hourlyRate, 0);
  assert.equal(row.salary, 0);
  assert.equal(row.net, 2_280_000); // chỉ còn phụ cấp: ăn trưa 40k × 27 ngày T10 + điện thoại + xăng xe + đồng phục
  assert.match(ui.payrollPage(), /class="payroll-alert"/);
  assert.match(ui.payrollPage(), /Chưa cấu hình giờ công chuẩn trong Cấu hình lương\./);
  ui.state.payrollDetail = "";
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "MONTHLY", salaryCoefficient: 1 } });
  assert.doesNotMatch(ui.payrollPage(), /class="payroll-alert"/, "đã nhập giờ công chuẩn thì không còn cảnh báo");
});

test("báo cáo lương: chọn tháng bằng dropdown từ 10/2026, xuất Excel, bỏ đoạn giải thích dài", () => {
  const ui = loadPayroll();
  ui.state.payrollMonth = "2026-11";
  ui.state.payrollQuery = "";
  ui.state.payrollDetail = "";
  ui.state.payrollEdit = "";
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "MONTHLY", status: "ACTIVE" } });

  const page = ui.payrollPage();
  assert.match(page, /<select class="input" name="month"[^>]*>/);
  assert.doesNotMatch(page, /type="month" name="month"/, "không còn ô chọn tháng kiểu lịch");
  assert.match(page, /<option value="2026-10" >Tháng 10\/2026<\/option>|<option value="2026-10">Tháng 10\/2026<\/option>/);
  assert.match(page, /<option value="2026-11" selected>Tháng 11\/2026<\/option>/);
  assert.match(page, /<button class="secondary-btn" type="button" data-payroll-export>/);
  // Đoạn giải thích dài dưới tiêu đề đã bỏ.
  assert.doesNotMatch(page, /Bấm bút chì ở cột Thao tác/);
  assert.doesNotMatch(page, /Lương năng suất = lương theo công × \(% đúng hạn/);

  // File Excel: đúng tháng đang xem, đủ 22 cột dữ liệu, có dòng tổng cộng.
  const { html, fileName } = ui.payrollExportHtml();
  assert.equal(fileName, "Bảng lương Tháng 11/2026.xls");
  assert.match(html, /<th>Ngày công\/Giờ công<\/th>/);
  assert.match(html, /<th>Thực lĩnh<\/th>/);
  assert.match(html, /Cô Test/);
  assert.match(html, /Tổng cộng/);
  assert.match(html, /x:num="20000000"/); // lương theo công = 100.000 × 8 giờ × 25 ngày
});

test("kế toán cũng có dòng trong bảng lương và trang chi tiết y như giáo viên", () => {
  const ui = loadPayroll();
  const accountant = { id: "acc-1", code: "KT0001", fullName: "Chị Kế Toán", phone: "", address: "", email: "kt@x.vn" };
  ui.state.payrollMonth = "2026-10";
  ui.state.payrollQuery = "";
  ui.state.payrollDetail = "";
  ui.state.payrollEdit = "";
  ui.state.data = fixture({ accountants: [accountant] });
  ui.state.data.payrollConfig.teachers["acc-1"] = { contractKind: "TT", status: "ACTIVE", salaryCoefficient: 1.5 };

  const rows = ui.payrollMonthRows("2026-10");
  const accountRow = rows.find((row: any) => row.teacher.id === "acc-1");
  assert.ok(accountRow, "kế toán phải có dòng trong bảng lương");
  // Không cấu hình hình thức trả lương → kế toán mặc định lương cứng cả tháng.
  assert.equal(accountRow.payMode, "MONTHLY");
  assert.equal(accountRow.salary, 32_400_000); // 150.000 × 8 giờ × 27 ngày
  assert.equal(rows.at(-1).teacher.id, "acc-1", "kế toán xếp sau giáo viên trong bảng");

  const page = ui.payrollPage();
  assert.match(page, /Chị Kế Toán/);
  assert.match(page, /<td>Kế toán<\/td><td>Lương tháng<\/td>/);
  assert.match(page, /<td>32\.400\.000\s?₫<\/td><td>1,5<\/td><td>27<\/td>/);

  // Trang chi tiết kế toán dùng lại đúng trang của giáo viên, chỉ khác đường dẫn.
  const detail = ui.accountantDetailPage(accountant);
  assert.match(detail, /← Danh sách kế toán/);
  assert.match(detail, /data-nav="\/ke-toan-vien"/);
  assert.match(detail, /Tổng quan/);
  assert.match(detail, /Hợp đồng/);
  assert.match(detail, /Lương &amp; KPI/);
  assert.match(detail, /data-nav="\/ke-toan-vien\/acc-1\/hop-dong"/);
  assert.match(detail, /data-nav="\/ke-toan-vien\/acc-1\/luong"/);
  assert.match(detail, /data-print-contract="acc-1"/);
  assert.match(detail, /data-people-edit="accountants\|acc-1"/);
  assert.match(detail, /<small>Role<\/small>/);
  assert.match(detail, /Kế toán không phụ trách lớp\./);

  const contractTab = ui.accountantDetailPage(accountant, "hop-dong");
  assert.match(contractTab, /id="teacher-contract-form"/);
  assert.match(contractTab, /<option value="MONTHLY" selected>Lương cứng/);
  assert.match(contractTab, /placeholder="Kế toán"/);
  assert.match(contractTab, /Thay đổi chỉ áp dụng cho kế toán này\./);

  const payrollTab = ui.accountantDetailPage(accountant, "luong");
  assert.match(payrollTab, /Bảng tính lương/);
  assert.match(payrollTab, /32\.400\.000\s?₫/);

  // In hợp đồng của kế toán: chức danh mặc định "Kế toán", hình thức lương tháng.
  ui.written.length = 0;
  ui.openTeacherContract("acc-1");
  const contractHtml = ui.written[0];
  assert.match(contractHtml, /vị trí <strong>Kế toán<\/strong>/);
  assert.match(contractHtml, /Hình thức trả lương:<\/span> Lương tháng/);
  assert.match(contractHtml, /Chị Kế Toán/);
});

test("đọc chính sách lương từ storage: giữ giờ công chuẩn và xăng xe, không còn thưởng doanh số", () => {
  const stored = {
    teachers: {},
    months: {},
    policy: { ...defaultPayrollPolicy(), standardHourlyRate: 120_000, uniformAllowance: 500_000, fuelAllowance: 700_000 },
  };
  const policy = hydratePayrollConfig(stored).policy;
  assert.equal(policy?.standardHourlyRate, 120_000, "giờ công chuẩn phải lưu lại được, nếu không cả bảng lương về 0đ sau khi tải lại trang");
  assert.equal(policy?.uniformAllowance, 500_000);
  assert.equal(policy?.fuelAllowance, 700_000, "phụ cấp xăng xe phải nằm trong danh sách khóa số, nếu không sẽ reset về 0");
  assert.equal((policy || {}).bonusRate, undefined);
});

test("ô hệ số lương nhận 2 số lẻ và hiện đúng giá trị đã lưu", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({ contract: { contractKind: "TT", salaryCoefficient: 0.28 } });
  const html = ui.teacherDetailPage(ui.state.data.teachers[0], "hop-dong");
  assert.match(html, /step="0\.01"[^>]*name="salaryCoefficient"[^>]*value="0\.28"/);
});

test("nhập hàng loạt: khớp họ tên không dấu, giữ nguyên người ngoài danh sách, báo người thiếu", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    teachers: [
      { id: "teacher-1", code: "GV0001", fullName: "Dương Thị Vân", phone: "", address: "", email: "", assignedClasses: [] },
      { id: "teacher-2", code: "GV0002", fullName: "Phan Thùy Linh", phone: "", address: "", email: "", assignedClasses: [] },
    ],
    accountants: [{ id: "acc-1", code: "KT0001", fullName: "Bùi Thị Hiền", phone: "", address: "", email: "" }],
    contract: { contractKind: "TT", salaryCoefficient: 1 },
  });
  ui.state.data.payrollConfig.teachers["teacher-2"] = { contractKind: "TT", salaryCoefficient: 0.5, note: "giữ nguyên" };

  const result = ui.payrollImportContracts({
    staff: [
      { name: "duong thi van", coefficient: 0.28, payMode: "HOURLY", contractKind: "BTG", jobTitle: "Giáo viên" },
      { code: "kt0001", coefficient: 0.37, payMode: "MONTHLY" },
      { name: "Nguyễn Văn Không Có", coefficient: 0.3 },
      { name: "Phan Thùy Linh", coefficient: 0 },
    ],
    policy: { standardHourlyRate: 100_000, mealAllowancePerDay: 40_000 },
  });

  assert.deepEqual([...result.missing], ["Nguyễn Văn Không Có"]);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0], /Phan Thùy Linh/);
  assert.deepEqual([...result.applied].sort(), ["Bùi Thị Hiền", "Dương Thị Vân"]);

  const van = result.contracts["teacher-1"];
  assert.equal(van.salaryCoefficient, 0.28);
  assert.equal(van.payMode, "HOURLY");
  assert.equal(van.contractKind, "BTG");
  assert.equal(van.status, "ACTIVE");
  assert.ok(van.contractNo, "hợp đồng mới phải có số hợp đồng");
  assert.equal(van.jobTitle, "Giáo viên");

  // Khớp theo mã: kế toán đổi sang lương tháng, giữ loại hợp đồng cũ.
  const hien = result.contracts["acc-1"];
  assert.equal(hien.salaryCoefficient, 0.37);
  assert.equal(hien.payMode, "MONTHLY");
  assert.equal(hien.contractKind, "TT");

  // Người sai hệ số không bị ghi đè.
  assert.equal(result.contracts["teacher-2"], undefined);
  assert.equal(ui.state.data.payrollConfig.teachers["teacher-2"].salaryCoefficient, 0.5);

  assert.deepEqual({ ...result.policy }, { standardHourlyRate: 100_000, mealAllowancePerDay: 40_000 });
});

test("nhập hàng loạt: dữ liệu không phải JSON báo lỗi rõ ràng", () => {
  const ui = loadPayroll();
  ui.state.data = fixture();
  assert.throws(() => ui.payrollImportContracts("{staff: 1"), /JSON/);
  assert.throws(() => ui.payrollImportContracts({ staff: [] }), /Không thấy dòng/);
});

test("trang cấu hình lương có khung dán danh sách và nút áp dụng", () => {
  const ui = loadPayroll();
  ui.state.data = fixture();
  const html = ui.payrollPolicySettingsPage();
  assert.match(html, /id="payroll-policy-form"/);
  assert.match(html, /data-payroll-import-input/);
  assert.match(html, /data-payroll-import-apply/);
  assert.match(html, /Nhập hệ số lương hàng loạt/);
  // Khung nhập nằm ngoài form chính sách để bấm "Áp dụng" không lưu nhầm chính sách.
  assert.ok(html.indexOf("</form>") < html.indexOf("data-payroll-import-input"));
});

test("trợ giảng nằm trong bảng lương, mặc định lương giờ, giờ công chốt tay được", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    assistants: [{ id: "tg-1", code: "TG0001", fullName: "Cô Trợ Giảng", phone: "", address: "", email: "" }],
    months: { "2026-09": { "tg-1": { hours: 100 } } },
  });
  ui.state.data.payrollConfig.teachers["tg-1"] = { contractKind: "BTG", salaryCoefficient: 0.2 };
  ui.state.payrollMonth = "2026-09";

  const staff = ui.payrollStaff();
  assert.ok(staff.some((item: any) => item.id === "tg-1"), "trợ giảng phải có mặt trong bảng lương");

  const rows = ui.payrollMonthRows("2026-09");
  const row = rows.find((item: any) => item.teacher.id === "tg-1");
  assert.ok(row);
  // Không cấu hình payMode → trợ giảng mặc định lương giờ (không phải lương tháng như kế toán).
  assert.equal(row.payMode, "HOURLY");
  // 100 giờ chốt tay × (100.000 × 0,2 = 20.000 đ/giờ) = 2.000.000 đ lương theo công.
  assert.equal(row.hours, 100);
  assert.equal(row.hoursOverride, true);
  assert.equal(row.salary, 2_000_000);

  const page = ui.payrollPage();
  assert.match(page, /<td>Trợ giảng<\/td><td>Lương giờ<\/td>/);
});

test("báo cáo lương có bộ lọc phòng ban: Trợ giảng, Giáo viên, còn lại là Vận hành", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    teachers: [
      { id: "t-gv", code: "GV0001", fullName: "Cô Giáo", phone: "", address: "", email: "", assignedClasses: [] },
      { id: "t-tg", code: "GV0002", fullName: "Cô Trợ Giảng", phone: "", address: "", email: "", assignedClasses: [] },
      { id: "t-kt", code: "HC0001", fullName: "Chị Kế Toán", phone: "", address: "", email: "", assignedClasses: [] },
    ],
  });
  ui.state.data.payrollConfig.teachers["t-gv"] = { department: "Giáo viên", salaryCoefficient: 1 };
  ui.state.data.payrollConfig.teachers["t-tg"] = { department: "Trợ giảng", salaryCoefficient: 1 };
  ui.state.data.payrollConfig.teachers["t-kt"] = { department: "Kế toán", salaryCoefficient: 1 };
  ui.state.payrollMonth = "2026-09";

  const all = ui.payrollPage();
  assert.match(all, /<select class="input" name="department"[^>]*>/);
  assert.match(all, /Tất cả phòng ban/);
  assert.match(all, /<option value="ASSISTANT"[^>]*>Trợ giảng<\/option><option value="TEACHER"[^>]*>Giáo viên<\/option><option value="OPS"[^>]*>Vận hành<\/option>/);

  ui.state.payrollDepartment = "ASSISTANT";
  const assistantPage = ui.payrollPage();
  assert.match(assistantPage, /Cô Trợ Giảng/);
  assert.doesNotMatch(assistantPage, /Cô Giáo/);
  assert.doesNotMatch(assistantPage, /Chị Kế Toán/);

  ui.state.payrollDepartment = "TEACHER";
  const teacherPage = ui.payrollPage();
  assert.match(teacherPage, /Cô Giáo/);
  assert.doesNotMatch(teacherPage, /Cô Trợ Giảng/);
  assert.doesNotMatch(teacherPage, /Chị Kế Toán/);

  // Còn lại (kể cả hành chính) thuộc nhóm Vận hành.
  ui.state.payrollDepartment = "OPS";
  const opsPage = ui.payrollPage();
  assert.doesNotMatch(opsPage, /Cô Giáo/);
  assert.doesNotMatch(opsPage, /Cô Trợ Giảng/);
  assert.match(opsPage, /Chị Kế Toán/);
});

test("báo cáo lương: tick cột thì ẩn cột trên màn hình, dữ liệu vẫn còn", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    teachers: [{ id: "t-1", code: "GV0001", fullName: "Cô Giáo", phone: "", address: "", email: "", assignedClasses: [] }],
  });
  ui.state.data.payrollConfig.teachers["t-1"] = { department: "Giáo viên", salaryCoefficient: 1 };
  ui.state.payrollMonth = "2026-09";

  const closed = ui.payrollPage();
  assert.match(closed, /data-payroll-columns/);
  // Chưa bấm thì không dựng sẵn danh sách cột.
  assert.doesNotMatch(closed, /data-payroll-column="/);
  assert.match(closed, /<th>Thuế TNCN<\/th>/);

  ui.state.payrollColumnMenu = true;
  const open = ui.payrollPage();
  assert.match(open, /<span>Thuế TNCN<\/span>/);
  assert.match(open, /<span>Phụ cấp điện thoại<\/span>/);
  assert.doesNotMatch(open, /data-payroll-column="tax" checked/);

  ui.state.payrollHiddenColumns = ["tax", "phone"];
  const page = ui.payrollPage();
  assert.doesNotMatch(page, /<th>Thuế TNCN<\/th>/);
  assert.doesNotMatch(page, /<th>Phụ cấp điện thoại<\/th>/);
  assert.match(page, /data-payroll-column="tax" checked/);
  // Cột khác và cột thao tác vẫn còn.
  assert.match(page, /<th>Thực lĩnh<\/th>/);
  assert.match(page, /settings-actions-cell/);
  // Dữ liệu không mất: file Excel xuất đủ cột như cũ.
  const exported = ui.payrollExportHtml().html;
  assert.match(exported, /<th>Thuế TNCN<\/th>/);
  assert.match(exported, /<th>Phụ cấp điện thoại<\/th>/);
});

test("bảng lương có dòng tổng cố định ở cuối, cộng theo các dòng đang xem", () => {
  const ui = loadPayroll();
  ui.state.data = fixture({
    teachers: [
      { id: "t-a", code: "GV0001", fullName: "Cô A", phone: "", address: "", email: "", assignedClasses: [] },
      { id: "t-b", code: "GV0002", fullName: "Cô B", phone: "", address: "", email: "", assignedClasses: [] },
    ],
    months: { "2026-10": { "t-a": { hours: 10 }, "t-b": { hours: 6 } } },
  });
  ui.state.data.payrollConfig.teachers["t-a"] = { salaryCoefficient: 1 };
  ui.state.data.payrollConfig.teachers["t-b"] = { salaryCoefficient: 1 };
  ui.state.payrollMonth = "2026-10";

  const rows = ui.payrollMonthRows("2026-10");
  const netTotal = rows.reduce((sum: number, row: any) => sum + row.net, 0);
  const salaryTotal = rows.reduce((sum: number, row: any) => sum + row.salary, 0);

  const page = ui.payrollPage();
  assert.match(page, /<tfoot><tr>/);
  assert.match(page, /<strong>Tổng cộng<\/strong>/);
  const foot = page.slice(page.indexOf("<tfoot>"));
  // Thực lĩnh và lương theo công cộng đúng bằng tổng hai dòng.
  assert.match(foot, new RegExp(netTotal.toLocaleString("vi-VN").replace(/\./g, "\.")));
  assert.match(foot, new RegExp(salaryTotal.toLocaleString("vi-VN").replace(/\./g, "\.")));
  // Số dòng tổng bằng số cột đang hiển thị + cột thao tác.
  const footCells = (foot.slice(0, foot.indexOf("</tr>")).match(/<td/g) || []).length;
  assert.equal(footCells, 23);

  // Ẩn cột thì dòng tổng cũng bớt ô theo.
  ui.state.payrollHiddenColumns = ["tax", "phone"];
  const hiddenPage = ui.payrollPage();
  const hiddenFoot = hiddenPage.slice(hiddenPage.indexOf("<tfoot>"));
  const hiddenFootCells = (hiddenFoot.slice(0, hiddenFoot.indexOf("</tr>")).match(/<td/g) || []).length;
  assert.equal(hiddenFootCells, 21);

  // Lọc phòng ban thì tổng chỉ còn của người trong nhóm được lọc.
  ui.state.payrollHiddenColumns = [];
  ui.state.payrollDepartment = "OPS";
  const opsPage = ui.payrollPage();
  assert.match(opsPage, /<strong>Tổng cộng<\/strong>/);
  assert.doesNotMatch(opsPage.slice(opsPage.indexOf("<tbody>")), /Cô A/);
});

test("KT0003 (chủ doanh nghiệp) không khấu trừ thuế TNCN, người khác cùng lương vẫn chịu thuế", () => {
  const ui = loadPayroll();
  const kpi = { eligible: 0, late: 0, onTimeRate: 1, lateSessions: [] };
  const contract = { contractKind: "TT", payMode: "MONTHLY", dependents: 0, salaryCoefficient: 3 };
  ui.state.data = fixture({ contract, months: {} });
  const base = fixture().teachers[0];
  const normal = ui.payrollRowFor({ ...base, code: "GV0099" }, 0, "2026-10", { kpi });
  const owner = ui.payrollRowFor({ ...base, code: "KT0003" }, 0, "2026-10", { kpi });
  assert.ok(normal.tax > 0);
  assert.equal(owner.tax, 0);
  assert.equal(owner.taxExempt, true);
  assert.equal(owner.net, normal.net + normal.tax);
});

test("phụ cấp: ăn trưa 40k × ngày làm việc; lương giờ nhân % giờ cam kết (thấp giảm, cao tăng), lương tháng đủ", () => {
  const ui = loadPayroll();
  const teacher = fixture().teachers[0];
  const kpi = { eligible: 0, late: 0, onTimeRate: 1, lateSessions: [] };
  // Chưa ghi giờ cam kết → đủ phụ cấp; ăn trưa T10/2026 = 40.000 × 27 ngày.
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "HOURLY" }, months: {} });
  const full = ui.payrollRowFor(teacher, 60 * 60, "2026-10", { kpi });
  assert.equal(full.mealAllowance, 1_080_000);
  assert.equal(full.autoAllowance, 1_080_000 + 300_000 + 500_000 + 400_000);
  // Tháng 11/2026 có 25 ngày làm việc → ăn trưa đổi theo tháng.
  assert.equal(ui.payrollRowFor(teacher, 60 * 60, "2026-11", { kpi }).mealAllowance, 1_000_000);

  // Cam kết 120 giờ: dạy 60 giờ = 50% → mọi phụ cấp còn một nửa.
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "HOURLY", committedHours: 120 }, months: {} });
  const half = ui.payrollRowFor(teacher, 60 * 60, "2026-10", { kpi });
  assert.equal(half.allowanceRate, 0.5);
  assert.equal(half.mealAllowance, 540_000);
  assert.equal(half.phoneAllowance, 150_000);
  assert.equal(half.autoAllowance, Math.round(full.autoAllowance / 2));
  // Dạy 150 giờ (dạy thay thêm) = 125% → phụ cấp tăng theo.
  const over = ui.payrollRowFor(teacher, 150 * 60, "2026-10", { kpi });
  assert.equal(over.mealAllowance, 1_350_000);
  assert.equal(over.fuelAllowance, 625_000);

  // Lương tháng luôn nhận đủ phụ cấp dù có ghi giờ cam kết.
  ui.state.data = fixture({ contract: { contractKind: "TT", payMode: "MONTHLY", committedHours: 120 }, months: {} });
  const monthly = ui.payrollRowFor(teacher, 0, "2026-10", { kpi });
  assert.equal(monthly.allowanceRate, 1);
  assert.equal(monthly.mealAllowance, 1_080_000);
});

test("phụ cấp kiểu mới chỉ áp cho phòng ban Giáo viên; trợ giảng giữ ăn ca nguyên mức tháng, không nhân % cam kết", () => {
  const ui = loadPayroll();
  const teacher = fixture().teachers[0];
  const kpi = { eligible: 0, late: 0, onTimeRate: 1, lateSessions: [] };
  ui.state.data = fixture({ contract: { contractKind: "BTG", payMode: "HOURLY", department: "Trợ giảng", committedHours: 120 }, months: {} });
  const assistant = ui.payrollRowFor(teacher, 60 * 60, "2026-10", { kpi });
  assert.equal(assistant.allowanceRate, 1);
  assert.equal(assistant.mealAllowance, 1_200_000);
  assert.equal(assistant.phoneAllowance, 300_000);
});

test("chấm công của tôi: giáo viên chỉ thấy chấm công của chính mình, không chọn được giáo viên khác", () => {
  const ui = loadPayroll();
  const data = fixture({
    teachers: [
      { id: "teacher-1", code: "GV0001", fullName: "Cô Test", phone: "", address: "", email: "t@x.vn", assignedClasses: [] },
      { id: "teacher-2", code: "GV0002", fullName: "Cô Khác", phone: "", address: "", email: "k@x.vn", assignedClasses: [] },
    ],
  });
  data.classes.push({ ...fixtureClass(), id: "class-t2", code: "T2", name: "T2-KHAC", teacherId: "teacher-2" });
  ui.state.data = { ...data, user: { role: "TEACHER", name: "Cô Test", teacherId: "teacher-1" }, calendarEvents: [] };
  ui.state.role = "TEACHER";
  ui.state.timesheetTeacher = "teacher-2"; // dù trước đó chọn người khác vẫn bị khoá về chính mình
  ui.state.timesheetMonth = "2026-10";
  const html = ui.timesheetPage();
  assert.match(html, /<h1>Chấm công của tôi<\/h1>/);
  assert.doesNotMatch(html, /<select class="input" name="teacher">/);
  assert.match(html, /value="Cô Test \(GV0001\)" readonly/);
  assert.equal(ui.state.timesheetTeacher, "teacher-1");
  assert.doesNotMatch(html, /T2-KHAC/);
  assert.doesNotMatch(html, /data-nav="\/lop-hoc\//, "giáo viên không có link sang trang lớp của admin");

  // Admin vẫn xem được tất cả và chọn giáo viên.
  ui.state.role = "ADMIN";
  ui.state.data.user = { role: "ADMIN", name: "Admin" };
  ui.state.timesheetTeacher = "";
  const admin = ui.timesheetPage();
  assert.match(admin, /<h1>Báo cáo chấm công<\/h1>/);
  assert.match(admin, /<select class="input" name="teacher">/);
});
