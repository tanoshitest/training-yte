/**
 * S42 (24/10/2026): chốt lịch khóa 1 theo trung tâm.
 *  - Xóa 2 buổi 08/09 và 15/09/2026.
 *  - 27/10 và 31/10/2026 là buổi học không tính phí (thuộc khóa 1).
 *  - Khóa 2 buổi 1 = 03/11/2026 (code: COURSE_WINDOW_SLOT_OVERRIDES + ghim 27/10, 31/10).
 *  - Học phí khóa 1 giữ nguyên 24 buổi / 2.400.000đ; phiếu, biên lai không đổi.
 * Chỉ đụng buổi học của lớp S42. Mặc định dry-run. APPLY=1 mới ghi.
 * Chạy SAU khi deploy bản app có COURSE_WINDOW_SLOT_OVERRIDES cho S42.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { classCourseStartDateOf, classCourseIndexOfDate, billedCourseSessions } from "../cloudflare/tuition-billing";

const CLASS_ID = "class-import-s42";
const DELETE_DATES = ["2026-09-08", "2026-09-15"];
const NOFEE_DATES = ["2026-10-27", "2026-10-31"];
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

(async () => {
  const key = "sessions:steps-demo";
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key }, select: { key: true, version: true } });
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S42");

  let next = sessions;
  for (const date of DELETE_DATES) {
    const rows = next.filter((s) => s.classId === CLASS_ID && s.date === date);
    if (rows.length !== 1) fail(`S42 ngày ${dmy(date)}: cần đúng 1 buổi để xóa, thấy ${rows.length} — dừng`);
    console.log(`Xóa buổi ${wd[new Date(`${date}T12:00:00`).getDay()]} ${dmy(date)} ${rows[0].startTime} (điểm danh ${(rows[0].attendance || []).length} HV)`);
    next = next.filter((s) => s !== rows[0]);
  }
  for (const date of NOFEE_DATES) {
    const slot = (cls.schedules || []).find((s: any) => s.weekday === new Date(`${date}T12:00:00`).getDay()
      && (!s.effectiveFrom || s.effectiveFrom <= date) && (!s.effectiveTo || s.effectiveTo >= date)) || fail(`S42 không có suất lịch ngày ${dmy(date)} — dừng`);
    const stored = next.filter((s) => s.classId === CLASS_ID && s.date === date);
    if (stored.length > 1) fail(`S42 ngày ${dmy(date)} có ${stored.length} bản ghi — dừng`);
    if (stored[0]?.isOff) fail(`S42 ngày ${dmy(date)} đang là buổi nghỉ — dừng để kiểm tra tay`);
    const item = stored[0]
      ? { ...stored[0], noFee: true }
      : {
        id: `session-s42-${date}-mienphi`, classId: CLASS_ID, date, startTime: slot.startTime, endTime: slot.endTime,
        teacherId: cls.teacherId, roomId: cls.roomId || "", status: "SCHEDULED", isExtra: false,
        recurrenceKey: `${CLASS_ID}|${date}|${slot.startTime}`, note: "Học không tính phí (cuối khóa 1)",
        isOff: false, noFee: true, hasHomework: false, attendance: [],
      };
    console.log(`${wd[new Date(`${date}T12:00:00`).getDay()]} ${dmy(date)} ${item.startTime}–${item.endTime}: học không tính phí${stored[0] ? " (sửa buổi đã có)" : " (thêm bản ghi)"}`);
    next = stored[0] ? next.map((s) => s === stored[0] ? item : s) : [...next, item];
  }

  const k2Start = classCourseStartDateOf(cls, next, 2);
  console.log(`\nSau khi sửa: khóa 1 học phí ${billedCourseSessions(cls, next, 1)} buổi · 27/10, 31/10 thuộc khóa ${classCourseIndexOfDate(cls, "2026-10-27", next)}/${classCourseIndexOfDate(cls, "2026-10-31", next)} · khóa 2 buổi 1 = ${k2Start ? dmy(k2Start) : "?"}`);
  if (k2Start !== "2026-11-03") fail("Khóa 2 không bắt đầu 03/11 — bản app trên server chưa có cấu hình S42, deploy rồi chạy lại");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key: k, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${k} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error("Dữ liệu buổi học vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await tx.opsStorageBlock.update({ where: { key: k }, data: { version: { increment: 1 } } });
    }
    await (sessionsRepository as any).write(tx, next);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong lịch S42.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
