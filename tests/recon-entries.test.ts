import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { rebuildReconEntries, type DemoCashEntry, type DemoReconEntry } from "../cloudflare/finance-types";

const cashbook: DemoCashEntry[] = [
  { id: "cash-1", date: "2026-09-17", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí Tháng 09/2026", amount: 515_000, method: "Chuyển khoản", studentName: "Hạ An", receiptId: "rcpt-1" },
  { id: "cash-2", date: "2026-09-17", kind: "OUT", source: "MANUAL", category: "Văn phòng phẩm", description: "Mua giấy in", amount: 320_000, method: "Tiền mặt" },
];

const approved: DemoReconEntry = { entryId: "cash-1", status: "MATCHED", amount: 515_000, date: "2026-09-17", approvedAt: "2026-09-17T11:00:00.000Z", approvedBy: "Quản trị STEPS" };

test("mỗi nghiệp vụ thu chi có một dòng đối soát, mặc định chưa khớp", () => {
  const entries = rebuildReconEntries(cashbook);
  assert.deepEqual(entries.map((row) => [row.entryId, row.status]), [["cash-1", "PENDING"], ["cash-2", "PENDING"]]);
});

test("duyệt rồi thì giữ dấu đã khớp cùng người duyệt", () => {
  const entries = rebuildReconEntries(cashbook, [approved]);
  assert.equal(entries[0].status, "MATCHED");
  assert.equal(entries[0].approvedBy, "Quản trị STEPS");
  assert.equal(entries[1].status, "PENDING");
});

test("phiếu bị sửa số tiền hoặc ngày sau khi duyệt thì phải đối soát lại", () => {
  const edited = rebuildReconEntries([{ ...cashbook[0], amount: 600_000 }, cashbook[1]], [approved]);
  assert.equal(edited[0].status, "PENDING", "sửa số tiền thì mất dấu đã khớp");
  assert.equal(edited[0].approvedBy, undefined);

  const moved = rebuildReconEntries([{ ...cashbook[0], date: "2026-09-18" }, cashbook[1]], [approved]);
  assert.equal(moved[0].status, "PENDING", "đổi ngày thì mất dấu đã khớp");
});

test("phiếu đã xóa không còn dòng đối soát treo lại", () => {
  const entries = rebuildReconEntries([cashbook[1]], [approved]);
  assert.deepEqual(entries.map((row) => row.entryId), ["cash-2"]);
});

function loadReconPage() {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8")
    .replace(/\nbootstrap\(\);\s*$/, "")
    .concat("\nglobalThis.__reconTest = { state, reconPage, reconEntryRows };\n");
  const context = vm.createContext({
    console,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => {}, open: () => null },
    location: { pathname: "/ke-toan/doi-soat" },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    Intl,
    Date,
    URL,
    URLSearchParams,
  });
  vm.runInContext(source, context);
  const ui = (context as typeof context & {
    __reconTest: { state: Record<string, any>; reconPage: () => string; reconEntryRows: () => any[] };
  }).__reconTest;
  ui.state.data = {
    students: [],
    classes: [],
    user: { name: "Quản trị STEPS" },
    settings: { branches: [] },
    finance: { debts: [], cashbook, recon: [], reconEntries: rebuildReconEntries(cashbook), payroll: [], forecasts: [] },
  };
  return ui;
}

test("trang đối soát bỏ 4 thẻ tổng và cụm Đối soát theo ngày", () => {
  const html = loadReconPage().reconPage();
  assert.doesNotMatch(html, /class-summary-grid/);
  assert.doesNotMatch(html, /Đối soát theo ngày/);
  assert.doesNotMatch(html, /Khớp số thì Done/);
  assert.doesNotMatch(html, /Đánh lệch/);
});

