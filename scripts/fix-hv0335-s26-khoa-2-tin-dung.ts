/**
 * S26 — HV0335 Duy Bảo đã đóng khóa 2 (tiền thừa trước khi dùng hệ thống, nhập dạng
 * tín dụng 1.560.000đ). Dữ liệu đang: phiếu khóa 2 = 0đ "đã thu", tín dụng 1.560.000đ
 * vẫn treo → không có biên lai nên số buổi tồn không được cộng 24 buổi (hiện −2), và
 * tín dụng treo sẽ bị app tự trừ nhầm vào phiếu khóa 3 sau này.
 * Sửa (giống cách ghi "đã đóng ngoài hệ thống" của các lớp khác):
 *  - phiếu khóa 2 về 1.560.000đ, đã thu đủ bằng một biên lai "chưa nhập phiếu thu sổ quỹ",
 *  - xóa tín dụng treo 1.560.000đ (đã dùng cho khóa 2).
 * Sổ quỹ không đổi. Số buổi tồn = −2 + 24 = 22. Chỉ đụng HV0335.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { courseRemainingSessions } from "../cloudflare/tuition-billing";

const NOTE = "Đã đóng học phí khóa 2 bằng tiền thừa trước khi dùng hệ thống — cập nhật công nợ S26 24/10/2026 (chưa nhập phiếu thu sổ quỹ)";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  const st = students.find((s) => s.code === "HV0335") || fail("Không thấy HV0335");
  const cls = classes.find((c) => c.code === "S26") || fail("Không thấy S26");
  const course = Number(cls.sessionPrice) * Number(cls.courseSessions);
  if (course !== 1_560_000) fail("Học phí khóa S26 không còn là 1.560.000đ — dừng");
  const now = new Date();
  const nowIso = now.toISOString();
  const r2 = ledger.receivables.find((r: any) => r.studentId === st.id && r.billKey === `course|${cls.id}|2` && r.status !== "CANCELLED") || fail("Không thấy phiếu khóa 2");
  if (!(r2.status === "PAID" && Math.round(r2.amountDue) === 0 && Math.round(r2.amountPaid) === 0)) fail(`Phiếu khóa 2 không ở trạng thái dự kiến (${r2.status} ${vnd(r2.amountDue)}) — dừng`);
  if (ledger.payments.some((p: any) => p.receivableId === r2.id && p.status !== "VOIDED")) fail("Phiếu khóa 2 đã có khoản thu — dừng");
  const credit = (ledger.credits || []).find((c: any) => c.id === `cred-surplus-${cls.id}-${st.id}`) || fail("Không thấy tín dụng tiền thừa S26 — dừng");
  if (Math.round(credit.amount) !== course) fail(`Tín dụng ${vnd(credit.amount)} khác 1.560.000đ — dừng`);
  const tonBefore = courseRemainingSessions(st, cls, sessions, ledger, now);

  const month = nowIso.slice(0, 7).replace("-", "");
  const seq = ledger.receipts.filter((r: any) => String(r.receiptNumber || "").startsWith(`PT-${month}-`))
    .reduce((max: number, r: any) => Math.max(max, Number(String(r.receiptNumber).split("-")[2]) || 0), 0) + 1;
  const payId = `pay-${crypto.randomUUID()}`;
  const order = ledger.paymentOrders.find((o: any) => o.id === r2.paymentOrderId);
  const payment = { id: payId, paymentCode: order?.paymentCode || "", studentId: st.id, bankTransactionId: `manual-${crypto.randomUUID()}`, receivableId: r2.id,
    amount: course, allocatedAmount: course, excessAmount: 0, status: "COMPLETED", paidAt: nowIso, method: "Chuyển khoản", note: NOTE };
  const receipt = { id: `rcpt-${crypto.randomUUID()}`, receiptNumber: `PT-${month}-${String(seq).padStart(6, "0")}`, paymentId: payId, studentId: st.id,
    amount: course, issuedAt: nowIso, status: "UNRECORDED", method: "Chuyển khoản", note: NOTE, classId: cls.id, className: cls.name,
    billingPeriod: r2.billingPeriod, billingMode: "COURSE", studentName: st.fullName, studentCode: st.code, creditSessionsUsed: 0, materialsAmount: 0 };
  ledger = {
    ...ledger,
    receivables: ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountDue: course, amountPaid: course, balanceDue: 0, status: "PAID" } : r),
    paymentOrders: ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId ? { ...o, amount: course, status: "PAID" } : o),
    payments: [payment, ...ledger.payments],
    receipts: [receipt, ...ledger.receipts],
    credits: ledger.credits.filter((c: any) => c.id !== credit.id),
  };
  const tonAfter = courseRemainingSessions(st, cls, sessions, ledger, now);
  console.log(`HV0335 ${st.fullName} · S26`);
  console.log(`  phiếu khóa 2: 0đ "đã thu" → ${vnd(course)} đã thu (${receipt.receiptNumber}, chưa vào sổ quỹ)`);
  console.log(`  xóa tín dụng treo ${vnd(credit.remainingAmount)} (${credit.status})`);
  console.log(`  số buổi tồn: ${tonBefore} → ${tonAfter}`);
  if (tonAfter !== tonBefore + 24) fail("Số buổi tồn không tăng đúng 24 — dừng");
  const finalStudents = students.map((s: any) => s.id === st.id ? { ...s, sessionBalances: { ...(s.sessionBalances || {}), [cls.id]: tonAfter } } : s);

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
  console.log("\nĐÃ GHI xong HV0335.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
