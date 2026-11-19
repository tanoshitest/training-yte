import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildTimesheetReportPdf, cleanTimesheetReportInput } from "../cloudflare/timesheet-report-pdf";

const font = (name: string) => { const b = fs.readFileSync(new URL(`../cloudflare/public/fonts/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

test("PDF chấm công: bổ trợ tách thành Test speaking / Kèm speaking / Kèm cá nhân / Kèm lớp", async () => {
  const input = cleanTimesheetReportInput({
    period: "Tháng 10/2026", totalCount: 3, totalHours: "6,0",
    teachers: [{ name: "Nguyễn Thuý Hằng", code: "GV0015", regular: 0, makeup: 0, substitute: 0, support: 3, count: 3, hours: "6,0",
      byType: { TEST_SPEAKING: 1, KEM_SPEAKING: 0, KEM_CA_NHAN: 1, KEM_LOP: 1 }, sessions: [] }],
  } as any);
  const t = input.teachers[0]!;
  assert.deepEqual([t.testSpeaking, t.kemSpeaking, t.kemCaNhan, t.kemLop], [1, 0, 1, 1]);
  const bytes = await buildTimesheetReportPdf({ regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") }, input);
  assert.ok(bytes.length > 1000);
  // Thiếu byType (client cũ) vẫn không lỗi.
  const old = cleanTimesheetReportInput({ teachers: [{ name: "A", support: 2 }] } as any);
  assert.deepEqual([old.teachers[0]!.testSpeaking, old.teachers[0]!.kemLop], [0, 0]);
});

test("PDF chấm công: dòng Nghỉ không lương / Nghỉ lễ đưa vào chi tiết (chỉ đối chiếu, không tính tổng)", async () => {
  const input = cleanTimesheetReportInput({
    period: "Tháng 10/2026", totalCount: 1, totalHours: "2,0",
    teachers: [{ name: "Lê Thị Huyền", code: "GV0009", regular: 1, count: 1, hours: "2,0", sessions: [
      { date: "24/10/2026", weekday: "Thứ 7", time: "09:00–11:00", className: "S4 (S4)", type: "Theo lịch", hours: "2,0", counted: true },
      { date: "25/10/2026", weekday: "CN", time: "14:30–16:30", className: "Nghỉ T14 25/10: Nguyễn Thị Thanh Huyền dạy thay", type: "Nghỉ không lương", hours: "2,0", counted: false },
      { date: "26/10/2026", weekday: "Thứ 2", time: "17:00–19:00", className: "T12", type: "Nghỉ lễ", hours: "2,0" },
    ] }],
  } as any);
  assert.deepEqual(input.teachers[0]!.sessions.map((s) => s.counted), [true, false, true]);
  const bytes = await buildTimesheetReportPdf({ regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") }, input);
  assert.ok(bytes.length > 1000);
  const src = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.match(src, /entry\.column === "off" \|\| entry\.column === "holiday"/);
  assert.match(src, /type: entry\.column === "off" \? "Nghỉ không lương"/);
});

test("PDF chấm công: bảng Tổng hợp có cột 'Ký xác nhận' bên phải cột Tổng giờ", async () => {
  const src = fs.readFileSync(new URL("../cloudflare/timesheet-report-pdf.ts", import.meta.url), "utf8");
  assert.match(src, /"Tổng buổi", "Tổng giờ", "Ký xác nhận"\]/);
  const input = cleanTimesheetReportInput({ period: "Tháng 10/2026", totalCount: 2, totalHours: "4,0", teachers: [{ name: "Lê Thị Huyền", code: "GV0009", regular: 2, count: 2, hours: "4,0", sessions: [] }] } as any);
  const bytes = await buildTimesheetReportPdf({ regular: font("Roboto-Regular.ttf"), medium: font("Roboto-Medium.ttf") }, input);
  assert.ok(bytes.length > 1000);
});
