/**
 * Đổi NGÀY CHỨNG TỪ các dòng thu chi của ĐÚNG 1 học viên trong 1 ngày cập nhật (không đổi tiền,
 * ngày cập nhật, biên lai, công nợ).
 *   STUDENT=HV0108 CLASS=S8 DATE=2026-10-28 VOUCHER=2026-10-27 COUNT=2 TOTAL=600000 tsx scripts/sua-ngay-chung-tu.ts
 *   ... APPLY=1 ...  (ghi thật). COUNT/TOTAL: số dòng / tổng tiền phải đúng, sai thì dừng.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const STUDENT = String(process.env.STUDENT || "").toUpperCase();
const CLASS = String(process.env.CLASS || "").toUpperCase();
const DATE = String(process.env.DATE || "");
const VOUCHER = String(process.env.VOUCHER || "");
const COUNT = Number(process.env.COUNT || NaN);
const TOTAL = Number(process.env.TOTAL || NaN);
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (!STUDENT || !CLASS || !/^\d{4}-\d{2}-\d{2}$/.test(DATE) || !/^\d{4}-\d{2}-\d{2}$/.test(VOUCHER) || !Number.isFinite(COUNT) || !Number.isFinite(TOTAL)) fail("Thiếu STUDENT / CLASS / DATE / VOUCHER / COUNT / TOTAL");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const st = students.find((s) => String(s.code).toUpperCase() === STUDENT) || fail(`Không thấy ${STUDENT}`);
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  const ledger = mergeSepayLedger(finance.sepay);
  const receiptIds = new Set(ledger.receipts.filter((r: any) => {
    if (r.studentId !== st.id) return false;
    const pay = ledger.payments.find((p: any) => p.id === r.paymentId);
    const recv = pay ? ledger.receivables.find((x: any) => x.id === pay.receivableId) : undefined;
    return (r.classId || recv?.classId) === cls.id;
  }).map((r: any) => r.id));
  const rows = (finance.cashbook || []).filter((c: any) => c.date === DATE && c.receiptId && receiptIds.has(c.receiptId));
  console.log(`${st.code} ${st.fullName} (${cls.code}) — dòng thu chi ngày ${DATE}:`);
  for (const c of rows) console.log(`  ${c.kind} ${vnd(c.amount)} ${c.method} · ${c.description} · ngày chứng từ hiện tại: ${c.voucherDate || "(theo ngày thu)"} → ${VOUCHER}`);
  const sum = rows.reduce((s: number, c: any) => s + Math.round(Number(c.amount) || 0), 0);
  if (rows.length !== COUNT || sum !== TOTAL) fail(`Có ${rows.length} dòng, tổng ${vnd(sum)} — khác COUNT=${COUNT} / TOTAL=${vnd(TOTAL)}, dừng`);
  const ids = new Set(rows.map((c: any) => c.id));
  const next = { ...finance, cashbook: finance.cashbook.map((c: any) => ids.has(c.id) ? { ...c, voucherDate: VOUCHER } : c) };
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versions) {
      const r = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!r.length || Number(r[0].version) !== version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, next);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
