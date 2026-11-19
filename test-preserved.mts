/**
 * Test luồng bảo lưu học phí: đóng → rời lớp → credit → vào lớp mới → phiếu trừ.
 * Chạy: npx tsx test-preserved.mts
 */
import {
  collectManualTuition,
  syncTuitionReceivables,
  leftClassConsumedSessions,
} from "./cloudflare/tuition-billing";
import type { SepayLedger } from "./cloudflare/sepay-engine";
import type { DemoClass, DemoLessonSession } from "./cloudflare/operations-types";
import type { DemoStudent } from "./cloudflare/people-types";

const NOW = new Date(2026, 9, 11, 12); // Chủ nhật 2026-10-11
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const emptyLedger = (): SepayLedger => ({
  settings: { bank: "970418", accountNumber: "1", accountName: "X" } as any,
  receivables: [], paymentOrders: [], bankTransactions: [], payments: [],
  receipts: [], invoices: [], credits: [], webhookLogs: [],
});

const monthlyClass = (id: string, price: number, studentIds: string[] = []): DemoClass => ({
  id, code: id.toUpperCase(), name: id.toUpperCase(), classTypeId: "ct", branchId: "b1",
  teacherId: "t1", roomId: "r1", syllabusId: "syl", status: "ACTIVE",
  studentIds: [...studentIds],
  // Thứ 3 (2) + Thứ 5 (4) — tháng 10/2026: 1,6,8,13,15,20,22,27,29 → 9 buổi
  schedules: [
    { weekday: 2, periodId: "p", startTime: "17:15", endTime: "19:15" },
    { weekday: 4, periodId: "p", startTime: "17:15", endTime: "19:15" },
  ],
  note: "", billingMode: "MONTHLY", sessionPrice: price, courseStartDate: "2026-09-01",
  billingEnabled: true,
});
const waitingClass = (studentIds: string[] = []): DemoClass => ({
  id: "class-waiting", code: "LC", name: "Lớp chờ", classTypeId: "", branchId: "",
  teacherId: "", roomId: "", syllabusId: "", status: "ACTIVE", studentIds: [...studentIds],
  schedules: [], note: "",
});
const student = (id: string, joined: Record<string, string> = {}): DemoStudent => ({
  id, code: id.toUpperCase(), fullName: id, phone: "", address: "", school: "",
  parentZalo: "", status: "STUDYING", classJoinedAt: { ...joined },
});
const sessions: DemoLessonSession[] = [];

// ─── Kịch bản 1: đóng đủ → rời → credit đủ → vào lớp mới giá khác ────────────
console.log("Kịch bản 1: đóng đủ 585k → rời 11/10 → credit 390k → lớp mới 100k/buổi");
{
  const s = student("s1", { "cls-a": "2026-10-01" });
  const clsA = monthlyClass("cls-a", 65_000, ["s1"]);
  const clsB = monthlyClass("cls-b", 100_000, []);
  const waiting = waitingClass();
  let ledger = emptyLedger();
  const classes = [waiting, clsA, clsB];
  const students = [s];

  // 1. Thu đủ tháng 10 (9 buổi × 65k = 585k)
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const collected = collectManualTuition({ ledger, student: s, cls: clsA, sessions, method: "TRANSFER", now: new Date(2026, 9, 5, 12) });
  if ("error" in collected) throw new Error(collected.error);
  ledger = collected.ledger;
  s.tuitionPaidThrough = { "cls-a": "2026-10" };
  check("receipt 585k", collected.receipt.amount === 585_000, `got ${collected.receipt.amount}`);

  // 2. Rời lớp 11/10 → về lớp chờ
  clsA.studentIds = [];
  waiting.studentIds = ["s1"];
  s.classJoinedAt = { "cls-a": "2026-10-01", "class-waiting": "2026-10-11" };
  s.status = "UNASSIGNED" as any;
  check("consumed = 3 buổi (1,6,8/10)", leftClassConsumedSessions(s, clsA, sessions, NOW) === 3, `got ${leftClassConsumedSessions(s, clsA, sessions, NOW)}`);

  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const credit = ledger.credits.find((c) => c.id === "cred-preserved-s1-cls-a");
  check("credit PRESERVED tồn tại", !!credit);
  check("credit = 585k − 3×65k = 390k", credit?.amount === 390_000, `got ${credit?.amount}`);
  check("credit OPEN + remaining 390k", credit?.status === "OPEN" && credit?.remainingAmount === 390_000);
  check("credit sourceClassId = cls-a", credit?.sourceClassId === "cls-a");

  // 3. Idempotent: sync lặp không nhân đôi credit
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  check("vẫn chỉ 1 credit sau re-sync", ledger.credits.filter((c) => c.id === "cred-preserved-s1-cls-a").length === 1);
  check("phiếu cls-a vẫn PAID nguyên", ledger.receivables.find((r) => r.classId === "cls-a")?.status === "PAID");

  // 4. Vào lớp mới cls-b 12/10 → phiếu 6 buổi × 100k = 600k − bảo lưu 390k = 210k
  s.classJoinedAt["cls-b"] = "2026-10-12";
  clsB.studentIds = ["s1"];
  waiting.studentIds = [];
  s.status = "STUDYING" as any;
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const recvB = ledger.receivables.find((r) => r.classId === "cls-b" && r.status !== "CANCELLED");
  check("phiếu cls-b amountDue = 210k", recvB?.amountDue === 210_000, `got ${recvB?.amountDue}`);
  check("appliedCredits ghi 390k", recvB?.appliedCredits?.[0]?.creditId === "cred-preserved-s1-cls-a" && recvB?.appliedCredits?.[0]?.amount === 390_000);
  check("credit USED + remaining 0", ledger.credits.find((c) => c.id === "cred-preserved-s1-cls-a")?.status === "USED");

  // 5. Re-sync lặp: số liệu không đổi, credit không tái áp
  const before = JSON.stringify(ledger.receivables.map((r) => [r.id, r.amountDue, r.appliedCredits]));
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const after = JSON.stringify(ledger.receivables.map((r) => [r.id, r.amountDue, r.appliedCredits]));
  check("re-sync idempotent", before === after, `${before} vs ${after}`);

  // 6. Phiếu cls-a nguồn không bị credit áp ngược (sourceClassId chặn)
  const recvA = ledger.receivables.find((r) => r.classId === "cls-a");
  check("phiếu nguồn cls-a không có appliedCredits", !(recvA?.appliedCredits || []).length);
}

