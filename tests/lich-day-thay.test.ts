import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleanCalendarEvents, validateCalendarEventInput, CALENDAR_EVENT_LABELS } from "../cloudflare/calendar-events";

test("lịch thêm loại Dạy thay: hợp lệ, được giữ khi đọc lại", () => {
  const checked = validateCalendarEventInput({ kind: "DAY_THAY", teacherId: "t1", date: "2026-10-03", startTime: "07:00", endTime: "09:00", note: "T12 (cô Lê Huyền)" }, ["t1"]);
  assert.ok("value" in checked);
  assert.equal(CALENDAR_EVENT_LABELS.DAY_THAY, "Dạy thay");
  const kept = cleanCalendarEvents([{ id: "cal-1", kind: "DAY_THAY", teacherId: "t1", date: "2026-10-03", startTime: "07:00", endTime: "09:00", note: "x" }]);
  assert.equal(kept.length, 1);
});

test("chấm công: lịch Dạy thay vào cột Dạy thay; báo cáo ghi 'Dạy thay + lớp + giáo viên'", () => {
  const src = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.match(src, /column: item\.kind === "DAY_THAY" \? "substitute" : "support"/);
  assert.match(src, /type: "substitute", minutes: sessionMinutesOf\(item\), className: note \? `Dạy thay \$\{note\}`/);
  assert.match(src, /className: entry\.column === "substitute" \? timesheetSubstituteLabel\(session, cls\)/);
  assert.match(src, /return `Dạy thay \$\{code\}\$\{name \? ` \(cô \$\{name\}\)` : ""\}`/);
});
