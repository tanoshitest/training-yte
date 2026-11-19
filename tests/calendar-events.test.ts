import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { cleanCalendarEvents, validateCalendarEventInput, timeRangesOverlap } from "../cloudflare/calendar-events";

test("calendar event input is validated", () => {
  const ok = validateCalendarEventInput({ kind: "TEST_SPEAKING", teacherId: "t1", date: "2026-10-27", startTime: "17:00", endTime: "21:00", note: " test " }, ["t1"]);
  assert.deepEqual(ok, { value: { kind: "TEST_SPEAKING", teacherId: "t1", date: "2026-10-27", startTime: "17:00", endTime: "21:00", note: "test" } });
  assert.ok("error" in validateCalendarEventInput({ kind: "MAKEUP", teacherId: "t1", date: "2026-10-27", startTime: "17:00", endTime: "18:00" }, ["t1"]));
  assert.ok("error" in validateCalendarEventInput({ kind: "KEM_LOP", teacherId: "x", date: "2026-10-27", startTime: "17:00", endTime: "18:00" }, ["t1"]));
  assert.ok("error" in validateCalendarEventInput({ kind: "KEM_LOP", teacherId: "t1", date: "2026-10-27", startTime: "18:00", endTime: "18:00" }, ["t1"]));
  assert.equal(cleanCalendarEvents([{ id: "a", kind: "KEM_LOP" }, { id: "b", kind: "NOPE" }, null]).length, 1);
  assert.equal(timeRangesOverlap("17:00", "19:00", "19:00", "20:00"), false);
  assert.equal(timeRangesOverlap("17:00", "19:01", "19:00", "20:00"), true);
});

class FixedDate extends Date {
  constructor(...args: any[]) { if (!args.length) super("2026-10-27T12:00:00"); else super(...(args as [any])); }
  static now() { return new Date("2026-10-27T12:00:00").getTime(); }
}

function loadUi() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t = { state, calendarBoard, teacherScheduleConflicts, calendarEventModalHtml, calendarMakeupModalHtml, calendarPage };\n");
  const context = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/lich-day" }, history: { pushState: () => {}, replaceState: () => {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date: FixedDate, URL, URLSearchParams });
  vm.runInContext(source, context);
  return (context as any).__t;
}

function seed(ui: any) {
  ui.state.role = "ADMIN";
  ui.state.calendarView = "week";
  ui.state.calendarDate = "2026-10-27";
  ui.state.data = {
    classes: [{ id: "c1", name: "S1", code: "S1", teacherId: "t1", status: "ACTIVE", schedules: [] }],
    teachers: [{ id: "t1", fullName: "Cô Vân", code: "GV1" }, { id: "t2", fullName: "Cô Trinh", code: "GV2" }],
    settings: { branches: [], rooms: [] },
    lessonSessions: [{ id: "s1", classId: "c1", date: "2026-10-27", startTime: "17:00", endTime: "19:00", teacherId: "t1", status: "SCHEDULED", isExtra: true, attendance: [] }],
    calendarEvents: [{ id: "e1", kind: "TEST_SPEAKING", teacherId: "t1", date: "2026-10-27", startTime: "18:00", endTime: "21:00", note: "Test đầu vào" }],
  };
}

test("Thêm lịch replaces per-cell + and events span rows with conflict tag", () => {
  const ui = loadUi(); seed(ui);
  const page = ui.calendarPage();
  assert.doesNotMatch(page, /data-makeup-add/);
  assert.match(page, /data-calendar-add>＋ Thêm lịch/);
  const days = Array.from({ length: 7 }, (_, i) => new FixedDate(2026, 9, 26 + i, 12));
  const html = ui.calendarBoard(ui.state.data.lessonSessions, days, ui.state.data.calendarEvents);
  // Hàng 17:00–19:00 (lớp) + hàng 18:00–21:00 (lịch thêm, không có lớp nào chồng hết) → thẻ kéo qua 2 hàng.
  assert.match(html, /class="calendar-event-slot" style="grid-column:4;grid-row:2 \/ 4"/);
  assert.match(html, /calendar-event kind-test_speaking has-conflict/);
  assert.match(html, /Trùng lịch/);
});

test("conflict check covers class sessions and other events of the same teacher only", () => {
  const ui = loadUi(); seed(ui);
  assert.deepEqual([...ui.teacherScheduleConflicts("t1", "2026-10-27", "18:30", "19:30").map((r: any) => r.label)], ["S1", "Test speaking"]);
  assert.deepEqual([...ui.teacherScheduleConflicts("t1", "2026-10-27", "18:30", "19:30", { excludeEventId: "e1" }).map((r: any) => r.label)], ["S1"]);
  assert.equal(ui.teacherScheduleConflicts("t2", "2026-10-27", "18:30", "19:30").length, 0);
  assert.equal(ui.teacherScheduleConflicts("t1", "2026-10-27", "21:00", "22:00").length, 0);
});

test("Thêm lịch modal has 5 kinds and shows conflict warning", () => {
  const ui = loadUi(); seed(ui);
  ui.state.calendarEvent = { kind: "KEM_SPEAKING", teacherId: "t1", date: "2026-10-27", startTime: "17:30", endTime: "18:30", note: "" };
  const html = ui.calendarEventModalHtml();
  for (const label of ["Dạy bù", "Test speaking", "Kèm speaking", "Kèm hỗ trợ cá nhân", "Kèm hỗ trợ lớp"]) assert.match(html, new RegExp(label));
  assert.match(html, /Trùng lịch — Cô Vân đã có 2 lịch/);
  ui.state.calendarEvent = null;
  ui.state.calendarMakeup = { date: "2026-10-27", startTime: "", endTime: "", teacherId: "", offSessionId: "" };
  assert.match(ui.calendarMakeupModalHtml(), /data-calendar-add-kind="MAKEUP"[^>]*>|calendar-add-kind kind-makeup active/);
});

test("lọc Bổ trợ thay cho lọc chi nhánh: chỉ hiện lịch bổ trợ", () => {
  const ui = loadUi(); seed(ui);
  let page = ui.calendarPage();
  assert.doesNotMatch(page, /Tất cả chi nhánh/);
  assert.match(page, /<select class="input" name="kind" aria-label="Loại lịch"><option value="">Tất cả<\/option><option value="SUPPORT" >Bổ trợ<\/option>/);
  assert.match(page, /data-session-view="s1"/);
  ui.state.calendarKind = "SUPPORT";
  page = ui.calendarPage();
  assert.doesNotMatch(page, /data-session-view="s1"/);
  assert.match(page, /data-calendar-event="e1"/);
});
