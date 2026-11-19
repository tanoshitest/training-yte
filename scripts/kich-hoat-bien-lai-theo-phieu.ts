/**
 * Biên lai đã thu tiền nhưng bước ghi buổi bị kẹt "Sai số tiền" (anh Mori 16/11/2026):
 * phụ huynh trả ĐỦ đúng số của phiếu đã gửi, nhưng lúc ghi buổi hệ thống tính lại báo giá
 * (vd áp thêm tín dụng buổi GV nghỉ) ra số khác → không gắn biên lai vào lớp, mốc đã đóng
 * và số buổi tồn không cập nhật, giao dịch nằm ở "Giao dịch lệch".
 * Nguyên tắc mới: phiếu đã gửi là số chuẩn → ghi theo chính phiếu (activateSessionsForPayment bản mới).
 * Script chỉ chạy cho các học viên trong CODES (mặc định HV1007 T4, HV0436 S34).
 * KHÔNG đổi công nợ, phiếu, tiền, sổ thu chi — tự kiểm và dừng nếu công nợ ai đó lệch.
 * Mặc định DRY-RUN. APPLY=1 mới ghi. Chạy SAU khi đã deploy bản code "thu theo phiếu đã gửi".
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
import { activateSessionsForPayment, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const CODES = new Set(String(process.env.CODES || "HV1007,HV0436").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean));
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
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
  let ledger: any = structuredClone(before);
  let nextStudents: any[] = structuredClone(students);
  const done: Array<{ student: any; cls: any; line: string }> = [];

  for (const receipt of before.receipts) {
    if (receipt.classId || receipt.status === "CANCELLED") continue;
    const student = students.find((row) => row.id === receipt.studentId);
    if (!student || !CODES.has(String(student.code || "").toUpperCase())) continue;
    const payment = ledger.payments.find((row: any) => row.id === receipt.paymentId);
    const receivable = payment && ledger.receivables.find((row: any) => row.id === payment.receivableId);
    const cls = receivable && classes.find((row) => row.id === receivable.classId);
    if (!payment || !receivable || !cls) fail(`${student.code}: biên lai ${receipt.receiptNumber} không có phiếu / lớp`);
    if (payment.status === "VOIDED" || payment.status === "REFUNDED") continue;
    const current = nextStudents.find((row) => row.id === student.id);
    const result: any = activateSessionsForPayment({ ledger, receivable, payment, students: [current], classes, sessions, now });
    if (result.status !== "OK") fail(`${cls.code} ${student.code} ${receipt.receiptNumber}: ${result.status} ${result.error || ""} — dừng, chưa ghi gì`);
    ledger = result.ledger;
    const updated = result.students[0];
    nextStudents = nextStudents.map((row) => (row.id === student.id ? updated : row));
    // Giao dịch ngân hàng của phần tiền này rời hàng đợi "Giao dịch lệch" (tiền đã ghi đúng phiếu).
    const txId = payment.bankTransactionId || payment.transactionId;
    ledger.bankTransactions = ledger.bankTransactions.map((row: any) => (
      row.id === txId && row.status === "NEEDS_REVIEW"
        ? { ...row, status: "ALLOCATED", reviewReason: undefined, processedAt: now.toISOString(), resolution: "Ghi buổi theo phiếu đã gửi (16/11/2026)" }
        : row
    ));
    done.push({
      student, cls,
      line: `${cls.code} ${student.code} ${student.fullName} · ${receipt.receiptNumber} ${vnd(receipt.amount)} ${receivable.billingPeriod}\n`
        + `   đã đóng tới ${student.tuitionPaidThrough?.[cls.id] || "—"} → ${updated.tuitionPaidThrough?.[cls.id] || "—"} · `
        + `tồn ${student.sessionBalances?.[cls.id] ?? "—"} → ${updated.sessionBalances?.[cls.id] ?? "—"} buổi · `
        + `tín dụng buổi ${student.tuitionCredits?.[cls.id] ?? 0} → ${updated.tuitionCredits?.[cls.id] ?? 0}`,
    });
  }
  if (!done.length) { console.log(`Không còn biên lai kẹt nào của ${[...CODES].join(", ")}.`); await prisma.$disconnect(); return; }

  // Công nợ cột "Còn nợ" (chạy đúng code app) trước / sau — phải y nguyên với MỌI học viên.
  const appDebt = (sepay: any, studentRows: any[]) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(studentRows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (studentId: string, classId: string) => ctx.__t.tuitionEffectiveDebt(ctx.__t.state.data.students.find((row: any) => row.id === studentId), ctx.__t.state.data.classes.find((row: any) => row.id === classId));
  };
  const syncedBefore: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(before)), classes, students, sessions, now);
  const syncedAfter: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(ledger)), classes, nextStudents, sessions, now);
  const sig = (synced: any) => JSON.stringify(synced.receivables.map((r: any) => [r.studentId, r.classId, r.billKey, r.amountDue, r.amountPaid, r.balanceDue, r.status].join("|")).sort());
  if (sig(syncedBefore) !== sig(syncedAfter)) fail("Phiếu công nợ sẽ thay đổi — dừng, chưa ghi gì.");
  const debtBefore = appDebt(syncedBefore, students);
  const debtAfter = appDebt(syncedAfter, nextStudents);
  console.log(`${done.length} biên lai — ghi buổi theo phiếu đã gửi:\n`);
  for (const { student, cls, line } of done) {
    const d0 = debtBefore(student.id, cls.id), d1 = debtAfter(student.id, cls.id);
    if (d0 !== d1) fail(`${cls.code} ${student.code}: công nợ đổi ${vnd(d0)} → ${vnd(d1)} — dừng, chưa ghi gì`);
    console.log(`${line}\n   công nợ giữ nguyên ${vnd(d1)}\n`);
  }
  console.log("OK: mọi phiếu công nợ y nguyên. Không đụng sổ thu chi.");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
