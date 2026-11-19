import type { Prisma } from "../../src/generated/prisma/client";

export type TxClient = Prisma.TransactionClient;

/** Giá trị Decimal của Prisma trả về dạng đối tượng; quy về number đồng. */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

/** Như `money` nhưng giữ lại `null` cho trường có thể vắng mặt. */
export function optionalMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toString());
}

/** Thêm khóa vào đối tượng chỉ khi có giá trị — dùng để dựng lại JSON có trường tùy chọn. */
export function withOptional<T extends object>(base: T, extras: Record<string, unknown>): T {
  const out = base as Record<string, unknown>;
  for (const [key, value] of Object.entries(extras)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out as T;
}

export type Row = Record<string, unknown>;

/** Delegate tối thiểu của Prisma mà bộ đồng bộ cần. Mỗi repository ép kiểu một lần. */
export interface RowDelegate {
  createMany(args: { data: Row[] }): Promise<unknown>;
  update(args: { where: Row; data: Row }): Promise<unknown>;
  deleteMany(args: { where: Row }): Promise<unknown>;
}

export interface TableSync {
  /** Tên bảng trong database. Dùng cho cả câu lệnh đọc lẫn báo cáo. */
  name: string;
  delegate: RowDelegate;
  /** Các cột tạo nên khóa chính, đúng thứ tự khai báo trong schema. */
  keyFields: string[];
  /** Các dòng dựng từ JSON mới. */
  rows: Row[];
  /**
   * Cột số nguyên giữ thứ tự dòng trong mảng JSON (đọc `ORDER BY`), không nằm trong
   * `keyFields`. Khi khai báo, bộ đồng bộ giữ nguyên giá trị đã lưu cho các dòng vẫn
   * đúng thứ tự tương đối — nên thêm/xoá ở đầu mảng không đánh lại số (và UPDATE)
   * toàn bộ bảng như trước.
   */
  orderField?: string;
  /**
   * Các cột xác định nhóm mà `orderField` chỉ cần tăng dần bên trong (ví dụ
   * `attendances` sắp theo `sessionId`). Ranh giới nhóm nới lỏng điều kiện giữ
   * giá trị cũ, tránh đánh lại số giữa các nhóm vốn độc lập nhau.
   */
  orderGroup?: string[];
}

export interface SyncReport {
  table: string;
  created: number;
  updated: number;
  deleted: number;
}

function rowKey(row: Row, keyFields: string[]) {
  return keyFields.map((field) => String(row[field])).join("\u0000");
}

function uniqueWhere(row: Row, keyFields: string[]): Row {
  if (keyFields.length === 1) return { [keyFields[0]]: row[keyFields[0]] };
  const value: Row = {};
  for (const field of keyFields) value[field] = row[field];
  return { [keyFields.join("_")]: value };
}

function matchWhere(row: Row, keyFields: string[]): Row {
  const value: Row = {};
  for (const field of keyFields) value[field] = row[field];
  return value;
}

/**
 * So sánh dòng cũ và dòng mới. Cột tiền đọc từ DB là đối tượng Decimal còn dòng mới
 * là number, nên cả hai phải quy về cùng một dạng chuỗi; nếu không thì mọi dòng có
 * cột tiền đều bị coi là đã đổi và lượt ghi nào cũng cập nhật lại toàn bộ bảng.
 */
function canonical(row: Row, columns: string[]) {
  return JSON.stringify(columns.map((column) => {
    const value = row[column];
    if (value === null || value === undefined) return null;
    if (typeof value === "object" || typeof value === "number") return String(value);
    return value;
  }));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/**
 * Đọc trạng thái hiện tại của tất cả các bảng trong nhóm bằng **một câu lệnh**, để phép
 * so sánh trước khi ghi chỉ tốn một lượt đi–về thay vì một lượt cho mỗi bảng.
 * Tên bảng là hằng do chính repository khai báo, không đến từ dữ liệu người dùng.
 */
async function currentRows(tx: TxClient, tables: TableSync[]): Promise<Row[][]> {
  const columns = tables.map((table, index) => `(SELECT json_agg(x) FROM "${table.name}" x) AS "t${index}"`);
  const [result] = await tx.$queryRawUnsafe<Record<string, Row[] | null>[]>(`SELECT ${columns.join(", ")}`);
  return tables.map((_, index) => result[`t${index}`] ?? []);
}

/**
 * Ghi đúng phần thay đổi của một nhóm bảng: xóa dòng biến mất (bảng con trước),
 * thêm dòng mới (bảng cha trước), cập nhật dòng đã đổi. Gọi trong một transaction.
 */
/** Biên của cột Int4 PostgreSQL — giá trị thứ tự phải nằm trong khoảng này. */
const INT4_MAX = 2147483647;
const INT4_MIN = -2147483648;
/** Khoảng cách khi buộc phải đánh số lại cả nhóm — chừa chỗ chèn giữa về sau. */
const POSITION_GAP = 1024;

/**
 * Gán cột thứ tự sao cho dòng đã lưu GIỮ NGUYÊN giá trị cũ nhiều nhất có thể; chỉ
 * dòng mới (hoặc dòng đổi chỗ) nhận giá trị mới, lấy trong khoảng trống giữa hai
 * dòng giữ nguyên kề nó. Thêm vào cuối / đầu mảng → chỉ INSERT đúng dòng đó.
 *
 * Bản cũ cấp số mới bằng cách đếm lùi từ INT4_MAX: dòng thêm vào CUỐI mảng chiếm
 * INT4_MAX−1, đẩy dòng cuối cũ (đang giữ INT4_MAX−1) phải đổi số, dây chuyền tới
 * toàn bộ bảng → mỗi lần nhập sao kê UPDATE ~12.000 dòng (13 giây trên máy thử,
 * quá 30 giây trên VPS → transaction hết hạn, nhập sao kê quay mãi — 17/11/2026).
 *
 * Dòng giữ số cũ = dãy con tăng dài nhất của các số đã lưu (O(n log n)).
 *
 * Nhóm (`orderGroup`): đọc ra sắp theo khoá nhóm rồi tới thứ tự, nên chỉ cần tăng
 * dần trong từng nhóm — mỗi đoạn liên tiếp cùng nhóm xử lý riêng.
 */
function orderedRows(table: TableSync, existing: Row[]): Row[] {
  const orderField = table.orderField;
  if (!orderField || table.keyFields.includes(orderField)) return table.rows;
  if (!table.rows.every((row) => orderField in row)) return table.rows;
  const stored = new Map<string, number>();
  for (const row of existing) {
    const position = Number(row[orderField]);
    if (Number.isInteger(position)) stored.set(rowKey(row, table.keyFields), position);
  }
  const groupOf = table.orderGroup?.length
    ? (row: Row) => table.orderGroup!.map((field) => String(row[field])).join("\u0000")
    : () => "";
  const positions = new Array<number>(table.rows.length);
  let start = 0;
  while (start < table.rows.length) {
    let end = start + 1;
    const group = groupOf(table.rows[start]);
    while (end < table.rows.length && groupOf(table.rows[end]) === group) end += 1;
    assignSegment(table, stored, start, end, positions);
    start = end;
  }
  let touched = false;
  const out = table.rows.map((row, index) => {
    if (positions[index] === row[orderField]) return row;
    touched = true;
    return { ...row, [orderField]: positions[index] };
  });
  return touched ? out : table.rows;
}

function assignSegment(table: TableSync, stored: Map<string, number>, start: number, end: number, positions: number[]) {
  const kept = new Array<number | undefined>(end - start);
  // Giữ số cũ cho DÃY CON TĂNG DÀI NHẤT (theo thứ tự mảng) của các số đã lưu: một dòng
  // bị dời chỗ (vd chuyển xuống cuối) chỉ làm đổi số đúng dòng đó, không kéo theo cả bảng.
  const olds: Array<{ index: number; value: number }> = [];
  for (let index = start; index < end; index += 1) {
    const old = stored.get(rowKey(table.rows[index], table.keyFields));
    if (old !== undefined) olds.push({ index: index - start, value: old });
  }
  const tails: number[] = [];
  const prev = new Array<number>(olds.length).fill(-1);
  for (let item = 0; item < olds.length; item += 1) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (olds[tails[mid]].value < olds[item].value) low = mid + 1; else high = mid;
    }
    if (low > 0) prev[item] = tails[low - 1];
    tails[low] = item;
  }
  for (let item = tails.length ? tails[tails.length - 1] : -1; item >= 0; item = prev[item]) {
    kept[olds[item].index] = olds[item].value;
  }
  // Dòng chưa có số: lấp vào khoảng trống giữa hai dòng giữ nguyên kề bên.
  let ok = true;
  let index = 0;
  while (index < kept.length && ok) {
    if (kept[index] !== undefined) { positions[start + index] = kept[index]!; index += 1; continue; }
    let runEnd = index;
    while (runEnd < kept.length && kept[runEnd] === undefined) runEnd += 1;
    const count = runEnd - index;
    const lo = index > 0 ? kept[index - 1] : undefined;
    const hi = runEnd < kept.length ? kept[runEnd] : undefined;
    let first: number;
    if (lo === undefined && hi === undefined) first = 0;
    else if (lo === undefined) first = hi! - count;
    else first = lo + 1;
    const last = first + count - 1;
    if (first < INT4_MIN || last > INT4_MAX || (hi !== undefined && last >= hi)) { ok = false; break; }
    for (let step = 0; step < count; step += 1) positions[start + index + step] = first + step;
    index = runEnd;
  }
  if (ok) return;
  // Hết chỗ (dồn sát biên Int4 hoặc chèn giữa hai số liền nhau): đánh số lại cả đoạn
  // một lần, cách nhau POSITION_GAP để các lần thêm sau chỉ còn INSERT.
  for (let step = 0; step < end - start; step += 1) positions[start + step] = step * POSITION_GAP;
}

