/**
 * S42 (25/10/2026) — chốt lịch khóa 1, bước 2 theo trung tâm:
 *  - 22/09 và 29/09/2026 (Thứ 3) bật lại thành học bình thường (tính phí) và thành suất
 *    lịch của khóa (thêm lịch học Thứ 3 19:15–20:45 hiệu lực 22/09 → 29/09).
 *  - 27/10 và 31/10 giữ học không tính phí, khóa 1 kết thúc 31/10 (buổi 24 trên lịch).
 *  - Khóa 2 buổi 1 = 03/11/2026. Học phí khóa 1 giữ 24 buổi / 2.400.000đ.
 * Chạy SAU khi deploy bản app có S42 khóa 1 = 22 suất. Chỉ đụng lớp S42.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { billedCourseSessions, classCourseIndexOfDate, classCourseSessionsForCourse, classCourseStartDateOf, classCourseWindowSlotsAt } from "../cloudflare/tuition-billing";

const CLASS_ID = "class-import-s42";
const NORMAL_DATES = ["2026-09-22", "2026-09-29"];
const SLOT = { weekday: 2, periodId: "period-4", startTime: "19:15", endTime: "20:45", effectiveFrom: "2026-09-22", effectiveTo: "2026-09-29" };
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

(async () => {
  const keys = ["classes:steps-demo", "sessions:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S42");
  if (classCourseWindowSlotsAt(cls, 1) !== 22) fail("Bản app trên server chưa có cấu hình S42 khóa 1 = 22 suất — deploy rồi chạy lại");
  if (sessions.some((s) => s.classId === CLASS_ID && ["2026-09-08", "2026-09-15"].includes(s.date))) fail("Còn buổi 08/09 hoặc 15/09 — chạy fix-s42.ts trước");

  let nextSessions = sessions;
  for (const date of NORMAL_DATES) {
    const rows = nextSessions.filter((s) => s.classId === CLASS_ID && s.date === date);
    if (rows.length !== 1) fail(`S42 ngày ${dmy(date)}: cần đúng 1 buổi, thấy ${rows.length} — dừng`);
    if (rows[0].startTime !== SLOT.startTime || rows[0].isOff) fail(`S42 ngày ${dmy(date)} không đúng dự kiến — dừng`);
    console.log(`T3 ${dmy(date)} ${rows[0].startTime}: ${rows[0].noFee ? "học không tính phí → học bình thường" : "đã là học bình thường"} (điểm danh giữ nguyên ${(rows[0].attendance || []).length} HV)`);
    nextSessions = nextSessions.map((s) => s === rows[0] ? { ...s, noFee: false, recurrenceKey: `${CLASS_ID}|${date}|${SLOT.startTime}` } : s);
  }
  const hasSlot = (cls.schedules || []).some((s: any) => s.weekday === SLOT.weekday && s.startTime === SLOT.startTime && s.effectiveFrom === SLOT.effectiveFrom && s.effectiveTo === SLOT.effectiveTo);
  const nextCls = hasSlot ? cls : { ...cls, schedules: [...(cls.schedules || []), SLOT] };
  console.log(hasSlot ? "Lịch Thứ 3 22/09→29/09 đã có." : "Thêm lịch học Thứ 3 19:15–20:45 hiệu lực 22/09 → 29/09/2026.");

  const k1 = classCourseSessionsForCourse(nextCls, nextSessions, 1);
  const k2Start = classCourseStartDateOf(nextCls, nextSessions, 2);
  console.log(`\nSau khi sửa: khóa 1 ${dmy(k1[0]?.date)} → 31/10 · ${k1.length} buổi tính phí + 27/10, 31/10 không tính phí (thuộc khóa ${classCourseIndexOfDate(nextCls, "2026-10-27", nextSessions)}/${classCourseIndexOfDate(nextCls, "2026-10-31", nextSessions)})`);
  console.log(`  học phí khóa 1: ${billedCourseSessions(nextCls, nextSessions, 1)} buổi · khóa 2 buổi 1 = ${k2Start ? dmy(k2Start) : "?"}`);
  if (k1.length !== 22 || k1.at(-1)?.date !== "2026-10-24" || k2Start !== "2026-11-03") fail("Lịch sau khi sửa không đúng dự kiến — dừng, chưa ghi gì");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (classesRepository as any).write(tx, classes.map((c) => c.id === CLASS_ID ? nextCls : c));
    await (sessionsRepository as any).write(tx, nextSessions);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong lịch S42 (bước 2).");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