// ─── Kịch bản 2: đóng một phần → credit nhỏ → lớp mới thu ít hơn credit ──────
console.log("Kịch bản 2: đóng 300k/585k → credit 105k → phiếu mới 90k → dư 15k");
{
  const s = student("s2", { "cls-c": "2026-10-01" });
  const clsC = monthlyClass("cls-c", 65_000, ["s2"]);
  const clsD = monthlyClass("cls-d", 15_000, []);
  const waiting = waitingClass();
  let ledger = emptyLedger();
  const classes = [waiting, clsC, clsD];
  const students = [s];

  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  // Đóng tay một phần: ghi receipt 300k + receivable PARTIALLY_PAID
  const recv0 = ledger.receivables.find((r) => r.classId === "cls-c")!;
  ledger = {
    ...ledger,
    receivables: ledger.receivables.map((r) => r.id === recv0.id
      ? { ...r, amountPaid: 300_000, balanceDue: 285_000, status: "PARTIALLY_PAID" as const, frozenAt: "2026-10-05T00:00:00.000Z" }
      : r),
    receipts: [{
      id: "rcpt-1", receiptNumber: "PT-1", paymentId: "pay-1", studentId: "s2",
      amount: 300_000, issuedAt: "2026-10-05T00:00:00.000Z", status: "ISSUED" as const,
      method: "Chuyển khoản", note: "", classId: "cls-c", className: "CLS-C",
      billingPeriod: "Tháng 10/2026 · CLS-C", billingMode: "MONTHLY", studentName: "s2", studentCode: "S2",
    } as any],
    payments: [{ id: "pay-1", paymentCode: "X", studentId: "s2", bankTransactionId: "m", receivableId: recv0.id, amount: 300_000, allocatedAmount: 300_000, excessAmount: 0, status: "COMPLETED", paidAt: "2026-10-05T00:00:00.000Z", method: "Chuyển khoản", note: "" } as any],
  };

  clsC.studentIds = [];
  waiting.studentIds = ["s2"];
  s.classJoinedAt = { "cls-c": "2026-10-01", "class-waiting": "2026-10-11" };
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const credit = ledger.credits.find((c) => c.id === "cred-preserved-s2-cls-c");
  check("credit = 300k − 195k = 105k", credit?.amount === 105_000, `got ${credit?.amount}`);

  // Vào lớp mới giá thấp: phiếu 6 buổi × 15k = 90k < 105k → áp 90k, còn dư 15k
  s.classJoinedAt["cls-d"] = "2026-10-12";
  clsD.studentIds = ["s2"];
  waiting.studentIds = [];
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const recvD = ledger.receivables.find((r) => r.classId === "cls-d" && r.status !== "CANCELLED");
  check("phiếu cls-d = 0 (credit bao trọn)", recvD?.amountDue === 0 && recvD?.balanceDue === 0, `got ${recvD?.amountDue}`);
  check("phiếu cls-d PAID ngay", recvD?.status === "PAID", `got ${recvD?.status}`);
  // Dư 15k tiếp tục áp sang phiếu tháng 11 lập sẵn (kỳ đến hạn tiếp theo)
  const recvNov = ledger.receivables.find((r) => r.classId === "cls-d" && r !== recvD && r.status !== "CANCELLED");
  check("dư 15k áp sang phiếu T11", recvNov?.appliedCredits?.[0]?.amount === 15_000 && recvNov?.amountDue === 105_000, `got ${JSON.stringify(recvNov?.appliedCredits)}`);
  const credit2 = ledger.credits.find((c) => c.id === "cred-preserved-s2-cls-c");
  check("credit dùng hết 105k → USED", credit2?.status === "USED" && credit2?.remainingAmount === 0, `got ${credit2?.remainingAmount} ${credit2?.status}`);
}

