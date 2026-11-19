/**
 * Chấm công tháng 10/2026 theo báo của các cô (Hằng, Yến Ngọc, Phương Thúy, Thanh Huyền, Lê Huyền).
 *  1. Dạy thay: gán giáo viên dạy thay vào buổi lớp (giáo viên chính tự thành "nghỉ" trong chấm công,
 *     học viên vẫn học bình thường — buổi học, điểm danh, học phí không đổi).
 *  2. Sửa giờ từng buổi: T17 (4, 11/10), S45 thứ 3 (6, 13, 20, 27/10), S25 thứ 2 (19, 26/10).
 *  3. T12 31/10 (Thanh Huyền) nối làm buổi bù của buổi nghỉ T12 14/10.
 *  4. Lịch thêm (Kèm hỗ trợ lớp / cá nhân / speaking) — cách B: chỉ cộng giờ cho giáo viên, không tạo buổi học.
 * Chưa làm (đang chờ anh Vũ chốt): test 14/10 của cô Thúy (TEST_14=HH:MM-HH:MM), T14 7/10 của cô Thanh Huyền
 * (T14_0710=1), kèm Tuệ An 7/10 trùng ôn thi (KEEP_TUEAN_0710=1 nếu vẫn muốn giữ).
 * Mặc định DRY-RUN: in thay đổi + bảng giờ chấm công + số buổi tồn / công nợ trước → sau. APPLY=1 mới ghi.
 * Chạy lại nhiều lần không ghi trùng (lịch thêm khử trùng theo giáo viên+loại+ngày+giờ+ghi chú).
 */
import fs from "node:fs";
import vm from "node:vm";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { settingsRepository } from "../cloudflare/storage/settings-repository";
import { teachersRepository } from "../cloudflare/storage/people-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";

const APPLY = process.env.APPLY === "1";
const RANGE = { from: "2026-10-01", to: "2026-10-31" };
const LOCKED = new Set(["S12", "S16", "S20", "S21", "S23", "S27", "S28", "S32", "S34", "S35", "S41", "T1", "T2", "T3", "T4", "T5"]);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const plain = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
const HV = { hang: "nguyen thuy hang", ngoc: "tran thi yen ngoc", thuy: "tran phuong thuy", thanhHuyen: "nguyen thi thanh huyen", thucUyen: "nguyen thi thuc uyen" };

