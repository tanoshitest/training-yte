/**
 * S20 — chuyển nợ khóa 1 của HV0272, HV0278 từ dạng "nợ buổi cũ gộp vào phiếu
 * khóa 2" (tuitionCredits = -24) thành phiếu khóa 1 riêng 1.560.000đ, để kế toán
 * thu riêng được khóa 1 và phiếu khóa 2 về đúng 1.560.000đ.
 * Chạy SAU khi deploy bản thu học phí theo từng khóa.
 * Mặc định chỉ in kế hoạch (dry-run). APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger } from "../cloudflare/sepay-engine";
import {
  courseIndexOfBillKey, courseRemainingSessions, syncTuitionReceivables,
} from "../cloudflare/tuition-billing";

const CLASS_ID = "class-import-s20";
const DEBTORS = ["HV0272", "HV0278"];
const COURSE_ONE_AMOUNT = 1_560_000;
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S20");
  let ledger: any = mergeSepayLedger(finance.sepay);
  const now = new Date();
  const targetIds = new Set<string>();
  const nextStudents = students.map((s) => {
    if (!DEBTORS.includes(s.code)) return s;
    if (Number(s.tuitionCredits?.[CLASS_ID]) !== -24) fail(`${s.code}: nợ buổi cũ không phải -24 (đang là ${s.tuitionCredits?.[CLASS_ID]}) — dừng`);
    if (ledger.receivables.some((r: any) => r.studentId === s.id && r.billKey === `course|${CLASS_ID}` && r.status !== "CANCELLED")) fail(`${s.code}: đã có phiếu khóa 1 — dừng`);
    targetIds.add(s.id);
    const created = createReceivable({
      studentId: s.id, studentName: s.fullName, billingPeriod: `Khóa 24 buổi · ${cls.name}`, amountDue: COURSE_ONE_AMOUNT,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: now.toISOString(),
    });
    ledger = {
      ...ledger,
      receivables: [{ ...created.receivable, classId: CLASS_ID, billKey: `course|${CLASS_ID}` }, ...ledger.receivables],
      paymentOrders: [created.order, ...ledger.paymentOrders],
    };
    const tuitionCredits = { ...(s.tuitionCredits || {}) };
    delete tuitionCredits[CLASS_ID];
    return { ...s, tuitionCredits };
  });
  if (targetIds.size !== DEBTORS.length) fail("Không đủ 2 học viên cần chuyển");
  // Đồng bộ như app (phiếu khóa 2 bỏ dòng nợ cũ) — chỉ giữ thay đổi của 2 em này.
  const synced: any = syncTuitionReceivables(ledger, classes, nextStudents, sessions, now);
  const mine = (row: any) => targetIds.has(row.studentId) && row.classId === CLASS_ID;
  const syncedOrders = new Map(synced.paymentOrders.map((o: any) => [o.id, o]));
  const myReceivableIds = new Set(synced.receivables.filter(mine).map((r: any) => r.id));
  const finalLedger = {
    ...ledger,
    receivables: [...synced.receivables.filter(mine), ...ledger.receivables.filter((r: any) => !mine(r))],
    paymentOrders: ledger.paymentOrders.map((o: any) => (myReceivableIds.has(o.receivableId) ? syncedOrders.get(o.id) || o : o)),
  };
  const finalStudents = students.map((s) => {
    if (!targetIds.has(s.id)) return s;
    const changed = nextStudents.find((n) => n.id === s.id);
    return { ...changed, sessionBalances: { ...(s.sessionBalances || {}), [CLASS_ID]: courseRemainingSessions(changed, cls, sessions, finalLedger, now) } };
  });
  for (const s of finalStudents.filter((row) => targetIds.has(row.id))) {
    const recv = finalLedger.receivables.filter((r: any) => r.studentId === s.id && r.classId === CLASS_ID && r.status !== "CANCELLED");
    console.log(`${s.code} ${s.fullName}: tồn=${courseRemainingSessions(s, cls, sessions, finalLedger, now)} | ${recv.map((r: any) => `K${courseIndexOfBillKey(r.billKey)}:${r.status}:${Number(r.balanceDue).toLocaleString("vi-VN")}`).join("  ")}`);
  }
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: finalLedger });
    await (studentsRepository as any).write(tx, finalStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
