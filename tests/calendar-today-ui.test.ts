import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

class FixedDate extends Date {
  constructor(value?: string | number | Date) {
    super(value === undefined ? "2026-09-10T12:00:00" : value);
  }
  static now() { return new Date("2026-09-10T12:00:00").getTime(); }
}

function loadCalendarBoard() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__calendarTodayTest = { state, calendarBoard };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
    location: { pathname: "/lich-day" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date: FixedDate,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  return (context as typeof context & {
    __calendarTodayTest: { state: Record<string, any>; calendarBoard: (items: any[], days: Date[]) => string };
  }).__calendarTodayTest;
}

test("teaching calendar highlights the whole current-day column", () => {
  const ui = loadCalendarBoard();
  ui.state.data = { classes: [{ id: "class-1", name: "Lớp hôm nay" }], teachers: [] };
  ui.state.calendarView = "week";
  const days = Array.from({ length: 7 }, (_, index) => new FixedDate(new Date(2026, 8, 7 + index, 12)));
  const html = ui.calendarBoard([{
    id: "session-1", classId: "class-1", teacherId: "", date: "2026-09-10",
    startTime: "17:00", endTime: "19:00", status: "SCHEDULED", isExtra: false,
  }], days);
  assert.match(html, /calendar-day-head is-today" aria-current="date"/);
  assert.match(html, /calendar-cell is-today"[^>]*aria-current="date"/);

  const styles = fs.readFileSync(new URL("../cloudflare/public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.calendar-day-head\.is-today \{[^}]*background: #cbd5e1/);
  assert.match(styles, /\.calendar-cell\.is-today \{[^}]*background: #e2e8f0/);
});
