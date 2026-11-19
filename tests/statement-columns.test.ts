/** Sao kê BIDV gốc (không xóa cột): tự tìm cột ngày / ghi có / nội dung theo tiêu đề. */
import assert from "node:assert/strict";
import test from "node:test";
import { extractStatementRows, remapStatementColumns } from "../cloudflare/bank-statement";

const read = (rows: unknown[][]) => extractStatementRows(remapStatementColumns(rows).rows);

test("bố cục BIDV gốc: dòng tiêu đề phía dưới phần thông tin tài khoản, cột Ghi nợ / Ghi có tách riêng", () => {
  const rows = [
    ["NGÂN HÀNG TMCP ĐẦU TƯ VÀ PHÁT TRIỂN VIỆT NAM"],
    ["SAO KÊ TÀI KHOẢN", "", "", "Từ ngày 26/10/2026 đến ngày 26/10/2026"],
    ["Số tài khoản: 8686838888"],
    [],
    ["STT", "Ngày giao dịch", "Ngày hiệu lực", "Số tham chiếu", "Ghi nợ", "Ghi có", "Số dư", "Nội dung giao dịch"],
    [1, "26/10/2026 07:20:41", "26/10/2026", "FT1", "", "1,560,000", "10,000,000", "HPS24HV0324 FT2629"],
    [2, "26/10/2026 08:00:00", "26/10/2026", "FT2", "11,000", "", "9,989,000", "Phi dich vu"],
    ["", "Tổng cộng", "", "", "11,000", "1,560,000", "", ""],
  ];
  const map = remapStatementColumns(rows);
  assert.equal(map.detected, true);
  assert.deepEqual(map.columns, { date: 1, credit: 5, content: 7, debit: 4 });
  const out = read(rows);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].date, out[0].amount, out[0].content], ["26/10/2026 07:20:41", 1_560_000, "HPS24HV0324 FT2629"]);
  assert.equal(out[1].amount, 0, "tiền ra → 0, không thành tiền vào");
  assert.equal(extractStatementRows(map.rows, true)[1].amount, -11_000, "đọc cột ghi nợ → tiền ra số âm (ghi khoản chi)");
  assert.equal(out[0].line, 6, "số dòng giữ đúng dòng Excel");
});

test("tiêu đề 2 tầng: Số tiền → Ghi nợ | Ghi có; cột Diễn giải", () => {
  const rows = [
    ["STT", "Ngày GD", "Số tiền", "", "Số dư", "Diễn giải"],
    ["", "", "Ghi nợ", "Ghi có", "", ""],
    [1, "26/10/2026 16:29:00", "", 1_560_000, 5_000_000, "8686838888 HPS36HV0474"],
  ];
  const map = remapStatementColumns(rows);
  assert.deepEqual(map.columns, { date: 1, credit: 3, content: 5, debit: 2 });
  const out = read(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, 1_560_000);
});

test("file đã xóa cột như trước (B/D/F) và file 'Tải kết quả' vẫn đọc đúng; vân tay dòng không đổi", () => {
  const original = [
    ["STT", "Ngày giao dịch", "Ngày hiệu lực", "Ghi nợ", "Ghi có", "Nội dung"],
    [1, "26/10/2026 07:20:41", "26/10/2026", "", 1_560_000, "HPS24HV0324 FT2629"],
  ];
  const trimmed = [
    ["STT", "Ngày giao dịch", "Ghi nợ", "Ghi có", "Số dư", "Nội dung"],
    [1, "26/10/2026 07:20:41", "", 1_560_000, "", "HPS24HV0324 FT2629"],
  ];
  const exported = [
    ["Dòng", "Ngày GD", "", "Số tiền", "", "Nội dung", "Kết quả", "Chi tiết", "Gợi ý"],
    [2, "26/10/2026 07:20:41", "", 1_560_000, "", "HPS24HV0324 FT2629", "Ghi nhận khớp", "", ""],
  ];
  const noHeader = [["", "26/10/2026 07:20:41", "", 1_560_000, "", "HPS24HV0324 FT2629"]];
  const fps = [original, trimmed, exported, noHeader].map((rows) => read(rows).map((row) => row.fingerprint));
  for (const list of fps) assert.equal(list.length, 1);
  assert.ok(fps.every((list) => list[0] === fps[0][0]), "cùng một giao dịch → cùng vân tay dù file sắp cột khác nhau");
});

test("dòng từng nhập qua file 'Tải kết quả' (mã phiếu chèn đầu nội dung, ngày thiếu giây) → file BIDV gốc nhận là đã nhập", async () => {
  const { looseStatementKey, statementDateIso } = await import("../cloudflare/bank-statement");
  const injected = looseStatementKey(String(statementDateIso("26/10/2026 20:08") || "").slice(0, 16), 1_560_000, "HPY5ZJEQ TKThe :104882563658| tai ICBVVNVX. TRAN THI DUNG Chuyen tien-0200970415", true);
  const raw = looseStatementKey(String(statementDateIso("26/10/2026 20:08:33") || "").slice(0, 16), 1_560_000, "TKThe :104882563658| tai ICBVVNVX. TRAN THI DUNG Chuyen tien-0200970415");
  assert.equal(injected, raw);
  // Dòng mới giữ nguyên mã đầu nội dung: 2 anh em CK cùng phút, cùng tiền, khác mã → không trùng.
  assert.notEqual(looseStatementKey("2026-10-26T13:00", 1, "HPS24HV0324 hoc phi"), looseStatementKey("2026-10-26T13:00", 1, "HPS24HV0325 hoc phi"));
});

test("2 anh em chuyển cùng phút, cùng số tiền, nội dung chỉ khác mã QR ở đầu → cả 2 đều được nhập", async () => {
  const { processBankStatement } = await import("../cloudflare/bank-statement");
  const { emptySepayLedger } = await import("../cloudflare/sepay-engine");
  const rows = read([
    ["STT", "Ngày giao dịch", "Phát sinh có", "Diễn giải"],
    [1, "26/10/2026 09:00:10", 1_560_000, "HPS24HV0324 hoc phi"],
    [2, "26/10/2026 09:00:40", 1_560_000, "HPS24HV0325 hoc phi"],
  ]);
  const first = processBankStatement(emptySepayLedger(), [], [rows[0]], new Date(), [], { queueUnmatched: true });
  const second = processBankStatement(first.ledger, [], [rows[1]], new Date(), [], { queueUnmatched: true });
  assert.notEqual(second.rows[0].result, "DUPLICATE");
});
