/** CHỈ ĐỌC: mổ xẻ công nợ một học viên ở mọi lớp + nhật ký liên quan. STUDENT=HV1011 */
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
import { auditRepository } from "../cloudflare/storage/audit-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables, tuitionCollectionCharge, monthlyRemainingSessions } from "../cloudflare/tuition-billing";

const CODE = String(process.env.STUDENT || "").toUpperCase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}`;
(async () => {
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const audit: any[] = await (auditRepository as any).read(prisma);
  const now = new Date();
  const st = students.find((s) => String(s.code).toUpperCase() === CODE);
  if (!st) throw new Error(`Không thấy ${CODE}`);
  const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  const raw: any = mergeSepayLedger(finance.sepay);
  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat(
    "\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining,monthlyCarryAmount,monthlyCarryReceivables,studentTuitionPaid,tuitionCollectionQuote,tuitionQuoteRemaining,sameClassDueAmount,outstandingOtherAmount,studentOutstandingOtherReceivables,monthKey,shiftMonthKey};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: sessions, finance: { ...finance, sepay: ledger }, settings, teachers };
  ctx.__t.state.role = "ADMIN";
  const T = ctx.__t;
  const clsName = (id: string) => { const c = classes.find((x) => x.id === id); return c ? `${c.code}` : id; };

  console.log(`${st.code} ${st.fullName} · status ${st.status || "-"} · exempt ${!!st.tuitionExempt}`);
  console.log(`  lớp hiện tại: ${(classes.filter((c) => (c.studentIds || []).includes(st.id)).map((c) => `${c.code} (${c.billingMode}, ${vnd(c.sessionPrice)}đ/buổi)`).join(", ")) || "-"}`);
  for (const k of ["classId", "classIds", "classJoinedAt", "classLeftAt", "tuitionPaidThrough", "tuitionCredits", "sessionBalances", "transferHistory", "classHistory", "previousClassIds", "oldDebt", "tuitionNote"]) {
    if (st[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(st[k])}`);
  }
  const other = Object.keys(st).filter((k) => /transfer|class|debt|tuition|move/i.test(k) && !["classId", "classIds", "classJoinedAt", "classLeftAt", "tuitionPaidThrough", "tuitionCredits", "sessionBalances", "transferHistory", "classHistory", "previousClassIds", "oldDebt", "tuitionNote"].includes(k));
  for (const k of other) console.log(`  ${k}: ${JSON.stringify(st[k])}`);

  const dump = (title: string, book: any) => {
    console.log(`\n== ${title}`);
    for (const r of book.receivables.filter((r: any) => r.studentId === st.id)) {
      console.log(`  [${r.billKey}] ${clsName(r.classId)} "${r.billingPeriod}" phải ${vnd(r.amountDue)} thu ${vnd(r.amountPaid)} còn ${vnd(r.balanceDue)} ${r.status}${r.frozenAt ? ` chốt ${String(r.frozenAt).slice(0, 10)}` : ""} tạo ${String(r.createdAt || r.issueDate || "").slice(0, 10)}${(r.appliedCredits || []).length ? ` credits ${JSON.stringify(r.appliedCredits)}` : ""}`);
      for (const p of book.payments.filter((p: any) => p.receivableId === r.id)) {
        const rc = book.receipts.find((x: any) => x.paymentId === p.id);
        console.log(`     + ${String(p.paidAt).slice(0, 10)} ${vnd(p.allocatedAmount ?? p.amount)} ${p.status} ${p.method || ""} ${p.note ? `"${p.note}"` : ""}${rc ? ` BL ${rc.receiptNumber} ${rc.status} "${rc.billingPeriod || ""}"` : ""}`);
      }
    }
    for (const c of (book.credits || []).filter((c: any) => c.studentId === st.id)) console.log(`  credit ${c.reason} ${vnd(c.amount)} còn ${vnd(c.remainingAmount)} ${c.status}`);
  };
  dump("Phiếu (sau đồng bộ — như web thấy)", ledger);
  const rawIds = new Set(raw.receivables.filter((r: any) => r.studentId === st.id).map((r: any) => `${r.id}|${r.amountDue}|${r.balanceDue}|${r.status}`));
  const synIds = new Set(ledger.receivables.filter((r: any) => r.studentId === st.id).map((r: any) => `${r.id}|${r.amountDue}|${r.balanceDue}|${r.status}`));
  if ([...rawIds].sort().join() !== [...synIds].sort().join()) dump("Phiếu lưu trong DB (trước đồng bộ)", raw);

  for (const cls of classes.filter((c) => (c.studentIds || []).includes(st.id))) {
    console.log(`\n== Công nợ web ở lớp ${cls.code} (tháng hiện tại ${T.monthKey()})`);
    const paid = T.studentTuitionPaid(st, cls);
    const quote = T.tuitionCollectionQuote(st, cls);
    const carryRows = T.monthlyCarryReceivables(st, cls, T.shiftMonthKey(T.monthKey(), 1));
    console.log(`  studentTuitionPaid = ${paid}`);
    console.log(`  báo giá (quote): ${vnd(quote?.amount)} ${JSON.stringify({ months: quote?.months, sessions: quote?.sessions, label: quote?.label, debt: quote?.oldDebt ?? quote?.debt })}`);
    console.log(`  core = ${paid === false ? `tuitionQuoteRemaining = ${vnd(T.tuitionQuoteRemaining(st, cls, quote))}` : `sameClassDueAmount = ${vnd(T.sameClassDueAmount(st, cls))}`}`);
    console.log(`  carry (nợ phiếu trước) = ${vnd(T.monthlyCarryAmount(st, cls, T.shiftMonthKey(T.monthKey(), 1)))} ${carryRows.map((r: any) => `[${r.billKey} ${vnd(r.balanceDue)}]`).join(" ")}`);
    console.log(`  nợ lớp khác = ${vnd(T.outstandingOtherAmount(st, cls))} ${T.studentOutstandingOtherReceivables(st, cls).map((r: any) => `[${clsName(r.classId)} ${r.billKey} ${vnd(r.balanceDue)}]`).join(" ")}`);
    console.log(`  ⇒ tuitionEffectiveDebt = ${vnd(T.tuitionEffectiveDebt(st, cls))} · tồn web ${T.studentSessionRemaining(st, cls)} · tồn server ${monthlyRemainingSessions(st, cls, sessions, ledger, now)}`);
    const q = tuitionCollectionCharge(st, cls, sessions, ledger, now);
    console.log(`  báo giá server: ${JSON.stringify(q)}`.slice(0, 600));
  }

  console.log(`\n== Nhật ký liên quan`);
  const keys = [st.id, st.code, st.fullName].filter(Boolean).map((x) => String(x));
  const rows = audit.filter((a) => keys.some((k) => String(a.entityId || "").includes(k) || String(a.summary || "").includes(k)))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const a of rows) console.log(`  ${String(a.createdAt).replace("T", " ").slice(0, 16)} ${a.userName || a.userEmail} [${a.action} ${a.entity}] ${a.summary}`);
  console.log(`  (${rows.length} dòng)`);

  console.log(`\n== Buổi học S3/T3 có ${st.fullName} từ 09/2026`);
  for (const cls of classes.filter((c) => /^(S3|T3)$/i.test(String(c.code)))) {
    const list = sessions.filter((s) => s.classId === cls.id && String(s.date) >= "2026-09-01")
      .filter((s) => JSON.stringify(s).includes(st.id)).map((s) => s.date).sort();
    console.log(`  ${cls.code}: ${list.length} buổi ${list.join(", ")}`);
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error("LỖI:", e.message); await prisma.$disconnect(); process.exit(1); });
