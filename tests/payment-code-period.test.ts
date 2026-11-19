/** Mã CK HP{lớp}{kỳ}{HV} (28/10/2026): mỗi kỳ một mã, đối soát khớp đúng phiếu của kỳ đó. */
import assert from "node:assert/strict";
import test from "node:test";
import { billPaymentCode, billPeriodTag, emptySepayLedger, friendlyPaymentOrderCode, parseStudentPaymentCode } from "../cloudflare/sepay-engine";
import { syncTuitionReceivables } from "../cloudflare/tuition-billing";

test("định dạng mã: tháng T{m}, nợ cũ T9, khóa K{n}", () => {
  assert.equal(billPeriodTag("month|c|2026-11"), "T11");
  assert.equal(billPeriodTag("months|c|2026-09,2026-10"), "T10");
  assert.equal(billPeriodTag("olddebt|c|2026-09"), "T9");
  assert.equal(billPeriodTag("course|c|2"), "K2");
  assert.equal(billPeriodTag("course|c"), "K1");
  assert.equal(billPaymentCode({ code: "T1" }, { code: "HV0111" }, "month|c|2026-11"), "HPT1T11HV0111");
  assert.equal(billPaymentCode({ code: "S42" }, { code: "HV0536" }, "course|c|2"), "HPS42K2HV0536");
});

test("giải mã đúng lớp/kỳ kể cả mã lớp có chữ T: T1+T11 khác T11+T1", () => {
  const classes = [{ id: "c-t1", code: "T1", studentIds: ["s1"] }, { id: "c-t11", code: "T11", studentIds: ["s2"] }];
  const students = [{ id: "s1", code: "HV0111" }, { id: "s2", code: "HV0222" }];
  const a = parseStudentPaymentCode("HPT1T11HV0111", classes, students)!;
  assert.equal(a.cls?.id, "c-t1"); assert.equal(a.tag, "T11");
  const b = parseStudentPaymentCode("HPT11T1HV0222", classes, students)!;
  assert.equal(b.cls?.id, "c-t11"); assert.equal(b.tag, "T1");
  const old = parseStudentPaymentCode("HPT11HV0222", classes, students)!;
  assert.equal(old.cls?.id, "c-t11"); assert.equal(old.tag, "");
});

test("phiếu tạo mới mang mã theo kỳ; CK theo mã kỳ nào vào đúng phiếu kỳ đó, kỳ đã thu thì không đoán sang kỳ khác", () => {
  const cls: any = { id: "class-t1", code: "T1", name: "T1", status: "ACTIVE", studentIds: ["s1"], billingMode: "MONTHLY", sessionPrice: 50_000,
    schedules: [{ weekday: 1, startTime: "17:00", endTime: "19:00" }, { weekday: 3, startTime: "17:00", endTime: "19:00" }] };
  const st: any = { id: "s1", code: "HV0111", fullName: "A", status: "STUDYING", sessionBalances: {} };
  const ledger = syncTuitionReceivables(emptySepayLedger(), [cls], [st], [], new Date("2026-10-20T05:00:00Z"));
  const t10 = ledger.receivables.find((r) => r.billKey === "month|class-t1|2026-10")!;
  const t11 = ledger.receivables.find((r) => r.billKey === "month|class-t1|2026-11")!;
  const codeOf = (r: any) => ledger.paymentOrders.find((o) => o.id === r.paymentOrderId)!.paymentCode;
  assert.equal(codeOf(t10), "HPT1T10HV0111");
  assert.equal(codeOf(t11), "HPT1T11HV0111");
  assert.equal(friendlyPaymentOrderCode(ledger, "HPT1T10HV0111", [cls], [st], 1), "HPT1T10HV0111");
  assert.equal(friendlyPaymentOrderCode(ledger, "HPT1HV0111", [cls], [st], t11.balanceDue), "HPT1T11HV0111", "mã cũ không kỳ: khớp số tiền");
  const paidT11 = { ...ledger, receivables: ledger.receivables.map((r) => r.id === t11.id ? { ...r, status: "PAID" as const, balanceDue: 0, amountPaid: r.amountDue } : r) };
  // T11 đã thu, T10 còn nợ: CK theo mã T11 vào nợ cũ T10 (phiếu báo T11 in kèm nợ cũ).
  assert.equal(friendlyPaymentOrderCode(paidT11, "HPT1T11HV0111", [cls], [st], t11.amountDue), "HPT1T10HV0111");
  // Không bao giờ sang kỳ SAU kỳ trên mã: T10 + T11 đều đã thu → mã T10 không rơi vào phiếu khác.
  const allPaid = { ...paidT11, receivables: paidT11.receivables.map((r) => r.id === t10.id ? { ...r, status: "PAID" as const, balanceDue: 0, amountPaid: r.amountDue } : r) };
  assert.equal(friendlyPaymentOrderCode(allPaid, "HPT1T10HV0111", [cls], [st], 1), undefined);
  // Mã T11, chuyển đúng số nợ cũ T10 → vào T10; đúng số T11 → vào T11.
  assert.equal(friendlyPaymentOrderCode(ledger, "HPT1T11HV0111", [cls], [st], t10.balanceDue), "HPT1T10HV0111");
  assert.equal(friendlyPaymentOrderCode(ledger, "HPT1T11HV0111", [cls], [st], t11.balanceDue), "HPT1T11HV0111");
});

