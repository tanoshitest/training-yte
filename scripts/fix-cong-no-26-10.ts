/**
 * Sửa công nợ theo yêu cầu anh Vũ ngày 26/10/2026 (gộp một lần chạy).
 * 1) CASES — tách "nợ cũ" đang gộp trong phiếu khóa 2 ra thành phiếu khóa 1 riêng:
 *    phiếu khóa 1 nợ đúng số anh đưa, phiếu khóa 2 về đúng học phí khóa 2.
 * 2) REOPEN — cả lớp bị ghi nhầm "đã đóng" một khóa: hoàn tác biên lai (giống xoá
 *    phiếu thu học phí trong app) → phiếu khóa đó mở lại, còn nợ đủ.
 * Tồn buổi tính lại theo code app. Chỉ đụng đúng học viên / lớp liệt kê.
 * Mặc định dry-run. APPLY=1 mới ghi.
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
import { createReceivable, mergeSepayLedger } from "../cloudflare/sepay-engine";
import { courseIndexOfBillKey, courseRemainingSessions, reverseTuitionReceipt, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

/** Mỗi dòng: lớp, mã HV, nợ khóa 1, nợ khóa 2 (đồng). */
const CASES: Array<{ classCode: string; studentCode: string; course1: number; course2: number }> = [
  { classCode: "S34", studentCode: "HV0436", course1: 725_000, course2: 1_560_000 }, // Long Hưng → tổng 2.285.000đ
];

