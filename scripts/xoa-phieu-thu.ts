/**
 * Xoá MỘT phiếu thu học phí ghi nhầm cho ĐÚNG 1 học viên — y hệt nút Xoá trong Quản lý thu chi
 * (hoàn tác biên lai: phiếu học phí mở lại, bỏ dòng sổ thu chi, tính lại tồn), dùng khi web không
 * cho xoá (ngày đã đối soát). Không đụng học viên khác.
 *   STUDENT=HV0581 CLASS=T3 RECEIPT=PT-202610-000606 TOTAL=400000 tsx scripts/xoa-phieu-thu.ts   (chạy thử)
 *   ... APPLY=1 ...  (ghi thật). TOTAL = công nợ app phải đạt sau khi xoá.
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
import { rebuildRecon, rebuildReconEntries, syncTuitionCashbook } from "../cloudflare/finance-types";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { reverseTuitionReceipt, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const STUDENT = String(process.env.STUDENT || "").toUpperCase();
const CLASS = String(process.env.CLASS || "").toUpperCase();
const RECEIPT = String(process.env.RECEIPT || "").trim();
const TOTAL = Number(process.env.TOTAL ?? NaN);
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (!STUDENT || !CLASS || !RECEIPT || !Number.isFinite(TOTAL)) fail("Thiếu STUDENT / CLASS / RECEIPT / TOTAL");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const raw: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const now = new Date();
  const st = students.find((s) => String(s.code).toUpperCase() === STUDENT) || fail(`Không thấy ${STUDENT}`);
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  const current: any = syncTuitionCashbook(raw);
  const ledger: any = mergeSepayLedger(current.sepay);
  const receipt = ledger.receipts.find((r: any) => r.receiptNumber === RECEIPT) || fail(`Không thấy biên lai ${RECEIPT}`);
  if (receipt.studentId !== st.id) fail(`Biên lai ${RECEIPT} không phải của ${STUDENT}`);
  const pay = ledger.payments.find((p: any) => p.id === receipt.paymentId);
  const recv = pay ? ledger.receivables.find((r: any) => r.id === pay.receivableId) : undefined;
  if ((receipt.classId || recv?.classId) !== cls.id) fail(`Biên lai ${RECEIPT} không thuộc lớp ${CLASS}`);
  const entries = current.cashbook.filter((c: any) => c.receiptId === receipt.id);
  const tx = pay?.bankTransactionId ? ledger.bankTransactions.find((t: any) => t.id === pay.bankTransactionId) : undefined;
  console.log(`${st.code} ${st.fullName} (${cls.code}) — xoá biên lai ${RECEIPT} ${vnd(receipt.amount)} ${receipt.method || ""} ${String(receipt.issuedAt).slice(0, 10)} · ${receipt.billingPeriod}`);
  console.log(`  Dòng sổ thu chi bị bỏ: ${entries.map((c: any) => `${c.date} ${vnd(c.amount)} ${c.description}`).join(" | ") || "(không có)"}`);
  if (tx) console.log(`  Giao dịch ngân hàng gốc: ${String(tx.transactionDate).slice(0, 16)} ${vnd(tx.transferAmount)} — "${String(tx.content).slice(0, 120)}"`);
  const reversed: any = reverseTuitionReceipt({ ledger, receiptId: receipt.id, students, classes, sessions });
  if (reversed.error) fail(reversed.error);
  const cashbook = current.cashbook.filter((c: any) => c.receiptId !== receipt.id);
  const finance = {
    ...current, sepay: reversed.ledger, cashbook,
    recon: rebuildRecon(cashbook, current.recon), reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
    cashbookSkippedReceiptIds: [...new Set([...(current.cashbookSkippedReceiptIds || []), receipt.id])],
  };
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => r.studentId !== st.id).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(ledger) !== others(reversed.ledger)) fail("Phiếu học viên khác bị đổi — dừng");
  const appDebt = (sepay: any, rows: any[]) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(rows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...current, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const s = ctx.__t.state.data.students.find((x: any) => x.id === st.id), c = ctx.__t.state.data.classes.find((x: any) => x.id === cls.id);
    return [ctx.__t.tuitionEffectiveDebt(s, c), ctx.__t.studentSessionRemaining(s, c)];
  };
  const [d0, t0] = appDebt(syncTuitionReceivables(mergeSepayLedger(structuredClone(ledger)), classes, students, sessions, now), students);
  const [d1, t1] = appDebt(syncTuitionReceivables(mergeSepayLedger(structuredClone(reversed.ledger)), classes, reversed.students, sessions, now), reversed.students);
  console.log(`  Công nợ: ${vnd(d0)} → ${vnd(d1)} · Tồn: ${t0} → ${t1}`);
  if (d1 !== TOTAL) fail(`Công nợ sau xoá ${vnd(d1)} ≠ ${vnd(TOTAL)} — dừng`);
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (q: any) => {
    for (const { key, version } of versions) {
      const r = await q.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!r.length || Number(r[0].version) !== version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await q.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(q, finance);
    await (studentsRepository as any).write(q, reversed.students);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