test("bộ lọc chỉ còn Đã khớp và Chưa khớp", () => {
  const ui = loadReconPage();
  const html = ui.reconPage();
  assert.match(html, /<option value="PENDING"[^>]*>Chưa khớp<\/option>/);
  assert.match(html, /<option value="MATCHED"[^>]*>Đã khớp<\/option>/);
  assert.doesNotMatch(html, /Lệch số/);

  ui.state.reconStatus = "MATCHED";
  assert.match(ui.reconPage(), /Chưa có nghiệp vụ thu chi nào để đối soát/, "chưa duyệt phiếu nào thì lọc Đã khớp ra rỗng");
});

test("mỗi giao dịch có nút Duyệt riêng, duyệt rồi thì đổi thành icon hoàn tác", () => {
  const ui = loadReconPage();
  const pending = ui.reconPage();
  assert.equal(pending.match(/data-recon-approve="cash-[12]"/g)?.length, 2);
  assert.equal(pending.match(/Chưa khớp<\/span>/g)?.length, 2);
  assert.doesNotMatch(pending, /data-recon-undo=/);

  ui.state.data.finance.reconEntries = rebuildReconEntries(cashbook, [approved]);
  const afterApprove = ui.reconPage();
  assert.match(afterApprove, /data-recon-undo="cash-1"/);
  assert.match(afterApprove, /title="Hoàn tác duyệt"/);
  assert.match(afterApprove, /Đã duyệt: Quản trị STEPS/);
  assert.equal(afterApprove.match(/data-recon-approve="cash-2"/g)?.length, 1);
  assert.equal(afterApprove.match(/data-recon-approve=/g)?.length, 1, "phiếu đã duyệt không còn nút Duyệt");
});

test("hoàn tác đưa phiếu về trạng thái chưa khớp ban đầu", () => {
  const ui = loadReconPage();
  ui.state.data.finance.reconEntries = rebuildReconEntries(cashbook, [approved]);
  assert.equal(ui.reconEntryRows().find((row) => row.entry.id === "cash-1").matched, true);

  ui.state.data.finance.reconEntries = ui.state.data.finance.reconEntries.map((row: DemoReconEntry) => (
    row.entryId === "cash-1" ? { entryId: row.entryId, status: "PENDING", amount: row.amount, date: row.date } : row
  ));
  const row = ui.reconEntryRows().find((item) => item.entry.id === "cash-1");
  assert.equal(row.matched, false);
  assert.equal(row.approvedBy, "");
  assert.match(ui.reconPage(), /data-recon-approve="cash-1"/);
});

test("phiếu thu học phí và phiếu thủ công đều hiện ở đối soát", () => {
  const rows = loadReconPage().reconEntryRows();
  assert.deepEqual(rows.map((row) => row.entry.source).sort(), ["MANUAL", "TUITION"]);
});

test("duyệt và hoàn tác gọi endpoint riêng, không gửi lại toàn bộ sổ thu chi", () => {
  const source = fs.readFileSync(new URL("../cloudflare/public/app.js", import.meta.url), "utf8");
  assert.match(source, /api\(`\/api\/finance\/recon\/\$\{encodeURIComponent\(entryId\)\}`/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /expectedAmount:/);
  assert.match(source, /expectedDate:/);
});

test("API từ chối duyệt nếu số tiền hoặc ngày đã đổi", () => {
  const source = fs.readFileSync(new URL("../cloudflare/worker.ts", import.meta.url), "utf8");
  assert.match(source, /amount !== expectedAmount \|\| entry\.date !== expectedDate/);
  assert.match(source, /Không có dữ liệu nào bị ghi đè/);
});

test("VPS dùng compare-and-swap nguyên tử khi ghi khối tài chính", () => {
  const source = fs.readFileSync(new URL("../cloudflare/vps-server.ts", import.meta.url), "utf8");
  assert.match(source, /async compareAndPut/);
  assert.match(source, /where: \{ key: dbKey, updatedAt: current\.updatedAt \}/);
  assert.match(source, /return updated\.count === 1/);
});