// ---- 1. Dạy thay: [lớp, ngày, giờ bắt đầu của suất lịch, giáo viên dạy thay]
const SUBS: Array<[string, string, string, string]> = [
  ["S3", "2026-10-15", "19:15", HV.hang], ["S31", "2026-10-24", "07:00", HV.hang],
  ["S5", "2026-10-21", "19:15", HV.ngoc], ["S14", "2026-10-23", "19:15", HV.ngoc], ["S4", "2026-10-24", "09:00", HV.ngoc],
  ["S3", "2026-10-24", "14:15", HV.ngoc], ["T3", "2026-10-25", "09:15", HV.ngoc], ["T10", "2026-10-31", "07:00", HV.ngoc],
  ["S38", "2026-10-21", "19:15", HV.thuy], ["S14", "2026-10-25", "09:00", HV.thuy],
  ["T8", "2026-10-11", "14:00", HV.thanhHuyen], ["T19", "2026-10-11", "16:30", HV.thanhHuyen], ["T7", "2026-10-11", "18:30", HV.thanhHuyen],
  ["T4", "2026-10-16", "17:15", HV.thanhHuyen], ["T13", "2026-10-24", "07:00", HV.thanhHuyen], ["T14", "2026-10-25", "14:30", HV.thanhHuyen],
  ["T21", "2026-10-25", "16:30", HV.thanhHuyen], ["T12", "2026-10-26", "17:00", HV.thanhHuyen],
  ["T5", "2026-10-25", "07:15", HV.thucUyen],
];
// ---- 2. Sửa giờ từng buổi: [lớp, ngày, giờ bắt đầu của suất lịch, giờ bắt đầu mới, giờ kết thúc mới]
const TIMES: Array<[string, string, string, string, string]> = [
  ["T17", "2026-10-04", "07:30", "07:30", "09:30"], ["T17", "2026-10-11", "07:30", "07:30", "09:30"],
  ["S45", "2026-10-06", "19:15", "19:15", "20:45"], ["S45", "2026-10-13", "19:15", "19:15", "20:45"],
  ["S45", "2026-10-20", "19:15", "19:15", "20:45"], ["S45", "2026-10-27", "19:15", "19:15", "20:45"],
  ["S25", "2026-10-19", "17:30", "17:00", "19:00"], ["S25", "2026-10-26", "17:30", "17:00", "19:00"],
];
// ---- 4. Lịch thêm
type Kind = "TEST_SPEAKING" | "KEM_SPEAKING" | "KEM_CA_NHAN" | "KEM_LOP" | "DAY_THAY";
const EVENTS: Array<{ kind: Kind; who: string; date: string; start: string; end: string; note: string }> = [];
const ev = (kind: Kind, who: string, date: string, start: string, end: string, note: string) => EVENTS.push({ kind, who, date, start, end, note });
// cô Hằng
ev("DAY_THAY", HV.hang, "2026-10-03", "07:00", "09:00", "T12 (cô Lê Huyền)"); // đã đổi từ Kèm lớp (scripts/sua-hang-day-thay.ts)
ev("DAY_THAY", HV.hang, "2026-10-08", "17:00", "19:00", "T13 (cô Lê Huyền)");
ev("KEM_LOP", HV.hang, "2026-10-18", "17:30", "19:30", "Kèm 2 bạn Linh Ngọc, Chí Dũng (lớp S23 cô Thùy)");
ev("KEM_LOP", HV.hang, "2026-10-24", "17:30", "19:00", "Kèm học sinh lớp S25 (cô Thúy)");
ev("KEM_LOP", HV.hang, "2026-10-26", "17:30", "19:00", "Kèm học sinh lớp S25 (cô Thúy)");
// cô Thanh Huyền
ev("KEM_LOP", HV.thanhHuyen, "2026-10-01", "17:00", "19:00", "Dạy bù lớp T15");
ev("KEM_LOP", HV.thanhHuyen, "2026-10-06", "17:00", "19:00", "Dạy bù lớp T11 + T10");
ev("KEM_LOP", HV.thanhHuyen, "2026-10-08", "17:00", "19:00", "Dạy bù lớp T15 + T16 (Thạch Khê)");
ev("KEM_SPEAKING", HV.thanhHuyen, "2026-10-17", "15:00", "18:30", "Kèm speaking 5 học sinh lớp T18");
if (process.env.T14_0710 === "1") ev("KEM_LOP", HV.thanhHuyen, "2026-10-07", "15:30", "18:30", "Dạy bù lớp T14 (cô Lê Huyền)");
// cô Phương Thúy
ev("KEM_LOP", HV.thuy, "2026-10-04", "09:15", "11:15", "Ôn thi Movers");
ev("KEM_LOP", HV.thuy, "2026-10-07", "17:00", "21:00", "Ôn thi Starters + Movers");
ev("KEM_CA_NHAN", HV.thuy, "2026-10-11", "09:15", "10:45", "Dạy bù bạn Phúc Khang");
for (const d of ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]) ev("KEM_CA_NHAN", HV.thuy, d, "19:00", "21:00", "Kèm 1 - 1 Thục Anh");
for (const d of ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]) {
  if (d === "2026-10-07" && process.env.KEEP_TUEAN_0710 !== "1") continue; // trùng giờ ôn thi 17h–21h cùng ngày
  ev("KEM_CA_NHAN", HV.thuy, d, "17:00", "19:00", "Kèm 1 - 1 Tuệ An");
}
const test14 = String(process.env.TEST_14 || "").match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
if (test14) ev("TEST_SPEAKING", HV.thuy, "2026-10-14", test14[1]!, test14[2]!, "Test");

const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const slotApplies = (s: any, date: string) => new Date(`${date}T12:00:00`).getDay() === Number(s.weekday) && (!s.effectiveFrom || s.effectiveFrom <= date) && (!s.effectiveTo || s.effectiveTo >= date);
const money = (n: number) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const hh = (m: number) => `${Math.round(((Number(m) || 0) / 60) * 100) / 100}`;

