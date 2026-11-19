/**
 * Chuyển Stephen từ danh sách Kế toán sang Giáo viên (anh Mori 12/11/2026).
 * - Giữ nguyên id (accountant-fdfc72b7-…) để hợp đồng lương, chấm công giữ liên kết.
 * - Mã mới: GV kế tiếp. Đăng nhập vẫn "stephen" + mật khẩu 123456789 (DEFAULT_PASSWORD_TEACHER_IDS ở worker).
 * - Không đụng dữ liệu khác. Mặc định DRY-RUN; APPLY=1 mới ghi. Dừng nếu dữ liệu khác mô tả.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { accountantsRepository, teachersRepository } from "../cloudflare/storage/people-repository";

const STEPHEN_ID = "accountant-fdfc72b7-9fed-4186-9dda-98838d37688b";
const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fail = (msg: string): never => { throw new Error(msg); };
const login = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9]/g, "").toLowerCase();

(async () => {
  const keys = ["accountants:steps-demo", "teachers:steps-demo"];
  const versionsAtRead = await prisma.opsStorageBlock.findMany({ where: { key: { in: keys } }, select: { key: true, version: true } });
  if (versionsAtRead.length !== keys.length) fail(`Thiếu storage_blocks cho ${keys.join(", ")}`);
  const accountants: any[] = await (accountantsRepository as any).read(prisma);
  const teachers: any[] = await (teachersRepository as any).read(prisma);
  const stephen = accountants.find((row) => row.id === STEPHEN_ID) ?? fail("Không thấy Stephen trong danh sách kế toán (có thể đã chuyển rồi).");
  if (login(stephen.fullName) !== "stephen") fail(`Tên không khớp: ${stephen.fullName}`);
  if (teachers.some((row) => row.id === STEPHEN_ID)) fail("Đã có giáo viên trùng id — dừng.");
  if (teachers.some((row) => login(row.fullName) === "stephen")) fail("Đã có giáo viên tên đăng nhập stephen — dừng.");
  const maxCode = Math.max(0, ...teachers.map((row) => Number(/^GV(\d+)$/.exec(String(row.code || ""))?.[1] || 0)));
  const code = `GV${String(maxCode + 1).padStart(4, "0")}`;
  const teacher = { id: stephen.id, code, fullName: stephen.fullName, phone: stephen.phone || "", address: stephen.address || "", email: stephen.email || "", assignedClasses: [] as string[] };
  const nextAccountants = accountants.filter((row) => row.id !== STEPHEN_ID);
  const nextTeachers = [...teachers, teacher];
  console.log(`Kế toán: ${accountants.length} → ${nextAccountants.length} (bỏ ${stephen.code} ${stephen.fullName})`);
  console.log(`Giáo viên: ${teachers.length} → ${nextTeachers.length} (thêm ${code} ${teacher.fullName}, id giữ nguyên)`);
  if (!APPLY) { console.log("\n(DRY-RUN — chưa ghi gì. Chạy lại với APPLY=1 để ghi.)"); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx: any) => {
    for (const { key, version } of versionsAtRead) {
      const rows = await tx.$queryRaw`SELECT version FROM storage_blocks WHERE key = ${key} FOR UPDATE`;
      if (!rows.length || Number(rows[0].version) !== version) throw new Error(`Dữ liệu ${key} vừa thay đổi — chưa ghi gì, hãy chạy lại.`);
      await tx.opsStorageBlock.update({ where: { key }, data: { version: { increment: 1 } } });
    }
    await (teachersRepository as any).write(tx, nextTeachers);
    await (accountantsRepository as any).write(tx, nextAccountants);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log("\nĐÃ GHI: Stephen đã sang Giáo viên.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DỪNG:", e.message); await prisma.$disconnect(); process.exit(1); });
