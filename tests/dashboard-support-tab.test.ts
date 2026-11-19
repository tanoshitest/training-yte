import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/** Dashboard › tab Bổ trợ: học viên vắng có phép trong tháng (lọc tháng 09/2026 – 12/2027). */
function load() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, dashboardPage, dashboardSupportRows, dashboardSupportMonthKey, dashboardSupportReportData };\n");
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 10, 4, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 10, 4, 12).getTime(); }
  };
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/dashboard" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date: FixedDate, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as any).__t;
}

const session = (id: string, classId: string, date: string, attendance: any[], extra: Record<string, unknown> = {}) =>
  ({ id, classId, date, startTime: "17:00", endTime: "19:00", status: "COMPLETED", attendance, ...extra });

test("tab Bổ trợ: liệt kê học viên vắng có phép trong tháng, gộp ngày theo học viên + lớp, bỏ buổi cả lớp nghỉ; lọc lớp + xuất PDF", async () => {
  const t = load();
  t.state.role = "ADMIN";
  t.state.data = {
    user: { role: "ADMIN" }, settings: { branches: [], rooms: [] }, teachers: [],
    students: [{ id: "a", code: "HV1", fullName: "An" }, { id: "b", code: "HV2", fullName: "Bình" }],
    classes: [{ id: "s1", code: "S1", name: "S1", studentIds: ["a", "b"], schedules: [] }, { id: "s2", code: "S2", name: "S2", studentIds: ["a"], schedules: [] }],
    lessonSessions: [
      session("x1", "s1", "2026-11-03", [{ studentId: "a", status: "EXCUSED" }, { studentId: "b", status: "ABSENT" }]),
      session("x2", "s1", "2026-11-10", [{ studentId: "a", status: "EXCUSED" }, { studentId: "b", status: "PRESENT" }]),
      session("x3", "s2", "2026-11-05", [{ studentId: "a", status: "EXCUSED" }]),
      session("x4", "s1", "2026-11-17", [{ studentId: "a", status: "EXCUSED" }, { studentId: "b", status: "EXCUSED" }], { isOff: true }),
      session("x5", "s1", "2026-10-20", [{ studentId: "b", status: "EXCUSED" }]),
    ],
  };
  assert.equal(t.dashboardSupportMonthKey(), "2026-11");
  const rows = JSON.parse(JSON.stringify(t.dashboardSupportRows().map((row: any) => [row.student.fullName, row.cls.code, row.dates])));
  assert.deepEqual(rows, [["An", "S1", ["2026-11-03", "2026-11-10"]], ["An", "S2", ["2026-11-05"]]]);
  t.state.dashboardTab = "support";
  const html = t.dashboardPage();
  assert.match(html, /data-dashboard-tab="attendance">Chuyên cần<\/button><button[^>]*data-dashboard-tab="support">Bổ trợ<\/button>/);
  assert.match(html, /<th>STT<\/th><th>Tên<\/th><th>Lớp<\/th><th>Ngày vắng<\/th>/);
  assert.match(html, /03\/11\/2026, 10\/11\/2026/);
  assert.match(html, /<option value="2026-09"[^>]*>Tháng 09\/2026<\/option>/, "bắt đầu từ tháng 9/2026");
  assert.match(html, /<option value="2027-12"[^>]*>Tháng 12\/2027<\/option>/);
  assert.doesNotMatch(html, /Tháng 08\/2026|Tháng 01\/2028/);
  assert.match(html, /<select class="input" id="dashboard-support-class"><option value="">Tất cả lớp<\/option><option value="s1" >S1<\/option><option value="s2" >S2<\/option><\/select>/);
  assert.match(html, /data-dashboard-support-pdf/);
  t.state.dashboardSupportClass = "s2";
  assert.deepEqual(JSON.parse(JSON.stringify(t.dashboardSupportRows().map((row: any) => [row.student.fullName, row.cls.code]))), [["An", "S2"]]);
  const report = JSON.parse(JSON.stringify(t.dashboardSupportReportData()));
  assert.equal(report.month, "Tháng 11/2026");
  assert.equal(report.filter, "Lớp: S2");
  assert.deepEqual(report.rows, [{ name: "An", code: "HV1", className: "S2", dates: ["05/11/2026"] }]);
  const { buildSupportReportPdf, cleanSupportReportInput, supportReportDownloadName } = await import("../cloudflare/support-report-pdf");
  const font = (name: string) => { const b = fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const bytes = await buildSupportReportPdf({ regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") }, cleanSupportReportInput(report));
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "%PDF");
  assert.equal(supportReportDownloadName(report.month), "hoc-vien-can-bo-tro-2026-11.pdf");
  t.state.dashboardSupportClass = "";
  t.state.dashboardSupportMonth = "2026-10";
  assert.deepEqual(JSON.parse(JSON.stringify(t.dashboardSupportRows().map((row: any) => row.student.fullName))), ["Bình"]);
});
