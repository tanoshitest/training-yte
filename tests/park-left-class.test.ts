/**
 * Học viên về Lớp chờ (lớp thu tháng): chưa đóng thì ngắt phiếu và mang khoản
 * đã học + nợ cũ sang kỳ quay lại; đã đóng thì giữ phiếu, hoàn phần chưa học
 * và giảm doanh số theo buổi thực học.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  attachParkedCarry, parkLeftClassReceivables, parkedCarryAmount, syncTuitionReceivables, tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

const CLS_ID = "class-a";
const CLS_B_ID = "class-b";
const PRICE = 65_000;
const SEED_NOW = new Date("2026-11-01T05:00:00Z");
const LEAVE_ISO = "2026-11-08T05:00:00.000Z";

function student(id = "stu-a"): DemoStudent {
  return {
    id, code: "HV0100", fullName: "Học viên A", parentName: "", phone: "", address: "", school: "", parentZalo: "",
    status: "STUDYING", sessionBalances: {}, classJoinedAt: { [CLS_ID]: "2026-09-01" },
    // Đã đóng xong T9–T10 → chỉ còn phiếu tháng 11 trong sổ.
    tuitionPaidThrough: { [CLS_ID]: "2026-10" },
  } as unknown as DemoStudent;
}

function cls(id = CLS_ID, price = PRICE): DemoClass {
  return {
    id, code: id === CLS_ID ? "S1" : "S2", name: id === CLS_ID ? "S1-9.1-2012" : "S2-9.1-2012", classTypeId: "", branchId: "branch-test",
    teacherId: "t", roomId: "", syllabusId: "", status: "ACTIVE", studentIds: ["stu-a"], note: "",
    billingMode: "MONTHLY", sessionPrice: price, courseSessions: 24,
    schedules: [
      { weekday: 2, periodId: "p1", startTime: "17:00", endTime: "19:00" },
      { weekday: 5, periodId: "p2", startTime: "17:00", endTime: "19:00" },
    ],
  } as unknown as DemoClass;
}

/** 8 buổi tháng 11/2026 (T3 & T6); học viên đã lưu điểm danh 2 buổi đầu tháng. */
function novSessions(classId = CLS_ID) {
  return ["2026-11-03", "2026-11-06", "2026-11-10", "2026-11-13", "2026-11-17", "2026-11-20", "2026-11-24", "2026-11-27"]
    .map((date, index) => ({
      id: `sess-${classId}-${index}`, classId, teacherId: "t", date, startTime: "17:00", endTime: "19:00", status: "COMPLETED",
      attendance: date < "2026-11-08" ? [{ studentId: "stu-a", status: "PRESENT", assessmentScores: {}, note: "" }] : [],
    }));
}

function seeded() {
  const a = student();
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls()], [a], novSessions(), SEED_NOW);
  const bill = ledger.receivables.find((row) => row.studentId === a.id && row.classId === CLS_ID && row.status === "OPEN");
  assert.ok(bill, "phải lập phiếu tháng 11 trước khi rời lớp");
  assert.equal(bill.amountDue, 8 * PRICE);
  return { a, ledger, bill };
}

function paid(ledger: ReturnType<typeof emptySepayLedger>, receivableId: string, amount: number) {
  return {
    ...ledger,
    receivables: ledger.receivables.map((row) => (
      row.id === receivableId
        ? { ...row, amountPaid: amount, balanceDue: Math.max(0, row.amountDue - amount), status: amount >= row.amountDue ? "PAID" as const : "PARTIALLY_PAID" as const }
        : row
    )),
  };
}

test("chưa đóng đồng nào: ngắt phiếu, mang phần đã học sang Lớp chờ", () => {
  const { a, ledger, bill } = seeded();
  const result = parkLeftClassReceivables(ledger, a, cls(), novSessions(), LEAVE_ISO);
  const parked = result.ledger.receivables.find((row) => row.id === bill.id)!;
  assert.equal(parked.status, "CANCELLED");
  assert.equal(parked.balanceDue, 0);
  assert.equal(parked.amountDue, 2 * PRICE, "chỉ còn tiền 2 buổi đã học");
  assert.equal(parked.leftClass?.deductionSessions, 6, "6 buổi chưa học bị cắt");
  assert.equal(parked.leftClass?.carryAmount, 2 * PRICE);
  assert.equal(result.carried, 2 * PRICE);
  assert.deepEqual(result.refunds, [], "chưa đóng tiền thì không có phiếu chi hoàn");
  const order = result.ledger.paymentOrders.find((row) => row.receivableId === bill.id)!;
  assert.equal(order.status, "CANCELLED", "mã QR của phiếu bị ngắt cũng hủy");
  // Lặp lại không nhân đôi khoản mang sang.
  const again = parkLeftClassReceivables(result.ledger, a, cls(), novSessions(), LEAVE_ISO);
  assert.equal(again.ledger, result.ledger);
  assert.equal(again.carried, 0);
});

