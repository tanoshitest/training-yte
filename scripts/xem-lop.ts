/** CHỈ ĐỌC: toàn bộ học phí một lớp (từng học viên: công nợ app, tồn, phiếu, biên lai). CLASS=T1 */
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
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";

const CLASS = String(process.env.CLASS || "").toUpperCase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}`;
(async () => {
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const now = new Date();
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS);
  if (!cls) throw new Error(`Không thấy lớp ${CLASS}`);
  const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: sessions, finance: { ...finance, sepay: ledger }, settings, teachers };
  ctx.__t.state.role = "ADMIN";
  console.log(`${cls.code} ${cls.name} · ${cls.billingMode} · ${vnd(cls.sessionPrice)}đ/buổi · ${cls.studentIds.length} HV`);
  for (const sid of cls.studentIds) {
    const st = students.find((s) => s.id === sid);
    if (!st) { console.log(`?? ${sid} không còn`); continue; }
    const debt = ctx.__t.tuitionEffectiveDebt(st, cls);
    const rem = ctx.__t.studentSessionRemaining(st, cls);
    const q = tuitionCollectionCharge(st, cls, sessions, ledger, now);
    console.log(`\n${st.code} | ${st.fullName} | nợ app ${vnd(debt)} | tồn ${rem} | paidThrough ${st.tuitionPaidThrough?.[cls.id] || "-"} | credit ${st.tuitionCredits?.[cls.id] ?? "-"}${st.tuitionExempt ? " | MIỄN" : ""} | báo giá ${vnd(q.amount)} (${(q as any).months?.join(",") || ""}${(q as any).oldDebtAmount ? ` nợ cũ ${vnd((q as any).oldDebtAmount)}` : ""})`);
    for (const r of ledger.receivables.filter((x: any) => x.studentId === sid && x.classId === cls.id && x.status !== "CANCELLED")) {
      const order = ledger.paymentOrders.find((o: any) => o.id === r.paymentOrderId);
      console.log(`  [${r.billKey}] phải ${vnd(r.amountDue)} thu ${vnd(r.amountPaid)} còn ${vnd(r.balanceDue)} ${r.status}${r.frozenAt ? " chốt" : ""} mã ${order?.paymentCode || "-"}`);
      for (const p of ledger.payments.filter((x: any) => x.receivableId === r.id)) {
        const rc = ledger.receipts.find((x: any) => x.paymentId === p.id);
        console.log(`     + ${String(p.paidAt).slice(0, 10)} ${vnd(p.allocatedAmount)} ${p.status} ${p.method || ""}${rc ? ` BL ${rc.receiptNumber} ${rc.status}` : ""}`);
      }
    }
    for (const c of (ledger.credits || []).filter((x: any) => x.studentId === sid)) console.log(`  credit ${c.id} ${vnd(c.remainingAmount ?? c.amount)} ${c.status || ""} ${c.reason || ""}`);
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error("LỖI", e.message); await prisma.$disconnect(); process.exit(1); });
