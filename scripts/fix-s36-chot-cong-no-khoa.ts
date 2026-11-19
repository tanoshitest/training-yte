/**
 * Sửa dữ liệu học phí lớp S36 theo xác nhận của trung tâm (23/10/2026):
 *  - Khóa 1 (01/08–22/10): cả lớp đã đóng, chỉ còn HV0465 Phúc Hưng nợ 1.560.000đ.
 *  - Khóa 2 (từ 24/10): cả lớp đang nợ 1.560.000đ.
 * Sau khi sửa, mọi thao tác thu tiếp theo chạy theo logic thu khóa của app.
 *
 * Cách xếp tiền đang có trên phiếu khóa 2 (không làm mất tiền thật):
 *  - Mỗi em: một khoản thu đúng 1.560.000đ (ưu tiên biên lai đã vào sổ quỹ) → chuyển sang phiếu khóa 1 (đã đóng).
 *  - Khoản thừa là biên lai "chưa vào sổ quỹ" (dòng ghi hàng loạt "cập nhật công nợ S36") → hoàn tác.
 *  - Khoản thừa là tiền thật đã vào sổ quỹ → giữ lại, trừ vào khóa 2.
 *  - HV0465: hoàn tác dòng ghi hàng loạt 1.560.000đ, lập phiếu khóa 1 còn nợ 1.560.000đ.
 *  - Bỏ "nợ buổi cũ" (-24) gộp trong phiếu khóa 2; hủy phiếu khóa 3 lập sớm.
 * Chỉ thay đổi học viên của lớp S36. Mặc định chỉ in kế hoạch (dry-run). APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import {
  courseIndexOfBillKey, courseRemainingSessions, reverseTuitionReceipt, syncTuitionReceivables,
} from "../cloudflare/tuition-billing";

const CLASS_ID = "class-import-s36";
const K1 = `course|${CLASS_ID}`;
const K2 = `course|${CLASS_ID}|2`;
const K3 = `course|${CLASS_ID}|3`;
const COURSE = 1_560_000;
const K1_DEBTOR = "HV0465";
const STAMP = "Chuyển về khóa 1 theo xác nhận trung tâm 23/10/2026";

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const live = (p: any) => p.status !== "VOIDED" && p.status !== "REFUNDED";

(async () => {
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  const originalStudents: any[] = await (studentsRepository as any).read(prisma);
  let students = originalStudents;
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  let cashbook: any[] = finance.cashbook || [];
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S36");
  if (Number(cls.sessionPrice) * Number(cls.courseSessions) !== COURSE) fail("Học phí khóa S36 không còn là 1.560.000đ — dừng");
  const inClass = new Set<string>(cls.studentIds);
  const log: string[] = [];
  const now = new Date();
  const k1Period = `Khóa ${cls.courseSessions} buổi · ${cls.name}`;
  const receiptOf = (pay: any) => ledger.receipts.find((r: any) => r.paymentId === pay.id);

  for (const sid of cls.studentIds) {
    const st = students.find((s) => s.id === sid) || fail(`Không thấy học viên ${sid}`);
    const mine = (key: string) => ledger.receivables.filter((r: any) => r.studentId === sid && r.billKey === key && r.status !== "CANCELLED");
    const k1Rows = mine(K1);
    const r2 = mine(K2)[0];
    const notes: string[] = [];

    // Phiếu khóa 3 lập sớm → hủy.
    for (const r3 of mine(K3)) {
      if (r3.amountPaid > 0 || r3.frozenAt) fail(`${st.code}: phiếu khóa 3 đã gửi/đã thu — dừng`);
      ledger = {
        ...ledger,
        receivables: ledger.receivables.map((r: any) => r.id === r3.id ? { ...r, balanceDue: 0, status: "CANCELLED" } : r),
        paymentOrders: ledger.paymentOrders.map((o: any) => o.id === r3.paymentOrderId && o.status === "ACTIVE" ? { ...o, status: "CANCELLED" } : o),
      };
      notes.push("hủy phiếu khóa 3 lập sớm");
    }
    if (!r2) { if (notes.length) log.push(`${st.code} ${st.fullName}: ${notes.join("; ")}`); continue; }

    const isDebtor = st.code === K1_DEBTOR;
    const k1Paid = k1Rows.some((r: any) => r.status === "PAID" || r.status === "OVERPAID");
    if (k1Rows.length && (isDebtor || !k1Paid)) fail(`${st.code}: đã có phiếu khóa 1 chưa đúng dự kiến — dừng để kiểm tra tay`);

    // Chọn khoản thu đóng khóa 1 và phân loại phần thừa.
    const pays = ledger.payments.filter((p: any) => p.receivableId === r2.id && live(p));
    const exact = pays.filter((p: any) => Math.round(Number(p.allocatedAmount)) === COURSE);
    const toK1 = isDebtor || k1Rows.length ? undefined
      : exact.find((p: any) => receiptOf(p)?.status === "ISSUED") || exact[0];
    if (!isDebtor && !k1Rows.length && !toK1 && pays.length) fail(`${st.code}: không có khoản thu đúng 1.560.000đ để chuyển sang khóa 1 — dừng`);
    const rest = pays.filter((p: any) => p !== toK1);
    const toReverse = rest.filter((p: any) => receiptOf(p)?.status === "UNRECORDED");
    if (toReverse.some((p: any) => /Đã đóng một phần/.test(String(p.note || receiptOf(p)?.note || "")) === false)) fail(`${st.code}: khoản chưa vào sổ quỹ không phải dòng ghi hàng loạt — dừng`);

    // a) Hoàn tác dòng ghi hàng loạt thừa (chưa vào sổ quỹ).
    for (const p of toReverse) {
      const rc = receiptOf(p) || fail(`${st.code}: không thấy biên lai`);
      const res: any = reverseTuitionReceipt({ ledger, receiptId: rc.id, students, classes, sessions });
      if (res.error) fail(res.error);
      ledger = res.ledger;
      students = res.students;
      cashbook = cashbook.filter((c: any) => c.receiptId !== rc.id);
      notes.push(`hoàn tác ${rc.receiptNumber} ${vnd(p.allocatedAmount)} (dòng ghi hàng loạt, chưa vào sổ quỹ)`);
    }

    // b2) Tiền thật đã vào sổ quỹ còn thừa (HV0472 600k, HV1008 390k) cũng là tiền khóa 1:
    //     chuyển sang khóa 1 và giảm dòng ghi hàng loạt (chưa vào sổ quỹ) đúng bằng số đó,
    //     để khóa 1 đủ 1.560.000đ, khóa 2 còn nợ đủ, sổ quỹ giữ nguyên.
    const extras = rest.filter((p: any) => !toReverse.includes(p));
    if (extras.length && toK1) {
      const bulkRc = receiptOf(toK1);
      if (bulkRc?.status !== "UNRECORDED") fail(`${st.code}: có tiền thừa nhưng khoản khóa 1 không phải dòng ghi hàng loạt — dừng`);
      const extraSum = extras.reduce((s: number, p: any) => s + Math.round(Number(p.allocatedAmount) || 0), 0);
      if (extraSum >= COURSE) fail(`${st.code}: tiền thừa ${vnd(extraSum)} quá lớn — dừng`);
      const reduced = COURSE - extraSum;
      ledger = {
        ...ledger,
        payments: ledger.payments.map((p: any) => p.id === toK1.id ? { ...p, amount: reduced, allocatedAmount: reduced } : p),
        receipts: ledger.receipts.map((r: any) => r.id === bulkRc.id ? { ...r, amount: reduced } : r),
        invoices: ledger.invoices.map((i: any) => i.paymentId === toK1.id ? { ...i, amount: reduced } : i),
      };
      toK1.amount = reduced; toK1.allocatedAmount = reduced;
      notes.push(`dòng ghi hàng loạt ${bulkRc.receiptNumber} giảm 1.560.000đ → ${vnd(reduced)}`);
    }

    // b) Khoản đúng 1 khóa → phiếu khóa 1 đã đóng.
    if (toK1) {
      const rc = receiptOf(toK1) || fail(`${st.code}: không thấy biên lai`);
      const extraIds = new Set(extras.map((p: any) => p.id));
      const extraRcIds = new Set(extras.map((p: any) => receiptOf(p)?.id).filter(Boolean));
      const created = createReceivable({ studentId: sid, studentName: st.fullName, billingPeriod: k1Period, amountDue: COURSE, usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: toK1.paidAt });
      const k1 = { ...created.receivable, classId: CLASS_ID, billKey: K1, amountPaid: COURSE, balanceDue: 0, status: "PAID" };
      ledger = {
        ...ledger,
        receivables: [k1, ...ledger.receivables],
        paymentOrders: [{ ...created.order, status: "PAID" }, ...ledger.paymentOrders],
        payments: ledger.payments.map((p: any) => p.id === toK1.id || extraIds.has(p.id) ? { ...p, receivableId: k1.id } : p),
        receipts: ledger.receipts.map((r: any) => r.id === rc.id || extraRcIds.has(r.id) ? { ...r, billingPeriod: k1Period, note: [r.note, STAMP].filter(Boolean).join(" · ") } : r),
        invoices: ledger.invoices.map((i: any) => i.paymentId === toK1.id || extraIds.has(i.paymentId) ? { ...i, receivableId: k1.id } : i),
      };
      cashbook = cashbook.map((c: any) => c.receiptId === rc.id || extraRcIds.has(c.receiptId) ? { ...c, tuitionId: k1.id } : c);
      const k1Sum = Math.round(Number(toK1.allocatedAmount)) + extras.reduce((s: number, p: any) => s + Math.round(Number(p.allocatedAmount) || 0), 0);
      if (k1Sum !== COURSE) fail(`${st.code}: tổng tiền khóa 1 ${vnd(k1Sum)} khác 1.560.000đ — dừng`);
      notes.push(`${[rc, ...extras.map(receiptOf)].map((r: any) => `${r.receiptNumber} (${r.status === "ISSUED" ? "đã vào sổ quỹ" : "chưa vào sổ quỹ"})`).join(" + ")} = ${vnd(COURSE)} → khóa 1 đã đóng`);
    }

    // c) HV0465: phiếu khóa 1 còn nợ.
    if (isDebtor) {
      const created = createReceivable({ studentId: sid, studentName: st.fullName, billingPeriod: k1Period, amountDue: COURSE, usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: now.toISOString() });
      ledger = {
        ...ledger,
        receivables: [{ ...created.receivable, classId: CLASS_ID, billKey: K1 }, ...ledger.receivables],
        paymentOrders: [created.order, ...ledger.paymentOrders],
      };
      notes.push(`lập phiếu khóa 1 còn nợ ${vnd(COURSE)}`);
    }

    // d) Phiếu khóa 2 về đúng 1 khóa; tiền thật còn lại trừ vào khóa 2.
    const k2Paid = ledger.payments.filter((p: any) => p.receivableId === r2.id && live(p)).reduce((s: number, p: any) => s + Math.max(0, Number(p.allocatedAmount) || 0), 0);
    const balance = Math.max(0, COURSE - k2Paid);
    const status = k2Paid <= 0 ? "OPEN" : balance > 0 ? "PARTIALLY_PAID" : k2Paid > COURSE ? "OVERPAID" : "PAID";
    ledger = {
      ...ledger,
      receivables: ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountDue: COURSE, amountPaid: k2Paid, balanceDue: balance, status, frozenAt: undefined } : r),
      paymentOrders: ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId
        ? (balance > 0 ? { ...refreshOrderQr(o, ledger.settings, balance), status: "ACTIVE" } : { ...o, status: "PAID" }) : o),
    };
    if (r2.amountDue !== COURSE || r2.amountPaid !== k2Paid) notes.push(`phiếu khóa 2: ${vnd(r2.amountDue)}/đã thu ${vnd(r2.amountPaid)} → ${vnd(COURSE)}/đã thu ${vnd(k2Paid)}`);
    if (notes.length) log.push(`${st.code} ${st.fullName}: ${notes.join("; ")}`);
  }

  // Bỏ "nợ buổi cũ" gộp vào phiếu khóa 2 — nợ khóa 1 giờ nằm ở phiếu khóa 1.
  students = students.map((s: any) => {
    if (!inClass.has(s.id) || s.tuitionCredits?.[CLASS_ID] === undefined) return s;
    log.push(`${s.code} ${s.fullName}: bỏ nợ buổi cũ ${s.tuitionCredits[CLASS_ID]}`);
    const tuitionCredits = { ...s.tuitionCredits };
    delete tuitionCredits[CLASS_ID];
    return { ...s, tuitionCredits };
  });

  // Đồng bộ như app; chỉ giữ thay đổi phiếu của lớp S36.
  const synced: any = syncTuitionReceivables(ledger, classes, students, sessions, now);
  const s36 = (r: any) => r.classId === CLASS_ID && inClass.has(r.studentId);
  const s36Ids = new Set(synced.receivables.filter(s36).map((r: any) => r.id));
  const syncedOrders = new Map(synced.paymentOrders.map((o: any) => [o.id, o]));
  const knownOrders = new Set(ledger.paymentOrders.map((o: any) => o.id));
  ledger = {
    ...ledger,
    receivables: [...synced.receivables.filter(s36), ...ledger.receivables.filter((r: any) => !s36(r))],
    paymentOrders: [
      ...synced.paymentOrders.filter((o: any) => !knownOrders.has(o.id) && s36Ids.has(o.receivableId)),
      ...ledger.paymentOrders.map((o: any) => s36Ids.has(o.receivableId) ? syncedOrders.get(o.id) || o : o),
    ],
  };
  const changed = new Map(students.map((s: any) => [s.id, s]));
  students = originalStudents.map((s: any) => {
    if (!inClass.has(s.id)) return s;
    const next: any = changed.get(s.id);
    const tuitionCredits = { ...(s.tuitionCredits || {}) };
    delete tuitionCredits[CLASS_ID];
    const out = { ...s, tuitionCredits };
    return { ...out, sessionBalances: { ...(s.sessionBalances || {}), [CLASS_ID]: courseRemainingSessions(next ? { ...next, tuitionCredits } : out, cls, sessions, ledger, now) } };
  });

  console.log(log.join("\n"));
  console.log("\n=== KẾT QUẢ SAU SỬA (lớp S36) ===");
  let total = 0;
  for (const sid of cls.studentIds) {
    const st = students.find((s: any) => s.id === sid);
    const recv = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === CLASS_ID && r.status !== "CANCELLED")
      .sort((a: any, b: any) => courseIndexOfBillKey(a.billKey) - courseIndexOfBillKey(b.billKey));
    const open = recv.filter((r: any) => ["OPEN", "PARTIALLY_PAID"].includes(r.status)).reduce((s: number, r: any) => s + Number(r.balanceDue), 0);
    total += open;
    console.log(`${st.code} ${st.fullName.padEnd(18)} tồn=${String(courseRemainingSessions(st, cls, sessions, ledger, now)).padStart(4)} nợ=${vnd(open).padStart(11)} | ${recv.map((r: any) => `K${courseIndexOfBillKey(r.billKey)}:${r.status}:${vnd(r.balanceDue)}`).join("  ")}`);
  }
  console.log(`Tổng còn nợ lớp S36: ${vnd(total)}`);

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger, cashbook });
    await (studentsRepository as any).write(tx, students);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong lớp S36.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
