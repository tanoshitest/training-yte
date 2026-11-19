/**
 * Chỉ sửa HV0811 (T17): huỷ phiếu gộp thừa "Tháng 09/2026 + Tháng 10/2026" (billKey
 * months|class-import-t17|2026-09,2026-10, 960.000đ, chưa thu đồng nào) — phiếu gộp cũ còn sót
 * lại từ trước khi tách nợ cũ T9 (olddebt) + phiếu tháng 10 riêng (đã đóng đủ cả hai, 780.000đ
 * hôm 29/10). Phiếu gộp này không tính vào công nợ hiển thị (app đã đúng 0đ) nhưng còn mở gây
 * nhầm khi xem thủ công / có thể bị thu nhầm lần sau. Không đụng phiếu nào khác, không đổi công nợ.
 *   STUDENT=HV0811 CLASS=T17 tsx scripts/sua-hv0811-phieu-thua.ts   (dry-run)
 *   ... APPLY=1 ...                                                (ghi thật)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const STUDENT = String(process.env.STUDENT || "").toUpperCase();
const CLASS = String(process.env.CLASS || "").toUpperCase();
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (STUDENT !== "HV0811" || CLASS !== "T17") fail("Script này chỉ chạy cho STUDENT=HV0811 CLASS=T17");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: "finance:steps-demo" }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const cls = classes.find((c) => c.code === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  const st = students.find((s) => s.code === STUDENT) || fail(`Không thấy ${STUDENT}`);
  const ledger: any = mergeSepayLedger(finance.sepay);
  const key = `months|${cls.id}|2026-09,2026-10`;
  const row = ledger.receivables.find((r: any) => r.studentId === st.id && r.classId === cls.id && r.billKey === key && r.status !== "CANCELLED")
    || fail("Không thấy phiếu gộp thừa (có thể đã huỷ trước đó) — dừng, không ghi");
  if (Math.round(Number(row.amountPaid) || 0) > 0) fail(`Phiếu đã thu ${vnd(row.amountPaid)} — dừng để xem tay, không tự huỷ phiếu đã có tiền`);
  if ((row.appliedCredits || []).length) fail("Phiếu đang trừ tín dụng — dừng để xem tay");
  console.log(`${STUDENT} ${st.fullName}: huỷ phiếu [${row.billKey}] "${row.billingPeriod}" ${vnd(row.amountDue)} (status ${row.status} → CANCELLED)`);
  const order = ledger.paymentOrders.find((o: any) => o.id === row.paymentOrderId);
  const newLedger = {
    ...ledger,
    receivables: ledger.receivables.map((r: any) => r.id === row.id ? { ...r, status: "CANCELLED", balanceDue: 0 } : r),
    paymentOrders: order ? ledger.paymentOrders.map((o: any) => o.id === order.id ? { ...o, status: "CANCELLED" } : o) : ledger.paymentOrders,
  };
  // Kiểm tra: không phiếu nào khác (của bất kỳ ai) bị đổi.
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => r.id !== row.id).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(ledger) !== others(newLedger)) fail("Phiếu khác bị đổi — dừng");
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    const q = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${versions[0].key} FOR UPDATE`;
    if (!q.length || Number(q[0].version) !== versions[0].version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
    await tx.opsStorageBlock.update({ where: { key: versions[0].key }, data: { version: { increment: 1 } } });
    await (financeRepository as any).write(tx, { ...finance, sepay: newLedger });
  }, { timeout: 60_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