test("đã đóng đủ: giữ phiếu, hoàn phần chưa học và giảm doanh số theo buổi thực học", () => {
  const { a, ledger, bill } = seeded();
  const paidLedger = paid(ledger, bill.id, 8 * PRICE);
  const result = parkLeftClassReceivables(paidLedger, a, cls(), novSessions(), LEAVE_ISO);
  const kept = result.ledger.receivables.find((row) => row.id === bill.id)!;
  assert.equal(kept.status, "PAID");
  assert.equal(kept.leftClass?.refundAmount, 6 * PRICE);
  assert.deepEqual(kept.leftClass?.revenue, { billed: 8, consumed: 2, actual: 2 * PRICE, reduction: 6 * PRICE });
  assert.deepEqual(result.refunds.map((row) => row.amount), [6 * PRICE]);
  assert.equal(result.carried, 0);
});

test("đóng một phần đủ phần thực học: hoàn phần dư, không còn nợ", () => {
  const { a, ledger, bill } = seeded();
  const paidLedger = paid(ledger, bill.id, 200_000);
  const result = parkLeftClassReceivables(paidLedger, a, cls(), novSessions(), LEAVE_ISO);
  const kept = result.ledger.receivables.find((row) => row.id === bill.id)!;
  assert.equal(kept.status, "PAID");
  assert.equal(kept.amountDue, 2 * PRICE);
  assert.equal(kept.balanceDue, 0);
  assert.equal(kept.leftClass?.refundAmount, 200_000 - 2 * PRICE);
  assert.deepEqual(result.refunds.map((row) => row.amount), [200_000 - 2 * PRICE]);
  assert.equal(result.carried, 0);
});

test("nợ cũ còn mở cũng được mang sang cùng phần đã học", () => {
  const { a, ledger, bill } = seeded();
  const withOldDebt = {
    ...ledger,
    receivables: [
      { ...ledger.receivables[0], id: "olddebt-1", billKey: `olddebt|${CLS_ID}|2026-10`, amountDue: 455_000, balanceDue: 455_000, status: "OPEN" as const },
      ...ledger.receivables,
    ],
  };
  const result = parkLeftClassReceivables(withOldDebt, a, cls(), novSessions(), LEAVE_ISO);
  const oldDebt = result.ledger.receivables.find((row) => row.id === "olddebt-1")!;
  assert.equal(oldDebt.status, "CANCELLED");
  assert.equal(oldDebt.leftClass?.carryAmount, 455_000);
  assert.equal(result.carried, 2 * PRICE + 455_000, "buổi đã học tháng 11 + nợ cũ");
  const month = result.ledger.receivables.find((row) => row.id === bill.id)!;
  assert.equal(month.leftClass?.carryAmount, 2 * PRICE);
});

test("quay lại lớp: khoản mang sang vào phiếu tháng của lớp đích, phần sau ngày vào tính giá lớp đích", () => {
  const { a, ledger } = seeded();
  const parked = parkLeftClassReceivables(ledger, a, cls(), novSessions(), LEAVE_ISO).ledger;
  assert.equal(parkedCarryAmount(a.id, CLS_ID, { months: ["2026-11"] }, parked), 0, "chưa gắn vào kỳ nào thì chưa cộng");
  const attached = attachParkedCarry(parked, [{ studentId: a.id, classId: CLS_ID, month: "2026-11" }]).ledger;
  assert.equal(parkedCarryAmount(a.id, CLS_ID, { months: ["2026-11"] }, attached), 2 * PRICE);
  assert.equal(parkedCarryAmount(a.id, CLS_ID, { months: ["2026-12"] }, attached), 0);

  const rejoin = { ...student(), classJoinedAt: { [CLS_ID]: "2026-11-08" } };
  const quote = tuitionCollectionCharge(rejoin, cls(), novSessions(), attached, new Date(LEAVE_ISO));
  assert.deepEqual(quote.months, ["2026-11"]);
  assert.equal(quote.oldDebtAmount, 2 * PRICE);
  assert.equal(quote.oldDebtLabel, "Nợ cũ từ Lớp chờ");
  // 6 buổi còn lại của tháng 11 theo giá lớp A + 2 buổi đã học trước khi nghỉ.
  assert.equal(quote.amount, 6 * PRICE + 2 * PRICE);
});