(async () => {
  const now = new Date();
  const keys = ["classes:steps-demo", "sessions:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const evKey = `kv:${encodeURIComponent("calendar-events:steps-demo")}`;
  const evRow = await prisma.vpsAppState.findUnique({ where: { key: evKey }, select: { value: true, updatedAt: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const events0: any[] = JSON.parse(JSON.stringify(evRow?.value ?? []));

  const teacherId = (name: string) => {
    const hit = teachers.filter((t) => plain(t.fullName) === name);
    if (hit.length !== 1) fail(`Tìm giáo viên "${name}" ra ${hit.length} người — dừng`);
    return hit[0].id as string;
  };
  const classOf = (code: string) => classes.find((c) => String(c.code).toUpperCase() === code) || fail(`Không thấy lớp ${code}`);
  const sessionOf = (arr: any[], cls: any, date: string, slotStart: string) =>
    arr.findIndex((s) => s.classId === cls.id && s.date === date && !s.isExtra && (s.startTime === slotStart || String(s.recurrenceKey || "").endsWith(`|${slotStart}`)));

  // ---- áp thay đổi lên bản sao
  const next: any[] = sessions.map((s) => ({ ...s }));
  const log: string[] = [];
  const touched = new Set<string>();
  const slotMain = (cls: any, date: string, start: string) => (cls.schedules || []).find((s: any) => slotApplies(s, date) && s.startTime === start);
  const ensure = (cls: any, date: string, slotStart: string): number => {
    const i = sessionOf(next, cls, date, slotStart);
    if (i >= 0) return i;
    const slot = slotMain(cls, date, slotStart) || fail(`${cls.code} không có suất lịch ${slotStart} ngày ${date} — dừng`);
    next.push({
      id: `session-${String(cls.code).toLowerCase()}-${date}-${slotStart.replace(":", "")}`,
      classId: cls.id, date, startTime: slot.startTime, endTime: slot.endTime, teacherId: cls.teacherId, roomId: cls.roomId || "",
      status: date < now.toISOString().slice(0, 10) ? "COMPLETED" : "SCHEDULED", isExtra: false,
      recurrenceKey: `${cls.id}|${date}|${slot.startTime}`, note: "", isOff: false, hasHomework: false, attendance: [],
    });
    return next.length - 1;
  };
  for (const [code, date, start, who] of SUBS) {
    const cls = classOf(code); const to = teacherId(who);
    const i = ensure(cls, date, start); const cur = next[i];
    if (cur.isOff || cur.status === "CANCELLED") fail(`${code} ${date} đang là buổi nghỉ/hủy — dừng, kiểm tay`);
    const before = cur.teacherId || cls.teacherId;
    if (before === to) { log.push(`= ${code} ${date} ${cur.startTime}: đã là ${who}`); continue; }
    next[i] = { ...cur, teacherId: to };
    touched.add(code);
    log.push(`→ DẠY THAY ${code} ${date} ${cur.startTime}–${cur.endTime}: ${teachers.find((t) => t.id === before)?.fullName} → ${teachers.find((t) => t.id === to)?.fullName}`);
  }
  for (const [code, date, slotStart, ns, ne] of TIMES) {
    const cls = classOf(code);
    const i = ensure(cls, date, slotStart); const cur = next[i];
    if (cur.startTime === ns && cur.endTime === ne) { log.push(`= ${code} ${date}: đã ${ns}–${ne}`); continue; }
    next[i] = { ...cur, startTime: ns, endTime: ne, recurrenceKey: cur.recurrenceKey || `${cls.id}|${date}|${slotStart}` };
    touched.add(code);
    log.push(`→ GIỜ ${code} ${date} (${wd[new Date(`${date}T12:00:00`).getDay()]}): ${cur.startTime}–${cur.endTime} → ${ns}–${ne} · điểm danh ${(cur.attendance || []).length} HV giữ nguyên`);
  }
  {
    const cls = classOf("T12");
    const off = next.find((s) => s.classId === cls.id && s.date === "2026-10-14" && s.isOff && s.offSource === "TEACHER") || fail("Không thấy buổi T12 14/10 đang nghỉ (GV tick nghỉ) — dừng");
    const bu = next.findIndex((s) => s.classId === cls.id && s.date === "2026-10-31");
    if (bu < 0) fail("Không thấy buổi T12 31/10 — dừng");
    if (next[bu].teacherId !== teacherId(HV.thanhHuyen)) fail("Buổi T12 31/10 không do cô Thanh Huyền dạy — dừng");
    if (next[bu].makeupOf === off.id) log.push("= T12 31/10 đã nối bù 14/10");
    else {
      log.push(`→ NỐI BÙ T12 31/10 ${next[bu].startTime}–${next[bu].endTime} (đang: isExtra=${Boolean(next[bu].isExtra)} makeupOf=${next[bu].makeupOf || "-"}) → bù cho T12 14/10`);
      next[bu] = { ...next[bu], makeupOf: off.id };
      touched.add("T12");
    }
  }
  const lockedTouched = [...touched].filter((c) => LOCKED.has(c));
  // Lớp đã chốt: chỉ đổi giáo viên dạy thay (không đụng công nợ/tồn). Bất kỳ học viên nào đổi nợ/tồn → không ghi (kiểm ở dưới).
  if (lockedTouched.length) console.log(`\n⚠ Có lớp đã chốt bị đụng buổi (chỉ đổi giáo viên/giờ): ${lockedTouched.join(", ")} — sẽ kiểm công nợ/tồn bên dưới, lệch là không ghi.`);

  const events1: any[] = events0.map((e) => ({ ...e }));
  const evSig = (e: any) => [e.teacherId, e.kind, e.date, e.startTime, e.endTime, e.note].join("|");
  const have = new Set(events1.map(evSig));
  let newEvents = 0;
  for (const e of EVENTS) {
    const item = { id: `cal-${crypto.randomUUID()}`, kind: e.kind, teacherId: teacherId(e.who), date: e.date, startTime: e.start, endTime: e.end, note: e.note, createdAt: now.toISOString(), createdBy: "script:cham-cong-t10" };
    if (have.has(evSig(item))) { log.push(`= LỊCH THÊM đã có: ${e.date} ${e.start}–${e.end} ${e.note}`); continue; }
    events1.push(item); have.add(evSig(item)); newEvents += 1;
    log.push(`+ LỊCH THÊM ${e.kind} · ${teachers.find((t) => t.id === item.teacherId)?.fullName} · ${e.date} ${e.start}–${e.end} · ${e.note}`);
  }
  console.log(log.join("\n"));
  console.log(`\nLớp đụng buổi học: ${[...touched].sort().join(", ") || "—"} · lịch thêm mới: ${newEvents}`);

  // ---- mô phỏng bằng chính code app: chấm công + công nợ/tồn trước → sau
  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining,timesheetSessions,timesheetTeacherRows,timesheetCalendarEvents};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  const measure = (ss: any[], evs: any[]) => {
    const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, ss, now);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: ss, calendarEvents: evs, finance: { ...finance, sepay: ledger }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const rows = ctx.__t.timesheetTeacherRows(ctx.__t.timesheetSessions("", RANGE), ctx.__t.timesheetCalendarEvents("", RANGE));
    const pay = new Map<string, any>(rows.map((r: any) => [r.teacher.id, r]));
    const stu = new Map<string, string>();
    for (const cls of classes) {
      if (!touched.has(String(cls.code))) continue;
      for (const sid of cls.studentIds || []) {
        const st = students.find((s) => s.id === sid); if (!st) continue;
        stu.set(`${cls.code}|${st.code}|${st.fullName}`, `nợ ${money(ctx.__t.tuitionEffectiveDebt(st, cls))} · tồn ${ctx.__t.studentSessionRemaining(st, cls)}`);
      }
    }
    return { pay, stu };
  };
  const A = measure(sessions, events0);
  const B = measure(next, events1);
  console.log("\n=== CHẤM CÔNG THÁNG 10 (giờ): thực tế (actual) · dạy thay · dạy bù · bổ trợ · nghỉ ===");
  for (const id of new Set([...A.pay.keys(), ...B.pay.keys()])) {
    const a = A.pay.get(id) || {}, b = B.pay.get(id) || {};
    const f = (r: any) => `${hh(r.actual)}h (thay ${hh(r.substitute)} · bù ${hh(r.makeup)} · bổ trợ ${hh(r.support)} · nghỉ ${hh(r.off)})`;
    if (f(a) === f(b)) continue;
    console.log(`${(a.teacher || b.teacher).fullName}: ${f(a)} → ${f(b)}  [Δ ${hh((b.actual || 0) - (a.actual || 0))}h]`);
  }
  console.log("\n=== HỌC VIÊN các lớp bị đụng: nợ / buổi tồn — chỉ in dòng thay đổi ===");
  let diff = 0;
  for (const [k, v] of A.stu) if (B.stu.get(k) !== v) { diff += 1; console.log(`${k}: ${v} → ${B.stu.get(k)}`); }
  console.log(diff ? `\n⚠ ${diff} học viên đổi công nợ/tồn — KHÔNG ghi khi chưa báo anh Vũ.` : `OK: không học viên nào (${A.stu.size} HV các lớp bị đụng) đổi công nợ hay buổi tồn.`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  if (diff) fail("Có học viên đổi công nợ/tồn — dừng, không ghi.");
  if (newEvents) {
    const done = evRow
      ? await prisma.vpsAppState.updateMany({ where: { key: evKey, updatedAt: evRow.updatedAt }, data: { value: events1 } })
      : { count: (await prisma.vpsAppState.create({ data: { key: evKey, value: events1 } }), 1) };
    if (done.count !== 1) fail("Lịch thêm vừa bị đổi trong lúc chạy — chưa ghi gì, chạy lại.");
    console.log(`ĐÃ GHI ${newEvents} lịch thêm.`);
  }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi buổi học, hãy chạy lại (lịch thêm đã ghi, chạy lại không ghi trùng).`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (sessionsRepository as any).write(tx, next);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("ĐÃ GHI buổi học (dạy thay, giờ, nối bù T12).");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
