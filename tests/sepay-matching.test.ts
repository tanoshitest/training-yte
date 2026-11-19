import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMatch,
  defaultSepayLedger,
  emptySepayLedger,
  extractPaymentCode,
  generatePaymentCode,
  mergeSepayLedger,
  processBankTransaction,
  STEPS_TUITION_ACCOUNT,
  type SepayBankTransaction,
} from "../cloudflare/sepay-engine";


test("preserves an explicitly empty ledger instead of restoring demo transactions", () => {
  const ledger = mergeSepayLedger(emptySepayLedger());
  assert.equal(ledger.receivables.length, 0);
  assert.equal(ledger.paymentOrders.length, 0);
  assert.equal(ledger.bankTransactions.length, 0);
});

test("upgrades the truncated STEPS BIDV account to the official 10-digit number", () => {
  const stored = defaultSepayLedger();
  stored.settings = { ...stored.settings, ...STEPS_TUITION_ACCOUNT, accountNumber: "868683888" };
  const ledger = mergeSepayLedger(stored);
  assert.equal(ledger.settings.accountNumber, "8686838888");
});

test("uses the STEPS BIDV account and migrates legacy tuition QR codes", () => {
  const legacy = defaultSepayLedger();
  legacy.settings = { ...legacy.settings, bank: "970415", accountNumber: "105800030300", accountName: "NGUYEN TAN THANH" };
  const ledger = mergeSepayLedger(legacy);
  assert.deepEqual(
    { bank: ledger.settings.bank, accountNumber: ledger.settings.accountNumber, accountName: ledger.settings.accountName },
    STEPS_TUITION_ACCOUNT,
  );
  assert.ok(ledger.paymentOrders.every((order) => order.qrUrl.includes("/970418-8686838888-compact2.png")));
});

function tx(overrides: Partial<SepayBankTransaction> = {}): SepayBankTransaction {
  return {
    id: "btx-test",
    provider: "SEPAY",
    providerTransactionId: "92704",
    accountNumber: "0123456789",
    transactionDate: "2026-09-05T23:40:00.000Z",
    transferType: "IN",
    transferAmount: 2000,
    content: "HP8F4K92",
    status: "RECEIVED",
    receivedAt: "2026-09-05T23:40:01.000Z",
    ...overrides,
  };
}

test("extracts payment code and ignores personal names", () => {
  assert.equal(extractPaymentCode("CK HP8F4K92 ngan hang"), "HP8F4K92");
  assert.equal(extractPaymentCode("NGUYEN VAN AN HOC PHI THANG 9"), null);
});

test("every code generatePaymentCode produces round-trips through extractPaymentCode", () => {
  const used = new Set<string>();
  for (let i = 0; i < 1000; i += 1) {
    const code = generatePaymentCode(used);
    used.add(code);
    assert.equal(extractPaymentCode(`Chuyen khoan hoc phi ${code} thang 9`), code, `mã ${code} phải trích lại được nguyên vẹn`);
  }
});

test("exact payment allocates, creates receipt and queues invoice", () => {
  const result = processBankTransaction(defaultSepayLedger(), tx());
  assert.equal(result.transaction.status, "ALLOCATED");
  assert.equal(result.receivable?.status, "PAID");
  assert.equal(result.payment?.status, "COMPLETED");
  assert.ok(result.receipt);
  assert.equal(result.invoice?.status, "PENDING");
  assert.equal(result.event, "TuitionPaymentCompleted");
});

test("partial payment does not auto-issue invoice", () => {
  const result = processBankTransaction(defaultSepayLedger(), tx({ transferAmount: 1000 }));
  assert.equal(result.receivable?.status, "PARTIALLY_PAID");
  assert.equal(result.payment?.status, "PARTIAL");
  assert.equal(result.invoice, undefined);
});

test("overpayment stays in Needs Review by default", () => {
  const result = processBankTransaction(defaultSepayLedger(), tx({ transferAmount: 3000 }));
  assert.equal(result.transaction.status, "NEEDS_REVIEW");
  assert.equal(result.transaction.reviewReason, "OVERPAYMENT");
  assert.equal(result.payment, undefined);
});

test("missing code and outgoing transfer are not allocated", () => {
  assert.equal(processBankTransaction(defaultSepayLedger(), tx({ content: "CK hoc phi" })).transaction.status, "UNMATCHED");
  assert.equal(processBankTransaction(defaultSepayLedger(), tx({ transferType: "OUT" })).transaction.status, "IGNORED");
});

test("second transfer to an already paid receivable is not invoiced again", () => {
  const ledger = defaultSepayLedger();
  const first = applyMatch(ledger, processBankTransaction(ledger, tx()));
  assert.equal(first.receivables.find((row) => row.receivableCode === "HP8F4K92")?.status, "PAID");
  const paidAgain = processBankTransaction(first, tx({ id: "btx-3", providerTransactionId: "92705" }));
  assert.ok(paidAgain.transaction.status === "DUPLICATE" || paidAgain.transaction.reviewReason === "ALREADY_PAID");
  assert.equal(paidAgain.invoice, undefined);
});
