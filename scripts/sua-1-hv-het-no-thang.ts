/**
 * Chỉ sửa ĐÚNG 1 học viên: ghi đã đóng đủ phiếu tháng MONTH ở lớp CLASS (thu đủ bằng biên lai
 * UNRECORDED — ghi nhận đã thu, KHÔNG sinh dòng sổ thu chi), đúng đường thu học phí (khấu trừ buổi
 * nghỉ, mốc đã đóng, tồn buổi). Không đụng học viên nào khác — kiểm tra chặt trước khi ghi.
 *   STUDENT=HV0573 CLASS=T2 MONTH=2026-10 tsx scripts/sua-1-hv-het-no-thang.ts   (dry-run)
 *   ... APPLY=1 ...                                                             (ghi thật)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { settingsRepository } from "../cloudflare/storage/settings-repository";
import { teachersRepository } from "../cloudflare/storage/people-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { collectTuitionAmount, monthlyPriorDebtReceivables, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const STUDENT = String(process.env.STUDENT || "").toUpperCase();
const CLASS = String(process.env.CLASS || "").toUpperCase();
const MONTH = String(process.env.MONTH || "");
const APPLY = process.env.APPLY === "1";
const NOTE = `Đã đóng học phí ${MONTH.slice(5)}/${MONTH.slice(0, 4)} — cập nhật công nợ ${STUDENT} theo xác nhận trung tâm (chưa nhập phiếu thu sổ quỹ)`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (!STUDENT || !CLASS || !/^\d{4}-\d{2}$/.test(MONTH)) fail("Thiếu STUDENT / CLASS / MONTH");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const now = new Date();
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  const st = (cls.studentIds || []).map((id: string) => students.find((s) => s.id === id)).find((s: any) => s && String(s.code).toUpperCase() === STUDENT)
    || fail(`${STUDENT} không thuộc lớp ${CLASS}`);

  const before: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  const bill = before.receivables.find((r: any) => r.studentId === st.id && r.billKey === `month|${cls.id}|${MONTH}` && r.status !== "CANCELLED")
    || fail(`Không có phiếu tháng ${MONTH}`);
  const prior = monthlyPriorDebtReceivables(before, st.id, cls.id, MONTH);
  const total = Math.max(0, bill.balanceDue) + prior.reduce((sum: number, r: any) => sum + r.balanceDue, 0);
  if (!(total > 0)) fail(`${STUDENT}: đã hết nợ đến ${MONTH} — không có gì để sửa`);
  const allowed = new Set([bill.id, ...prior.map((r: any) => r.id)]);

  const res: any = collectTuitionAmount({ ledger: before, student: st, cls, sessions, method: "TRANSFER", amount: total, note: NOTE, now, startMonth: MONTH });
  if ("error" in res) fail(res.error);
  if (res.steps.some((s: any) => !allowed.has(s.receivable.id))) fail("Tiền phân bổ ra ngoài phiếu đến tháng chọn — dừng");
  const ids = new Set(res.steps.map((s: any) => s.receipt.id));
  const afterLedger = { ...res.ledger, receipts: res.ledger.receipts.map((r: any) => ids.has(r.id) ? { ...r, status: "UNRECORDED", note: NOTE } : r) };
  const afterStudents = students.map((s) => s.id !== st.id ? s : {
    ...s,
    tuitionCredits: { ...(s.tuitionCredits || {}), [cls.id]: Math.max(0, Number(s.tuitionCredits?.[cls.id] || 0) - res.creditSessionsUsed) },
    tuitionPaidThrough: res.paidThroughMonth ? { ...(s.tuitionPaidThrough || {}), [cls.id]: [s.tuitionPaidThrough?.[cls.id] || "", res.paidThroughMonth].sort().at(-1) } : s.tuitionPaidThrough,
  });

  // Kiểm tra: không phiếu của học viên nào khác bị đổi.
  const othersOf = (l: any) => JSON.stringify(l.receivables.filter((r: any) => r.studentId !== st.id).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (othersOf(before) !== othersOf(afterLedger)) fail("Phiếu của học viên khác bị đổi — dừng");

  const settled: any = syncTuitionReceivables(mergeSepayLedger(JSON.parse(JSON.stringify(afterLedger))), classes, afterStudents, sessions, now);
  const src = require("node:fs").readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
  const vm = require("node:vm");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  const debtOf = (sepay: any, rows: any[]) => {
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(rows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const s = ctx.__t.state.data.students.find((x: any) => x.id === st.id);
    const c = ctx.__t.state.data.classes.find((x: any) => x.id === cls.id);
    return { debt: ctx.__t.tuitionEffectiveDebt(s, c), rem: ctx.__t.studentSessionRemaining(s, c) };
  };
  const a = debtOf(before, students), b = debtOf(settled, afterStudents);
  console.log(`${STUDENT} ${st.fullName}: ghi đã đóng đến ${MONTH} ${vnd(total)}${prior.length ? ` (gồm nợ cũ ${prior.map((r: any) => `${r.billingPeriod.split(" · ")[0]} ${vnd(r.balanceDue)}`).join(", ")})` : ""} (biên lai ${res.steps.map((s: any) => s.receipt.receiptNumber).join(", ")} — chưa vào sổ thu chi)`);
  console.log(`  nợ ${vnd(a.debt)} → ${vnd(b.debt)} | tồn ${a.rem} → ${b.rem}`);
  if (b.debt !== 0) fail(`Công nợ sau sửa chưa về 0đ (còn ${vnd(b.debt)}) — KHÔNG ghi`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versions) {
      const q = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!q.length || Number(q[0].version) !== version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: afterLedger });
    await (studentsRepository as any).write(tx, afterStudents);
  }, { timeout: 60_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
