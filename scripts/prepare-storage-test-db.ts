import "dotenv/config";

import { execFileSync } from "node:child_process";
import pg from "pg";

/**
 * Tạo database riêng cho test tầng lưu trữ quan hệ rồi áp dụng migration.
 * Test ghi và xóa dữ liệu thật nên không được dùng chung database làm việc.
 */

const target = process.env.STORAGE_TEST_DATABASE_URL
  ?? (process.env.DATABASE_URL ?? "").replace(/\/([^/?]+)(\?|$)/, "/stepslms_storage_test$2");
if (!target) throw new Error("Thiếu DATABASE_URL hoặc STORAGE_TEST_DATABASE_URL.");

const url = new URL(target);
const database = url.pathname.replace(/^\//, "");
const adminUrl = new URL(target);
adminUrl.pathname = "/postgres";

async function main() {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`Đã tạo database test ${database}.`);
  }
  await client.end();

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: target },
  });
  console.log(`Database test sẵn sàng: ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
