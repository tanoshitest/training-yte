/**
 * Chốt công nợ một LỚP THU THÁNG theo bảng đối chiếu của trung tâm (anh Vũ, 28/10/2026 — mẫu T1).
 * Cách sửa (dùng lại cho các lớp sau):
 *  - PAID: học viên đã đóng đủ đến hết tháng MONTH nhưng LMS chưa ghi → thu đủ phiếu tháng đó (kèm nợ
 *    cũ trước tháng đó: phiếu nợ cũ T9 / tháng trước còn nợ) bằng biên lai
 *    UNRECORDED (ghi nhận đã thu, KHÔNG sinh dòng sổ thu chi), đúng như nút thu học phí (khấu trừ buổi
 *    nghỉ, mốc đã đóng, tồn buổi).
 *  - OVERPAY: học viên đóng dư → khoản dư thành tín dụng (OVERPAYMENT), tự trừ vào phiếu tháng sau.
 *  - OWE: học viên còn nợ (tô vàng) — giữ nguyên, kiểm tra công nợ đúng số này.
 *  - LEGACY_PAID (+ LEGACY_MONTH): tháng đó đã đóng trước khi dùng hệ thống nhưng LMS không có
 *    phiếu/biên lai → lập phiếu tháng đó đã thu (biên lai UNRECORDED, không vào sổ thu chi) để số
 *    buổi tồn đồng bộ với cả lớp. Công nợ không đổi.
 *  - OLDDEBT=code:amt: nợ cũ T9 (phiếu "olddebt") theo bảng khác LMS → đặt lại số phải thu của phiếu
 *    nợ cũ đó (chưa thu đồng nào). Không đụng phiếu khác.
 *  - CANCEL_BUNDLE=2026-09,2026-10: huỷ các phiếu GỘP cũ "months|lớp|2026-09,2026-10" còn mở, chưa thu
 *    đồng nào, của học viên trong lớp (bản gộp sót lại trước khi tách nợ cũ T9 + phiếu tháng 10 riêng —
 *    không tính vào công nợ nhưng làm thu nhầm). Chạy trước PAID.
 *  Mọi học viên khác trong lớp phải còn nợ 0đ sau sửa; sai là dừng, không ghi.
 *   CLASS=T1 MONTH=2026-10 PAID=HV0547,HV0555 OWE=HV0545:300000,HV0539:300000 OVERPAY=HV0553:100000 tsx scripts/sua-cong-no-lop-thang.ts
 *   ... APPLY=1 ...  (ghi thật)
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
import { createReceivable, mergeSepayLedger, applyStudentCreditsToReceivables, refreshOrderQr } from "../cloudflare/sepay-engine";
import { carryReceivableMonth, classBillingMode, classTuitionCharge, collectTuitionAmount, monthlyPriorDebtReceivables, monthlyRemainingSessions, syncTuitionReceivables } from "../cloudflare/tuition-billing";

const CLASS = String(process.env.CLASS || "").toUpperCase();
const MONTH = String(process.env.MONTH || "");
const list = (v?: string) => String(v || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
const PAID = list(process.env.PAID);
const OWE = new Map(list(process.env.OWE).map((x) => { const [c, a] = x.split(":"); return [c, Math.round(Number(a))] as const; }));
const LEGACY_PAID = list(process.env.LEGACY_PAID);
/** HV không có trong bảng đối chiếu / cần xem riêng: không sửa, không kiểm tra. */
const SKIP = new Set(list(process.env.SKIP));
const LEGACY_MONTH = String(process.env.LEGACY_MONTH || "");
const OVERPAY = new Map(list(process.env.OVERPAY).map((x) => { const [c, a] = x.split(":"); return [c, Math.round(Number(a))] as const; }));
const OLDDEBT = new Map(list(process.env.OLDDEBT).map((x) => { const [c, a] = x.split(":"); return [c, Math.round(Number(a))] as const; }));
const CANCEL_BUNDLE = String(process.env.CANCEL_BUNDLE || "").trim();
const APPLY = process.env.APPLY === "1";
const NOTE = `Đã đóng học phí ${MONTH.slice(5)}/${MONTH.slice(0, 4)} — cập nhật công nợ ${CLASS} theo đối chiếu trung tâm (chưa nhập phiếu thu sổ quỹ)`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const fail = (m: string): never => { throw new Error(m); };

