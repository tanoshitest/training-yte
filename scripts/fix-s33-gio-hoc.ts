/**
 * S33: lịch từ 11/10/2026 nhập 19:00–21:00 (Thứ 6, CN) trùng 15 phút với S32
 * 17:15–19:15 cùng cô Thanh Thùy. Sửa về 19:15–21:15 như lịch trước 11/10:
 *  - lịch học hàng tuần của lớp S33 (2 dòng 19:00–21:00 từ 11/10),
 *  - các buổi S33 đã lưu từ 11/10 đang ghi 19:00–21:00 (giữ nguyên điểm danh).
 * Chỉ đụng lớp S33. Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";

const CODE = "S33";
const FROM = { start: "19:00", end: "21:00" };
const TO = { start: "19:15", end: "21:15" };
const SINCE = "2026-10-11";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

(async () => {
  const keys = ["classes:steps-demo", "sessions:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const cls = classes.find((c) => c.code === CODE) || fail("Không thấy lớp S33");
  const slotText = (s: any) => `${wd[s.weekday]} ${s.startTime}-${s.endTime}${s.effectiveFrom ? ` từ ${s.effectiveFrom}` : ""}${s.effectiveTo ? ` đến ${s.effectiveTo}` : ""}`;
  const target = (cls.schedules || []).filter((s: any) => s.startTime === FROM.start && s.endTime === FROM.end && s.effectiveFrom === SINCE && !s.effectiveTo);
  if (target.length !== 2) fail(`Cần đúng 2 dòng lịch ${FROM.start}-${FROM.end} từ ${SINCE}, thấy ${target.length} — dừng`);
  console.log("Lịch S33 trước:", (cls.schedules || []).map(slotText).join(" | "));
  const schedules = cls.schedules.map((s: any) => target.includes(s) ? { ...s, startTime: TO.start, endTime: TO.end } : s);
  console.log("Lịch S33 sau: ", schedules.map(slotText).join(" | "));

  let moved = 0;
  const nextSessions = sessions.map((s: any) => {
    if (s.classId !== cls.id || s.date < SINCE || s.isExtra || s.startTime !== FROM.start || s.endTime !== FROM.end) return s;
    moved += 1;
    const recurrenceKey = s.recurrenceKey ? `${cls.id}|${s.date}|${TO.start}` : s.recurrenceKey;
    console.log(`   buổi ${s.date} ${wd[new Date(`${s.date}T12:00:00`).getDay()]}: ${FROM.start}-${FROM.end} → ${TO.start}-${TO.end} · điểm danh ${(s.attendance || []).length} HV giữ nguyên`);
    return { ...s, startTime: TO.start, endTime: TO.end, recurrenceKey };
  });
  console.log(`Buổi đã lưu cần sửa giờ: ${moved}`);
  const nextClasses = classes.map((c) => c.id === cls.id ? { ...c, schedules } : c);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (classesRepository as any).write(tx, nextClasses);
    await (sessionsRepository as any).write(tx, nextSessions);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S33.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
