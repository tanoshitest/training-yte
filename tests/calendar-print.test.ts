import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/** Lịch dạy: nút In lịch bên phải Thêm lịch, in theo ngày / tuần / tháng theo bộ lọc đang chọn. */
test("lịch dạy: In lịch ngày / tuần / tháng ra PDF", async () => {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t = { state, calendarPage, calendarPrintData };\n");
  const FixedDate = class extends Date {
    constructor(...args: unknown[]) { if (args.length === 0) super(2026, 10, 4, 12); else super(...(args as [any])); }
    static now() { return new Date(2026, 10, 4, 12).getTime(); }
  };
  const context = vm.createContext({
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} },
    location: { pathname: "/lich-day", origin: "https://example.test" }, history: { pushState: () => {}, replaceState: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date: FixedDate, URL, URLSearchParams,
  });
  vm.runInContext(source, context);
  const t = (context as any).__t;
  t.state.role = "ADMIN";
  t.state.calendarDate = "2026-11-04";
  t.state.data = {
    user: { role: "ADMIN" }, students: [], lessonSessions: [],
    teachers: [{ id: "t1", code: "GV1", fullName: "Kim Chi" }, { id: "t2", code: "GV2", fullName: "Thanh Huyền" }],
    classes: [
      { id: "c1", code: "S31", name: "S31 Ket", teacherId: "t1", status: "ACTIVE", studentIds: [], courseStartDate: "2026-09-01", schedules: [{ weekday: 6, startTime: "07:00", endTime: "09:00", periodId: "p" }] },
      { id: "c2", code: "S2", name: "S2 Movers", teacherId: "t2", status: "ACTIVE", studentIds: [], courseStartDate: "2026-09-01", schedules: [{ weekday: 3, startTime: "17:30", endTime: "19:00", periodId: "p" }] },
    ],
    settings: { branches: [], rooms: [], periods: [] },
    calendarEvents: [{ id: "e1", kind: "KEM_LOP", teacherId: "t2", date: "2026-11-07", startTime: "10:00", endTime: "11:30", note: "S16" }],
  };
  const page = t.calendarPage();
  assert.match(page, /data-calendar-add>＋ Thêm lịch<\/button><details class="calendar-print">/, "In lịch nằm bên phải Thêm lịch");
  for (const mode of ["day", "week", "month"]) assert.match(page, new RegExp(`data-calendar-print="${mode}"`));

  const { buildCalendarPrintPdf, cleanCalendarPrintInput, calendarPrintDownloadName } = await import("../cloudflare/calendar-print-pdf");
  const font = (name: string) => { const b = fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const fonts = { regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") };
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

  const week = plain(t.calendarPrintData("week"));
  assert.equal(week.title, "LỊCH DẠY TUẦN 02/11/2026 – 08/11/2026");
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.rows.map((row: any) => [row.date, row.title, row.teacher]), [["2026-11-04", "S2 Movers", "Thanh Huyền"], ["2026-11-07", "S31 Ket", "Kim Chi"], ["2026-11-07", "Kèm hỗ trợ lớp", "Thanh Huyền"]]);
  assert.equal(calendarPrintDownloadName(week), "lich-day-tuan-2026-11-02_2026-11-08.pdf");
  for (const data of [week, plain(t.calendarPrintData("month")), plain(t.calendarPrintData("day"))]) {
    const bytes = await buildCalendarPrintPdf(fonts, cleanCalendarPrintInput(data));
    assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "%PDF");
  }

  const month = plain(t.calendarPrintData("month"));
  assert.equal(month.title, "LỊCH DẠY THÁNG 11/2026");
  assert.equal(month.days.length, 30, "tháng chỉ in ngày của tháng");
  assert.equal(calendarPrintDownloadName(month), "lich-day-thang-2026-11.pdf");

  const day = plain(t.calendarPrintData("day"));
  assert.equal(day.title, "LỊCH DẠY THỨ 4 04/11/2026");
  assert.deepEqual(day.rows.map((row: any) => row.title), ["S2 Movers"]);

  t.state.calendarTeacher = "t1";
  const mine = plain(t.calendarPrintData("week"));
  assert.match(mine.filter, /Giáo viên: Kim Chi/);
  assert.deepEqual(mine.rows.map((row: any) => row.title), ["S31 Ket"]);
});
