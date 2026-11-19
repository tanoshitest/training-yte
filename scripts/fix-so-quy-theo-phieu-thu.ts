/**
 * Sổ quỹ ghi dư: khi thu phần còn lại của phiếu học phí, dòng sổ quỹ ghi số tiền
 * cả phiếu (charge.amount) thay vì số tiền phiếu thu (tiền thực nhận). Script sửa
 * các dòng sổ quỹ học phí có receiptId mà số tiền ≠ số tiền phiếu thu đó, đưa về
 * đúng số phiếu thu. Không đụng phiếu thu, phiếu học phí, công nợ.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo"] } }, select: { key: true, version: true } });
  const finance: any = await (financeRepository as any).read(prisma);
  const students: any[] = await (studentsRepository as any).read(prisma);
  const ledger: any = mergeSepayLedger(finance.sepay);
  const receipts = new Map<string, any>(ledger.receipts.map((r: any) => [r.id, r]));
  const studentById = new Map<string, any>(students.map((s) => [s.id, s]));

  let total = 0;
  const fixes = new Map<string, number>();
  for (const row of finance.cashbook || []) {
    if (row.source !== "TUITION" || row.kind !== "IN" || !row.receiptId) continue;
    const receipt = receipts.get(row.receiptId);
    if (!receipt) continue;
    const real = Math.max(0, Math.round(Number(receipt.amount) || 0));
    const booked = Math.round(Number(row.amount) || 0);
    if (real === booked) continue;
    fixes.set(row.id, real);
    total += booked - real;
    const code = studentById.get(receipt.studentId)?.code || "";
    console.log(`${row.date} ${code} ${row.studentName} · ${row.description}\n   sổ quỹ ${vnd(booked)} → ${vnd(real)} (phiếu thu ${receipt.id}) · lệch ${vnd(booked - real)}`);
  }
  console.log(`\nSố dòng cần sửa: ${fixes.size} · tổng ghi dư ${vnd(total)}`);
  if (!fixes.size) { await prisma.$disconnect(); return; }
  const cashbook = finance.cashbook.map((row: any) => fixes.has(row.id) ? { ...row, amount: fixes.get(row.id) } : row);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, cashbook });
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong sổ quỹ.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
