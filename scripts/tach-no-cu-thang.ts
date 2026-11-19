/**
 * Tách nợ cũ T9 ra khỏi phiếu tháng 10 của lớp thu tháng thành phiếu riêng (chốt với anh Vũ
 * 28/10/2026: T9 = đúng số nợ cũ, áp cho mọi học viên kể cả đã đóng phiếu gộp).
 *   tsx scripts/tach-no-cu-thang.ts                 (chạy thử, in kế hoạch + kiểm tra)
 *   ONLY=HV0108,HV0396 tsx ...                      (chỉ vài học viên)
 *   APPLY=1 tsx ...                                 (ghi thật)
 * Dừng (không ghi) nếu với BẤT KỲ học viên lớp tháng nào: công nợ app hoặc số buổi tồn đổi,
 * tổng tiền đã thu đổi, hoặc tổng sổ thu chi theo ngày đổi. Lớp chốt (11 lớp) không bị đụng.
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
import { syncTuitionCashbook } from "../cloudflare/finance-types";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { classBillingMode, monthlyRemainingSessions, syncTuitionReceivables } from "../cloudflare/tuition-billing";
import { splitMonthlyOldDebtBills } from "../cloudflare/old-debt-split";

const LOCKED = ["S12", "S16", "S20", "S21", "S23", "S27", "S28", "S32", "S34", "S35", "S41"];
const APPLY = process.env.APPLY === "1";
const ONLY = String(process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
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
  const monthly = classes.filter((c) => classBillingMode(c) === "MONTHLY");
  if (monthly.some((c) => LOCKED.includes(String(c.code)))) fail("Có lớp chốt đang thu tháng — dừng để xem tay");

  const before = mergeSepayLedger(finance.sepay);
  const out = splitMonthlyOldDebtBills({ ledger: before, cashbook: finance.cashbook || [], students, classes: monthly, now, onlyStudentCodes: ONLY });
  const skippedIds = new Set<string>(finance.cashbookSkippedReceiptIds || []);
  for (const row of out.rows) for (const sp of row.splitReceipts) if (skippedIds.has(sp.fromId)) skippedIds.add(sp.toId);
  const nextFinance = { ...finance, sepay: out.ledger, cashbook: out.cashbook, cashbookSkippedReceiptIds: [...skippedIds] };

  // ---------- Kiểm tra bất biến ----------
  const appView = (fin: any) => {
    const synced = syncTuitionCashbook(fin);
    const sepay = syncTuitionReceivables(mergeSepayLedger(structuredClone(synced.sepay)), classes, students, sessions, now);
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(students), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...synced, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const res = new Map<string, { debt: number; remaining: number; serverRemaining: number }>();
    for (const c of monthly) for (const sid of c.studentIds || []) {
      const st = ctx.__t.state.data.students.find((r: any) => r.id === sid);
      const cl = ctx.__t.state.data.classes.find((r: any) => r.id === c.id);
      if (!st) continue;
      res.set(`${c.code}|${st.code}`, { debt: ctx.__t.tuitionEffectiveDebt(st, cl), remaining: ctx.__t.studentSessionRemaining(st, cl), serverRemaining: monthlyRemainingSessions(st, c, sessions, sepay, now) });
    }
    const cashByDay = new Map<string, number>();
    for (const row of synced.cashbook) if (row.kind === "IN") cashByDay.set(row.date, (cashByDay.get(row.date) || 0) + Math.round(Number(row.amount) || 0));
    const paidByStudent = new Map<string, number>();
    for (const r of sepay.receipts) paidByStudent.set(r.studentId, (paidByStudent.get(r.studentId) || 0) + Math.round(Number(r.amount) || 0));
    return { res, cashByDay, paidByStudent, sepay };
  };
  const A = appView(finance);
  const B = appView(nextFinance);
  const diffs: string[] = [];
  for (const [k, a] of A.res) {
    const b = B.res.get(k)!;
    if (a.debt !== b.debt) diffs.push(`${k}: công nợ ${vnd(a.debt)} → ${vnd(b.debt)}`);
    if (a.remaining !== b.remaining) diffs.push(`${k}: tồn ${a.remaining} → ${b.remaining}`);
    if (a.serverRemaining !== b.serverRemaining) diffs.push(`${k}: tồn (server) ${a.serverRemaining} → ${b.serverRemaining}`);
  }
  for (const [d, v] of A.cashByDay) if (B.cashByDay.get(d) !== v) diffs.push(`Sổ thu chi ngày ${d}: ${vnd(v)} → ${vnd(B.cashByDay.get(d) || 0)}`);
  for (const [s, v] of A.paidByStudent) if (B.paidByStudent.get(s) !== v) diffs.push(`Tổng biên lai HV ${s}: ${vnd(v)} → ${vnd(B.paidByStudent.get(s) || 0)}`);
  // Phiếu sau đồng bộ giữ đúng số tách (đồng bộ không cộng nợ cũ lại vào T10).
  for (const row of out.rows) {
    const st = students.find((s) => s.code === row.studentCode);
    const cl = monthly.find((c) => (c.code || c.name) === row.classCode);
    const synced = B.sepay.receivables.filter((r: any) => r.studentId === st.id && r.classId === cl.id && r.status !== "CANCELLED");
    const od = synced.find((r: any) => String(r.billKey).startsWith("olddebt|"));
    const t10 = synced.find((r: any) => r.billKey === `month|${cl.id}|2026-10`);
    if (!od || od.amountDue !== row.oldDebt) diffs.push(`${row.classCode} ${row.studentCode}: phiếu nợ cũ sau đồng bộ ${od ? vnd(od.amountDue) : "mất"}`);
    if (!t10 || t10.amountDue !== row.t10After.amountDue) diffs.push(`${row.classCode} ${row.studentCode}: phiếu T10 sau đồng bộ ${t10 ? vnd(t10.amountDue) : "mất"} ≠ ${vnd(row.t10After.amountDue)}`);
  }
  // Học viên ngoài lớp tháng không bị đụng.
  const monthlyIds = new Set(monthly.flatMap((c) => c.studentIds || []));
  const outside = (l: any) => JSON.stringify(l.receivables.filter((r: any) => !monthlyIds.has(r.studentId)).map((r: any) => [r.id, r.amountDue, r.amountPaid, r.status]));
  if (outside(before) !== outside(out.ledger)) diffs.push("Phiếu của học viên ngoài lớp tháng bị thay đổi");

  // ---------- Báo cáo ----------
  const unpaid = out.rows.filter((r) => r.oldDebtPaid === 0);
  const paidRows = out.rows.filter((r) => r.oldDebtPaid > 0);
  console.log(`Tách ${out.rows.length} học viên · tổng nợ cũ ${vnd(out.rows.reduce((s, r) => s + r.oldDebt, 0))}`);
  console.log(`  - Chưa đóng: ${unpaid.length} (phiếu T9 nợ cũ mở, phiếu T10 giảm tương ứng)`);
  console.log(`  - Đã đóng (đủ/một phần): ${paidRows.length} · biên lai chuyển nguyên sang T9: ${paidRows.reduce((s, r) => s + r.movedReceipts.length, 0)} · biên lai chia đôi: ${paidRows.reduce((s, r) => s + r.splitReceipts.length, 0)}`);
  for (const r of out.rows) {
    console.log(`  ${r.classCode.padEnd(4)} ${r.studentCode} ${r.studentName.padEnd(18)} T9 nợ cũ ${vnd(r.oldDebt).padStart(10)}${r.oldDebtPaid ? ` (đã thu ${vnd(r.oldDebtPaid)})` : ""} | T10 ${vnd(r.t10Before.amountDue)} → ${vnd(r.t10After.amountDue)} ${r.t10After.status}${r.splitReceipts.length ? ` | chia BL ${r.splitReceipts.map((x) => `${x.from}→${x.to} ${vnd(x.amount)}`).join(", ")}` : ""}${r.movedReceipts.length ? ` | chuyển BL ${r.movedReceipts.join(", ")}` : ""}`);
  }
  if (out.skipped.length) {
    console.log(`\nKHÔNG TÁCH (${out.skipped.length}) — cần xem tay:`);
    for (const s of out.skipped) console.log(`  ${s.classCode} ${s.studentCode} nợ cũ ${vnd(s.oldDebt)}: ${s.reason}`);
  }
  if (diffs.length) { console.log(`\nLỆCH ${diffs.length}:`); diffs.slice(0, 60).forEach((d) => console.log(`  ${d}`)); fail("Có lệch — KHÔNG ghi."); }
  console.log("\nKiểm tra: công nợ + tồn của mọi học viên lớp tháng, tổng biên lai, sổ thu chi theo ngày — KHÔNG ĐỔI.");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, nextFinance);
  }, { timeout: 180_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
