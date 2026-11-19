/**
 * S32 — HV0418 Thiện Nhân: khoản "Nợ cũ" 2.450.000đ (nợ từ trước khóa 2) đang nằm
 * trên phiếu KHÓA 2 (chưa bắt đầu) ở trạng thái "đã gửi". Hệ quả: tới lúc khóa 2 bắt
 * đầu, app coi khóa 2 đã có phiếu nên KHÔNG lập phiếu học phí khóa 2 thật (2.400.000đ),
 * và doanh số khóa 2 bị tính nhầm khoản nợ cũ.
 * Sửa: chuyển phiếu nợ cũ đó về KHÓA 1 (giữ nguyên 2.450.000đ, giữ chốt số).
 * Công nợ hiện tại không đổi (2.450.000đ). Chỉ đụng HV0418 lớp S32.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { classCurrentCourseIndex, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  const st = students.find((s) => s.code === "HV0418") || fail("Không thấy HV0418");
  const cls = classes.find((c) => c.code === "S32") || fail("Không thấy S32");
  const now = new Date();
  const current = classCurrentCourseIndex(cls, now, sessions);
  if (current !== 1) fail(`S32 đang ở khóa ${current}, không phải khóa 1 — dừng để kiểm tra tay`);
  const rows = ledger.receivables.filter((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED");
  if (rows.some((r: any) => r.billKey === `course|${cls.id}` || r.billKey === `course|${cls.id}|1`)) fail("Đã có phiếu khóa 1 — dừng");
  const r2 = rows.find((r: any) => r.billKey === `course|${cls.id}|2`) || fail("Không thấy phiếu khóa 2");
  if (Math.round(r2.amountDue) !== 2_450_000 || Math.round(r2.amountPaid) !== 0 || r2.status !== "OPEN" || !/Nợ cũ/.test(String(r2.billingPeriod || ""))) fail(`Phiếu khóa 2 không đúng dự kiến (${r2.status} ${vnd(r2.amountDue)} "${r2.billingPeriod}") — dừng`);
  const debt = (led: any) => studentCourseCollectStates(st, cls, sessions, led, now).filter((s: any) => s.status === "DUE").reduce((sum: number, s: any) => sum + (s.balanceDue || 0), 0);
  const before = debt(syncTuitionReceivables(ledger, classes, students, sessions, now));

  ledger = { ...ledger, receivables: ledger.receivables.map((r: any) => r.id === r2.id
    ? { ...r, billKey: `course|${cls.id}`, billingPeriod: `Nợ cũ khóa 1 · ${cls.name}`, frozenAt: r.frozenAt || now.toISOString() } : r) };
  const after = debt(syncTuitionReceivables(ledger, classes, students, sessions, now));
  console.log(`HV0418 ${st.fullName} · S32 (đang khóa ${current})`);
  console.log(`  phiếu "Nợ cũ" ${vnd(r2.amountDue)}: khóa 2 → khóa 1 · công nợ ${vnd(before)} → ${vnd(after)}`);
  console.log(`  khóa 2 (2.400.000đ) sẽ được app lập bình thường khi bắt đầu`);
  if (after !== 2_450_000) fail("Công nợ sau khi sửa không phải 2.450.000đ — dừng");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S32.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
