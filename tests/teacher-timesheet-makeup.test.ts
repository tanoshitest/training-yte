import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Chấm công + dạy bù (chốt với trung tâm 23/10/2026):
 * thực tế = lý thuyết − nghỉ không lương + dạy bù + dạy không tính phí; nghỉ lễ
 * (admin tick) không lương; lớp tháng nghỉ không bù thì tháng sau khấu trừ, đã bù
 * thì không; lớp khóa buổi nghỉ chờ bù tới khi bù. Hôm nay cố định 23/10/2026.
 */
function load() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, timesheetTeacherRows, timesheetSessions, timesheetCalendarEvents, timesheetReportData, timesheetViewRange, timesheetPage, teacherOffCreditSessions, billedMonthSessions, teacherOffSessionsNeedingMakeup };\n");
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 9, 23, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 9, 23, 12).getTime(); }
  };
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/ke-toan/cham-cong" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, TextEncoder, Intl, Date: FixedDate, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as any).__t;
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
// Lớp tháng học thứ 6 (2 tiếng): tháng 10/2026 có 02, 09, 16, 23, 30.
const monthly = { id: "m1", code: "T16", name: "T16", billingMode: "MONTHLY", sessionPrice: 60_000, branchId: "b", status: "ACTIVE", teacherId: "chi", studentIds: [],
  schedules: [{ weekday: 5, periodId: "fri", startTime: "17:00", endTime: "19:00" }] };
const session = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, classId: "m1", date, startTime: "17:00", endTime: "19:00", teacherId: "chi", status: "COMPLETED", isExtra: false,
  recurrenceKey: `m1|${date}|17:00`, isOff: false, attendance: [], ...extra,
});

function seed(t: any, sessions: any[]) {
  t.state.data = {
    students: [], classes: [monthly], lessonSessions: sessions,
    teachers: [{ id: "chi", code: "GV1", fullName: "Kim Chi" }, { id: "huyen", code: "GV2", fullName: "Thanh Huyền" }],
    settings: { branches: [], rooms: [] }, finance: { sepay: { receivables: [], payments: [], receipts: [], invoices: [] }, cashbook: [] },
  };
  t.state.timesheetMonth = "2026-10";
}
const rowsOf = (t: any) => Object.fromEntries(t.timesheetTeacherRows(t.timesheetSessions("", { from: "2026-10-01", to: "2026-10-31" }))
  .map((row: any) => [row.teacher.code, { lt: row.total / 60, le: row.holiday / 60, off: row.off / 60, bu: row.makeup / 60, free: row.noFee / 60, tt: row.actual / 60, notes: row.notes }]));

test("chấm công: GV nghỉ không lương, GV khác dạy bù được cộng giờ, nghỉ lễ không lương, không tính phí vẫn chấm công", () => {
  const t = load();
  seed(t, [
    session("s02", "2026-10-02", { isOff: true, offSource: "ADMIN" }),
    session("s09", "2026-10-09", { isOff: true, offSource: "TEACHER" }),
    session("s16", "2026-10-16", { noFee: true }),
    { ...session("mk", "2026-10-20", { teacherId: "huyen", isExtra: true, makeupOf: "s09" }), recurrenceKey: "m1|2026-10-20|17:00" },
  ]);
  const rows = plain(rowsOf(t));
  assert.deepEqual(rows.GV1, { lt: 6, le: 2, off: 2, bu: 0, free: 2, tt: 2, notes: ["Nghỉ T16 09/10: đã dạy bù 20/10 (Thanh Huyền)"] },
    "lý thuyết cả tháng 09, 23, 30 = 6 giờ; thực tế realtime (hôm nay 23/10 trưa, buổi 23 và 30 chưa qua): lý thuyết đã qua 2 − nghỉ 2 + không tính phí 2 = 2");
  assert.deepEqual(rows.GV2, { lt: 0, le: 0, off: 0, bu: 2, free: 0, tt: 2, notes: ["Dạy bù T16 20/10 cho Kim Chi buổi 09/10"] });
  const html = t.timesheetPage();
  for (const header of ["Nghỉ lễ", "Nghỉ không lương", "Dạy bù", "Dạy không tính phí", "Chấm công thực tế", "Ghi chú"]) assert.match(html, new RegExp(`<th>${header}</th>`));
});

