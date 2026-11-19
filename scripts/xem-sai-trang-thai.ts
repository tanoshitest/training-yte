/** CHỈ ĐỌC: học viên lớp thu tháng có công nợ 0đ nhưng web vẫn hiện "Công nợ" (tồn âm / báo giá còn). CLASSES=T1,T2 để lọc. */
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
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
(async () => {
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  await prisma.$disconnect();
  const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, new Date());
  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining,studentTuitionPaid,tuitionCollectionQuote};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: sessions, finance: { ...finance, sepay: ledger }, settings, teachers };
  ctx.__t.state.role = "ADMIN";
  const only = String(process.env.CLASSES || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  let n = 0;
  for (const cls of classes) {
    if (cls.billingMode === "COURSE") continue;
    if (only.length && !only.includes(String(cls.code).toUpperCase())) continue;
    for (const sid of cls.studentIds || []) {
      const st = students.find((s) => s.id === sid);
      if (!st || st.tuitionExempt) continue;
      const debt = Math.round(ctx.__t.tuitionEffectiveDebt(st, cls) || 0);
      const ton = ctx.__t.studentSessionRemaining(st, cls);
      const paid = ctx.__t.studentTuitionPaid(st, cls);
      if (debt > 0 || paid) continue;
      const q = ctx.__t.tuitionCollectionQuote(st, cls);
      const bills = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && r.status !== "CANCELLED").map((r: any) => `${r.billKey.split("|")[0]}:${r.billKey.split("|").pop()}:${r.status}`).sort().join(" ");
      n += 1;
      console.log(`${cls.code} ${st.code} ${st.fullName} | nợ ${vnd(debt)} | tồn ${ton} | báo giá ${vnd(q?.amount)} (${q?.label || ""}) | paidThrough ${st.tuitionPaidThrough?.[cls.id] || "-"} | ${bills}`);
    }
  }
  console.log(`\nTổng ${n} học viên nợ 0đ nhưng web hiện "Công nợ".`);
})().catch(async (e) => { console.error("LỖI:", e.message); await prisma.$disconnect(); process.exit(1); });