/** Lớp + khóa bị ghi nhầm đã đóng cho cả lớp → mở lại phiếu (nợ đủ học phí khóa). */
const REOPEN: Array<{ classCode: string; course: number }> = [
  { classCode: "S23", course: 2 }, // S23 MOVERS VIP — khóa 2 cả lớp chưa đóng (16/10 ghi nhầm)
];

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
  const iso = now.toISOString();

  const before = mergeSepayLedger(finance.sepay);
  let ledger: any = structuredClone(before);
  let workStudents: any[] = structuredClone(students);
  const targets: Array<{ student: any; cls: any; expected: number; label: string }> = [];
  for (const r of REOPEN) {
    const cls = classes.find((row) => String(row.code).toUpperCase() === r.classCode) || fail(`Không thấy lớp ${r.classCode}`);
    for (const studentId of cls.studentIds || []) {
      const student = students.find((row) => row.id === studentId);
      if (!student || student.tuitionExempt) continue;
      const recv = ledger.receivables.filter((x: any) => x.studentId === student.id && x.classId === cls.id && courseIndexOfBillKey(x.billKey) === r.course && x.status !== "CANCELLED");
      if (recv.length !== 1) fail(`${r.classCode} ${student.code}: cần đúng 1 phiếu khóa ${r.course}, đang có ${recv.length}`);
      const paymentIds = new Set(ledger.payments.filter((p: any) => p.receivableId === recv[0].id && p.status !== "VOIDED").map((p: any) => p.id));
      const receipts = ledger.receipts.filter((x: any) => paymentIds.has(x.paymentId));
      if (!receipts.length) { console.log(`${r.classCode} ${student.code} ${student.fullName}: khóa ${r.course} chưa có biên lai — bỏ qua`); continue; }
      for (const receipt of receipts) {
        if (receipt.status === "ISSUED") fail(`${r.classCode} ${student.code}: biên lai ${receipt.receiptNumber} đã vào sổ thu chi — dừng, cần xem tay`);
        const out: any = reverseTuitionReceipt({ ledger, receiptId: receipt.id, students: workStudents, classes, sessions });
        if (out.error) fail(`${r.classCode} ${student.code}: ${out.error}`);
        ledger = out.ledger;
        workStudents = out.students;
      }
      const amountDue = Math.round(Number(recv[0].amountDue) || 0);
      targets.push({ student, cls, expected: amountDue, label: `${r.classCode} ${student.code} — mở lại khóa ${r.course} (gỡ ${receipts.map((x: any) => `${x.receiptNumber} ${vnd(x.amount)}`).join(", ")})` });
    }
  }
  for (const c of CASES) {
    const cls = classes.find((row) => String(row.code).toUpperCase() === c.classCode) || fail(`Không thấy lớp ${c.classCode}`);
    const student = students.find((row) => String(row.code).toUpperCase() === c.studentCode) || fail(`Không thấy ${c.studentCode}`);
    if (!(cls.studentIds || []).includes(student.id)) fail(`${c.studentCode} không thuộc ${c.classCode}`);
    const mine = ledger.receivables.filter((r: any) => r.studentId === student.id && r.classId === cls.id && r.status !== "CANCELLED");
    if (mine.some((r: any) => courseIndexOfBillKey(r.billKey) === 1)) fail(`${c.studentCode}: đã có phiếu khóa 1 — dừng`);
    const k2 = mine.filter((r: any) => courseIndexOfBillKey(r.billKey) === 2);
    if (k2.length !== 1) fail(`${c.studentCode}: cần đúng 1 phiếu khóa 2, đang có ${k2.length}`);
    const recv = k2[0];
    if (recv.status !== "OPEN" || Math.round(Number(recv.amountPaid) || 0) > 0) fail(`${c.studentCode}: phiếu khóa 2 đã thu một phần / không OPEN — dừng`);
    if (Math.round(Number(recv.amountDue) || 0) <= c.course2) fail(`${c.studentCode}: phiếu khóa 2 ${vnd(recv.amountDue)} không có nợ cũ gộp — dừng`);

    // Phiếu khóa 2 về đúng học phí khóa 2, bỏ dòng "Nợ cũ …".
    recv.amountDue = c.course2;
    recv.balanceDue = c.course2;
    recv.billingPeriod = String(recv.billingPeriod).replace(/ · Nợ cũ [\d.]+đ$/, "");
    recv.frozenAt = iso;
    const order = ledger.paymentOrders.find((row: any) => row.id === recv.paymentOrderId);
    if (order) order.amount = c.course2;

    // Phiếu khóa 1 riêng cho phần nợ cũ.
    const created = createReceivable({
      studentId: student.id, studentName: student.fullName, billingPeriod: `Khóa 1 · ${cls.name} · Nợ khóa 1`, amountDue: c.course1,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: iso,
    });
    ledger = {
      ...ledger,
      receivables: [{ ...created.receivable, classId: cls.id, billKey: `course|${cls.id}`, frozenAt: iso }, ...ledger.receivables],
      paymentOrders: [created.order, ...ledger.paymentOrders],
    };
    targets.push({ student, cls, expected: c.course1 + c.course2, label: `${c.classCode} ${c.studentCode} — tách nợ khóa 1 ${vnd(c.course1)} + khóa 2 ${vnd(c.course2)}` });
  }

  const syncedBefore: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(before)), classes, students, sessions, now);
  const syncedAfter: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(ledger)), classes, workStudents, sessions, now);
  // Sync không được đổi phiếu của học viên khác.
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => !targets.some((t) => t.student.id === r.studentId)).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(syncedBefore) !== others(syncedAfter)) fail("Phiếu của học viên khác bị thay đổi — dừng");

  const appDebt = (sepay: any, studentRows: any[] = students) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(studentRows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (studentId: string, classId: string) => ctx.__t.tuitionEffectiveDebt(ctx.__t.state.data.students.find((r: any) => r.id === studentId), ctx.__t.state.data.classes.find((r: any) => r.id === classId));
  };
  const debtBefore = appDebt(syncedBefore);
  const debtAfter = appDebt(syncedAfter, workStudents);
  const states = (student: any, cls: any, l: any) => studentCourseCollectStates(student, cls, sessions, l, now)
    .map((s: any) => `K${s.index} ${s.status}${s.balanceDue ? ` ${vnd(s.balanceDue)}` : ""}`).join(" · ");

  const nextStudents = workStudents.map((row) => ({ ...row }));
  for (const { student, cls, expected, label } of targets) {
    const after = workStudents.find((row) => row.id === student.id);
    const d0 = debtBefore(student.id, cls.id), d1 = debtAfter(student.id, cls.id);
    if (d1 !== expected) fail(`${student.code}: công nợ sau sửa ${vnd(d1)} ≠ ${vnd(expected)} — dừng`);
    const t0 = courseRemainingSessions(student, cls, sessions, syncedBefore, now);
    const t1 = courseRemainingSessions(after, cls, sessions, syncedAfter, now);
    console.log(`${label} · ${student.fullName}`);
    console.log(`  Công nợ: ${vnd(d0)} → ${vnd(d1)}`);
    console.log(`  Tồn:     ${t0} → ${t1} buổi`);
    console.log(`  Trước:   ${states(student, cls, syncedBefore)}`);
    console.log(`  Sau:     ${states(after, cls, syncedAfter)}`);
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
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
