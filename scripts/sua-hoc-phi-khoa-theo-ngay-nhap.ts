/**
 * Chỉ sửa ĐÚNG 1 học viên ở 1 lớp thu khóa: đổi ngày nhập học xong mà phiếu khóa đã chốt (frozenAt) chưa thu
 * vẫn giữ số tiền cũ → nhả chốt phiếu đó và đồng bộ lại theo mốc mới (cùng đường với PUT /api/students).
 * Chỉ đụng phiếu OPEN, amountPaid = 0, billKey course|…; mọi phiếu khác của mọi người phải giữ nguyên.
 *   STUDENT=HV0521 CLASS=S41 tsx scripts/sua-hoc-phi-khoa-theo-ngay-nhap.ts   (dry-run)
 *   ... APPLY=1 ...                                                          (ghi thật)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { classBillingMode, syncTuitionReceivables, unfreezeCourseReceivablesForJoinChange } from "../cloudflare/tuition-billing";

const STUDENT = String(process.env.STUDENT || "").toUpperCase();
const CLASS = String(process.env.CLASS || "").toUpperCase();
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (!STUDENT || !CLASS) fail("Thiếu STUDENT / CLASS");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: "finance:steps-demo" }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const now = new Date();
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  if (classBillingMode(cls) !== "COURSE") fail(`${CLASS} không phải lớp thu khóa`);
  const st = (cls.studentIds || []).map((id: string) => students.find((s) => s.id === id)).find((s: any) => s && String(s.code).toUpperCase() === STUDENT)
    || fail(`${STUDENT} không thuộc lớp ${CLASS}`);
  console.log(`${STUDENT} ${st.fullName}: ngày nhập học ${st.classJoinedAt?.[cls.id] || "(theo khóa)"}`);

  const before: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  const released = unfreezeCourseReceivablesForJoinChange(before, [{ studentId: st.id, classId: cls.id }]);
  if (!released.unfrozen) fail("Không có phiếu khóa đã chốt chưa thu để cập nhật — dừng, không ghi");
  const after: any = syncTuitionReceivables(mergeSepayLedger(JSON.parse(JSON.stringify(released.ledger))), classes, students, sessions, now);

  const mine = (l: any) => l.receivables.filter((r: any) => r.studentId === st.id && r.classId === cls.id && String(r.billKey).startsWith("course|"));
  for (const b of mine(before)) {
    const a = after.receivables.find((r: any) => r.id === b.id);
    console.log(`  [${b.billKey}] "${b.billingPeriod}" ${vnd(b.amountDue)} → ${vnd(a?.amountDue)} (còn ${vnd(b.balanceDue)} → ${vnd(a?.balanceDue)}) ${b.status}${b.frozenAt ? " (đang chốt)" : ""}`);
  }
  // Kiểm tra: phiếu của người khác / phiếu đã thu không đổi.
  const other = (l: any) => JSON.stringify(l.receivables.filter((r: any) => !(r.studentId === st.id && r.classId === cls.id && String(r.billKey).startsWith("course|")))
    .map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status, r.amountPaid]));
  if (other(before) !== other(after)) fail("Phiếu khác bị đổi — dừng, không ghi");
  if (mine(before).some((r: any) => r.amountPaid > 0 && JSON.stringify([r.amountDue, r.balanceDue, r.status]) !== JSON.stringify([after.receivables.find((x: any) => x.id === r.id)?.amountDue, after.receivables.find((x: any) => x.id === r.id)?.balanceDue, after.receivables.find((x: any) => x.id === r.id)?.status]))) fail("Phiếu đã thu bị đổi — dừng");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    const q = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${versions[0].key} FOR UPDATE`;
    if (!q.length || Number(q[0].version) !== versions[0].version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
    await tx.opsStorageBlock.update({ where: { key: versions[0].key }, data: { version: { increment: 1 } } });
    await (financeRepository as any).write(tx, { ...finance, sepay: after });
  }, { timeout: 60_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
