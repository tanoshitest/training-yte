import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/** Lớp đổi giáo viên phụ trách giữa tháng (S22 tháng 10/2026): buổi ghi chú "[Phụ trách]" không bị coi là dạy thay. */
function load() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, timesheetTeacherRows, timesheetSessions };\n");
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 10, 5, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 10, 5, 12).getTime(); }
  };
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, TextEncoder, Intl, Date: FixedDate, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as any).__t;
}
const cls = { id: "c22", code: "S22", name: "S22", billingMode: "PER_SESSION", sessionPrice: 100_000, branchId: "b", status: "ACTIVE", teacherId: "van", studentIds: [],
  schedules: [{ weekday: 5, periodId: "p", startTime: "19:00", endTime: "21:00" }] };
const sess = (date: string, teacherId: string, note = "") => ({ id: `s-${date}`, classId: "c22", date, startTime: "19:00", endTime: "21:00", teacherId, status: "COMPLETED", isExtra: false,
  recurrenceKey: `c22|${date}|19:00`, note, isOff: false, attendance: [] });
// Huyền 02, 06, 16, 18; Vân 09, 23, 25, 30 (hòa 4–4 → giáo viên hiện tại là Vân)
const plan = [["2026-10-02", "huyen"], ["2026-10-06", "huyen"], ["2026-10-09", "van"], ["2026-10-16", "huyen"], ["2026-10-18", "huyen"], ["2026-10-23", "van"], ["2026-10-25", "van"], ["2026-10-30", "van"]];
function rows(note: string) {
  const t = load();
  t.state.data = { students: [], classes: [cls], lessonSessions: plan.map(([d, who]) => sess(d!, who!, note)),
    teachers: [{ id: "van", code: "GV1", fullName: "Dương Thị Vân" }, { id: "huyen", code: "GV2", fullName: "Thanh Huyền" }],
    settings: { branches: [], rooms: [] }, finance: { sepay: { receivables: [], payments: [], receipts: [], invoices: [] }, cashbook: [] } };
  const r = t.timesheetTeacherRows(t.timesheetSessions("", { from: "2026-10-01", to: "2026-10-31" }));
  return Object.fromEntries(r.map((x: any) => [x.teacher.code, { off: x.off / 60, thay: x.substitute / 60, actual: x.actual / 60 }]));
}

test("không đánh dấu: giáo viên đứng 4 buổi bị coi là dạy thay (hành vi cũ)", () => {
  const r = rows("");
  assert.equal(r.GV2.thay, 8);
  assert.equal(r.GV1.off, 8);
});

test("đánh dấu [Phụ trách]: mỗi cô chấm công theo lịch, không nghỉ / dạy thay", () => {
  const r = rows("[Phụ trách]");
  assert.equal(r.GV2.thay, 0);
  assert.equal(r.GV2.off, 0);
  assert.equal(r.GV1.thay, 0);
  assert.equal(r.GV1.off, 0);
  assert.equal(r.GV2.actual, 8);
  assert.equal(r.GV1.actual, 8);
});
