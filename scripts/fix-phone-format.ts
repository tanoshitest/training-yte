import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Sửa số điện thoại sai định dạng trong các bảng vận hành:
 *
 *   - 9 chữ số không bắt đầu bằng "0" (bị mất số 0 đầu, thường do import Excel)
 *     → thêm "0" vào đầu. Gồm cả dạng "84xxxxxxx" (9 số) = số 084x mất số 0,
 *     KHÔNG phải mã quốc gia (dạng đó phải 11 số "84xxxxxxxxx").
 *   - Giá trị lẫn khoảng trắng/chấm/gạch/ngoặc/"+" nhưng phần chữ số đã hợp lệ
 *     → ghi lại dạng sạch.
 *
 * Chỉ tự sửa khi giá trị gốc toàn số/ký tự phân tách; giá trị có chữ hoặc
 * phần số không suy ra được số hợp lệ (thiếu/thừa chữ số giữa chừng) thì
 * bỏ qua và in ra để tra tay — đoán sai SĐT = gọi nhầm người.
 *
 *   tsx scripts/fix-phone-format.ts            chạy sửa thật
 *   tsx scripts/fix-phone-format.ts --dry-run  chỉ xem trước
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const dryRun = process.argv.includes("--dry-run");

const TABLE_COLS: [string, string[]][] = [
  ["students", ["phone", "parentZalo", "parentPhone1", "parentPhone2"]],
  ["teachers", ["phone"]],
  ["accountants", ["phone"]],
  ["assistants", ["phone"]],
  ["center_settings", ["phone"]],
];

const digits = (s: string) => s.replace(/[^0-9]/g, "");
const onlySep = (s: string) => /^[\d\s.\-()+]+$/.test(s);

/** Trả số đã sửa, hoặc null nếu không cần/không dám sửa. */
function fix(raw: string): string | null {
  const trimmed = raw.trim();
  const d = digits(trimmed);
  if (/^[1-9]\d{8}$/.test(d) && onlySep(trimmed)) return `0${d}`; // thiếu số 0 đầu
  if (/^84\d{9}$/.test(d) && onlySep(trimmed)) return `0${d.slice(2)}`; // mã quốc gia -> nội địa
  if (/^0\d{9}$/.test(d) && trimmed !== d && onlySep(trimmed)) return d; // lẫn ký tự phân tách
  return null;
}

type Row = { id: string; code: string | null; value: string };

async function main() {
  const updates: { table: string; col: string; row: Row; fixed: string }[] = [];
  const skipped: { table: string; col: string; row: Row; digitsOnly: string }[] = [];

  for (const [table, cols] of TABLE_COLS) {
    const tableExists = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) n FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'`,
    );
    if (Number(tableExists[0].n) === 0) continue;

    const hasCode = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='code'`,
    );
    const selectCode = Number(hasCode[0].n) > 0 ? `"code"` : `NULL`;

    for (const col of cols) {
      const colExists = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${col}'`,
      );
      if (Number(colExists[0].n) === 0) continue;

      const rows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT "id", ${selectCode} AS "code", "${col}" AS "value" FROM "${table}" WHERE "${col}" IS NOT NULL AND btrim("${col}"::text) <> ''`,
      );
      for (const row of rows) {
        const fixed = fix(row.value);
        if (fixed !== null) updates.push({ table, col, row, fixed });
        else if (digits(row.value) !== row.value.trim() || !/^0\d{9}$/.test(digits(row.value)))
          skipped.push({ table, col, row, digitsOnly: digits(row.value) });
      }
    }
  }

  console.log(`=== ${dryRun ? "DRY-RUN — " : ""}SẼ SỬA ${updates.length} Ô ===`);
  for (const u of updates) {
    console.log(`${u.table}.${u.col}  ${u.row.code ?? u.row.id}  "${u.row.value}" -> "${u.fixed}"`);
  }

  console.log(`\n=== BỎ QUA, CẦN TRA TAY (${skipped.length}) ===`);
  for (const s of skipped) {
    console.log(`${s.table}.${s.col}  ${s.row.code ?? s.row.id}  "${s.row.value}" (digits: ${s.digitsOnly || "rỗng"})`);
  }

  if (dryRun) {
    console.log("\nDry-run: không ghi gì.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.$executeRawUnsafe(
        `UPDATE "${u.table}" SET "${u.col}" = $1 WHERE "id" = $2`,
        u.fixed,
        u.row.id,
      );
    }
  });
  console.log(`\nĐã cập nhật ${updates.length} ô.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
