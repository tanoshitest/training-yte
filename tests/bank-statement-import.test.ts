import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";
import { extractStatementRows, processBankStatement, statementFingerprint } from "../cloudflare/bank-statement";

function testStudent(overrides: Partial<DemoStudent> = {}): DemoStudent {
  return {
    id: "student-test",
    code: "HV0001",
    fullName: "Học viên kiểm thử",
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING",
    sessionBalances: { "class-test": 10 },
    ...overrides,
  };
}

function monthlyClass(): DemoClass {
  return {
    id: "class-test",
    code: "TEST",
    name: "Lớp kiểm thử",
    classTypeId: "class-standard",
    branchId: "branch-test",
    teacherId: "teacher-test",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["student-test"],
    schedules: [
      { weekday: 1, periodId: "period-monday", startTime: "17:00", endTime: "19:00" },
      { weekday: 3, periodId: "period-wednesday", startTime: "14:30", endTime: "16:30" },
    ],
    note: "",
    billingMode: "MONTHLY",
    sessionPrice: 100_000,
    courseSessions: 24,
  };
}

/** Ledger đang có phiếu T10 (800k — mã HPTESTHV0001) + phiếu T11 lập sẵn (900k — mã sinh riêng). */
function ledgerWithTwoBills() {
  const cls = monthlyClass();
  const student = testStudent();
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [student], [], new Date("2026-10-20T12:00:00Z"));
  const oct = ledger.receivables.find((row) => row.billKey === `month|${cls.id}|2026-10`)!;
  const octCode = ledger.paymentOrders.find((row) => row.id === oct.paymentOrderId)!.paymentCode;
  return { cls, student, ledger, oct, octCode };
}

function sheetRow(date: string, amount: number | string, content: string): unknown[] {
  return ["", date, "", amount, "", content];
}

