/**
 * Cô Nguyễn Thuý Hằng: 2 lịch thêm 03/10 (T12) và 08/10 (T13) đang là "Kèm lớp" → đổi sang loại "Dạy thay",
 * ghi chú "T12 (cô Lê Huyền)" / "T13 (cô Lê Huyền)". Chấm công chuyển từ cột Bổ trợ sang cột Dạy thay (giờ không đổi).
 * Chỉ đụng đúng 2 lịch này. Không đụng buổi học, điểm danh, học phí. CHỈ chạy sau khi đã deploy loại lịch DAY_THAY.
 * Mặc định DRY-RUN. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const plain = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
const TARGETS = [
  { date: "2026-10-03", start: "07:00", end: "09:00", oldNote: "Dạy bù lớp T12 (cô Lê Huyền)", note: "T12 (cô Lê Huyền)" },
  { date: "2026-10-08", start: "17:00", end: "19:00", oldNote: "Dạy bù lớp T13 (cô Lê Huyền)", note: "T13 (cô Lê Huyền)" },
];

(async () => {
  const teachers: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, "fullName" FROM teachers`);
  const hang = teachers.filter((t) => plain(t.fullName) === "nguyen thuy hang");
  if (hang.length !== 1) throw new Error(`Tìm cô Nguyễn Thuý Hằng ra ${hang.length} người — dừng`);
  const key = `kv:${encodeURIComponent("calendar-events:steps-demo")}`;
  const row = await prisma.vpsAppState.findUnique({ where: { key }, select: { value: true, updatedAt: true } });
  const events: any[] = JSON.parse(JSON.stringify(row?.value ?? []));
  let changed = 0;
  for (const t of TARGETS) {
    const mine = events.filter((e) => e.teacherId === hang[0].id && e.date === t.date && e.startTime === t.start && e.endTime === t.end);
    const done = mine.filter((e) => e.kind === "DAY_THAY" && e.note === t.note);
    const todo = mine.filter((e) => e.kind === "KEM_LOP" && e.note === t.oldNote);
    if (done.length && !todo.length) { console.log(`= ${t.date} ${t.start}–${t.end}: đã là Dạy thay ${t.note}`); continue; }
    if (todo.length !== 1) throw new Error(`${t.date}: cần đúng 1 lịch Kèm lớp "${t.oldNote}", thấy ${todo.length} — dừng`);
    Object.assign(todo[0], { kind: "DAY_THAY", note: t.note, updatedAt: new Date().toISOString(), updatedBy: "script:hang-day-thay" });
    changed += 1;
    console.log(`→ ${t.date} ${t.start}–${t.end}: Kèm lớp "${t.oldNote}" → Dạy thay "${t.note}"`);
  }
  if (!APPLY) { console.log(`\n(DRY-RUN — ${changed} lịch sẽ đổi, chưa ghi gì. Chạy lại với APPLY=1 để ghi.)`); await prisma.$disconnect(); return; }
  if (!changed) { console.log("Không có gì cần ghi."); await prisma.$disconnect(); return; }
  const res = await prisma.vpsAppState.updateMany({ where: { key, updatedAt: row!.updatedAt }, data: { value: events } });
  console.log(res.count === 1 ? `\nĐÃ GHI ${changed} lịch Dạy thay cho cô Hằng.` : "\nKHÔNG GHI: lịch thêm vừa bị đổi, chạy lại.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
