import type { SyncReport, TxClient } from "./relational-table-sync";

/**
 * Một nhóm dữ liệu (tương ứng một khóa KV cũ) được đọc/ghi qua các bảng quan hệ.
 * `read` phải dựng lại **đúng** cấu trúc JSON mà `cloudflare/worker.ts` mong đợi,
 * kể cả thứ tự phần tử trong mảng và các trường tùy chọn vắng mặt.
 */
export interface BlockRepository<T> {
  /** Khóa KV mà repository phụ trách, ví dụ "students:steps-demo". */
  readonly key: string;
  read(tx: TxClient): Promise<T>;
  write(tx: TxClient, value: T): Promise<SyncReport[]>;
}
