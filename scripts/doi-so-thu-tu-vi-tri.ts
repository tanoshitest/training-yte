/**
 * Đánh số lại cột thứ tự (`position`) của các bảng đang dồn sát biên Int4 (anh Mori 17/11/2026).
 *
 * Lỗi: bản cũ của relational-table-sync cấp số thứ tự mới bằng cách đếm lùi từ 2.147.483.647,
 * nên mỗi lần thêm dòng vào CUỐI bảng (phiếu, biên lai, giao dịch…) phải đánh số lại cả bảng —
 * nhập sao kê UPDATE ~12.000 dòng, quá 30 giây → lỗi P2028, vòng quay quay mãi.
 * Code mới chỉ cần đánh số lại MỘT lần (giãn cách 1024) — script này làm việc đó trước khi
 * deploy để lần ghi đầu tiên sau deploy không phải gánh 12.000 UPDATE trong giới hạn 30 giây.
 *
 * - Chỉ bảng có số thứ tự lớn nhất > 1 tỷ (dồn sát biên). Giữ nguyên THỨ TỰ (sắp theo position cũ),
 *   không đổi nội dung nào khác → dữ liệu đọc ra y hệt (script tự so học phí, học viên, lớp, buổi học, giáo viên trước/sau).
 * - Khoá toàn bộ storage_blocks trong lúc chạy để không đụng lượt ghi của app.
 * Mặc định DRY-RUN. APPLY=1 mới ghi.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { teachersRepository } from "../cloudflare/storage/people-repository";

const REPOS: Array<[string, any]> = [["học phí", financeRepository], ["học viên", studentsRepository], ["lớp", classesRepository], ["buổi học", sessionsRepository], ["giáo viên", teachersRepository]];
const snapshot = async (client: any) => Promise.all(REPOS.map(async ([, repo]) => JSON.stringify(await repo.read(client))));

const APPLY = process.env.APPLY === "1";
const PINNED = 1_000_000_000;
const GAP = 1024;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

(async () => {
  const tables: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.columns WHERE column_name = 'position' AND table_schema = current_schema() ORDER BY 1`,
  );
  const targets: Array<{ name: string; rows: number; min: number; max: number }> = [];
  for (const { table_name: name } of tables) {
    const [stat]: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS rows, coalesce(min(position),0)::bigint AS min, coalesce(max(position),0)::bigint AS max FROM "${name}"`);
    const row = { name, rows: Number(stat.rows), min: Number(stat.min), max: Number(stat.max) };
    const pinned = row.max > PINNED;
    console.log(`${pinned ? "→ ĐÁNH LẠI" : "  giữ     "} ${name.padEnd(28)} ${String(row.rows).padStart(6)} dòng · position ${row.min} … ${row.max}`);
    if (pinned) targets.push(row);
  }
  if (!targets.length) { console.log("\nKhông bảng nào dồn sát biên — không cần làm gì."); await prisma.$disconnect(); return; }
  if (targets.some((row) => (row.rows - 1) * GAP > 2_147_483_647)) throw new Error("Bảng quá lớn cho giãn cách 1024 — dừng.");

  const before = await snapshot(prisma);
  if (!APPLY) { console.log(`\n${targets.length} bảng sẽ được đánh số lại (thứ tự giữ nguyên).\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)`); await prisma.$disconnect(); return; }

  await prisma.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(`SELECT key FROM storage_blocks FOR UPDATE`);
    for (const { name } of targets) {
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "${name}" t SET position = s.rn * ${GAP} FROM (SELECT ctid AS id, (row_number() OVER (ORDER BY position, ctid) - 1) AS rn FROM "${name}") s WHERE t.ctid = s.id`,
      );
      console.log(`  ${name}: ${updated} dòng`);
    }
    const after = await snapshot(tx);
    REPOS.forEach(([label], index) => { if (after[index] !== before[index]) throw new Error(`Dữ liệu ${label} đọc ra khác trước — huỷ, chưa ghi gì.`); });
  }, { timeout: 300_000, maxWait: 30_000 });
  console.log("\nĐÃ GHI xong — dữ liệu học phí, học viên, lớp, buổi học, giáo viên đọc ra y hệt trước.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
