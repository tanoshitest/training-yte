/**
 * Phiếu tháng 11/2026 (anh Vũ duyệt 9/11/2026) — chỉ 2 học viên:
 *  - Khánh Ly (HV0954, lớp T4): phiếu T11 bị trừ thêm 1 buổi từ tín dụng buổi GV nghỉ 25/09 — buổi đó đã
 *    khấu trừ ở phiếu T10 (trừ lần 2). Phiếu T11: 350.000 → 400.000; tín dụng buổi nghỉ T4: 1 → 0.
 *  - Hoàng Hà Giang (HV0537, lớp T1): phiếu T11 trừ 4 buổi (−200.000) thay vì 2 buổi như cả lớp (−100.000).
 *    Phiếu T11: 200.000 → 300.000 (cộng nợ cũ T10 300.000 = phải nộp 600.000); tín dụng buổi nghỉ T1: 5 → 1
 *    như các bạn cùng lớp.
 * Giữ trạng thái "đã gửi yêu cầu thanh toán" (frozenAt) và mã QR của phiếu (cập nhật số tiền).
 * Mặc định DRY-RUN. APPLY=1 mới ghi. Dừng nếu dữ liệu khác mô tả.
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
import { mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";

const PLAN = [
  { code: "HV0954", classId: "class-import-t4", from: 350_000, to: 400_000, creditFrom: 1, creditTo: 0 },
  { code: "HV0537", classId: "class-import-t1", from: 200_000, to: 300_000, creditFrom: 5, creditTo: 1 },
];
const MONTH = "2026-11";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students0: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);

  const before: any = mergeSepayLedger(finance.sepay);
  let ledger: any = JSON.parse(JSON.stringify(before));
  let students = students0.map((s) => ({ ...s }));
  const touchedClasses = new Set<string>();

  for (const p of PLAN) {
    const st = students.find((s) => s.code === p.code) || fail(`Không thấy ${p.code}`);
    const cls = classes.find((c) => c.id === p.classId) || fail(`Không thấy lớp ${p.classId}`);
    if (!cls.studentIds.includes(st.id)) fail(`${p.code} không thuộc lớp ${cls.code}`);
    touchedClasses.add(cls.id);
    const bills = ledger.receivables.filter((r: any) => r.studentId === st.id && r.billKey === `month|${cls.id}|${MONTH}` && r.status !== "CANCELLED");
    if (bills.length !== 1) fail(`${p.code}: có ${bills.length} phiếu tháng 11, cần đúng 1`);
    const r = bills[0];
    if (r.status !== "OPEN" || Number(r.amountPaid) !== 0) fail(`${p.code}: phiếu T11 ${r.status}, đã thu ${r.amountPaid} — dừng`);
    if (Math.round(Number(r.amountDue)) !== p.from) fail(`${p.code}: phiếu T11 đang ${vnd(r.amountDue)}, dự kiến ${vnd(p.from)} — dừng (có thể đã sửa)`);
    if ((r.appliedCredits || []).length) fail(`${p.code}: phiếu có cấn trừ tiền dư — dừng để xem tay`);
    const credit = Math.round(Number(st.tuitionCredits?.[cls.id]) || 0);
    if (credit !== p.creditFrom) fail(`${p.code}: tín dụng buổi nghỉ ${credit}, dự kiến ${p.creditFrom} — dừng`);
    const order = ledger.paymentOrders.find((o: any) => o.id === r.paymentOrderId) || fail(`${p.code}: thiếu mã thanh toán`);
    ledger.receivables = ledger.receivables.map((x: any) => x.id === r.id ? { ...x, amountDue: p.to, balanceDue: p.to } : x);
    ledger.paymentOrders = ledger.paymentOrders.map((o: any) => o.id === order.id ? { ...refreshOrderQr(o, ledger.settings, p.to), status: o.status } : o);
    students = students.map((s) => s.id === st.id ? { ...s, tuitionCredits: { ...(s.tuitionCredits || {}), [cls.id]: p.creditTo } } : s);
    console.log(`→ ${cls.code} ${p.code} ${st.fullName}: phiếu T11 ${vnd(p.from)} → ${vnd(p.to)} (mã ${r.receivableCode}, giữ "đã gửi yêu cầu") · tín dụng buổi nghỉ ${p.creditFrom} → ${p.creditTo}`);
  }

  // Kiểm bằng code app: công nợ / tồn của mọi HV các lớp bị đụng, trước → sau.
  const view = (sepay: any, rows: any[]) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(rows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (sid: string, cid: string) => {
      const s = ctx.__t.state.data.students.find((x: any) => x.id === sid);
      const c = ctx.__t.state.data.classes.find((x: any) => x.id === cid);
      return { debt: ctx.__t.tuitionEffectiveDebt(s, c), rem: ctx.__t.studentSessionRemaining(s, c) };
    };
  };
  const A = view(before, students0), B = view(ledger, students);
  const wanted = new Set(PLAN.map((p) => p.code));
  let unexpected = 0;
  for (const cid of touchedClasses) {
    const cls = classes.find((c) => c.id === cid);
    console.log(`\n=== ${cls.code}: công nợ · tồn (chỉ in dòng thay đổi) ===`);
    for (const sid of cls.studentIds) {
      const st = students0.find((s) => s.id === sid); if (!st) continue;
      const a = A(sid, cid), b = B(sid, cid);
      if (a.debt === b.debt && a.rem === b.rem) continue;
      const flag = wanted.has(st.code) ? "" : "  ✘ KHÔNG nằm trong danh sách sửa";
      if (flag) unexpected += 1;
      console.log(`${st.code} ${st.fullName}: nợ ${vnd(a.debt)} → ${vnd(b.debt)} | tồn ${a.rem} → ${b.rem}${flag}`);
    }
  }
  const otherBefore = JSON.stringify(before.receivables.filter((r: any) => !PLAN.some((p) => students0.find((s) => s.code === p.code)?.id === r.studentId)).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  const otherAfter = JSON.stringify(ledger.receivables.filter((r: any) => !PLAN.some((p) => students0.find((s) => s.code === p.code)?.id === r.studentId)).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (otherBefore !== otherAfter || unexpected) fail("Có phiếu/học viên ngoài 2 bạn bị đổi — KHÔNG ghi");
  console.log("\nOK: chỉ 2 học viên thay đổi.");

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, students);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong phiếu T11 của Khánh Ly và Hoàng Hà Giang.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
