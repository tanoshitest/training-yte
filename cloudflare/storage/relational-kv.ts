import type { PrismaClient } from "../../src/generated/prisma/client";
import type { BlockRepository } from "./block-repository";
import { auditRepository, periodicReportsRepository } from "./audit-repository";
import { classesRepository } from "./classes-repository";
import { financeRepository } from "./finance-repository";
import { integrationSettingsRepository } from "./integration-settings-repository";
import { accountantsRepository, assistantsRepository, teachersRepository } from "./people-repository";
import { sessionsRepository } from "./sessions-repository";
import { settingsRepository } from "./settings-repository";
import { studentsRepository } from "./students-repository";
import { zaloMessageRepository } from "./zalo-message-repository";
import {
  ACTIVITY_ATTEMPTS_PREFIX,
  PROGRESS_PREFIX,
  STUDENT_STATE_PREFIX,
  readActivityAttempts,
  readProgress,
  readStudentState,
  writeActivityAttempts,
  writeProgress,
  writeStudentState,
} from "./student-portal-storage";
import type { TxClient } from "./relational-table-sync";

/** Bộ định tuyến không cần biết kiểu dữ liệu của từng nhóm, chỉ cần hợp đồng đọc/ghi. */
function register<T>(repository: BlockRepository<T>) {
  return repository as unknown as BlockRepository<never>;
}

/** Các nhóm dữ liệu đã chuyển sang bảng quan hệ. Khóa nào không có ở đây vẫn dùng kho JSON cũ. */
export const blockRepositories: BlockRepository<never>[] = [
  register(studentsRepository),
  register(classesRepository),
  register(sessionsRepository),
  register(financeRepository),
  register(teachersRepository),
  register(accountantsRepository),
  register(assistantsRepository),
  register(settingsRepository),
  register(auditRepository),
  register(periodicReportsRepository),
  register(integrationSettingsRepository),
  register(zaloMessageRepository),
];

const repositoryByKey = new Map(blockRepositories.map((repository) => [repository.key, repository]));

/** Kho JSON cũ (`vps_app_state`) cho các khóa chưa chuyển: `backup:*`, `migration:*`, `_health`. */
export interface LegacyKvStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  compareAndPut<T>(key: string, expected: string, value: T): Promise<boolean>;
}