// ─── Kịch bản 3: lớp nguồn trong luồng chuyển lớp → không sinh credit ────────
console.log("Kịch bản 3: có phiếu transfer|đích|nguồn → không tạo credit");
{
  const s = student("s3", { "cls-e": "2026-10-01" });
  const clsE = monthlyClass("cls-e", 65_000, []);
  const clsF = monthlyClass("cls-f", 65_000, ["s3"]);
  const waiting = waitingClass();
  let ledger = emptyLedger();
  ledger = {
    ...ledger,
    receipts: [{
      id: "rcpt-3", receiptNumber: "PT-3", paymentId: "pay-3", studentId: "s3",
      amount: 585_000, issuedAt: "2026-10-05T00:00:00.000Z", status: "ISSUED" as const,
      method: "Chuyển khoản", note: "", classId: "cls-e", className: "CLS-E",
      billingPeriod: "Tháng 10/2026 · CLS-E", billingMode: "MONTHLY", studentName: "s3", studentCode: "S3",
    } as any],
    receivables: [{
      id: "recv-t", receivableCode: "RC-1", studentId: "s3", studentName: "s3",
      billingPeriod: "Chênh lệch chuyển lớp", issueDate: "2026-10-10", dueDate: "2026-10-20",
      amountDue: -50_000, amountPaid: 0, balanceDue: -50_000, currency: "VND",
      status: "OPEN" as const, paymentOrderId: "po-t", classId: "cls-f",
      billKey: "transfer|cls-f|cls-e|2026-10",
    } as any],
    paymentOrders: [{ id: "po-t", receivableId: "recv-t", studentId: "s3", paymentCode: "T", amount: 0, qrUrl: "", status: "ACTIVE" as const, createdAt: "2026-10-10" } as any],
  };
  const classes = [waiting, clsE, clsF];
  ledger = syncTuitionReceivables(ledger, classes, [s], sessions, NOW);
  check("không có credit preserved cho lớp nguồn đã chuyển", !ledger.credits.some((c) => c.reason === "PRESERVED"));
}

// ─── Kịch bản 4: quay lại đúng lớp nguồn → credit chưa dùng bị thu hồi ───────
console.log("Kịch bản 4: quay lại đúng lớp nguồn → credit chưa dùng bị xóa");
{
  const s = student("s4", { "cls-g": "2026-10-01" });
  const clsG = monthlyClass("cls-g", 65_000, ["s4"]);
  const waiting = waitingClass();
  let ledger = emptyLedger();
  const classes = [waiting, clsG];
  const students = [s];
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  const collected = collectManualTuition({ ledger, student: s, cls: clsG, sessions, method: "TRANSFER", now: new Date(2026, 9, 5, 12) });
  if ("error" in collected) throw new Error(collected.error);
  ledger = collected.ledger;
  s.tuitionPaidThrough = { "cls-g": "2026-10" };
  clsG.studentIds = [];
  waiting.studentIds = ["s4"];
  s.classJoinedAt = { "cls-g": "2026-10-01", "class-waiting": "2026-10-11" };
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  check("credit tồn tại sau khi rời", ledger.credits.some((c) => c.id === "cred-preserved-s4-cls-g"));
  // Quay lại đúng lớp nguồn
  clsG.studentIds = ["s4"];
  waiting.studentIds = [];
  delete s.classJoinedAt["class-waiting"];
  ledger = syncTuitionReceivables(ledger, classes, students, sessions, NOW);
  check("credit chưa dùng bị thu hồi khi quay lại lớp", !ledger.credits.some((c) => c.id === "cred-preserved-s4-cls-g"));
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
