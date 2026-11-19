/**
 * S40: theo xác nhận của trung tâm (23/10/2026), các học viên còn phiếu khóa 1
 * (1.560.000đ) đang mở đã đóng khóa 1 ngoài hệ thống. Ghi nhận khóa 1 đã đóng
 * bằng biên lai "chưa nhập phiếu thu sổ quỹ" (không vào sổ quỹ vì tiền đã thu
 * ngoài), phiếu khóa 1 → Đã thu. Khóa 2 giữ nguyên logic app.
 * Chỉ đụng phiếu khóa 1 của lớp S40. Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const CODE = "S40";
const COURSE = 1_560_000;
const NOTE = "Đã đóng học phí khóa 1 ngoài hệ thống — cập nhật công nợ S40 theo xác nhận trung tâm 23/10/2026 (chưa nhập phiếu thu sổ quỹ)";
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
  const cls = classes.find((c) => c.code === CODE) || fail("Không thấy lớp S40");
  if (Number(cls.sessionPrice) * Number(cls.courseSessions) !== COURSE) fail("Học phí khóa S40 không còn là 1.560.000đ — dừng");
  const k1Key = `course|${cls.id}`;
  const nowIso = new Date().toISOString();
  const month = nowIso.slice(0, 7).replace("-", "");
  let seq = ledger.receipts.filter((r: any) => String(r.receiptNumber || "").startsWith(`PT-${month}-`))
    .reduce((max: number, r: any) => Math.max(max, Number(String(r.receiptNumber).split("-")[2]) || 0), 0);

  const lines: string[] = [];
  for (const sid of cls.studentIds) {
    const st = students.find((s) => s.id === sid);
    if (!st) continue;
    const k1 = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && (r.billKey === k1Key || r.billKey === `${k1Key}|1`) && r.status !== "CANCELLED");
    const open = k1.filter((r: any) => r.status === "OPEN" || r.status === "PARTIALLY_PAID");
    if (!open.length) { lines.push(`   ${st.code} ${st.fullName}: khóa 1 ${k1.length ? k1.map((r: any) => r.status).join("/") : "không có phiếu"} — bỏ qua`); continue; }
    if (open.length > 1) fail(`${st.code}: có ${open.length} phiếu khóa 1 đang mở — dừng`);
    const r = open[0];
    if (Math.round(r.amountDue) !== COURSE || Math.round(r.amountPaid) !== 0) fail(`${st.code}: phiếu khóa 1 ${vnd(r.amountDue)} đã thu ${vnd(r.amountPaid)} — không đúng dự kiến, dừng`);
    const payId = `pay-${crypto.randomUUID()}`;
    const payment = { id: payId, paymentCode: ledger.paymentOrders.find((o: any) => o.id === r.paymentOrderId)?.paymentCode || "", studentId: sid,
      bankTransactionId: `manual-${crypto.randomUUID()}`, receivableId: r.id, amount: COURSE, allocatedAmount: COURSE, excessAmount: 0,
      status: "COMPLETED", paidAt: nowIso, method: "Chuyển khoản", note: NOTE };
    seq += 1;
    const receipt = { id: `rcpt-${crypto.randomUUID()}`, receiptNumber: `PT-${month}-${String(seq).padStart(6, "0")}`, paymentId: payId, studentId: sid,
      amount: COURSE, issuedAt: nowIso, status: "UNRECORDED", method: "Chuyển khoản", note: NOTE, classId: cls.id, className: cls.name,
      billingPeriod: r.billingPeriod, billingMode: "COURSE", studentName: st.fullName, studentCode: st.code, creditSessionsUsed: 0, materialsAmount: 0 };
    ledger = {
      ...ledger,
      receivables: ledger.receivables.map((x: any) => x.id === r.id ? { ...x, amountPaid: COURSE, balanceDue: 0, status: "PAID" } : x),
      paymentOrders: ledger.paymentOrders.map((o: any) => o.id === r.paymentOrderId ? { ...o, status: "PAID" } : o),
      payments: [payment, ...ledger.payments],
      receipts: [receipt, ...ledger.receipts],
    };
    lines.push(` ✔ ${st.code} ${st.fullName}: phiếu khóa 1 ${vnd(COURSE)} → Đã thu (${receipt.receiptNumber}, chưa vào sổ quỹ)`);
  }
  console.log(`Lớp ${CODE} · ${cls.name}`);
  console.log(lines.join("\n"));
  const count = lines.filter((l) => l.startsWith(" ✔")).length;
  console.log(`\nSố học viên ghi nhận đã đóng khóa 1: ${count} · tổng ${vnd(count * COURSE)} (không vào sổ quỹ)`);
  if (!count) { await prisma.$disconnect(); return; }

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S40.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
