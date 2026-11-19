/**
 * Lớp S22 tháng 10/2026: cô Thanh Huyền dạy 02, 06, 16, 18/10; cô Vân dạy 09, 23, 25, 30/10.
 *  - Buổi 09/10 (không tính phí): đổi giáo viên Thanh Huyền → Dương Thị Vân (cô Huyền báo nhầm 12/10 — bỏ).
 *  - Đánh dấu 8 buổi tháng 10 bằng ghi chú "[Phụ trách]" để chấm công coi là giáo viên đứng lớp theo phân công
 *    (không phải dạy thay): hết 3 dòng "Nghỉ không lương" của cô Huyền, cô Vân chuyển "Dạy thay" → "Theo lịch".
 * Không đụng học viên / điểm danh / học phí. Mặc định DRY-RUN (mô phỏng chấm công + công nợ/tồn trước → sau). APPLY=1 mới ghi.
 * Cần deploy bản app.js có quy tắc "[Phụ trách]" thì bảng chấm công trên web mới đổi.
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
const MARK = "[Phụ trách]";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const plain = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
const money = (n: number) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const hh = (m: number) => `${Math.round(((Number(m) || 0) / 60) * 100) / 100}`;

// Giáo viên đứng từng buổi S22 tháng 10 sau khi sửa
const PLAN: Array<[string, string]> = [
  ["2026-10-02", "nguyen thi thanh huyen"], ["2026-10-06", "nguyen thi thanh huyen"], ["2026-10-09", "duong thi van"],
  ["2026-10-16", "nguyen thi thanh huyen"], ["2026-10-18", "nguyen thi thanh huyen"],
  ["2026-10-23", "duong thi van"], ["2026-10-25", "duong thi van"], ["2026-10-30", "duong thi van"],
];

(async () => {
  const now = new Date();
  const keys = ["classes:steps-demo", "sessions:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const evKey = `kv:${encodeURIComponent("calendar-events:steps-demo")}`;
  const evRow = await prisma.vpsAppState.findUnique({ where: { key: evKey }, select: { value: true } });
  const events: any[] = JSON.parse(JSON.stringify(evRow?.value ?? []));
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);

  const teacherId = (name: string) => {
    const hit = teachers.filter((t) => plain(t.fullName) === name);
    if (hit.length !== 1) fail(`Tìm giáo viên "${name}" ra ${hit.length} người — dừng`);
    return hit[0].id as string;
  };
  const cls = classes.find((c) => String(c.code).toUpperCase() === "S22") || fail("Không thấy lớp S22");
  const octSessions = sessions.filter((s) => s.classId === cls.id && String(s.date).startsWith("2026-10"));
  const planDates = PLAN.map(([d]) => d);
  const extra = octSessions.filter((s) => !planDates.includes(s.date));
  if (extra.length) fail(`S22 tháng 10 có buổi ngoài danh sách (${extra.map((s) => s.date).join(", ")}) — dừng, kiểm tay`);

  const next: any[] = sessions.map((s) => ({ ...s }));
  const log: string[] = [];
  for (const [date, who] of PLAN) {
    const i = next.findIndex((s) => s.classId === cls.id && s.date === date);
    if (i < 0) fail(`S22 không có buổi ${date} — dừng`);
    const cur = next[i];
    if (cur.isOff || cur.status === "CANCELLED") fail(`S22 ${date} đang là buổi nghỉ/hủy — dừng`);
    const to = teacherId(who);
    const note = String(cur.note || "").includes(MARK) ? String(cur.note) : `${MARK}${cur.note ? ` ${cur.note}` : ""}`;
    if (cur.teacherId === to && note === cur.note) { log.push(`= S22 ${date}: đã đúng`); continue; }
    next[i] = { ...cur, teacherId: to, note };
    log.push(`→ S22 ${date} ${cur.startTime}–${cur.endTime}${cur.noFee ? " (không tính phí)" : ""}: ${teachers.find((t) => t.id === cur.teacherId)?.fullName || "—"} → ${teachers.find((t) => t.id === to)?.fullName} · ghi chú "${note}" · điểm danh ${(cur.attendance || []).length} HV giữ nguyên`);
  }
  console.log(log.join("\n"));

  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining,timesheetSessions,timesheetTeacherRows,timesheetCalendarEvents};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  const measure = (ss: any[]) => {
    const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, ss, now);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: ss, calendarEvents: events, finance: { ...finance, sepay: ledger }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const rows = ctx.__t.timesheetTeacherRows(ctx.__t.timesheetSessions("", RANGE), ctx.__t.timesheetCalendarEvents("", RANGE));
    const pay = new Map<string, any>(rows.map((r: any) => [r.teacher.id, r]));
    // công nợ / tồn của MỌI học viên mọi lớp (không chỉ S22) — để chắc không có gì lệch
    const stu = new Map<string, string>();
    for (const c of classes) for (const sid of c.studentIds || []) {
      const st = students.find((s) => s.id === sid); if (!st) continue;
      stu.set(`${c.code}|${st.code}|${st.fullName}`, `nợ ${money(ctx.__t.tuitionEffectiveDebt(st, c))} · tồn ${ctx.__t.studentSessionRemaining(st, c)}`);
    }
    return { pay, stu };
  };
  const A = measure(sessions);
  const B = measure(next);
  console.log("\n=== CHẤM CÔNG THÁNG 10 (giờ) — chỉ in giáo viên thay đổi ===");
  let changed = 0;
  for (const id of new Set([...A.pay.keys(), ...B.pay.keys()])) {
    const a = A.pay.get(id) || {}, b = B.pay.get(id) || {};
    const f = (r: any) => `${hh(r.actual)}h (lý thuyết ${hh(r.totalElapsed)} · thay ${hh(r.substitute)} · bù ${hh(r.makeup)} · không phí ${hh(r.noFee)} · bổ trợ ${hh(r.support)} · nghỉ ${hh(r.off)})`;
    if (f(a) === f(b)) continue;
    changed += 1;
    console.log(`${(a.teacher || b.teacher).fullName}: ${f(a)} → ${f(b)}  [Δ ${hh((b.actual || 0) - (a.actual || 0))}h]`);
  }
  if (!changed) console.log("(không giáo viên nào đổi)");
  console.log("\n=== CÔNG NỢ / BUỔI TỒN của toàn bộ học viên — chỉ in dòng thay đổi ===");
  let diff = 0;
  for (const [k, v] of A.stu) if (B.stu.get(k) !== v) { diff += 1; console.log(`${k}: ${v} → ${B.stu.get(k)}`); }
  console.log(diff ? `\n⚠ ${diff} học viên đổi công nợ/tồn — KHÔNG ghi.` : `OK: không học viên nào (${A.stu.size} HV toàn trung tâm) đổi công nợ hay buổi tồn.`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  if (diff) fail("Có học viên đổi công nợ/tồn — dừng, không ghi.");
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (sessionsRepository as any).write(tx, next);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("ĐÃ GHI S22 tháng 10 (giáo viên 09/10 + ghi chú [Phụ trách]).");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
