/**
 * S36: thêm buổi "học không tính phí" Thứ 7 24/10/2026 16:00–17:30 (suất lịch đầu
 * tiên sau buổi 24 khóa 1). Buổi không tính phí không chiếm vị trí khóa → buổi 1
 * khóa 2 lùi sang Thứ 5 29/10. Giáo viên vẫn được chấm công (cột Dạy không tính
 * phí), học viên không bị trừ buổi tồn. Phiếu/công nợ học phí giữ nguyên.
 * Chỉ thêm đúng 1 bản ghi buổi học của lớp S36. Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";

const CLASS_ID = "class-import-s36";
const DATE = "2026-10-24";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  const key = "sessions:steps-demo";
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key }, select: { key: true, version: true } });
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S36");
  const slot = (cls.schedules || []).find((s: any) => s.weekday === 6 && (!s.effectiveFrom || s.effectiveFrom <= DATE) && (!s.effectiveTo || s.effectiveTo >= DATE))
    || fail("S36 không có suất Thứ 7 ngày 24/10 — dừng");
  const existing = sessions.filter((s) => s.classId === CLASS_ID && s.date === DATE);
  if (existing.length) fail(`Đã có ${existing.length} bản ghi buổi S36 ngày 24/10 (${existing.map((s) => `${s.startTime} noFee=${Boolean(s.noFee)}`).join(", ")}) — dừng để kiểm tra tay`);
  const item = {
    id: `session-s36-${DATE}-mienphi`,
    classId: CLASS_ID,
    date: DATE,
    startTime: slot.startTime,
    endTime: slot.endTime,
    teacherId: cls.teacherId,
    roomId: cls.roomId || "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${CLASS_ID}|${DATE}|${slot.startTime}`,
    note: "Buổi thêm học không tính phí (sau buổi 24 khóa 1)",
    isOff: false,
    noFee: true,
    hasHomework: false,
    attendance: [],
  };
  console.log(`Thêm buổi S36 ${DATE} ${item.startTime}–${item.endTime} · GV ${cls.teacherId} · học không tính phí`);
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key: k, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${k} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error("Dữ liệu buổi học vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await tx.opsStorageBlock.update({ where: { key: k }, data: { version: { increment: 1 } } });
    }
    await (sessionsRepository as any).write(tx, [...sessions, item]);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong buổi 24/10 S36.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