(async () => {
  if (!CLASS || !/^\d{4}-\d{2}$/.test(MONTH)) fail("Thiếu CLASS / MONTH");
  const versions = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const settings: any = await (settingsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const now = new Date();
  const cls = classes.find((c) => String(c.code).toUpperCase() === CLASS) || fail(`Không thấy lớp ${CLASS}`);
  if (classBillingMode(cls) !== "MONTHLY") fail(`${CLASS} không phải lớp thu tháng`);
  const roster = (cls.studentIds || []).map((id: string) => students.find((s) => s.id === id)).filter(Boolean);
  const byCode = (code: string) => roster.find((s: any) => String(s.code).toUpperCase() === code) || fail(`${code} không thuộc lớp ${CLASS}`);
  for (const c of [...PAID, ...OWE.keys(), ...OVERPAY.keys(), ...LEGACY_PAID, ...OLDDEBT.keys()]) byCode(c);
  if (LEGACY_PAID.length && !/^\d{4}-\d{2}$/.test(LEGACY_MONTH)) fail("Thiếu LEGACY_MONTH");

  const before: any = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions, now);
  let ledger: any = before;
  let workStudents: any[] = structuredClone(students);
  const log: string[] = [];
  if (CANCEL_BUNDLE) {
    const key = `months|${cls.id}|${CANCEL_BUNDLE}`;
    const ids = new Set(roster.map((s: any) => s.id));
    const rows = ledger.receivables.filter((r: any) => ids.has(r.studentId) && r.billKey === key && ["OPEN", "DRAFT"].includes(r.status));
    for (const r of rows) {
      if (Math.round(Number(r.amountPaid) || 0) > 0 || (r.appliedCredits || []).length) fail(`Phiếu gộp ${r.billingPeriod} của ${r.studentName} đã có tiền/tín dụng — dừng để xem tay`);
    }
    const rowIds = new Set(rows.map((r: any) => r.id));
    const orderIds = new Set(rows.map((r: any) => r.paymentOrderId).filter(Boolean));
    ledger = {
      ...ledger,
      receivables: ledger.receivables.map((r: any) => rowIds.has(r.id) ? { ...r, status: "CANCELLED", balanceDue: 0 } : r),
      paymentOrders: ledger.paymentOrders.map((o: any) => orderIds.has(o.id) && o.status === "ACTIVE" ? { ...o, status: "CANCELLED" } : o),
    };
    for (const r of rows) log.push(`${roster.find((s: any) => s.id === r.studentId)?.code} ${r.studentName}: huỷ phiếu gộp thừa "${r.billingPeriod}" ${vnd(r.amountDue)} (chưa thu)`);
  }
  for (const [code, amount] of OLDDEBT) {
    const st = byCode(code);
    const bill = ledger.receivables.find((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED" && String(r.billKey || "").split("|")[0] === "olddebt")
      || fail(`${code}: không có phiếu nợ cũ`);
    if (!(amount >= 0)) fail(`${code}: OLDDEBT phải >= 0`);
    if (Number(bill.amountPaid) > 0) fail(`${code}: phiếu nợ cũ đã thu ${vnd(bill.amountPaid)} — dừng để xem tay`);
    if ((bill.appliedCredits || []).length) fail(`${code}: phiếu nợ cũ đang trừ tín dụng — dừng`);
    if (Number(bill.amountDue) === amount) { log.push(`${code}: nợ cũ đã đúng ${vnd(amount)} — bỏ qua`); continue; }
    const before = Number(bill.amountDue);
    ledger = {
      ...ledger,
      // amount = 0: giữ phiếu nợ cũ (không huỷ — huỷ thì báo giá tháng tự cộng lại nợ cũ) nhưng không còn phải thu.
      receivables: ledger.receivables.map((r: any) => r.id !== bill.id ? r : amount > 0
        ? { ...r, amountDue: amount, balanceDue: amount, status: "OPEN" }
        : { ...r, amountDue: 0, balanceDue: 0, status: "PAID", note: `Nợ cũ ${vnd(before)} đưa về 0 theo bảng đối chiếu ${CLASS} — chờ xác nhận đã thu / bỏ nợ` }),
      paymentOrders: ledger.paymentOrders.map((o: any) => o.id !== bill.paymentOrderId || o.status !== "ACTIVE" ? o
        : amount > 0 ? refreshOrderQr(o, ledger.settings, amount) : { ...o, status: "CANCELLED" }),
    };
    log.push(`${code} ${st.fullName}: nợ cũ ${vnd(before)} → ${vnd(amount)} theo bảng`);
  }
  for (const code of PAID) {
    const st = byCode(code);
    const bill = ledger.receivables.find((r: any) => r.studentId === st.id && r.billKey === `month|${cls.id}|${MONTH}` && r.status !== "CANCELLED")
      || fail(`${code}: không có phiếu tháng ${MONTH}`);
    // Nợ cũ trước tháng MONTH (phiếu nợ cũ riêng / phiếu tháng trước còn nợ) cũng đã đóng.
    const prior = monthlyPriorDebtReceivables(ledger, st.id, cls.id, MONTH);
    const total = Math.max(0, bill.balanceDue) + prior.reduce((sum: number, r: any) => sum + r.balanceDue, 0);
    if (!(total > 0)) { log.push(`${code} ${st.fullName}: đã hết nợ đến ${MONTH} — bỏ qua`); continue; }
    const allowed = new Set([bill.id, ...prior.map((r: any) => r.id)]);
    const live = workStudents.find((s) => s.id === st.id);
    const start = prior.length ? [MONTH, ...prior.map((r: any) => carryReceivableMonth(r))].sort()[0] : MONTH;
    const res: any = collectTuitionAmount({ ledger, student: live, cls, sessions, method: "TRANSFER", amount: total, note: NOTE, now, startMonth: start });
    if ("error" in res) fail(`${code}: ${res.error}`);
    if (res.steps.some((s: any) => !allowed.has(s.receivable.id))) fail(`${code}: tiền phân bổ ra ngoài phiếu đến ${MONTH} — dừng`);
    const ids = new Set(res.steps.map((s: any) => s.receipt.id));
    ledger = { ...res.ledger, receipts: res.ledger.receipts.map((r: any) => ids.has(r.id) ? { ...r, status: "UNRECORDED", note: NOTE } : r) };
    workStudents = workStudents.map((s) => s.id !== st.id ? s : {
      ...s,
      tuitionCredits: { ...(s.tuitionCredits || {}), [cls.id]: Math.max(0, Number(s.tuitionCredits?.[cls.id] || 0) - res.creditSessionsUsed) },
      tuitionPaidThrough: res.paidThroughMonth ? { ...(s.tuitionPaidThrough || {}), [cls.id]: [s.tuitionPaidThrough?.[cls.id] || "", res.paidThroughMonth].sort().at(-1) } : s.tuitionPaidThrough,
    });
    log.push(`${code} ${st.fullName}: ghi đã đóng đến ${MONTH} ${vnd(total)}${prior.length ? ` (gồm nợ cũ ${prior.map((r: any) => `${r.billingPeriod.split(" · ")[0]} ${vnd(r.balanceDue)}`).join(", ")})` : ""} (biên lai ${res.steps.map((s: any) => s.receipt.receiptNumber).join(", ")} — chưa vào sổ thu chi)`);
  }
  for (const [code, amount] of OVERPAY) {
    const st = byCode(code);
    const pay = ledger.payments.filter((p: any) => p.studentId === st.id && p.status === "COMPLETED"
      && ledger.receivables.find((r: any) => r.id === p.receivableId)?.billKey === `month|${cls.id}|${MONTH}`)
      .sort((a: any, b: any) => String(b.paidAt).localeCompare(String(a.paidAt)))[0] || fail(`${code}: chưa có khoản thu tháng ${MONTH} để gắn tiền dư`);
    if ((ledger.credits || []).some((c: any) => c.sourcePaymentId === pay.id && c.reason === "OVERPAYMENT")) { log.push(`${code}: đã có tín dụng đóng dư — bỏ qua`); continue; }
    ledger = applyStudentCreditsToReceivables({ ...ledger, credits: [{ id: `cred-${crypto.randomUUID()}`, studentId: st.id, sourcePaymentId: pay.id, amount, remainingAmount: amount, reason: "OVERPAYMENT", status: "OPEN", createdAt: now.toISOString(), sourceClassId: undefined }, ...(ledger.credits || [])] });
    log.push(`${code} ${st.fullName}: đóng dư ${vnd(amount)} → tín dụng trừ vào phiếu tháng sau`);
  }
  for (const code of LEGACY_PAID) {
    const st = byCode(code);
    const key = `month|${cls.id}|${LEGACY_MONTH}`;
    if (ledger.receivables.some((r: any) => r.studentId === st.id && r.classId === cls.id && r.status !== "CANCELLED"
      && ["month", "months"].includes(String(r.billKey || "").split("|")[0])
      && String(r.billKey || "").split("|")[2]?.split(",").includes(LEGACY_MONTH))) fail(`${code}: đã có phiếu tháng ${LEGACY_MONTH} — dừng để xem tay`);
    const amount = classTuitionCharge(cls, sessions, LEGACY_MONTH).amount;
    if (!(amount > 0)) fail(`${code}: học phí tháng ${LEGACY_MONTH} = 0`);
    const iso = `${LEGACY_MONTH}-28T05:00:00.000Z`;
    const period = `Tháng ${LEGACY_MONTH.slice(5)}/${LEGACY_MONTH.slice(0, 4)} · ${cls.name}`;
    const created = createReceivable({ studentId: st.id, studentName: st.fullName, billingPeriod: period, amountDue: amount, usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: iso });
    const note = `Đã đóng ${period} trước khi dùng hệ thống — đồng bộ số buổi tồn ${CLASS} (chưa nhập phiếu thu sổ quỹ)`;
    const payment = { id: `pay-${crypto.randomUUID()}`, paymentCode: created.order.paymentCode, studentId: st.id, bankTransactionId: `manual-${crypto.randomUUID()}`, receivableId: created.receivable.id, amount, allocatedAmount: amount, excessAmount: 0, status: "COMPLETED", paidAt: iso, method: "Chuyển khoản", note };
    const receipt = { id: `rcpt-${crypto.randomUUID()}`, receiptNumber: (() => { const stamp = LEGACY_MONTH.replace("-", ""); const max = Math.max(0, ...ledger.receipts.map((r: any) => { const m = new RegExp(`^PT-${stamp}-(\\d+)$`).exec(String(r.receiptNumber)); return m ? Number(m[1]) : 0; })); return `PT-${stamp}-${String(max + 1).padStart(6, "0")}`; })(), paymentId: payment.id, studentId: st.id, amount, issuedAt: iso, status: "UNRECORDED", method: "Chuyển khoản", note, classId: cls.id, className: cls.name, billingPeriod: period, billingMode: "MONTHLY", studentName: st.fullName, studentCode: st.code, creditSessionsUsed: 0, materialsAmount: 0 };
    ledger = {
      ...ledger,
      receivables: [{ ...created.receivable, classId: cls.id, billKey: key, amountPaid: amount, balanceDue: 0, status: "PAID", frozenAt: iso }, ...ledger.receivables],
      paymentOrders: [{ ...created.order, status: "PAID" }, ...ledger.paymentOrders],
      payments: [payment, ...ledger.payments],
      receipts: [receipt, ...ledger.receipts],
    };
    log.push(`${code} ${st.fullName}: tháng ${LEGACY_MONTH} đã đóng trước hệ thống → phiếu ${vnd(amount)} đã thu (biên lai ${receipt.receiptNumber} — chưa vào sổ thu chi)`);
  }
  const settled: any = syncTuitionReceivables(mergeSepayLedger(JSON.parse(JSON.stringify(ledger))), classes, workStudents, sessions, now);
  workStudents = workStudents.map((s) => roster.some((r: any) => r.id === s.id) ? { ...s, sessionBalances: { ...(s.sessionBalances || {}), [cls.id]: monthlyRemainingSessions(s, cls, sessions, settled, now) } } : s);

  // Kiểm tra: công nợ app từng học viên = OWE (hoặc 0); học viên ngoài lớp không đổi.
  const view = (sepay: any, rows: any[]) => {
    const src = fs.readFileSync("cloudflare/public/app.js", "utf8").replace(/\nbootstrap\(\);\s*$/, "").concat("\nglobalThis.__t={state,tuitionEffectiveDebt,studentSessionRemaining};");
    const ctx: any = vm.createContext({ console, document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: () => {} }, location: { pathname: "/" }, history: { pushState() {}, replaceState() {} }, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams });
    vm.runInContext(src, ctx);
    ctx.__t.state.data = { user: { role: "ADMIN" }, students: structuredClone(rows), classes: structuredClone(classes), lessonSessions: sessions, finance: { ...finance, sepay }, settings, teachers };
    ctx.__t.state.role = "ADMIN";
    const c = ctx.__t.state.data.classes.find((x: any) => x.id === cls.id);
    return (id: string) => { const s = ctx.__t.state.data.students.find((x: any) => x.id === id); return { debt: ctx.__t.tuitionEffectiveDebt(s, c), rem: ctx.__t.studentSessionRemaining(s, c) }; };
  };
  const A = view(before, students), B = view(settled, workStudents);
  const others = (l: any) => JSON.stringify(l.receivables.filter((r: any) => !roster.some((s: any) => s.id === r.studentId)).map((r: any) => [r.id, r.amountDue, r.balanceDue, r.status]));
  if (others(before) !== others(settled)) fail("Phiếu học viên ngoài lớp bị đổi — dừng");
  log.forEach((l) => console.log(l));
  console.log(`\n${CLASS} sau sửa:`);
  const bad: string[] = [];
  for (const st of roster) {
    if (st.tuitionExempt) continue;
    const a = A(st.id), b = B(st.id);
    if (SKIP.has(String(st.code).toUpperCase())) { console.log(`  ${st.code} ${String(st.fullName).padEnd(24)} nợ ${vnd(a.debt).padStart(10)} → ${vnd(b.debt).padStart(10)} | tồn ${a.rem} → ${b.rem} | (bỏ qua — xem riêng)`); continue; }
    const want = OWE.get(String(st.code).toUpperCase()) ?? 0;
    const t11 = settled.receivables.find((r: any) => r.studentId === st.id && r.billKey === `month|${cls.id}|${(() => { const d = new Date(`${MONTH}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })()}` && r.status !== "CANCELLED");
    console.log(`  ${st.code} ${String(st.fullName).padEnd(24)} nợ ${vnd(a.debt).padStart(10)} → ${vnd(b.debt).padStart(10)} | tồn ${a.rem} → ${b.rem}${t11 ? ` | phiếu tháng sau ${vnd(t11.balanceDue)}` : ""}${b.debt !== want ? `  ✘ cần ${vnd(want)}` : ""}`);
    if (b.debt !== want) bad.push(st.code);
  }
  if (bad.length) fail(`Công nợ sau sửa chưa đúng bảng: ${bad.join(", ")} — KHÔNG ghi`);
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versions) {
      const q = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!q.length || Number(q[0].version) !== version) throw new Error("Dữ liệu vừa thay đổi — chưa ghi gì, hãy chạy lại.");
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger });
    await (studentsRepository as any).write(tx, workStudents);
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
