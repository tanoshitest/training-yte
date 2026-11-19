/**
 * S35 (26/10/2026, theo bảng thông báo học phí khóa anh Vũ gửi):
 *  - Cả lớp nợ 1.560.000đ khóa hiện tại (khóa 2), chưa ai đóng.
 *  - Nợ khóa cũ (khóa 1): Bảo Linh, Ngọc Diệp, Cẩm Tú 1.560.000đ; Quỳnh Chi 5.520.000đ.
 * Hiện trạng sai: 4 em này có biên lai khóa 2 1.560.000đ ghi nhầm ngày 16/10 (ghi nhận
 * nội bộ, không vào sổ thu chi) và nợ cũ đang gộp vào phiếu khóa 2.
 * Script: hoàn tác 4 biên lai 16/10 (như xoá phiếu thu trên web), tách nợ cũ ra phiếu
 * khóa 1 riêng, phiếu khóa 2 về 1.560.000đ. Các em khác giữ nguyên.
 * Tự kiểm: công nợ từng em trong lớp phải đúng bảng EXPECTED, học viên lớp khác không đổi.
 * Mặc định dry-run. APPLY=1 mới ghi.
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
import { createReceivable, mergeSepayLedger } from "../cloudflare/sepay-engine";
import { courseIndexOfBillKey, courseRemainingSessions, reverseTuitionReceipt, studentCourseCollectStates, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const CLASS_CODE = "S35";
const COURSE2 = 1_560_000;
/** Nợ khóa cũ (khóa 1) theo bảng của trung tâm. */
const OLD_DEBT: Record<string, number> = {
  HV0455: 1_560_000, // Bảo Linh
  HV0457: 1_560_000, // Ngọc Diệp
  HV0460: 1_560_000, // Cẩm Tú
  HV0459: 5_520_000, // Quỳnh Chi
};
const APPLY = process.env.APPLY === "1";
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
  const iso = now.toISOString();

  const cls = classes.find((row) => String(row.code).toUpperCase() === CLASS_CODE) || fail(`Không thấy lớp ${CLASS_CODE}`);
  const roster = students.filter((s) => (cls.studentIds || []).includes(s.id) && !s.tuitionExempt);
  const before = mergeSepayLedger(finance.sepay);
  let ledger: any = structuredClone(before);
  let work: any[] = structuredClone(students);
  const log: string[] = [];

  for (const [code, old] of Object.entries(OLD_DEBT)) {
    const st = roster.find((s) => s.code === code) || fail(`${code} không có trong ${CLASS_CODE}`);
    const mine = ledger.receivables.filter((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED");
    if (mine.some((r: any) => courseIndexOfBillKey(r.billKey) === 1)) fail(`${code}: đã có phiếu khóa 1 — dừng để kiểm tra tay`);
    const k2s = mine.filter((r: any) => courseIndexOfBillKey(r.billKey) === 2);
    if (k2s.length !== 1) fail(`${code}: cần đúng 1 phiếu khóa 2, đang có ${k2s.length}`);
    const k2id = k2s[0].id;

    // 1) Hoàn tác biên lai khóa 2 ghi nhầm (chỉ biên lai ghi nhận nội bộ — không vào sổ thu chi).
    const payIds = new Set(ledger.payments.filter((p: any) => p.receivableId === k2id && p.status !== "VOIDED").map((p: any) => p.id));
    const receipts = ledger.receipts.filter((r: any) => payIds.has(r.paymentId));
    for (const receipt of receipts) {
      if (receipt.status === "ISSUED") fail(`${code}: biên lai ${receipt.receiptNumber} đã vào sổ thu chi — dừng, cần xem tay`);
      const out: any = reverseTuitionReceipt({ ledger, receiptId: receipt.id, students: work, classes, sessions });
      if (out.error) fail(`${code}: ${out.error}`);
      ledger = out.ledger;
      work = out.students;
    }

    // 2) Phiếu khóa 2 về đúng học phí khóa 2, bỏ phần nợ cũ gộp.
    const k2 = ledger.receivables.find((r: any) => r.id === k2id);
    if (Math.round(Number(k2.amountPaid) || 0) > 0) fail(`${code}: phiếu khóa 2 vẫn còn tiền đã thu sau khi hoàn tác — dừng`);
    k2.amountDue = COURSE2;
    k2.balanceDue = COURSE2;
    k2.status = "OPEN";
    k2.billingPeriod = String(k2.billingPeriod).replace(/ · Nợ cũ [\d.]+đ$/, "");
    k2.frozenAt = iso;
    const order = ledger.paymentOrders.find((o: any) => o.id === k2.paymentOrderId);
    if (order) { order.amount = COURSE2; order.status = "ACTIVE"; }

    // 3) Phiếu khóa 1 riêng cho nợ khóa cũ; bỏ nợ buổi cũ ghi tay (tuitionCredits âm) để không trừ hai lần.
    const created = createReceivable({
      studentId: st.id, studentName: st.fullName, billingPeriod: `Khóa 1 · ${cls.name} · Nợ khóa cũ`, amountDue: old,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: iso,
    });
    ledger = {
      ...ledger,
      receivables: [{ ...created.receivable, classId: cls.id, billKey: `course|${cls.id}`, frozenAt: iso }, ...ledger.receivables],
      paymentOrders: [created.order, ...ledger.paymentOrders],
    };
    work = work.map((s) => {
      if (s.id !== st.id) return s;
      const tuitionCredits = { ...(s.tuitionCredits || {}) };
      if (Math.round(Number(tuitionCredits[cls.id]) || 0) < 0) delete tuitionCredits[cls.id];
      return { ...s, tuitionCredits };
    });
    log.push(`${code} ${st.fullName}: gỡ ${receipts.map((r: any) => `${r.receiptNumber} ${vnd(r.amount)} (${String(r.issuedAt).slice(0, 10)})`).join(", ") || "không có biên lai"}; khóa 1 nợ ${vnd(old)}; khóa 2 ${vnd(COURSE2)}`);
  }

  const syncedBefore: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(before)), classes, students, sessions, now);
  const syncedAfter: any = syncTuitionReceivables(mergeSepayLedger(structuredClone(ledger)), classes, work, sessions, now);
  const touched = new Set(Object.keys(OLD_DEBT).map((code) => roster.find((s) => s.code === code)!.id));
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => !touched.has(r.studentId)).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(syncedBefore) !== others(syncedAfter)) fail("Phiếu của học viên khác bị thay đổi — dừng");

  const appDebt = (sepay: any, rows: any[]) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(rows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    return (id: string) => ctx.__t.tuitionEffectiveDebt(ctx.__t.state.data.students.find((r: any) => r.id === id), ctx.__t.state.data.classes.find((r: any) => r.id === cls.id));
  };
  const dBefore = appDebt(syncedBefore, students);
  const dAfter = appDebt(syncedAfter, work);
  const states = (st: any, l: any) => studentCourseCollectStates(st, cls, sessions, l, now).map((s: any) => `K${s.index} ${s.status}${s.balanceDue ? ` ${vnd(s.balanceDue)}` : ""}`).join(" · ");

  console.log(log.join("\n"));
  console.log(`\n=== ${CLASS_CODE} sau sửa (đối chiếu bảng trung tâm) ===`);
  const nextStudents = work.map((row) => ({ ...row }));
  let total = 0;
  for (const st of roster) {
    const after = work.find((s) => s.id === st.id);
    const expected = COURSE2 + (OLD_DEBT[st.code] || 0);
    const d0 = dBefore(st.id), d1 = dAfter(st.id);
    total += d1;
    const t1 = courseRemainingSessions(after, cls, sessions, syncedAfter, now);
    const mark = d1 === expected ? "✓" : "✘";
    console.log(`${mark} ${st.code} ${st.fullName.padEnd(22)} ${vnd(d0).padStart(11)} → ${vnd(d1).padStart(11)} (bảng: ${vnd(expected)}) · tồn ${t1} · ${states(after, syncedAfter)}`);
    if (d1 !== expected) fail(`${st.code}: công nợ sau sửa ${vnd(d1)} ≠ bảng ${vnd(expected)} — dừng, chưa ghi gì`);
    if (touched.has(st.id)) {
      const row = nextStudents.find((s) => s.id === st.id);
      row.sessionBalances = { ...(row.sessionBalances || {}), [cls.id]: t1 };
    }
  }
  console.log(`Tổng nợ lớp: ${vnd(total)}`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, nextStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