export async function syncTables(tx: TxClient, tables: TableSync[]): Promise<SyncReport[]> {
  const existingRows = await currentRows(tx, tables);
  const plans = tables.map((table, index) => {
    const existing = existingRows[index];
    const rows = orderedRows(table, existing);
    const existingByKey = new Map(existing.map((row) => [rowKey(row, table.keyFields), row]));
    const created: Row[] = [];
    const updated: Row[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = rowKey(row, table.keyFields);
      seen.add(key);
      const before = existingByKey.get(key);
      const columns = Object.keys(row);
      if (!before) created.push(row);
      else if (canonical(before, columns) !== canonical(row, columns)) updated.push(row);
    }
    const deleted = existing.filter((row) => !seen.has(rowKey(row, table.keyFields)));
    return { table, created, updated, deleted };
  });

  for (const plan of [...plans].reverse()) {
    if (!plan.deleted.length) continue;
    for (const part of chunks(plan.deleted, 500)) {
      await plan.table.delegate.deleteMany({ where: { OR: part.map((row) => matchWhere(row, plan.table.keyFields)) } });
    }
  }
  for (const plan of plans) {
    for (const part of chunks(plan.created, 1000)) {
      await plan.table.delegate.createMany({ data: part });
    }
  }
  for (const plan of plans) {
    for (const row of plan.updated) {
      await plan.table.delegate.update({ where: uniqueWhere(row, plan.table.keyFields), data: row });
    }
  }

  return plans.map((plan) => ({
    table: plan.table.name,
    created: plan.created.length,
    updated: plan.updated.length,
    deleted: plan.deleted.length,
  }));
}