test("quay lại lớp khác: giữ giá lớp cũ cho phần đã học, phần còn lại tính giá lớp mới", () => {
  const { a, ledger } = seeded();
  const parked = parkLeftClassReceivables(ledger, a, cls(), novSessions(), LEAVE_ISO).ledger;
  const attached = attachParkedCarry(parked, [{ studentId: a.id, classId: CLS_B_ID, month: "2026-11" }]).ledger;
  const target = { ...cls(CLS_B_ID, 60_000), studentIds: ["stu-a"] };
  const rejoin = { ...student(), classJoinedAt: { [CLS_B_ID]: "2026-11-08" } };
  const quote = tuitionCollectionCharge(rejoin, target, novSessions(CLS_B_ID), attached, new Date(LEAVE_ISO));
  assert.equal(quote.oldDebtAmount, 2 * PRICE, "phần đã học giữ giá lớp A");
  assert.equal(quote.amount, 6 * 60_000 + 2 * PRICE);
});

test("quay lại lớp: khoản mang sang từ phiếu nợ cũ không bị cộng thêm vá nợ cũ", () => {
  // Lớp T2 có vá nợ cũ 400k cho HV0567 tháng 10. Phiếu nợ cũ đã bị ngắt lúc về
  // Lớp chờ (CANCELLED) nên là khoản đang gửi — không được cộng lại lần nữa.
  const t2 = "class-import-t2";
  const t2Student = {
    ...student("stu-t2"), code: "HV0567",
    classJoinedAt: { [t2]: "2026-09-01" }, tuitionPaidThrough: { [t2]: "2026-09" },
  } as unknown as DemoStudent;
  const t2Class = { ...cls(t2), code: "T2", name: "T2-9.1-2012", studentIds: ["stu-t2"] };
  const carried = {
    ...emptySepayLedger(),
    receivables: [{
      id: "recv-olddebt", receivableCode: "HP-OLD", studentId: "stu-t2", studentName: "Học viên T2",
      billingPeriod: "Nợ cũ", issueDate: "2026-09-01", dueDate: "2026-09-10",
      amountDue: 455_000, amountPaid: 0, balanceDue: 0, currency: "VND", status: "CANCELLED" as const,
      paymentOrderId: "", classId: t2, billKey: `olddebt|${t2}|2026-09`,
      leftClass: {
        at: LEAVE_ISO, billedSessions: 0, consumedSessions: 0, deductionSessions: 0, deductionAmount: 0,
        carryAmount: 455_000, carryTarget: { classId: t2, month: "2026-10" },
      },
    }],
  } as ReturnType<typeof emptySepayLedger>;
  const quote = tuitionCollectionCharge(t2Student, t2Class as DemoClass, [], carried, new Date("2026-10-05T05:00:00Z"));
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.oldDebtAmount, 455_000, "nợ cũ chỉ tính một lần qua khoản mang sang");
  assert.equal(quote.oldDebtLabel, "Nợ cũ từ Lớp chờ");
});

test("rời lớp đã tất toán: không tạo thêm bảo lưu tín dụng cho cặp lớp cũ", () => {
  const { a, ledger, bill } = seeded();
  const paidLedger = paid(ledger, bill.id, 8 * PRICE);
  const parked = parkLeftClassReceivables(paidLedger, a, cls(), novSessions(), LEAVE_ISO).ledger;
  const remSource = { ...cls(), studentIds: [] };
  const synced = syncTuitionReceivables(parked, [remSource], [a], novSessions(), SEED_NOW);
  assert.equal(
    synced.credits.filter((row) => row.reason === "PRESERVED" && row.studentId === a.id && row.sourceClassId === CLS_ID).length,
    0,
    "tiền hoàn không được biến thành tín dụng bảo lưu",
  );
});
