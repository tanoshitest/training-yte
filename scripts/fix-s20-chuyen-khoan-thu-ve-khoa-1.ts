/**
 * Sửa dữ liệu học phí lớp S20 theo xác nhận của trung tâm (23/10/2026):
 *  - Khóa 1 (28/07–20/10): cả lớp đã đóng, trừ HV0272 và HV0278.
 *  - Khóa 2 (từ 24/10): chưa em nào đóng.
 * Hiện trạng: 11 khoản thu tiền khóa 1 đang gắn nhầm vào phiếu khóa 2, HV0266
 * có thêm một dòng thu trùng (16/10) và phiếu khóa 3 lập sớm.
 *
 * Mặc định chỉ in kế hoạch (dry-run). APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { createReceivable, mergeSepayLedger, refreshOrderQr } from "../cloudflare/sepay-engine";
import {
  courseIndexOfBillKey, courseRemainingSessions, rebuildCourseSessionBalances, reverseTuitionReceipt, syncTuitionReceivables,
} from "../cloudflare/tuition-billing";

const CLASS_ID = "class-import-s20";
const K1_BILL_KEY = `course|${CLASS_ID}`;
const K2_BILL_KEY = `course|${CLASS_ID}|2`;
const K3_BILL_KEY = `course|${CLASS_ID}|3`;
const MOVE_TO_K1 = ["HV0265", "HV0267", "HV0268", "HV0269", "HV0270", "HV0271", "HV0273", "HV0274", "HV0275", "HV0276", "HV0277"];
const DUPLICATE_K2 = "HV0266";
const K1_DEBTORS = ["HV0272", "HV0278"];
const COURSE_SESSIONS = 24;
const STAMP = "Chuyển về khóa 1 theo xác nhận trung tâm 23/10/2026";

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };

(async () => {
  // Ghi lại phiên bản dữ liệu lúc đọc — lúc ghi nếu đã đổi (có người vừa thao tác) thì dừng.
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: ["finance:steps-demo", "students:steps-demo"] } }, select: { key: true, version: true } });
  let students: any[] = await (studentsRepository as any).read(prisma);
  const originalStudents = students;
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  let ledger: any = mergeSepayLedger(finance.sepay);
  let cashbook: any[] = finance.cashbook || [];
  const cls = classes.find((c) => c.id === CLASS_ID) || fail("Không thấy lớp S20");
  const byCode = new Map(students.map((s) => [s.code, s]));
  const log: string[] = [];

  // 1) 11 khoản thu: chuyển từ phiếu khóa 2 sang phiếu khóa 1 (PAID), mở lại phiếu khóa 2.
  for (const code of MOVE_TO_K1) {
    const st = byCode.get(code) || fail(`Không thấy ${code}`);
    const r2 = ledger.receivables.find((r: any) => r.studentId === st.id && r.billKey === K2_BILL_KEY && r.status !== "CANCELLED") || fail(`${code}: không có phiếu khóa 2`);
    if (ledger.receivables.some((r: any) => r.studentId === st.id && r.billKey === K1_BILL_KEY && r.status !== "CANCELLED")) fail(`${code}: đã có phiếu khóa 1, dừng để kiểm tra tay`);
    const pays = ledger.payments.filter((p: any) => p.receivableId === r2.id && p.status !== "VOIDED" && p.status !== "REFUNDED");
    if (pays.length !== 1) fail(`${code}: phiếu khóa 2 có ${pays.length} khoản thu, cần đúng 1`);
    const pay = pays[0];
    const rcpt = ledger.receipts.find((r: any) => r.paymentId === pay.id) || fail(`${code}: không thấy biên lai`);
    const amount = Math.round(Number(pay.allocatedAmount) || 0);
    if (amount !== 1_560_000) fail(`${code}: số tiền ${amount} khác 1.560.000`);
    const k1Period = `Khóa ${COURSE_SESSIONS} buổi · ${cls.name}`;
    const created = createReceivable({
      studentId: st.id, studentName: st.fullName, billingPeriod: k1Period, amountDue: amount,
      usedCodes: ledger.paymentOrders.map((o: any) => o.paymentCode), now: pay.paidAt,
    });
    const k1 = { ...created.receivable, classId: CLASS_ID, billKey: K1_BILL_KEY, amountPaid: amount, balanceDue: 0, status: "PAID" };
    const k1Order = { ...created.order, status: "PAID" };
    ledger = {
      ...ledger,
      receivables: [k1, ...ledger.receivables.map((r: any) => r.id === r2.id ? { ...r, amountPaid: 0, balanceDue: r.amountDue, status: "OPEN" } : r)],
      paymentOrders: [k1Order, ...ledger.paymentOrders.map((o: any) => o.id === r2.paymentOrderId ? { ...refreshOrderQr(o, ledger.settings, r2.amountDue), status: "ACTIVE" } : o)],
      payments: ledger.payments.map((p: any) => p.id === pay.id ? { ...p, receivableId: k1.id } : p),
      receipts: ledger.receipts.map((r: any) => r.id === rcpt.id ? { ...r, billingPeriod: k1Period, note: [r.note, STAMP].filter(Boolean).join(" · ") } : r),
      invoices: ledger.invoices.map((i: any) => i.paymentId === pay.id ? { ...i, receivableId: k1.id } : i),
    };
    let cashMoved = 0;
    cashbook = cashbook.map((c: any) => {
      if (c.receiptId !== rcpt.id) return c;
      cashMoved += 1;
      return { ...c, tuitionId: k1.id };
    });
    log.push(`${code} ${st.fullName}: biên lai ${rcpt.receiptNumber} (${rcpt.status}, ${amount.toLocaleString("vi-VN")}đ) → phiếu khóa 1 mới; phiếu khóa 2 mở lại 1.560.000đ; sổ quỹ cập nhật ${cashMoved} dòng`);
  }

  // 2) HV0266: hoàn tác dòng thu trùng trên phiếu khóa 2 (đã có CK khóa 1 ngày 19/09), hủy phiếu khóa 3 lập sớm.
  {
    const st = byCode.get(DUPLICATE_K2) || fail(`Không thấy ${DUPLICATE_K2}`);
    const r2 = ledger.receivables.find((r: any) => r.studentId === st.id && r.billKey === K2_BILL_KEY && r.status !== "CANCELLED") || fail("HV0266: không có phiếu khóa 2");
    const pays = ledger.payments.filter((p: any) => p.receivableId === r2.id && p.status !== "VOIDED" && p.status !== "REFUNDED");
    if (pays.length !== 1) fail(`HV0266: phiếu khóa 2 có ${pays.length} khoản thu`);
    const rcpt = ledger.receipts.find((r: any) => r.paymentId === pays[0].id) || fail("HV0266: không thấy biên lai");
    if (rcpt.status !== "UNRECORDED") fail(`HV0266: biên lai khóa 2 là ${rcpt.status}, không phải dòng ghi hàng loạt — dừng`);
    const reversed: any = reverseTuitionReceipt({ ledger, receiptId: rcpt.id, students, classes, sessions });
    if (reversed.error) fail(reversed.error);
    ledger = reversed.ledger;
    students = reversed.students;
    const cashBefore = cashbook.length;
    cashbook = cashbook.filter((c: any) => c.receiptId !== rcpt.id);
    const r3 = ledger.receivables.find((r: any) => r.studentId === st.id && r.billKey === K3_BILL_KEY && r.status !== "CANCELLED");
    if (r3) {
      if (r3.amountPaid > 0 || r3.frozenAt) fail("HV0266: phiếu khóa 3 đã gửi/đã thu — dừng");
      ledger = {
        ...ledger,
        receivables: ledger.receivables.map((r: any) => r.id === r3.id ? { ...r, balanceDue: 0, status: "CANCELLED" } : r),
        paymentOrders: ledger.paymentOrders.map((o: any) => o.id === r3.paymentOrderId && o.status === "ACTIVE" ? { ...o, status: "CANCELLED" } : o),
      };
    }
    log.push(`HV0266 ${st.fullName}: hoàn tác biên lai trùng ${rcpt.receiptNumber} (16/10, 1.560.000đ); phiếu khóa 2 mở lại; ${r3 ? "hủy phiếu khóa 3" : "không có phiếu khóa 3"}; sổ quỹ bỏ ${cashBefore - cashbook.length} dòng`);
  }

  // 3) Nợ khóa 1 của 2 em: ghi nợ cũ 24 buổi — phiếu khóa 2 tự cộng dòng "Nợ học phí khóa cũ".
  students = students.map((s: any) => {
    if (!K1_DEBTORS.includes(s.code)) return s;
    log.push(`${s.code} ${s.fullName}: ghi nợ khóa 1 = 24 buổi (tuitionCredits ${s.tuitionCredits?.[CLASS_ID] ?? "trống"} → -24)`);
    return { ...s, tuitionCredits: { ...(s.tuitionCredits || {}), [CLASS_ID]: -COURSE_SESSIONS } };
  });

  // 4) Đồng bộ như app làm sau mỗi lần ghi: tính lại phiếu và số buổi tồn.
  const now = new Date();
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, now);
  // Chỉ thay số của lớp S20 (tồn lưu sẵn + nợ buổi) trên bản gốc — mọi học viên/lớp khác giữ nguyên.
  const rebuilt = new Map((rebuildCourseSessionBalances(students, classes, sessions, ledger, now) as any[]).map((s) => [s.id, s]));
  const computed = new Map(students.map((s: any) => [s.id, s]));
  students = originalStudents.map((s: any) => {
    if (!cls.studentIds.includes(s.id)) return s;
    const tuitionCredits = { ...(s.tuitionCredits || {}) };
    const credit = computed.get(s.id)?.tuitionCredits?.[CLASS_ID];
    if (credit === undefined) delete tuitionCredits[CLASS_ID]; else tuitionCredits[CLASS_ID] = credit;
    return { ...s, tuitionCredits, sessionBalances: { ...(s.sessionBalances || {}), [CLASS_ID]: rebuilt.get(s.id)?.sessionBalances?.[CLASS_ID] } };
  });

  console.log(log.join("\n"));
  console.log("\n=== KẾT QUẢ SAU SỬA (lớp S20) ===");
  for (const sid of cls.studentIds) {
    const st = students.find((s: any) => s.id === sid);
    const recv = ledger.receivables.filter((r: any) => r.studentId === sid && r.classId === CLASS_ID && r.status !== "CANCELLED");
    const open = recv.filter((r: any) => ["OPEN", "PARTIALLY_PAID"].includes(r.status)).reduce((s: number, r: any) => s + Number(r.balanceDue), 0);
    console.log(`${st.code} ${st.fullName.padEnd(12)} tồn=${String(courseRemainingSessions(st, cls, sessions, ledger, now)).padStart(4)} nợ=${open.toLocaleString("vi-VN").padStart(10)}đ | ${recv.map((r: any) => `K${courseIndexOfBillKey(r.billKey)}:${r.status}:${Number(r.amountDue).toLocaleString("vi-VN")}`).join("  ")}`);
  }

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
  console.log("\nĐÃ GHI xong finance + students.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
