/**
 * S17, S18 — nợ khóa 1 đang nằm dạng "nợ buổi cũ" (tuitionCredits âm) gộp vào
 * phiếu khóa 2 (vd 3.120.000đ = khóa 2 1.560.000đ + nợ khóa 1 1.560.000đ), nên
 * phiếu in "24 buổi × 65.000đ" mà tổng 3.120.000đ. Tách như S20:
 *  - lập phiếu khóa 1 riêng = số buổi nợ × đơn giá (còn nợ),
 *  - phiếu khóa 2 về đúng giá khóa; tiền đã thu trên phiếu khóa 2 giữ nguyên,
 *  - bỏ "nợ buổi cũ" của học viên ở lớp đó.
 * Tổng nợ của từng học viên không đổi. Gửi yêu cầu thanh toán sẽ cộng dồn đúng.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import { courseIndexOfBillKey, courseRemainingSessions } from "../cloudflare/tuition-billing";

const CODES = ["S17", "S18"];
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const live = (p: any) => p.status !== "VOIDED" && p.status !== "REFUNDED";

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  const now = new Date();
  const changedStudents = new Map<string, any>();
  const touched: { st: any; cls: any }[] = [];

  for (const code of CODES) {
    const cls = classes.find((c) => c.code === code) || fail(`Không thấy lớp ${code}`);
    const price = Number(cls.sessionPrice);
    const course = price * Number(cls.courseSessions);
    const k1Key = `course|${cls.id}`;
    const k2Key = `course|${cls.id}|2`;
    console.log(`\nLớp ${code} · ${cls.name} · giá khóa ${vnd(course)}`);
    for (const sid of cls.studentIds) {
      const st = changedStudents.get(sid) || students.find((s) => s.id === sid);
      if (!st) continue;
      const credit = Math.round(Number(st.tuitionCredits?.[cls.id]) || 0);
      if (credit >= 0) continue;
      const debt = -credit * price;
      const rows = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && r.status !== "CANCELLED");
      if (rows.some((r: any) => r.billKey === k1Key || r.billKey === `${k1Key}|1`)) fail(`${st.code}: đã có phiếu khóa 1 — dừng`);
      const k2 = rows.filter((r: any) => r.billKey === k2Key);
      if (k2.length !== 1) fail(`${st.code}: cần đúng 1 phiếu khóa 2, thấy ${k2.length} — dừng`);
      const r2 = k2[0];
      if (Math.round(r2.amountDue) !== course + debt) fail(`${st.code}: phiếu khóa 2 ${vnd(r2.amountDue)} khác ${vnd(course)} + nợ ${vnd(debt)} — dừng`);
      const paid = ledger.payments.filter((p: any) => p.receivableId === r2.id && live(p)).reduce((s: number, p: any) => s + Math.max(0, Number(p.allocatedAmount) || 0), 0);
      if (Math.round(paid) !== Math.round(r2.amountPaid)) fail(`${st.code}: tiền thu phiếu khóa 2 không khớp — dừng`);
      if (paid > course) fail(`${st.code}: đã thu ${vnd(paid)} vượt giá khóa 2 — dừng để kiểm tra tay`);

      const created = createReceivable({
        studentId: sid, studentName: st.fullName, billingPeriod: `Khóa ${cls.courseSessions} buổi · ${cls.name}`, amountDue: debt,
        usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: now.toISOString(),
      });
      const balance = course - paid;
      const status = paid <= 0 ? "OPEN" : balance > 0 ? "PARTIALLY_PAID" : "PAID";
      ledger = {
        ...ledger,
        receivables: [
          { ...created.receivable, classId: cls.id, billKey: k1Key },
          ...ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountDue: course, balanceDue: balance, status } : r),
        ],
        paymentOrders: [
          created.order,
          ...ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId
            ? (balance > 0 ? { ...refreshOrderQr(o, ledger.settings, balance), status: "ACTIVE" } : { ...o, status: "PAID" }) : o),
        ],
      };
      const tuitionCredits = { ...(st.tuitionCredits || {}) };
      delete tuitionCredits[cls.id];
      changedStudents.set(sid, { ...st, tuitionCredits });
      touched.push({ st, cls });
      console.log(` ✔ ${st.code} ${st.fullName}: phiếu khóa 2 ${vnd(r2.amountDue)} (đã thu ${vnd(paid)}) → khóa 1 còn nợ ${vnd(debt)} (${-credit} buổi) + khóa 2 ${vnd(course)} đã thu ${vnd(paid)}${balance ? `, còn ${vnd(balance)}` : " (đủ)"} · tổng còn nợ ${vnd(r2.balanceDue)} → ${vnd(debt + balance)}`);
      if (Math.round(r2.balanceDue) !== debt + balance) fail(`${st.code}: tổng nợ thay đổi — dừng`);
    }
  }
  console.log(`\nSố học viên tách nợ khóa 1: ${touched.length}`);
  if (!touched.length) { await prisma.$disconnect(); return; }
  const finalStudents = students.map((s) => {
    const next = changedStudents.get(s.id);
    if (!next) return s;
    const cls = touched.find((t) => t.st.id === s.id)!.cls;
    return { ...next, sessionBalances: { ...(s.sessionBalances || {}), [cls.id]: courseRemainingSessions(next, cls, sessions, ledger, now) } };
  });

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, finalStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S17, S18.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
