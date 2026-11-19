import test from "node:test";
import assert from "node:assert/strict";
import { nextReceiptNumber } from "../cloudflare/sepay-engine";

test("số biên lai mới không trùng sau khi xoá một biên lai giữa dãy", () => {
  const now = new Date("2026-10-28T10:00:00+07:00");
  const rows = [1, 2, 4, 5].map((n) => ({ receiptNumber: `PT-202610-${String(n).padStart(6, "0")}` })) as any[];
  assert.equal(nextReceiptNumber(rows, now), "PT-202610-000006");
  assert.equal(nextReceiptNumber([], now), "PT-202610-000001");
});
