/**
 * S32 HV0420 Hà Giang (26/10/2026, anh Vũ xác nhận): em đã trả hết nợ khóa cũ, khóa 2
 * (06/11) chưa bắt đầu — phải giống cả lớp (không nợ). Hiện 2 khoản chuyển khoản
 * 19/10 (400.000đ + 450.000đ) đang gắn nhầm vào phiếu khóa 2 nên khóa 2 hiện "Còn nợ
 * 1.550.000đ". Script chuyển 2 khoản đó sang phiếu khóa 1 (đã thu đủ 850.000đ), mở lại
 * phiếu khóa 2 nguyên trạng như các bạn cùng lớp. Số tiền, ngày trong sổ thu chi giữ nguyên.
 * Chỉ đụng HV0420. Mặc định dry-run. APPLY=1 mới ghi.
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
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import { courseIndexOfBillKey, courseRemainingSessions, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const CLASS_CODE = "S32";
const STUDENT_CODE = "HV0420";
const MOVE_TOTAL = 850_000;
const STAMP = "Chuyển về khóa 1 (trả nợ khóa cũ) theo xác nhận trung tâm 26/10/2026";
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

  const cls = classes.find((row) => String(row.code).toUpperCase() === CLASS_CODE) || fail(`Không thấy lớp ${CLASS_CODE}`);
  const student = students.find((row) => String(row.code).toUpperCase() === STUDENT_CODE) || fail(`Không thấy ${STUDENT_CODE}`);
  const before = mergeSepayLedger(finance.sepay);
  let ledger: any = structuredClone(before);
  let cashbook: any[] = structuredClone(finance.cashbook || []);

  const mine = ledger.receivables.filter((r: any) => r.studentId === student.id && r.classId === cls.id && r.status !== "CANCELLED");
  if (mine.some((r: any) => courseIndexOfBillKey(r.billKey) === 1)) fail("Đã có phiếu khóa 1 — dừng để kiểm tra tay");
  const k2 = mine.filter((r: any) => courseIndexOfBillKey(r.billKey) === 2);
  if (k2.length !== 1) fail(`Cần đúng 1 phiếu khóa 2, đang có ${k2.length}`);
  const r2 = k2[0];
  const pays = ledger.payments.filter((p: any) => p.receivableId === r2.id && p.status !== "VOIDED" && p.status !== "REFUNDED");
  const moved = pays.reduce((sum: number, p: any) => sum + Math.round(Number(p.allocatedAmount) || 0), 0);
  if (moved !== MOVE_TOTAL) fail(`Phiếu khóa 2 đang có ${vnd(moved)} đã thu (cần đúng ${vnd(MOVE_TOTAL)}) — dừng`);

  const k1Period = `Khóa 1 · ${cls.name} · Nợ khóa cũ`;
  const created = createReceivable({
    studentId: student.id, studentName: student.fullName, billingPeriod: k1Period, amountDue: MOVE_TOTAL,
    usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: pays[0].paidAt,
  });
  const k1 = { ...created.receivable, classId: cls.id, billKey: `course|${cls.id}`, amountPaid: MOVE_TOTAL, balanceDue: 0, status: "PAID", frozenAt: now.toISOString() };
  const payIds = new Set(pays.map((p: any) => p.id));
  const receiptIds = new Set(ledger.receipts.filter((r: any) => payIds.has(r.paymentId)).map((r: any) => r.id));
  ledger = {
    ...ledger,
    receivables: [k1, ...ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountPaid: 0, balanceDue: r.amountDue, status: "OPEN" } : r)],
    paymentOrders: [{ ...created.order, status: "PAID" }, ...ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId ? { ...refreshOrderQr(o, ledger.settings, r2.amountDue), status: "ACTIVE" } : o)],
    payments: ledger.payments.map((p: any) => payIds.has(p.id) ? { ...p, receivableId: k1.id } : p),
    receipts: ledger.receipts.map((r: any) => receiptIds.has(r.id) ? { ...r, classId: cls.id, className: cls.name, billingPeriod: k1Period, billingMode: "COURSE", note: [r.note, STAMP].filter(Boolean).join(" · ") } : r),
    invoices: ledger.invoices.map((i: any) => payIds.has(i.paymentId) ? { ...i, receivableId: k1.id } : i),
  };
  let cashMoved = 0;
  cashbook = cashbook.map((c: any) => {
    if (!receiptIds.has(c.receiptId)) return c;
    cashMoved += 1;
    return { ...c, tuitionId: k1.id };
  });

  const syncedBefore: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(before)), classes, students, sessions, now);
  const syncedAfter: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(ledger)), classes, students, sessions, now);
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => r.studentId !== student.id).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(syncedBefore) !== others(syncedAfter)) fail("Phiếu của học viên khác bị thay đổi — dừng");

  const appDebt = (sepay: any) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(students), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (studentId: string) => ctx.__t.tuitionEffectiveDebt(ctx.__t.state.data.students.find((r: any) => r.id === studentId), ctx.__t.state.data.classes.find((r: any) => r.id === cls.id));
  };
  const d0 = appDebt(syncedBefore)(student.id);
  const d1 = appDebt(syncedAfter)(student.id);
  const states = (l: any) => studentCourseCollectStates(student, cls, sessions, l, now).map((s: any) => `K${s.index} ${s.status}${s.balanceDue ? ` ${vnd(s.balanceDue)}` : ""}`).join(" · ");
  // Bạn cùng lớp làm mốc: nợ hiện tại của một em khóa 2 chưa đóng.
  const peer = students.find((s) => (cls.studentIds || []).includes(s.id) && s.id !== student.id && !s.tuitionExempt);
  const peerDebt = peer ? appDebt(syncedAfter)(peer.id) : 0;
  if (d1 !== peerDebt) fail(`Công nợ sau sửa ${vnd(d1)} khác bạn cùng lớp ${peer?.code} ${vnd(peerDebt)} — dừng`);
  const t0 = courseRemainingSessions(student, cls, sessions, syncedBefore, now);
  const t1 = courseRemainingSessions(student, cls, sessions, syncedAfter, now);

  console.log(`${CLASS_CODE} ${STUDENT_CODE} ${student.fullName}`);
  console.log(`  Chuyển ${pays.length} khoản (${pays.map((p: any) => vnd(p.allocatedAmount)).join(" + ")}) từ phiếu khóa 2 → phiếu khóa 1; sổ thu chi cập nhật ${cashMoved} dòng (giữ số tiền, ngày)`);
  console.log(`  Công nợ: ${vnd(d0)} → ${vnd(d1)}  (bạn cùng lớp ${peer?.code}: ${vnd(peerDebt)})`);
  console.log(`  Tồn:     ${t0} → ${t1} buổi`);
  console.log(`  Trước:   ${states(syncedBefore)}`);
  console.log(`  Sau:     ${states(syncedAfter)}`);

  const nextStudents = students.map((row) => row.id !== student.id ? row : { ...row, sessionBalances: { ...(row.sessionBalances || {}), [cls.id]: t1 } });
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger, cashbook });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
