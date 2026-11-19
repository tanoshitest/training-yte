/**
 * HV0807 (T16): khoản chuyển khoản 480.000đ ngày 02/10 ("nộp tiền học phí cho cháu
 * Nguyễn Quốc Gia Bảo T16") bị khớp nhầm vào phiếu tháng 11, nên tháng 11 hiện
 * "đã đóng" 480.000đ. Đây là tiền học phí tháng 9 (các bạn cùng lớp đều có phiếu
 * T9 480.000đ đã thu; HV0807 không có phiếu T9).
 * Sửa: lập phiếu tháng 9 480.000đ đã thu, chuyển khoản tiền + biên lai + dòng sổ
 * quỹ sang phiếu tháng 9; xóa (hủy) phiếu tháng 11 — app tự lập lại phiếu T11
 * 540.000đ chưa thu như các bạn. Tiền trong sổ quỹ giữ nguyên.
 * Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger } from "../cloudflare/sepay-engine";

const CODE = "HV0807";
const CLASS_ID = "class-import-t16";
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
  const st = students.find((s) => s.code === CODE) || fail(`Không thấy ${CODE}`);
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp T16");
  const mine = (key: string) => ledger.receivables.filter((r: any) => r.studentId === st.id && r.billKey === key && r.status !== "CANCELLED");
  const nov = mine(`month|${CLASS_ID}|2026-11`);
  if (nov.length !== 1) fail(`Cần đúng 1 phiếu T11, thấy ${nov.length} — dừng`);
  const r11 = nov[0];
  if (r11.status !== "PAID" || Math.round(r11.amountPaid) !== 480_000) fail(`Phiếu T11 không phải 480.000đ đã thu (${r11.status} ${vnd(r11.amountPaid)}) — dừng`);
  if (mine(`month|${CLASS_ID}|2026-09`).length) fail("HV0807 đã có phiếu T9 — dừng để kiểm tra tay");
  const pays = ledger.payments.filter((p: any) => p.receivableId === r11.id && p.status === "COMPLETED");
  if (pays.length !== 1 || Math.round(pays[0].allocatedAmount) !== 480_000) fail("Phiếu T11 không phải đúng 1 khoản thu 480.000đ — dừng");
  const pay = pays[0];
  const rc = ledger.receipts.find((r: any) => r.paymentId === pay.id) || fail("Không thấy biên lai");
  const tx = (ledger.bankTransactions || []).find((t: any) => t.id === pay.bankTransactionId);
  console.log(`Trước: phiếu T11 ${r11.status} ${vnd(r11.amountDue)} · khoản thu ${vnd(pay.allocatedAmount)} (${rc.receiptNumber}) từ giao dịch ${tx?.transactionDate?.slice(0, 10) || "?"}: "${String(tx?.content || tx?.description || "").slice(0, 90)}"`);

  const period = `Tháng 09/2026 · ${cls.name}`;
  const created = createReceivable({ studentId: st.id, studentName: st.fullName, billingPeriod: period, amountDue: 480_000,
    usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: pay.paidAt });
  const r09 = { ...created.receivable, classId: CLASS_ID, billKey: `month|${CLASS_ID}|2026-09`, amountPaid: 480_000, balanceDue: 0, status: "PAID" };
  ledger = {
    ...ledger,
    receivables: [r09, ...ledger.receivables.map((r: any) => r.id === r11.id ? { ...r, amountPaid: 0, balanceDue: 0, status: "CANCELLED" } : r)],
    paymentOrders: [{ ...created.order, status: "PAID" }, ...ledger.paymentOrders.map((o: any) => o.id === r11.paymentOrderId ? { ...o, status: "CANCELLED" } : o)],
    payments: ledger.payments.map((p: any) => p.id === pay.id ? { ...p, receivableId: r09.id } : p),
    receipts: ledger.receipts.map((r: any) => r.id === rc.id ? { ...r, billingPeriod: period } : r),
    invoices: ledger.invoices.map((i: any) => i.paymentId === pay.id ? { ...i, receivableId: r09.id } : i),
  };
  const cashbook = (finance.cashbook || []).map((c: any) => c.receiptId === rc.id
    ? { ...c, tuitionId: r09.id, description: `Thu học phí ${period}` } : c);
  console.log(`Sau:   phiếu T9 480.000đ ĐÃ THU (biên lai ${rc.receiptNumber}, sổ quỹ giữ nguyên ${vnd(rc.amount)}) · phiếu T11 cũ HỦY → app lập lại T11 540.000đ chưa thu`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (txn: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await txn.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await txn.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(txn, { ...finance, sepay: ledger, cashbook });
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong HV0807.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