test("buổi thêm ghi 'học bù' chưa nối với buổi nghỉ được nêu ở ghi chú", () => {
  const t = load();
  seed(t, [session("s09", "2026-10-09", { isOff: true, offSource: "TEACHER" }), { ...session("x", "2026-10-21", { isExtra: true, note: "Học bù buổi 2026-10-09" }), recurrenceKey: "m1|2026-10-21|17:00" }]);
  assert.deepEqual(plain(rowsOf(t).GV1.notes), ["Nghỉ T16 09/10: chưa dạy bù", "Buổi thêm T16 21/10 ghi \"học bù\" nhưng chưa nối với buổi nghỉ"]);
});

test("lớp tháng: nghỉ không bù → tháng sau khấu trừ; đã bù → không khấu trừ, buổi bù không thu thêm", () => {
  const t = load();
  const off = session("s09", "2026-10-09", { isOff: true, offSource: "TEACHER" });
  seed(t, [off]);
  assert.equal(t.teacherOffCreditSessions(monthly, t.state.data.lessonSessions, "2026-11"), 1);
  const billedBefore = t.billedMonthSessions(monthly, t.state.data.lessonSessions, "2026-10");
  seed(t, [off, { ...session("mk", "2026-10-20", { isExtra: true, makeupOf: "s09" }), recurrenceKey: "m1|2026-10-20|17:00" }]);
  assert.equal(t.teacherOffCreditSessions(monthly, t.state.data.lessonSessions, "2026-11"), 0, "đã dạy bù — không khấu trừ");
  assert.equal(t.billedMonthSessions(monthly, t.state.data.lessonSessions, "2026-10"), billedBefore, "buổi bù không tính phí thêm");
});

test("danh sách chờ dạy bù: lớp tháng chỉ tháng này, lớp khóa giữ cả buổi nghỉ tháng trước", () => {
  const t = load();
  const course = { ...monthly, id: "c1", code: "S33", name: "S33", billingMode: "COURSE", courseSessions: 24, courseStartDate: "2026-09-04" };
  seed(t, [
    session("m-sep", "2026-09-25", { isOff: true, offSource: "TEACHER" }),
    session("m-oct", "2026-10-09", { isOff: true, offSource: "TEACHER" }),
    { ...session("c-sep", "2026-09-25", { isOff: true, offSource: "TEACHER" }), classId: "c1", recurrenceKey: "c1|2026-09-25|17:00" },
  ]);
  t.state.data.classes.push(course);
  assert.deepEqual(plain(t.teacherOffSessionsNeedingMakeup("").map((item: any) => item.id)), ["c-sep", "m-oct"]);
});