test("extractStatementRows chỉ lấy dòng giao dịch: B=ngày, D=ghi có, F=nội dung", () => {
  const rows = extractStatementRows([
    ["STT", "Ngày giao dịch", "Ghi nợ", "Ghi có", "Số dư", "Nội dung"],
    sheetRow("16/09/2026 18:45:59", "1,600,000", "TKThe :02 Nguyễn thị thanh"),
    sheetRow("16/09/2026 18:17:27", 613_000, "8686838881 nguyễn thị Tuyết"),
    ["", "", "", "", "", "Tổng cộng"],
    sheetRow("", 500_000, "dòng thiếu ngày bị loại"),
    sheetRow("16/09/2026 19:00:00", "", "dòng không có tiền bị loại"),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 1_600_000);
  assert.equal(rows[1].content, "8686838881 nguyễn thị Tuyết");
});

test("nội dung có mã HP… khớp đúng số tiền → ghi nhận phiếu, sinh biên lai", () => {
  const { student, ledger, oct, octCode } = ledgerWithTwoBills();
  const rows = extractStatementRows([sheetRow("20/10/2026 10:00:00", 800_000, `PH nop ${octCode} hoc phi`)]);
  const outcome = processBankStatement(ledger, [student], rows, new Date("2026-10-20T12:00:00Z"));
  assert.equal(outcome.rows[0].result, "APPLIED");
  assert.equal(outcome.completed.length, 1);
  const octAfter = outcome.ledger.receivables.find((row) => row.id === oct.id);
  assert.equal(octAfter?.status, "PAID");
  assert.equal(octAfter?.balanceDue, 0);
  assert.equal(outcome.ledger.receipts.length, 1, "sinh phiếu thu trong cập nhật thu chi");
  const tx = outcome.ledger.bankTransactions.find((item) => item.provider === "BANK_IMPORT");
  assert.equal(tx?.content, `PH nop ${octCode} hoc phi`, "giao dịch giữ nội dung gốc trên sao kê");
});

test("chỉ có mã HV + đúng số tiền một phiếu → thu đúng phiếu đó", () => {
  const { student, ledger, oct } = ledgerWithTwoBills();
  const rows = extractStatementRows([sheetRow("20/10/2026 10:00:00", 800_000, "Phu huynh nop hoc phi HV0001")]);
  const outcome = processBankStatement(ledger, [student], rows, new Date("2026-10-20T12:00:00Z"));
  assert.equal(outcome.rows[0].result, "APPLIED");
  assert.equal(outcome.ledger.receivables.find((row) => row.id === oct.id)?.status, "PAID");
  const nov = outcome.ledger.receivables.find((row) => row.billKey === `month|class-test|2026-11`);
  assert.equal(nov?.status, "OPEN", "phiếu T11 vẫn mở — chỉ thu phiếu khớp số tiền");
});

test("chỉ có mã HV + tiền đúng tổng nợ → thu hết các phiếu đang mở", () => {
  const { student, ledger } = ledgerWithTwoBills();
  const rows = extractStatementRows([sheetRow("20/10/2026 10:00:00", 1_700_000, "ck het no HV0001")]);
  const outcome = processBankStatement(ledger, [student], rows, new Date("2026-10-20T12:00:00Z"));
  assert.equal(outcome.rows[0].result, "APPLIED");
  const open = outcome.ledger.receivables.filter((row) => row.status === "OPEN" || row.status === "PARTIALLY_PAID");
  assert.equal(open.length, 0, "hai phiếu đều đã thu");
  assert.equal(outcome.ledger.receipts.length, 2, "mỗi phiếu một biên lai");
  const fps = outcome.ledger.bankTransactions.map((tx) => tx.providerTransactionId);
  assert.ok(fps.some((id) => id.endsWith("#1")) && fps.some((id) => id.endsWith("#2")), "mỗi phiếu một dòng giao dịch con");
});

test("mã HV nhưng số tiền không khớp phiếu nào → bỏ qua", () => {
  const { student, ledger } = ledgerWithTwoBills();
  const rows = extractStatementRows([sheetRow("20/10/2026 10:00:00", 500_000, "nop HV0001")]);
  const outcome = processBankStatement(ledger, [student], rows, new Date("2026-10-20T12:00:00Z"));
  assert.equal(outcome.rows[0].result, "AMOUNT_MISMATCH");
  assert.match(outcome.rows[0].detail || "", /1\.700\.000/);
  assert.equal(outcome.ledger.receipts.length, 0);
});

test("nội dung không có mã nào, mã HV lạ, hoặc học viên hết nợ → bỏ qua đúng lý do", () => {
  const { student, ledger } = ledgerWithTwoBills();
  const rows = extractStatementRows([
    sheetRow("20/10/2026 10:00:00", 800_000, "TKThe :02 Nguyen thi thanh"),
    sheetRow("20/10/2026 10:05:00", 800_000, "nop HV9999"),
    sheetRow("20/10/2026 10:10:00", 800_000, "nop HV0002"),
  ]);
  const rich = testStudent({ id: "student-rich", code: "HV0002", fullName: "Học viên hết nợ" });
  const outcome = processBankStatement(ledger, [student, rich], rows, new Date("2026-10-20T12:00:00Z"));
  assert.equal(outcome.rows[0].result, "NO_CODE");
  assert.equal(outcome.rows[1].result, "NO_STUDENT");
  assert.equal(outcome.rows[2].result, "NO_RECEIVABLE");
});

test("upload trùng: cùng dòng trong file và cùng file lần hai đều bỏ qua", () => {
  const { student, ledger } = ledgerWithTwoBills();
  const dup = sheetRow("20/10/2026 10:00:00", 800_000, "ck HV0001");
  const first = processBankStatement(ledger, [student], extractStatementRows([dup, dup]), new Date("2026-10-20T12:00:00Z"));
  assert.equal(first.rows[0].result, "APPLIED");
  assert.equal(first.rows[1].result, "DUPLICATE", "dòng lặp trong cùng file bị chặn");
  const second = processBankStatement(first.ledger, [student], extractStatementRows([dup]), new Date("2026-10-21T12:00:00Z"));
  assert.equal(second.rows[0].result, "DUPLICATE", "upload lại file cũ không ghi nhận lần hai");
  assert.equal(second.ledger.receipts.length, first.ledger.receipts.length);
});

test("fingerprint giống nhau cho cùng một dòng sao kê", () => {
  const a = statementFingerprint("16/09/2026 18:45:59", 613_000, "TKThe :02   Nguyễn thị thanh");
  const b = statementFingerprint("16/09/2026 18:45:59", 613_000, "  tkthe :02 NGUYỄN THỊ THANH  ");
  assert.equal(a, b);
});

test("mã HP của phiếu đã thanh toán → báo trùng thay vì thu lại", () => {
  const { student, ledger, oct, octCode } = ledgerWithTwoBills();
  const paid = processBankStatement(ledger, [student], extractStatementRows([
    sheetRow("20/10/2026 10:00:00", 800_000, `nop ${octCode}`),
  ]), new Date("2026-10-20T12:00:00Z"));
  assert.equal(paid.ledger.receivables.find((row) => row.id === oct.id)?.status, "PAID");
  const again = processBankStatement(paid.ledger, [student], extractStatementRows([
    sheetRow("21/10/2026 09:00:00", 800_000, `nop ${octCode} lan hai`),
  ]), new Date("2026-10-21T12:00:00Z"));
  assert.equal(again.rows[0].result, "DUPLICATE");
});
