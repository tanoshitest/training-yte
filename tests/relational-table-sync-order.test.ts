import test from "node:test";
import assert from "node:assert/strict";
import { syncTables } from "../cloudflare/storage/relational-table-sync";

/** tx giả: chỉ đủ cho syncTables (đọc hiện trạng 1 câu + ghi qua delegate), đếm số câu ghi. */
function fakeTx(existing: Record<string, unknown>[]) {
  const calls = { created: 0, updated: 0, deleted: 0 };
  const delegate = {
    createMany: async ({ data }: { data: unknown[] }) => { calls.created += data.length; },
    update: async () => { calls.updated += 1; },
    deleteMany: async () => { calls.deleted += 1; },
  };
  const tx = { $queryRawUnsafe: async () => [{ t0: existing }] };
  return { tx, delegate, calls };
}
const rows = (ids: string[], positions?: number[]) => ids.map((id, index) => ({ id, position: positions ? positions[index] : index, note: "x" }));

test("thêm dòng vào CUỐI bảng có số thứ tự sát INT4_MAX: chỉ INSERT dòng mới, không đánh số lại cả bảng", async () => {
  const n = 3000;
  const ids = Array.from({ length: n }, (_, i) => `r${i}`);
  const existing = rows(ids, ids.map((_, i) => 2147483647 - n + i));
  const { tx, delegate, calls } = fakeTx(existing);
  const next = [...existing, { id: "new1", position: 0, note: "x" }, { id: "new2", position: 0, note: "x" }];
  await syncTables(tx as never, [{ name: "t", delegate: delegate as never, keyFields: ["id"], orderField: "position", rows: next }]);
  // Hết chỗ phía trên → đánh số lại đúng MỘT lần (giãn cách), các lần sau chỉ còn INSERT.
  assert.equal(calls.created, 2);
  const spaced = rows([...ids, "new1", "new2"], [...ids, "new1", "new2"].map((_, i) => i * 1024));
  const second = fakeTx(spaced);
  await syncTables(second.tx as never, [{ name: "t", delegate: second.delegate as never, keyFields: ["id"], orderField: "position", rows: [...spaced, { id: "new3", position: 0, note: "x" }] }]);
  assert.deepEqual(second.calls, { created: 1, updated: 0, deleted: 0 });
});

test("thêm vào ĐẦU và CUỐI mảng: dòng cũ giữ nguyên số, không UPDATE", async () => {
  const existing = rows(["a", "b", "c"], [0, 1024, 2048]);
  const { tx, delegate, calls } = fakeTx(existing);
  await syncTables(tx as never, [{ name: "t", delegate: delegate as never, keyFields: ["id"], orderField: "position", rows: [{ id: "z", position: 0, note: "x" }, ...existing, { id: "d", position: 0, note: "x" }] }]);
  assert.deepEqual(calls, { created: 2, updated: 0, deleted: 0 });
});

test("thứ tự đọc lại vẫn đúng sau khi chèn đầu / giữa / cuối", async () => {
  const existing = rows(["a", "b", "c"], [0, 1024, 2048]);
  const captured: Record<string, unknown>[] = [];
  const { tx, delegate } = fakeTx(existing);
  (delegate as any).createMany = async ({ data }: { data: Record<string, unknown>[] }) => { captured.push(...data); };
  const updates: Record<string, unknown>[] = [];
  (delegate as any).update = async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); };
  const next = [{ id: "z" }, { id: "a" }, { id: "m" }, { id: "b" }, { id: "c" }, { id: "d" }].map((row) => ({ ...row, position: 0, note: "x" }));
  await syncTables(tx as never, [{ name: "t", delegate: delegate as never, keyFields: ["id"], orderField: "position", rows: next }]);
  const final = new Map(existing.map((row) => [row.id, row.position as number]));
  for (const row of [...captured, ...updates]) final.set(String(row.id), Number(row.position));
  const order = [...final.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  assert.deepEqual(order, ["z", "a", "m", "b", "c", "d"]);
  assert.equal(updates.length, 0);
});

test("một dòng bị dời xuống cuối: chỉ dòng đó đổi số", async () => {
  const ids = Array.from({ length: 500 }, (_, i) => `r${i}`);
  const existing = rows(ids, ids.map((_, i) => i * 1024));
  const { tx, delegate, calls } = fakeTx(existing);
  const moved = [...existing.slice(1), existing[0]];
  await syncTables(tx as never, [{ name: "t", delegate: delegate as never, keyFields: ["id"], orderField: "position", rows: moved }]);
  assert.deepEqual(calls, { created: 0, updated: 1, deleted: 0 });
});