export interface RelationalKv {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  compareAndPut(key: string, expected: string, value: string): Promise<boolean>;
  /** Phiên bản của các nhóm đã chuyển sang bảng — tăng mỗi lần ghi, để cache tính toán. */
  versions?(keys: string[]): Promise<Record<string, number>>;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Cờ đánh dấu các bước xử lý dữ liệu chạy đúng một lần của `worker.ts`. */
const MIGRATION_PREFIX = "migration:";
/** Khóa `worker.ts` đọc thử ở `/api/health` chỉ để biết database còn sống. */
const HEALTH_KEY = "_health";

/**
 * Đọc một nhóm dữ liệu. Mỗi repository dựng lại JSON bằng **đúng một câu lệnh SQL**,
 * mà một câu lệnh của PostgreSQL luôn chạy trên một ảnh chụp duy nhất, nên không cần
 * bọc transaction để tránh đọc phải trạng thái nửa vời.
 */
export async function readBlock<T>(prisma: PrismaClient, repository: BlockRepository<T>): Promise<T | null> {
  const block = await prisma.opsStorageBlock.findUnique({ where: { key: repository.key }, select: { key: true } });
  if (!block) return null;
  return repository.read(prisma as unknown as TxClient);
}

/** Khóa dòng phiên bản của nhóm dữ liệu, để hai lượt ghi cùng nhóm không chồng lên nhau. */
async function lockBlock(tx: TxClient, key: string) {
  const rows = await tx.$queryRaw<{ key: string }[]>`SELECT key FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
  return rows.length > 0;
}

async function bumpBlock(tx: TxClient, key: string, exists: boolean) {
  if (exists) await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
  else await tx.opsStorageBlock.create({ data: { key, version: 1 } });
}

export async function writeBlock<T>(prisma: PrismaClient, repository: BlockRepository<T>, value: T) {
  // Sync bảng quan hệ sau mỗi lần ghi có thể đụng hàng trăm dòng (phiếu, đơn QR)
  // — vượt timeout mặc định 5s của transaction tương tác. Nới lên 30s.
  await prisma.$transaction(async (tx) => {
    const exists = await lockBlock(tx as TxClient, repository.key);
    await bumpBlock(tx as TxClient, repository.key, exists);
    await repository.write(tx as TxClient, value);
  }, { timeout: 30_000, maxWait: 10_000 });
}

export function createRelationalKv(prisma: PrismaClient, legacy: LegacyKvStorage): RelationalKv {
  // JSON dựng lại từ bảng quan hệ tốn ~1s với nhóm lớn (sessions, finance) trong
  // khi mọi request — kể cả request ghi — đều đọc lại chúng. Version block tăng
  // ở mỗi lần ghi nên giữ bản đã serialize theo version là an toàn: ghi xong
  // thì version đổi, lần đọc sau tự trượt cache. Cache giữ chuỗi JSON chứ không
  // giữ object, nên chỗ gọi thoải mái mutate kết quả mà không làm bẩn cache.
  const blockCache = new Map<string, { version: number; serialized: string }>();
  return {
    async versions(keys: string[]) {
      const wanted = keys.filter((key) => repositoryByKey.has(key));
      if (!wanted.length) return {};
      const rows = await prisma.opsStorageBlock.findMany({ where: { key: { in: wanted } }, select: { key: true, version: true } });
      return Object.fromEntries(rows.map((row) => [row.key, row.version]));
    },

    async get<T>(key: string, type: "json"): Promise<T | null> {
      if (type !== "json") throw new Error("VPS adapter chỉ hỗ trợ KV JSON.");
      if (key === HEALTH_KEY) {
        // Chạm vào database để lỗi kết nối vẫn lộ ra đúng như kho cũ.
        await prisma.opsDataMigration.count();
        return null;
      }
      if (key.startsWith(MIGRATION_PREFIX)) {
        const row = await prisma.opsDataMigration.findUnique({ where: { key } });
        return (row?.ranAt as T | undefined) ?? null;
      }
      if (key.startsWith(PROGRESS_PREFIX)) {
        return await readProgress(prisma, key.slice(PROGRESS_PREFIX.length)) as T | null;
      }
      if (key.startsWith(ACTIVITY_ATTEMPTS_PREFIX)) {
        return await readActivityAttempts(prisma, key.slice(ACTIVITY_ATTEMPTS_PREFIX.length)) as T | null;
      }
      if (key.startsWith(STUDENT_STATE_PREFIX)) {
        return await readStudentState(prisma, key.slice(STUDENT_STATE_PREFIX.length)) as T | null;
      }
      const repository = repositoryByKey.get(key);
      if (!repository) return (await legacy.get<T>(key)) ?? null;
      const block = await prisma.opsStorageBlock.findUnique({ where: { key }, select: { version: true } });
      if (!block) return null;
      const hit = blockCache.get(key);
      if (hit && hit.version === block.version) return JSON.parse(hit.serialized) as T;
      const value = await repository.read(prisma as unknown as TxClient);
      const serialized = JSON.stringify(value);
      if (serialized !== undefined) blockCache.set(key, { version: block.version, serialized });
      return value as T;
    },

    async put(key: string, value: string) {
      if (key.startsWith(MIGRATION_PREFIX)) {
        const ranAt = String(JSON.parse(value) ?? "");
        await prisma.opsDataMigration.upsert({ where: { key }, create: { key, ranAt }, update: { ranAt } });
        return;
      }
      if (key.startsWith(PROGRESS_PREFIX)) {
        await writeProgress(prisma, key.slice(PROGRESS_PREFIX.length), JSON.parse(value));
        return;
      }
      if (key.startsWith(ACTIVITY_ATTEMPTS_PREFIX)) {
        await writeActivityAttempts(prisma, key.slice(ACTIVITY_ATTEMPTS_PREFIX.length), JSON.parse(value));
        return;
      }
      if (key.startsWith(STUDENT_STATE_PREFIX)) {
        await writeStudentState(prisma, key.slice(STUDENT_STATE_PREFIX.length), JSON.parse(value));
        return;
      }
      const repository = repositoryByKey.get(key);
      if (!repository) {
        await legacy.put(key, JSON.parse(value));
        return;
      }
      // Nhiều luồng ghi lại đúng nội dung đã đọc (đồng bộ phiếu không đổi, upsert
      // nguyên trạng…). Nếu chuỗi JSON trùng bản cache của version hiện tại thì
      // bảng quan hệ đang chứa đúng dữ liệu đó rồi — bỏ qua cả lượt ghi lẫn bump
      // version, version giữ nguyên nên các cache khác vẫn hợp lệ.
      const hit = blockCache.get(key);
      if (hit && hit.serialized === value) {
        const block = await prisma.opsStorageBlock.findUnique({ where: { key }, select: { version: true } });
        if (block?.version === hit.version) return;
      }
      await writeBlock(prisma, repository, JSON.parse(value));
    },

    /**
     * Giữ nguyên ngữ nghĩa chống xung đột của kho cũ: chỉ ghi khi nhóm dữ liệu vẫn
     * đúng bản mà chỗ gọi đã đọc. So sánh trên chính JSON dựng lại nên `expected`
     * do `worker.ts` truyền vào vẫn dùng được y như trước.
     */
    async compareAndPut(key: string, expected: string, value: string) {
      const repository = repositoryByKey.get(key);
      if (!repository) return legacy.compareAndPut(key, expected, JSON.parse(value));
      try {
        return await prisma.$transaction(async (tx) => {
          const exists = await lockBlock(tx as TxClient, key);
          // Đã khoá dòng version nên version đọc sau lock ổn định trong transaction.
          // Trùng version cache nghĩa là chuỗi JSON cache chính là nội dung hiện tại
          // — so `expected` với nó thay vì dựng lại toàn bộ bảng chỉ để so sánh.
          let current = "null";
          if (exists) {
            const block = await tx.opsStorageBlock.findUnique({ where: { key }, select: { version: true } });
            const hit = blockCache.get(key);
            current = hit && hit.version === block?.version
              ? hit.serialized
              : JSON.stringify(await repository.read(tx as TxClient));
          }
          if (current !== expected) return false;
          await bumpBlock(tx as TxClient, key, exists);
          await repository.write(tx as TxClient, JSON.parse(value));
          return true;
        }, { timeout: 30_000, maxWait: 10_000 });
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },
  };
}
