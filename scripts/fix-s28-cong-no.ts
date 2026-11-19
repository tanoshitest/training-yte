/**
 * S28 — chốt công nợ theo trung tâm (24/10/2026): lớp đang học KHÓA 1; chỉ còn
 * HV Thùy Trang, Bảo Ngọc, Kim Ngân, Anh Thư nợ khóa 1 1.560.000đ, các bạn khác hết nợ.
 * Lỗi đang có:
 *  - Phiếu KHÓA 2 (chưa bắt đầu) đã bị "Gửi yêu cầu thanh toán" sớm (bản cũ) → bị cộng
 *    vào công nợ (vd Bảo An đóng khóa 1 hôm 23/10 vẫn hiện nợ 1.560.000đ).
 *  - Bảo Uyên, Thanh Hải: tiền thật 1.560.000đ ghi vào phiếu khóa 2, khóa 1 vẫn để nợ.
 *  - Bảo Ngọc: khóa 1 ghi "đã đóng" bằng dòng ghi hàng loạt (chưa vào sổ quỹ) nhưng chưa đóng.
 * Sửa (chỉ lớp S28):
 *  - Phiếu khóa sau (chưa bắt đầu) còn mở: bỏ trạng thái "đã gửi" → không tính nợ.
 *  - Khóa 1 còn nợ mà khóa sau có tiền thật: chuyển khoản tiền đó sang khóa 1.
 *  - Khóa 1 "đã đóng" bằng dòng ghi hàng loạt của 4 bạn còn nợ: hoàn tác dòng đó.
 * Sổ quỹ giữ nguyên. Mặc định dry-run. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import {
  classCurrentCourseIndex, courseIndexOfBillKey, courseRemainingSessions, reverseTuitionReceipt,
  studentCourseCollectStates, syncTuitionReceivables,
} from "../cloudflare/tuition-billing";

const CODE = "S28";
const DEBTORS = ["HV0371", "HV0374", "HV0375", "HV0377"]; // Thùy Trang, Bảo Ngọc, Kim Ngân, Anh Thư
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
  const cls = classes.find((c) => c.code === CODE) || fail("Không thấy lớp S28");
  const course = Number(cls.sessionPrice) * Number(cls.courseSessions);
  if (course !== 1_560_000) fail("Học phí khóa S28 không còn là 1.560.000đ — dừng");
  const now = new Date();
  const current = classCurrentCourseIndex(cls, now, sessions);
  if (current !== 1) fail(`S28 đang ở khóa ${current}, không phải khóa 1 — dừng để kiểm tra tay`);
  const inClass = new Set<string>(cls.studentIds);
  const receiptOf = (p: any) => ledger.receipts.find((r: any) => r.paymentId === p.id);
  const rowsOf = (sid: string) => ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === cls.id && r.status !== "CANCELLED" && String(r.billKey || "").startsWith("course|"));
  const debtOf = (sts: any[], led: any, sid: string) => {
    const st = sts.find((s) => s.id === sid);
    return studentCourseCollectStates(st, cls, sessions, led, now).filter((s: any) => s.status === "DUE").reduce((sum: number, s: any) => sum + (s.balanceDue || 0), 0);
  };
  const synced0: any = syncTuitionReceivables(ledger, classes, students, sessions, now);
  const before = new Map(cls.studentIds.map((sid: string) => [sid, debtOf(students, synced0, sid)]));
  const log: string[] = [];

  for (const sid of cls.studentIds) {
    const st = students.find((s) => s.id === sid);
    if (!st) continue;
    const isDebtor = DEBTORS.includes(st.code);
    const notes: string[] = [];
    const k1 = rowsOf(sid).filter((r: any) => courseIndexOfBillKey(r.billKey) === 1);
    if (k1.length > 1) fail(`${st.code}: có ${k1.length} phiếu khóa 1 — dừng`);

    // a) Bạn còn nợ mà khóa 1 đang "đã đóng" chỉ bằng dòng ghi hàng loạt → hoàn tác.
    //    Khóa 1 đã đóng bằng TIỀN THẬT (đã vào sổ quỹ) thì giữ nguyên; phần nợ 1.560.000đ
    //    của bạn này là phiếu khóa 2 đã gửi → giữ phiếu khóa 2 "đã gửi".
    let keepLaterFrozen = false;
    if (isDebtor && k1[0] && ["PAID", "OVERPAID", "PARTIALLY_PAID"].includes(k1[0].status)) {
      const pays = ledger.payments.filter((p: any) => p.receivableId === k1[0].id && live(p));
      const real = pays.filter((p: any) => receiptOf(p)?.status !== "UNRECORDED");
      if (real.length) {
        keepLaterFrozen = true;
        notes.push(`khóa 1 đã đóng bằng tiền thật ${real.map((p: any) => `${receiptOf(p)?.receiptNumber || ""} ${vnd(p.allocatedAmount)} ngày ${String(p.paidAt || receiptOf(p)?.issuedAt || "").slice(0, 10)}`).join(", ")} → giữ nguyên; nợ 1.560.000đ là phiếu khóa 2 đã gửi`);
      }
    }
    if (isDebtor && !keepLaterFrozen && k1[0] && ["PAID", "OVERPAID", "PARTIALLY_PAID"].includes(k1[0].status)) {
      const pays = ledger.payments.filter((p: any) => p.receivableId === k1[0].id && live(p));
      for (const p of pays) {
        const rc = receiptOf(p);
        const res: any = reverseTuitionReceipt({ ledger, receiptId: rc.id, students, classes, sessions });
        if (res.error) fail(`${st.code}: ${res.error}`);
        ledger = res.ledger; students = res.students;
        cashbook = cashbook.filter((c: any) => c.receiptId !== rc.id);
        notes.push(`hoàn tác ${rc.receiptNumber} ${vnd(p.allocatedAmount)} khóa 1 (ghi hàng loạt, chưa vào sổ quỹ)`);
      }
    }

    // b) Bạn hết nợ mà khóa 1 còn mở, tiền thật nằm ở phiếu khóa sau → chuyển sang khóa 1.
    const k1Now = rowsOf(sid).find((r: any) => courseIndexOfBillKey(r.billKey) === 1);
    if (!isDebtor && k1Now && (k1Now.status === "OPEN" || k1Now.status === "PARTIALLY_PAID") && Math.round(k1Now.amountPaid) === 0) {
      const later = rowsOf(sid).filter((r: any) => courseIndexOfBillKey(r.billKey) > 1);
      const pay = later.flatMap((r: any) => ledger.payments.filter((p: any) => p.receivableId === r.id && live(p) && Math.round(p.allocatedAmount) === course))[0];
      if (pay) {
        const from = ledger.receivables.find((r: any) => r.id === pay.receivableId);
        ledger = {
          ...ledger,
          payments: ledger.payments.map((p: any) => p.id === pay.id ? { ...p, receivableId: k1Now.id } : p),
          invoices: ledger.invoices.map((i: any) => i.paymentId === pay.id ? { ...i, receivableId: k1Now.id } : i),
          receivables: ledger.receivables.map((r: any) => r.id === k1Now.id ? { ...r, amountPaid: course, balanceDue: 0, status: "PAID" }
            : r.id === from.id ? { ...r, amountPaid: 0, balanceDue: r.amountDue, status: "OPEN", frozenAt: undefined } : r),
          paymentOrders: ledger.paymentOrders.map((o: any) => o.id === k1Now.paymentOrderId ? { ...o, status: "PAID" }
            : o.id === from.paymentOrderId ? { ...refreshOrderQr(o, ledger.settings, from.amountDue), status: "ACTIVE" } : o),
        };
        const rc = receiptOf(pay);
        if (rc) ledger = { ...ledger, receipts: ledger.receipts.map((r: any) => r.id === rc.id ? { ...r, billingPeriod: k1Now.billingPeriod } : r) };
        cashbook = cashbook.map((c: any) => rc && c.receiptId === rc.id ? { ...c, tuitionId: k1Now.id } : c);
        notes.push(`chuyển ${rc?.receiptNumber || "khoản thu"} ${vnd(course)} từ phiếu khóa ${courseIndexOfBillKey(from.billKey)} sang khóa 1`);
      }
    }

    // c) Phiếu khóa sau (chưa bắt đầu) còn mở, chưa thu: bỏ "đã gửi" để không tính nợ.
    for (const r of rowsOf(sid)) {
      if (keepLaterFrozen) break;
      if (courseIndexOfBillKey(r.billKey) <= current || !r.frozenAt) continue;
      if (r.status !== "OPEN" || Math.round(r.amountPaid) > 0) continue;
      ledger = { ...ledger, receivables: ledger.receivables.map((x: any) => x.id === r.id ? { ...x, frozenAt: undefined } : x) };
      notes.push(`phiếu khóa ${courseIndexOfBillKey(r.billKey)} (chưa bắt đầu) bỏ trạng thái "đã gửi"`);
    }
    if (notes.length) log.push(`${st.code} ${st.fullName}:\n   - ${notes.join("\n   - ")}`);
  }

  const synced: any = syncTuitionReceivables(ledger, classes, students, sessions, now);
  console.log(`Lớp ${CODE} · khóa hiện tại ${current}\n`);
  console.log(log.join("\n"));
  console.log("\nCông nợ sau khi sửa:");
  let bad = 0;
  for (const sid of cls.studentIds) {
    const st = students.find((s) => s.id === sid); if (!st) continue;
    const after = debtOf(students, synced, sid);
    const want = DEBTORS.includes(st.code) ? course : 0;
    if (after !== want) bad += 1;
    console.log(`  ${after === want ? "✔" : "✘"} ${st.code} ${st.fullName.padEnd(22)} ${vnd(before.get(sid) || 0).padStart(12)} → ${vnd(after).padStart(12)}${after === want ? "" : `  (cần ${vnd(want)})`}`);
  }
  if (bad) fail(`${bad} học viên chưa ra đúng công nợ — dừng, chưa ghi gì`);

  const changed = new Map(students.map((s: any) => [s.id, s]));
  const finalStudents = originalStudents.map((s: any) => {
    if (!inClass.has(s.id)) return s;
    const next: any = changed.get(s.id);
    return { ...next, sessionBalances: { ...(next.sessionBalances || {}), [cls.id]: courseRemainingSessions(next, cls, sessions, ledger, now) } };
  });

  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi trong lúc chạy — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (financeRepository as any).write(tx, { ...finance, sepay: ledger, cashbook });
    await (studentsRepository as any).write(tx, finalStudents);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI xong S28.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
