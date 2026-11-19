/**
 * S26 — theo xác nhận trung tâm (24/10/2026): HV0336 Bảo Linh, HV0340 Duy Hưng
 * còn nợ khóa 1 775.000đ và chưa đóng khóa 2 1.560.000đ.
 * Hiện trạng: phiếu khóa 2 gộp 2.285.000đ (khóa 2 1.560.000đ + "nợ cũ 725.000đ").
 * Sửa: lập phiếu khóa 1 riêng còn nợ 775.000đ; phiếu khóa 2 về 1.560.000đ còn nợ.
 * Mỗi em còn nợ 2.335.000đ. Chỉ đụng 2 em này của lớp S26.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";

const CODE = "S26";
const TARGETS = ["HV0336", "HV0340"];
const K1_DEBT = 775_000;
const OLD_K2 = 2_285_000;
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  const cls = classes.find((c) => c.code === CODE) || fail("Không thấy lớp S26");
  const course = Number(cls.sessionPrice) * Number(cls.courseSessions);
  if (course !== 1_560_000) fail(`Học phí khóa S26 là ${vnd(course)} — dừng`);
  const k1Key = `course|${cls.id}`;
  const k2Key = `course|${cls.id}|2`;
  const debt = (sid: string) => ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && r.status !== "CANCELLED")
    .reduce((s: number, r: any) => s + Math.max(0, Number(r.balanceDue) || 0), 0);

  for (const code of TARGETS) {
    const st = students.find((s) => s.code === code) || fail(`Không thấy ${code}`);
    if (!cls.studentIds.includes(st.id)) fail(`${code} không thuộc lớp S26 — dừng`);
    const before = debt(st.id);
    const rows = ledger.receivables.filter((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED");
    if (rows.some((r: any) => r.billKey === k1Key || r.billKey === `${k1Key}|1`)) fail(`${code}: đã có phiếu khóa 1 — dừng`);
    const k2 = rows.filter((r: any) => r.billKey === k2Key);
    if (k2.length !== 1) fail(`${code}: cần đúng 1 phiếu khóa 2, thấy ${k2.length} — dừng`);
    const r2 = k2[0];
    if (Math.round(r2.amountDue) !== OLD_K2 || Math.round(r2.amountPaid) !== 0) fail(`${code}: phiếu khóa 2 ${vnd(r2.amountDue)} đã thu ${vnd(r2.amountPaid)} — không đúng dự kiến, dừng`);

    const created = createReceivable({ studentId: st.id, studentName: st.fullName, billingPeriod: `Nợ còn lại khóa 1 · ${cls.name}`, amountDue: K1_DEBT,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: new Date().toISOString() });
    ledger = {
      ...ledger,
      receivables: [
        // Chốt số nợ khóa 1 (frozenAt) để đồng bộ của app không tính lại thành giá cả khóa.
        { ...created.receivable, classId: cls.id, billKey: k1Key, frozenAt: new Date().toISOString() },
        ...ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountDue: course, balanceDue: course, status: "OPEN",
          billingPeriod: String(r.billingPeriod || "").replace(/\s*·\s*Nợ cũ [\d.]+đ/, "") } : r),
      ],
      paymentOrders: [
        created.order,
        ...ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId ? { ...refreshOrderQr(o, ledger.settings, course), status: "ACTIVE" } : o),
      ],
    };
    const after = debt(st.id);
    console.log(`${code} ${st.fullName}: phiếu khóa 2 ${vnd(r2.amountDue)} (gồm nợ cũ 725.000đ) → khóa 1 còn nợ ${vnd(K1_DEBT)} + khóa 2 còn nợ ${vnd(course)} · tổng nợ ${vnd(before)} → ${vnd(after)}`);
    if (after !== K1_DEBT + course) fail(`${code}: tổng nợ sau khi sửa không đúng — dừng`);
  }

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S26.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