test("dạy thay khác dạy bù: buổi theo lịch đổi giáo viên → GV chính nghỉ không lương, GV thay cộng cột Dạy thay", () => {
  const t = load();
  seed(t, [
    session("s02", "2026-10-02"),
    session("s09", "2026-10-09", { teacherId: "huyen" }),
    session("s16", "2026-10-16"),
  ]);
  const rows = t.timesheetTeacherRows(t.timesheetSessions("", { from: "2026-10-01", to: "2026-10-31" }));
  const pick = (code: string) => { const row = rows.find((item: any) => item.teacher.code === code); return plain({ lt: row.total / 60, off: row.off / 60, thay: row.substitute / 60, bu: row.makeup / 60, tt: row.actual / 60, notes: row.notes }); };
  assert.deepEqual(pick("GV1"), { lt: 10, off: 2, thay: 0, bu: 0, tt: 4, notes: ["Nghỉ T16 09/10: Thanh Huyền dạy thay"] },
    "lý thuyết cả tháng 10 giờ; thực tế tới 23/10 trưa: 02, 09, 16 đã qua (6 giờ) − 2 giờ dạy thay = 4");
  assert.deepEqual(pick("GV2"), { lt: 0, off: 0, thay: 2, bu: 0, tt: 2, notes: ["Dạy thay T16 09/10 cho Kim Chi"] });
  // Nhật ký từng GV: buổi dạy thay hiện ở cả hai người với nhãn riêng.
  t.state.timesheetTeacher = "huyen";
  assert.match(t.timesheetPage(), /badge-blue">Dạy thay<\/span>/);
  t.state.timesheetTeacher = "chi";
  assert.match(t.timesheetPage(), /Nghỉ không lương<\/span><small class="people-subline">Nghỉ T16 09\/10: Thanh Huyền dạy thay/);
});

test("lớp đổi hẳn giáo viên (người trước dạy cả tháng) không bị tính là dạy thay", () => {
  const t = load();
  seed(t, ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"].map((date) => session(`s${date}`, date, { teacherId: "huyen" })));
  const rows = t.timesheetTeacherRows(t.timesheetSessions("", { from: "2026-10-01", to: "2026-10-31" }));
  assert.deepEqual(plain(rows.map((row: any) => [row.teacher.code, row.total / 60, row.substitute / 60, row.off / 60])), [["GV2", 10, 0, 0]]);
});

test("lịch dạy: tag Dạy bù / Dạy thay / Nghỉ học trên thẻ buổi học", () => {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__c = { state, sessionCard };\n");
  const context = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/lich-day" }, history: { pushState: () => {}, replaceState: () => {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(source, context);
  const c = (context as any).__c;
  const t = load();
  seed(t, []);
  c.state.data = t.state.data;
  const tagsOf = (item: any) => [...c.sessionCard(item).matchAll(/calendar-tag[^"]*">([^<]+)</g)].map((m: RegExpMatchArray) => m[1]);
  c.state.data.lessonSessions = [session("s02", "2026-10-02"), session("s09", "2026-10-09", { teacherId: "huyen" }), session("s16", "2026-10-16", { isOff: true, offSource: "TEACHER" })];
  const mk = { ...session("mk", "2026-10-20", { teacherId: "huyen", isExtra: true, makeupOf: "s16" }), recurrenceKey: "m1|2026-10-20|17:00" };
  c.state.data.lessonSessions.push(mk);
  assert.deepEqual(tagsOf(c.state.data.lessonSessions[1]), ["Dạy thay"]);
  assert.deepEqual(tagsOf(c.state.data.lessonSessions[2]), ["Nghỉ học"]);
  assert.deepEqual(tagsOf(mk), ["Dạy bù"], "buổi bù do GV khác dạy vẫn là dạy bù, không phải dạy thay");
  assert.deepEqual(tagsOf(c.state.data.lessonSessions[0]), []);
});

test("lịch thêm (test / kèm speaking, kèm hỗ trợ) chấm công vào cột Bổ trợ, chỉ tính khi đã qua", () => {
  const t = load();
  seed(t, [session("s09", "2026-10-09")]);
  t.state.data.calendarEvents = [
    { id: "e1", kind: "TEST_SPEAKING", teacherId: "huyen", date: "2026-10-20", startTime: "14:00", endTime: "15:30", note: "Test đầu vào" },
    { id: "e2", kind: "KEM_LOP", teacherId: "chi", date: "2026-10-21", startTime: "08:00", endTime: "09:00", note: "" },
    { id: "e3", kind: "KEM_SPEAKING", teacherId: "huyen", date: "2026-10-28", startTime: "14:00", endTime: "15:00", note: "" },
    { id: "e4", kind: "KEM_CA_NHAN", teacherId: "huyen", date: "2026-09-28", startTime: "14:00", endTime: "15:00", note: "" },
  ];
  const range = { from: "2026-10-01", to: "2026-10-31" };
  const rows = plain(Object.fromEntries(t.timesheetTeacherRows(t.timesheetSessions("", range), t.timesheetCalendarEvents("", range))
    .map((row: any) => [row.teacher.code, { support: row.support / 60, tt: row.actual / 60, notes: row.notes }])));
  assert.deepEqual(rows.GV2, { support: 1.5, tt: 1.5, notes: ["Test speaking 20/10 14:00–15:30: Test đầu vào"] }, "28/10 chưa qua, 28/09 khác tháng");
  assert.deepEqual(rows.GV1, { support: 1, tt: 7, notes: ["Kèm hỗ trợ lớp 21/10 08:00–09:00"] }, "lịch lớp thứ 6 đã qua 02, 09, 16 = 6 giờ + bổ trợ 1");
  const html = t.timesheetPage();
  assert.match(html, /<th>Test speaking<\/th><th>Kèm speaking<\/th><th>Kèm cá nhân<\/th><th>Kèm lớp<\/th><th>Tổng buổi<\/th><th>Chấm công thực tế<\/th>/);
});

test("chấm công: lọc từ ngày–đến ngày, Xuất PDF mỗi giáo viên bao nhiêu buổi, từng buổi loại gì", async () => {
  const t = load();
  seed(t, [session("s09", "2026-10-09", { isOff: true, offSource: "TEACHER" })]);
  t.state.data.calendarEvents = [{ id: "e1", kind: "KEM_SPEAKING", teacherId: "huyen", date: "2026-10-20", startTime: "14:00", endTime: "15:30", note: "Kèm An" }];
  const page = t.timesheetPage();
  assert.match(page, /data-timesheet-export>.*Xuất PDF/);
  assert.match(page, /name="from" value="2026-10-01"/);
  assert.match(page, /name="to" value="2026-10-31"/);
  // Bảng chính có đủ cột như file PDF: từng loại test / kèm riêng, số buổi dưới số giờ, Tổng buổi.
  assert.match(page, /<th>Dạy không tính phí<\/th><th>Test speaking<\/th><th>Kèm speaking<\/th><th>Kèm cá nhân<\/th><th>Kèm lớp<\/th><th>Tổng buổi<\/th><th>Chấm công thực tế<\/th>/);
  assert.match(page, /data-timesheet-teacher="huyen">Thanh Huyền<\/button><\/td>(<td>[^]*?<\/td>){7}<td>1,5<small class="people-subline">1 buổi<\/small><\/td><td>0<\/td><td>0<\/td><td><strong>1<\/strong><\/td>/, "Thanh Huyền: kèm speaking 1,5 giờ · 1 buổi, tổng 1 buổi");
  assert.match(page, /Kim Chi<\/button><\/td><td>[^<]*<small class="people-subline">2 buổi đã dạy<\/small>/);
  assert.doesNotMatch(page, /timesheet-teacher-block|Tổng hợp buổi dạy theo loại/);
  // Đồng hồ test = 23/10: lớp thứ 6 của Kim Chi đã dạy 02, 16 (09 nghỉ → không tính); Thanh Huyền 1 buổi kèm speaking.
  const all = plain(t.timesheetReportData());
  assert.equal(all.period, "Tháng 10/2026");
  assert.equal(all.filter, "Tất cả giáo viên");
  assert.equal(all.totalCount, 3);
  assert.equal(all.totalHours, "5,5");
  assert.deepEqual(all.teachers.map((row: any) => [row.name, row.regular, row.support, row.count, row.hours]), [["Kim Chi", 2, 0, 2, "4,0"], ["Thanh Huyền", 0, 1, 1, "1,5"]]);
  // Chi tiết hiện cả dòng Nghỉ không lương (chỉ đối chiếu, counted=false) giống trang web; số buổi / giờ chỉ tính dòng counted.
  assert.deepEqual(all.teachers[0].sessions.map((row: any) => [row.date, row.weekday, row.type, row.hours, row.counted]), [["02/10/2026", "Thứ 6", "Theo lịch", "2,0", true], ["09/10/2026", "Thứ 6", "Nghỉ không lương", "2,0", false], ["16/10/2026", "Thứ 6", "Theo lịch", "2,0", true]]);
  assert.equal(all.teachers[0].sessions.filter((row: any) => row.counted).length, all.teachers[0].count);
  assert.equal(all.teachers[1].sessions[0].type, "Kèm speaking");

  t.state.timesheetFrom = "2026-10-20";
  t.state.timesheetTo = "2026-10-16";
  assert.deepEqual({ ...t.timesheetViewRange() }, { from: "2026-10-16", to: "2026-10-20" }, "nhập ngược thì đảo lại");
  t.state.timesheetTeacher = "chi";
  const one = plain(t.timesheetReportData());
  assert.equal(one.period, "Từ ngày 16/10/2026 đến ngày 20/10/2026");
  assert.equal(one.filter, "Giáo viên: Kim Chi (GV1)");
  assert.deepEqual(one.teachers.map((row: any) => [row.name, row.count]), [["Kim Chi", 1]]);

  // Máy chủ vẽ được PDF từ dữ liệu này.
  const { buildTimesheetReportPdf, cleanTimesheetReportInput, timesheetReportDownloadName } = await import("../cloudflare/timesheet-report-pdf");
  const font = (name: string) => { const b = fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const bytes = await buildTimesheetReportPdf({ regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") }, cleanTimesheetReportInput(all));
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "%PDF");
  assert.equal(timesheetReportDownloadName(all.period), "bao-cao-buoi-day-2026-10.pdf");
  assert.equal(timesheetReportDownloadName(one.period), "bao-cao-buoi-day-2026-10-16_2026-10-20.pdf");
});

test("chấm công tất cả giáo viên: đủ nhân sự (GV, trợ giảng, kế toán) kể cả 0 buổi; Audit Lê Hà từ 11/2026", () => {
  const t = load();
  seed(t, [session("s02", "2026-10-02")]);
  t.state.data.teachers.push({ id: "tg1", code: "GV14", fullName: "Trợ Giảng Một" }, { id: "gv0", code: "GV17", fullName: "Giáo Viên Mới" });
  t.state.data.accountants = [{ id: "kt1", code: "KT0003", fullName: "Kế Toán A" }];
  t.state.data.payrollConfig = { teachers: { tg1: { department: "Trợ giảng" } }, months: {} };
  t.state.data.audits = [{ id: "au1", code: "AU01", fullName: "Lê Hà" }, { id: "au2", code: "AU02", fullName: "Audit Khác" }];
  const october = t.timesheetPage();
  assert.match(october, /Kim Chi<\/button>/);
  assert.match(october, /data-timesheet-teacher="gv0">Giáo Viên Mới<\/button>/, "giáo viên 0 buổi vẫn có dòng");
  assert.match(october, /data-timesheet-teacher="tg1">Trợ Giảng Một<\/button>/, "trợ giảng 0 buổi vẫn có dòng");
  assert.match(october, /<span class="table-link timesheet-staff-name">Kế Toán A<\/span>/, "kế toán có dòng, tên như giáo viên, không ghi vai trò");
  assert.doesNotMatch(october, /Lê Hà/, "tháng 10 Lê Hà chưa đi làm");
  assert.doesNotMatch(october, /Audit Khác/);
  t.state.timesheetMonth = "2026-11";
  const november = t.timesheetPage();
  assert.match(november, /timesheet-staff-name">Lê Hà<\/span>/, "từ tháng 11 có Lê Hà");
  assert.match(november, /Trợ Giảng Một<\/button>/);
  assert.doesNotMatch(november, /Audit Khác/, "audit khác không lên bảng");
  // Bộ lọc phòng ban như Báo cáo lương.
  assert.match(november, /<select class="input" name="department"><option value="ALL" selected>Tất cả phòng ban<\/option><option value="ASSISTANT" >Trợ giảng<\/option><option value="TEACHER" >Giáo viên<\/option><option value="OPS" >Vận hành<\/option><\/select>/);
  const names = (html: string) => [...html.matchAll(/(?:data-timesheet-teacher="[^"]+"|timesheet-staff-name")>([^<]+)</g)].map((m) => m[1]);
  t.state.timesheetDepartment = "ASSISTANT";
  assert.deepEqual(names(t.timesheetPage()), ["Trợ Giảng Một"]);
  t.state.timesheetDepartment = "TEACHER";
  assert.deepEqual(names(t.timesheetPage()), ["Kim Chi", "Thanh Huyền", "Giáo Viên Mới"]);
  t.state.timesheetDepartment = "OPS";
  assert.deepEqual(names(t.timesheetPage()), ["Kế Toán A", "Lê Hà"]);
});
