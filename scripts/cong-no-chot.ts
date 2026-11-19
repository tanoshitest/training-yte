/**
 * Công nợ đã chốt (số dư đầu kỳ LMS) — CHỈ ĐỌC, không ghi gì.
 *
 * Chụp:  tsx scripts/cong-no-chot.ts > cong-no-chot.json
 *        → công nợ + số buổi tồn từng học viên của các lớp đã chốt (docs/cong-no-da-chot.md),
 *          tính đúng như app (đồng bộ phiếu trước khi tính).
 * So:    BASELINE=data/cong-no-chot/2026-10-25.json tsx scripts/cong-no-chot.ts
 *        → in mọi học viên có công nợ / tồn khác bản đã chốt. Không lệch thì in "KHỚP".
 * Lớp:   CODES=S16,S20 để chỉ chụp/so vài lớp; mặc định = danh sách lớp đã chốt bên dưới.
 *        ALL=1 chụp mọi lớp (đối chiếu tổng công nợ trước/sau deploy).
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
import { mergeSepayLedger } from "../cloudflare/sepay-engine";
import { courseRemainingSessions, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

/** Lớp đã được trung tâm đối chiếu đúng 100% — giữ khớp docs/cong-no-da-chot.md. */
export const LOCKED_CLASSES = [
  "S12", "S16", "S20", "S21", "S23", "S27", "S28", "S32", "S34", "S35", "S41",
  // 13/11/2026 21:54: anh Mori khoá cứng MỌI lớp thu tháng Thạch Khê + Thành Sen (data/cong-no-chot/2026-11-13-lop-thang.json).
  "T1", "T2", "T3", "T4", "T5", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16", "T17", "T18", "T19", "T20", "T21", "T22", "T23", "T24",
  "S1", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S31", "S38",
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

(async () => {
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  await prisma.$disconnect();
  const now = process.env.AT ? new Date(process.env.AT) : new Date();
  const ledger: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  // Lớp thu tháng: công nợ/tồn phải tính như web (gồm nợ phiếu lớp khác, nợ cũ,
  // chênh lệch chuyển lớp…) — dùng đúng app.js, không tự tính lại ở đây.
  const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
  const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
  vm.runInContext(src, ctx);
  ctx.__t.state.data = { user: { role: "ADMIN" }, students, classes, lessonSessions: sessions, finance: { ...finance, sepay: ledger }, settings, teachers };
  ctx.__t.state.role = "ADMIN";
  const codes = (process.env.CODES || (process.env.ALL === "1" ? classes.map((c: any) => c.code).join(",") : LOCKED_CLASSES.join(","))).split(",").map((c) => c.trim()).filter(Boolean);
  const snapshot: any = { at: now.toISOString(), classes: {} };
  for (const code of codes) {
    const cls = classes.find((c) => c.code === code);
    if (!cls) { snapshot.classes[code] = { missing: true }; continue; }
    const rows: any = {};
    for (const sid of cls.studentIds || []) {
      const st = students.find((s) => s.id === sid);
      if (!st) continue;
      let debt: number; let ton: number | null;
      if (cls.billingMode === "COURSE") {
        const states = studentCourseCollectStates(st, cls, sessions, ledger, now);
        debt = states.filter((s: any) => s.status === "DUE").reduce((sum: number, s: any) => sum + (s.balanceDue || 0), 0);
        ton = courseRemainingSessions(st, cls, sessions, ledger, now);
      } else {
        debt = Math.round(ctx.__t.tuitionEffectiveDebt(st, cls) || 0);
        ton = ctx.__t.studentSessionRemaining(st, cls);
      }
      const open = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && ["OPEN", "PARTIALLY_PAID"].includes(r.status))
        .map((r: any) => `${r.billKey}:${Math.round(r.balanceDue)}`).sort();
      rows[st.code] = { name: st.fullName, debt, ton, open };
    }
    snapshot.classes[code] = { id: cls.id, name: cls.name, students: rows, total: Object.values(rows).reduce((s: number, r: any) => s + r.debt, 0) };
  }

  if (!process.env.BASELINE) {
    // OUT=đường-dẫn: ghi thẳng ra file (stdout qua ssh/PowerShell có thể bị cắt cụt và đổi mã chữ).
    if (process.env.OUT) { fs.writeFileSync(process.env.OUT, `${JSON.stringify(snapshot, null, 1)}\n`, "utf8"); console.log(`Đã ghi ${process.env.OUT} (${codes.join(", ")})`); return; }
    process.stdout.write(JSON.stringify(snapshot, null, 1));
    return;
  }
  const base = JSON.parse(fs.readFileSync(process.env.BASELINE, "utf8"));
  let diffs = 0;
  for (const code of codes) {
    const a = base.classes?.[code]; const b = snapshot.classes[code];
    if (!a) { console.log(`${code}: chưa có trong bản chốt`); continue; }
    const keys = new Set([...Object.keys(a.students || {}), ...Object.keys(b.students || {})]);
    for (const k of keys) {
      const x = a.students?.[k]; const y = b.students?.[k];
      if (!x || !y) { diffs += 1; console.log(`✘ ${code} ${k}: ${!x ? "học viên mới vào lớp" : "không còn trong lớp"}`); continue; }
      if (x.debt !== y.debt) { diffs += 1; console.log(`✘ ${code} ${k} ${y.name}: công nợ ${vnd(x.debt)} → ${vnd(y.debt)}`); }
      // Số buổi tồn tự giảm theo buổi học đã qua — chỉ báo khi chụp cùng thời điểm (AT).
      if (process.env.AT && x.ton !== y.ton) { diffs += 1; console.log(`✘ ${code} ${k} ${y.name}: tồn ${x.ton} → ${y.ton}`); }
    }
  }
  console.log(diffs ? `\n${diffs} chỗ lệch so với bản chốt ${base.at}` : `KHỚP bản chốt ${base.at} (${codes.join(", ")})`);
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
