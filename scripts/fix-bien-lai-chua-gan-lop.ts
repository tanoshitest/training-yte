/**
 * Biên lai chuyển khoản cũ chưa gắn lớp (25/10/2026). Các lần chuyển thiếu / chuyển
 * trước qua SePay & sao kê trước bản v=334 chỉ trừ công nợ trên phiếu, biên lai không
 * được kích hoạt (thiếu lớp, kỳ) nên số buổi tồn chưa cộng phần tiền đó.
 * Script gắn biên lai theo đúng phiếu của nó (lớp, kỳ, hình thức thu) rồi tính lại số
 * buổi tồn. CÔNG NỢ KHÔNG ĐỔI — script tự kiểm và dừng nếu công nợ bất kỳ ai lệch.
 * Bỏ qua (chờ trung tâm xác nhận): T21 HV0875 Thanh Hằng, S33 HV0427 Bảo Ngọc.
 * Không đụng sổ thu chi. Mặc định dry-run. APPLY=1 mới ghi.
 */
import fs from "node:fs";
import vm from "node:vm";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { settingsRepository } from "../cloudflare/storage/settings-repository";
import { teachersRepository } from "../cloudflare/storage/people-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { classBillingMode, courseIndexOfBillKey, courseMaterialFee, courseRemainingSessions, monthlyRemainingSessions, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const SKIP = new Set(["HV0875", "HV0427"]);
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  const keys = ["finance:steps-demo", "students:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const now = new Date();

  const before = finance.sepay;
  const after = structuredClone(before);
  const touched = new Map<string, { student: any; cls: any; receipts: string[] }>();
  for (const receipt of after.receipts) {
    if (receipt.classId) continue;
    const payment = after.payments.find((row: any) => row.id === receipt.paymentId);
    const receivable = payment && after.receivables.find((row: any) => row.id === payment.receivableId);
    const cls = receivable && classes.find((row) => row.id === receivable.classId);
    const student = students.find((row) => row.id === receipt.studentId);
    if (!receivable || !cls || !student) { console.log(`Bỏ qua biên lai ${receipt.receiptNumber} ${vnd(receipt.amount)}: không có phiếu/lớp`); continue; }
    if (SKIP.has(String(student.code).toUpperCase())) { console.log(`Bỏ qua (chờ xác nhận): ${cls.code} ${student.code} ${student.fullName} · ${vnd(receipt.amount)}`); continue; }
    const head = String(receivable.billKey || "").split("|")[0];
    const mode = head === "month" || head === "months" ? "MONTHLY" : head === "course" ? "COURSE" : classBillingMode(cls);
    // Học liệu chỉ nằm trong phần tiền đầu tiên của phiếu khóa.
    let materialsAmount = 0;
    if (mode === "COURSE") {
      const fee = Math.max(0, Math.round(Number(courseMaterialFee(cls, courseIndexOfBillKey(receivable.billKey) || 1).amount) || 0));
      const earlier = after.payments
        .filter((row: any) => row.receivableId === receivable.id && row.id !== payment.id && String(row.paidAt || "") < String(payment.paidAt || "") && row.status !== "VOIDED")
        .reduce((sum: number, row: any) => sum + (Number(row.allocatedAmount) || 0), 0);
      materialsAmount = Math.min(receipt.amount, Math.max(0, fee - earlier));
    }
    Object.assign(receipt, {
      classId: cls.id, className: cls.name, billingPeriod: receivable.billingPeriod, billingMode: mode,
      studentName: student.fullName, studentCode: student.code || "", materialsAmount, creditSessionsUsed: 0,
    });
    const key = `${student.id}|${cls.id}`;
    if (!touched.has(key)) touched.set(key, { student, cls, receipts: [] });
    touched.get(key)!.receipts.push(`${receipt.receiptNumber} ${vnd(receipt.amount)} ${receivable.billingPeriod}`);
  }
  if (!touched.size) { console.log("Không còn biên lai nào cần gắn lớp."); await prisma.$disconnect(); return; }

  const syncedBefore: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(before)), classes, students, sessions, now);
  const syncedAfter: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(after)), classes, students, sessions, now);
  // Công nợ cột "Còn nợ" (chạy đúng code app) trước / sau.
  const appDebt = (sepay: any) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(students), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (studentId: string, classId: string) => ctx.__t.tuitionEffectiveDebt(ctx.__t.state.data.students.find((row: any) => row.id === studentId), ctx.__t.state.data.classes.find((row: any) => row.id === classId));
  };
  const debtBefore = appDebt(syncedBefore);
  const debtAfter = appDebt(syncedAfter);
  const remaining = (student: any, cls: any, ledger: any) => classBillingMode(cls) === "COURSE"
    ? courseRemainingSessions(student, cls, sessions, ledger, now)
    : monthlyRemainingSessions(student, cls, sessions, ledger, now);
  const courseDebt = (student: any, cls: any, ledger: any) => classBillingMode(cls) === "COURSE"
    ? studentCourseCollectStates(student, cls, sessions, ledger, now).filter((row: any) => row.status === "DUE").reduce((sum: number, row: any) => sum + row.balanceDue, 0)
    : 0;

  const nextStudents = students.map((row) => ({ ...row }));
  console.log(`\n${touched.size} học viên — gắn biên lai vào lớp, tính lại số buổi tồn:\n`);
  for (const { student, cls, receipts } of touched.values()) {
    const d0 = debtBefore(student.id, cls.id), d1 = debtAfter(student.id, cls.id);
    const c0 = courseDebt(student, cls, syncedBefore), c1 = courseDebt(student, cls, syncedAfter);
    if (d0 !== d1 || c0 !== c1) fail(`${cls.code} ${student.code}: công nợ đổi ${vnd(d0)} → ${vnd(d1)} — dừng, chưa ghi gì`);
    const t0 = remaining(student, cls, syncedBefore), t1 = remaining(student, cls, syncedAfter);
    console.log(`${cls.code} ${student.code} ${student.fullName}: tồn ${t0} → ${t1} buổi · công nợ giữ ${vnd(d1)}\n   ${receipts.join("\n   ")}`);
    const row = nextStudents.find((item) => item.id === student.id);
    row.sessionBalances = { ...(row.sessionBalances || {}), [cls.id]: t1 };
  }

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: after });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
