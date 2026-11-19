/**
 * Học viên vừa ở lớp thật (chưa kết thúc) vừa còn tên trong "Lớp chờ" (anh Mori 14/11/2026: "không thể 1 tên 2 lớp").
 * Trang Quản lý doanh số coi người trong Lớp chờ là đã nghỉ → ghi "Giảm doanh số" oan
 * (vd. HV1150 Phan Tuệ Nhi S56 −9.030.000).
 * Sửa: gỡ khỏi Lớp chờ + bỏ mốc "class-waiting" trong classJoinedAt (mốc đó = ngày rời lớp của doanh số).
 * KHÔNG đụng lớp thật, phiếu thu, biên lai. Dừng nếu đồng bộ học phí trước/sau khác nhau ở bất kỳ phiếu nào.
 * Mặc định DRY-RUN. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";

const WAITING_ID = "class-waiting";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  const keys = ["classes:steps-demo", "students:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const classes: any[] = await (classesRepository as any).read(prisma);
  const students: any[] = await (studentsRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const isWaiting = (c: any) => c.id === WAITING_ID || String(c.name || "").trim() === "Lớp chờ";
  const waiting = classes.find(isWaiting) ?? fail("Không thấy Lớp chờ");
  const studying = new Map<string, string[]>();
  for (const c of classes) {
    if (isWaiting(c) || c.status === "FINISHED") continue;
    for (const id of c.studentIds || []) studying.set(id, [...(studying.get(id) || []), c.code || c.name]);
  }
  const both = (waiting.studentIds || []).filter((id: string) => studying.has(id));
  if (!both.length) { console.log("Không còn học viên nào vừa ở lớp vừa ở Lớp chờ — không cần sửa."); await prisma.$disconnect(); return; }
  const byId = new Map(students.map((s) => [s.id, s]));
  console.log(`${both.length} học viên vừa ở lớp thật vừa ở Lớp chờ:`);
  for (const id of both) {
    const s: any = byId.get(id) || {};
    console.log(`  - ${s.code || id} ${s.fullName || ""} · lớp ${studying.get(id)!.join(", ")} · trạng thái ${s.status} · mốc Lớp chờ ${s.classJoinedAt?.[WAITING_ID] || "(không có)"}`);
  }

  const drop = new Set(both);
  const nextClasses = classes.map((c) => (c.id === waiting.id ? { ...c, studentIds: (c.studentIds || []).filter((id: string) => !drop.has(id)) } : c));
  const nextStudents = students.map((s) => {
    if (!drop.has(s.id)) return s;
    const classJoinedAt = { ...(s.classJoinedAt || {}) };
    delete classJoinedAt[WAITING_ID];
    const sessionBalances = { ...(s.sessionBalances || {}) };
    if (!Number(sessionBalances[WAITING_ID])) delete sessionBalances[WAITING_ID];
    return { ...s, classJoinedAt, sessionBalances, ...(s.status === "UNASSIGNED" ? { status: "STUDYING" } : {}) };
  });

  // Phiếu học phí phải y nguyên: đồng bộ với dữ liệu cũ và mới cho ra cùng một kết quả.
  const now = new Date();
  const sig = (cls: any[], sts: any[]) => JSON.stringify((syncTuitionReceivables(mergeSepayLedger(structuredClone(finance.sepay)), cls, sts, sessions, now) as any)
    .receivables.map((r: any) => [r.studentId, r.classId, r.billKey, r.amountDue, r.amountPaid, r.balanceDue, r.status].join("|")).sort());
  if (sig(classes, students) !== sig(nextClasses, nextStudents)) fail("Phiếu học phí sẽ thay đổi sau khi gỡ Lớp chờ — KHÔNG ghi, cần xem tay.");
  console.log("\nOK: phiếu học phí của mọi học viên không đổi. Chỉ gỡ tên khỏi Lớp chờ + bỏ mốc Lớp chờ.");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (classesRepository as any).write(tx, nextClasses);
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log(`\nĐÃ GHI: gỡ ${both.length} học viên khỏi Lớp chờ.`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
