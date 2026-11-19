/**
 * "Thế hệ dữ liệu": số tăng mỗi khi có thể có dữ liệu đổi (request ghi, ghi khối lưu trữ,
 * việc chạy nền). Bộ nhớ đệm dựng sẵn (vd /api/bootstrap) chỉ dùng khi thế hệ chưa đổi.
 * Tăng thừa chỉ làm dựng lại sớm hơn — không bao giờ sai dữ liệu; tăng thiếu mới nguy hiểm,
 * nên mọi đường ghi (kể cả compareAndPut không ghi được) đều tăng.
 */
let generation = 0;

export function currentDataGeneration(): number {
  return generation;
}

const listeners = new Set<() => void>();

/** Nghe mỗi lần thế hệ tăng (vd để dựng sẵn bootstrap sau lượt ghi). Trả về hàm huỷ nghe. */
export function onDataGenerationBump(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function bumpDataGeneration(): void {
  generation += 1;
  for (const listener of listeners) {
    try { listener(); } catch { /* người nghe lỗi không được chặn lượt ghi */ }
  }
}

type WritableKv = {
  put?: (...args: never[]) => Promise<unknown>;
  delete?: (...args: never[]) => Promise<unknown>;
  compareAndPut?: (...args: never[]) => Promise<unknown>;
};

/** Bọc kho khoá–giá trị: mọi lần put / delete / compareAndPut đều tăng thế hệ (trước và sau khi ghi). */
const tracked = new WeakSet<object>();

export function trackKvWrites<T extends object>(kv: T): T {
  if (!kv || tracked.has(kv)) return kv;
  tracked.add(kv);
  const target = kv as T & WritableKv;
  for (const method of ["put", "delete", "compareAndPut"] as const) {
    const original = target[method];
    if (typeof original !== "function") continue;
    (target as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      bumpDataGeneration();
      try {
        return await (original as (...input: unknown[]) => Promise<unknown>).apply(kv, args);
      } finally {
        bumpDataGeneration();
      }
    };
  }
  return kv;
}
