/**
 * S21 — theo xác nhận trung tâm (24/10/2026): HV0280 Phương Chi, HV0284 Khả Hân,
 * HV0285 Bùi Bảo Châu còn nợ khóa 1 1.560.000đ, ngoài khóa 2 như cả lớp.
 * Hiện trạng: phiếu khóa 2 gộp 3.120.000đ (khóa 2 + nợ khóa 1 dạng "nợ buổi cũ" −24)
 * và một dòng ghi hàng loạt "Đã đóng một phần — cập nhật công nợ S21" 1.560.000đ
 * (chưa vào sổ quỹ) → mỗi em chỉ còn nợ 1.560.000đ như các bạn.
 * Sửa: hoàn tác dòng ghi hàng loạt đó (không đụng sổ quỹ), tách phiếu khóa 1 riêng
 * 1.560.000đ còn nợ, phiếu khóa 2 về 1.560.000đ còn nợ, bỏ "nợ buổi cũ".
 * Mỗi em: còn nợ 3.120.000đ = khóa 1 + khóa 2. Chỉ đụng 3 em này của lớp S21.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import { courseRemainingSessions, reverseTuitionReceipt } from "../cloudflare/tuition-billing";

const CODE = "S21";
const TARGETS = ["HV0280", "HV0284", "HV0285"];
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const live = (p: any) => p.status !== "VOIDED" && p.status !== "REFUNDED";

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const originalStudents: any[] = await (studentsRepository as any).read(prisma);
  let students = originalStudents;
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  let cashbook: any[] = finance.cashbook || [];
  const cls = classes.find((c) => c.code === CODE) || fail("Không thấy lớp S21");
  const course = Number(cls.sessionPrice) * Number(cls.courseSessions);
  if (course !== 1_560_000) fail(`Học phí khóa S21 là ${vnd(course)}, không phải 1.560.000đ — dừng`);
  const k1Key = `course|${cls.id}`;
  const k2Key = `course|${cls.id}|2`;
  const now = new Date();
  const debt = (sid: string) => ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && r.status !== "CANCELLED")
    .reduce((s: number, r: any) => s + Math.max(0, Number(r.balanceDue) || 0), 0);

  for (const code of TARGETS) {
    const st = students.find((s) => s.code === code) || fail(`Không thấy ${code}`);
    if (!cls.studentIds.includes(st.id)) fail(`${code} không thuộc lớp S21 — dừng`);
    const before = debt(st.id);
    const rows = ledger.receivables.filter((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED");
    if (rows.some((r: any) => r.billKey === k1Key || r.billKey === `${k1Key}|1`)) fail(`${code}: đã có phiếu khóa 1 — dừng`);
    const k2 = rows.filter((r: any) => r.billKey === k2Key);
    if (k2.length !== 1) fail(`${code}: cần đúng 1 phiếu khóa 2, thấy ${k2.length} — dừng`);
    const r2 = k2[0];
    const pays = ledger.payments.filter((p: any) => p.receivableId === r2.id && live(p));
    const receiptOf = (p: any) => ledger.receipts.find((r: any) => r.paymentId === p.id);
    const bulk = pays.filter((p: any) => receiptOf(p)?.status === "UNRECORDED" && /Đã đóng một phần/.test(String(receiptOf(p)?.note || p.note || "")));
    const real = pays.filter((p: any) => !bulk.includes(p));
    if (real.length) fail(`${code}: phiếu khóa 2 có khoản thu thật (đã vào sổ quỹ) — dừng để kiểm tra tay`);
    const notes: string[] = [];

    // 1) Hoàn tác dòng ghi hàng loạt "Đã đóng một phần" (chưa vào sổ quỹ).
    for (const p of bulk) {
      const rc = receiptOf(p);
      const res: any = reverseTuitionReceipt({ ledger, receiptId: rc.id, students, classes, sessions });
      if (res.error) fail(`${code}: ${res.error}`);
      ledger = res.ledger;
      students = res.students;
      cashbook = cashbook.filter((c: any) => c.receiptId !== rc.id);
      notes.push(`hoàn tác ${rc.receiptNumber} ${vnd(p.allocatedAmount)} (ghi hàng loạt, chưa vào sổ quỹ)`);
    }

    // 2) Phiếu khóa 1 riêng còn nợ; phiếu khóa 2 về đúng 1 khóa còn nợ.
    const created = createReceivable({ studentId: st.id, studentName: st.fullName, billingPeriod: `Khóa ${cls.courseSessions} buổi · ${cls.name}`, amountDue: course,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: now.toISOString() });
    ledger = {
      ...ledger,
      receivables: [
        { ...created.receivable, classId: cls.id, billKey: k1Key },
        ...ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountDue: course, amountPaid: 0, balanceDue: course, status: "OPEN" } : r),
      ],
      paymentOrders: [
        created.order,
        ...ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId ? { ...refreshOrderQr(o, ledger.settings, course), status: "ACTIVE" } : o),
      ],
    };
    notes.push(`phiếu khóa 2 ${vnd(r2.amountDue)} → ${vnd(course)} còn nợ; lập phiếu khóa 1 ${vnd(course)} còn nợ`);

    // 3) Bỏ "nợ buổi cũ" (đã thành phiếu khóa 1).
    students = students.map((s: any) => {
      if (s.id !== st.id) return s;
      const tuitionCredits = { ...(s.tuitionCredits || {}) };
      delete tuitionCredits[cls.id];
      return { ...s, tuitionCredits };
    });
    const after = debt(st.id);
    console.log(`${code} ${st.fullName}: còn nợ ${vnd(before)} → ${vnd(after)}\n   - ${notes.join("\n   - ")}`);
    if (after !== 2 * course) fail(`${code}: nợ sau khi sửa ${vnd(after)} khác 3.120.000đ — dừng`);
  }

  const touched = new Set(TARGETS.map((c) => students.find((s) => s.code === c).id));
  const changed = new Map(students.map((s: any) => [s.id, s]));
  const finalStudents = originalStudents.map((s: any) => {
    if (!touched.has(s.id)) return s;
    const next: any = changed.get(s.id);
    return { ...next, sessionBalances: { ...(next.sessionBalances || {}), [cls.id]: courseRemainingSessions(next, cls, sessions, ledger, now) } };
  });

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger, cashbook });
    await (studentsRepository as any).write(tx, finalStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S21.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
