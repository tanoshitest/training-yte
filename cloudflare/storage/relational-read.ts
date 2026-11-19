/**
 * Đường đọc của tầng quan hệ.
 *
 * Mỗi nhóm dữ liệu được đọc bằng **đúng một câu lệnh SQL**, gom các bảng con thành
 * những cột JSON riêng. Cách này giải quyết cùng lúc hai việc:
 *
 *  - **Nhất quán:** một câu lệnh là một ảnh chụp của PostgreSQL, nên không cần
 *    transaction để tránh đọc phải trạng thái nửa vời khi có người ghi xen vào.
 *  - **Tốc độ:** một lượt đi–về thay vì nhiều truy vấn tuần tự trên cùng một kết nối.
 *
 * PostgreSQL trả cột tiền `numeric` thành số JSON nên phía đọc không phải quy đổi
 * `Decimal` nữa. Việc dựng lại đối tượng vẫn làm bằng TypeScript để giữ **đúng thứ tự
 * khóa** mà `worker.ts` sinh ra — `worker.ts` so sánh thay đổi bằng `JSON.stringify`,
 * đổi thứ tự khóa là làm nhật ký đầy mục giả.
 */

/** `json_agg` trả NULL khi bảng rỗng. */
export function rowsOf<T>(value: unknown): T[] {
  return (value ?? []) as T[];
}

/** Gom các dòng bảng con theo khóa cha, giữ nguyên thứ tự đã sắp trong SQL. */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = groups.get(id);
    if (list) list.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}

/** Dựng `Record<string, V>` từ các dòng bảng con của một bản ghi cha. */
export function mapOf<T, V>(items: T[] | undefined, key: (item: T) => string, pick: (item: T) => V): Record<string, V> {
  const out: Record<string, V> = {};
  for (const item of items ?? []) out[key(item)] = pick(item);
  return out;
}
