/**
 * HV0942 Thúy (T2): xếp lại từ Lớp chờ ngày 23/10 bị tính như chuyển lớp LC→T2 —
 * lập phiếu chênh lệch +150.000đ, đặt mốc vào lớp 01/10 (coi tháng 10 đã do "lớp
 * cũ" thu) và trạng thái vẫn "Chưa xếp lớp". Sửa: hủy phiếu chênh lệch, bỏ mốc
 * vào lớp 01/10 + mốc Lớp chờ, trạng thái Đang học. Phiếu tháng 10 (350.000đ) giữ
 * nguyên — kế toán bấm Thu học phí khi phụ huynh đóng.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const CODE = "HV0942";
const CLASS_ID = "class-import-t2";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const ledger: any = mergeSepayLedger(finance.sepay);
  const student = students.find((s) => s.code === CODE) || fail(`Không thấy ${CODE}`);
  const transfer = ledger.receivables.filter((r: any) => r.studentId === student.id && r.classId === CLASS_ID
    && r.status !== "CANCELLED" && String(r.billKey || "").startsWith(`transfer|${CLASS_ID}|class-waiting|`));
  if (transfer.length !== 1) fail(`Cần đúng 1 phiếu chênh lệch LC→T2 đang mở, thấy ${transfer.length} — dừng`);
  if (transfer[0].amountPaid > 0) fail("Phiếu chênh lệch đã có tiền thu — dừng để kiểm tra tay");
  const oct = ledger.receivables.find((r: any) => r.studentId === student.id && r.billKey === `month|${CLASS_ID}|2026-10` && r.status !== "CANCELLED");
  console.log(`Trước: trạng thái ${student.status} · mốc vào lớp ${JSON.stringify(student.classJoinedAt)} · phiếu chênh lệch ${transfer[0].amountDue.toLocaleString("vi-VN")}đ (${transfer[0].status}) · phiếu T10 ${oct ? `${oct.status} ${oct.amountDue.toLocaleString("vi-VN")}đ, đã thu ${oct.amountPaid.toLocaleString("vi-VN")}đ` : "không có"}`);

  const nextLedger = {
    ...ledger,
    receivables: ledger.receivables.map((r: any) => r.id === transfer[0].id ? { ...r, status: "CANCELLED", balanceDue: 0 } : r),
    paymentOrders: ledger.paymentOrders.map((o: any) => o.receivableId === transfer[0].id && o.status === "ACTIVE" ? { ...o, status: "CANCELLED" } : o),
  };
  const classJoinedAt = { ...(student.classJoinedAt || {}) };
  delete classJoinedAt[CLASS_ID];
  delete classJoinedAt["class-waiting"];
  const nextStudents = students.map((s) => s.id === student.id ? { ...s, status: "STUDYING", classJoinedAt } : s);
  console.log(`Sau:   trạng thái STUDYING · mốc vào lớp ${JSON.stringify(classJoinedAt)} · phiếu chênh lệch CANCELLED · phiếu T10 giữ nguyên`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: nextLedger });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong HV0942.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