test("mã cũ không kỳ của phiếu đã thu (dùng lại QR tháng cũ) → Giao dịch lệch, không tự gạch tháng sau", async () => {
  const { processBankTransaction } = await import("../cloudflare/sepay-engine");
  const classes = [{ id: "c-t11", code: "T11", studentIds: ["s1"] }];
  const students = [{ id: "s1", code: "HV0717" }];
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      { id: "r10", studentId: "s1", studentName: "Tài", classId: "c-t11", billKey: "month|c-t11|2026-10", billingPeriod: "T10", currency: "VND", issueDate: "2026-10-04", dueDate: "2026-10-04", amountDue: 450000, amountPaid: 450000, balanceDue: 0, status: "PAID", paymentOrderId: "o10" },
      { id: "r11", studentId: "s1", studentName: "Tài", classId: "c-t11", billKey: "month|c-t11|2026-11", billingPeriod: "T11", currency: "VND", issueDate: "2026-10-06", dueDate: "2026-10-06", amountDue: 450000, amountPaid: 0, balanceDue: 450000, status: "OPEN", paymentOrderId: "o11" },
    ],
    paymentOrders: [
      { id: "o10", receivableId: "r10", studentId: "s1", paymentCode: "HPT11HV0717", amount: 450000, status: "PAID" },
      { id: "o11", receivableId: "r11", studentId: "s1", paymentCode: "HP2QX9AK", amount: 450000, status: "ACTIVE" },
    ],
  } as any;
  assert.equal(friendlyPaymentOrderCode(ledger, "HPT11HV0717", classes, students, 450000), undefined, "không quy sang phiếu T11");
  const res = processBankTransaction(ledger, { id: "tx", provider: "SEPAY", transferType: "IN", transferAmount: 450000, content: "8686838888 HPT11HV0717", transactionDate: "2026-11-07", status: "RECEIVED" } as any);
  assert.equal(res.transaction.status, "NEEDS_REVIEW");
  assert.equal(res.transaction.reviewReason, "ALREADY_PAID");
  // Mã cũ của phiếu còn mở vẫn khớp như trước.
  const open = { ...ledger, receivables: ledger.receivables.map((r: any) => r.id === "r10" ? { ...r, amountPaid: 0, balanceDue: 450000, status: "OPEN" } : r), paymentOrders: ledger.paymentOrders.map((o: any) => o.id === "o10" ? { ...o, status: "ACTIVE" } : o) };
  assert.equal(friendlyPaymentOrderCode(open, "HPT11HV0717", classes, students, 450000), "HPT11HV0717");
});
