/**
 * Đặt số giờ dạy cam kết/tháng (committedHours) hàng loạt cho đúng các mã trong GIO.
 * Mặc định DRY-RUN: chỉ in bảng cũ → mới. APPLY=1 mới ghi. Ghi có điều kiện (đổi giữa chừng thì từ chối).
 *   GIO='GV0001=78.5,GV0005=156'   (mã nhân sự = số giờ cam kết)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
(async () => {
  const wanted = new Map<string, number>();
  for (const part of String(process.env.GIO || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [code, value] = part.split("=");
    const n = Number(value);
    if (!code || !Number.isFinite(n) || n <= 0 || n > 744) throw new Error(`Số giờ không hợp lệ: ${part}`);
    wanted.set(code.trim().toUpperCase(), n);
  }
  if (!wanted.size) throw new Error("Thiếu GIO");
  const key = `kv:${encodeURIComponent("payroll-config:steps-demo")}`;
  const row = await prisma.vpsAppState.findUnique({ where: { key }, select: { value: true, updatedAt: true } });
  const config: any = JSON.parse(JSON.stringify(row?.value ?? {}));
  const people: any[] = [];
  for (const table of ["teachers", "accountants", "assistants"]) {
    const rows: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id, code, "fullName" FROM ${table}`);
    people.push(...rows);
  }
  const byCode = new Map(people.map((p) => [String(p.code).toUpperCase(), p]));
  let changed = 0;
  for (const [code, coef] of wanted) {
    const person = byCode.get(code);
    const contract = person ? config.teachers?.[person.id] : null;
    if (!person || !contract) { console.log(`✘ ${code}: không thấy nhân sự hoặc chưa có hồ sơ lương — bỏ qua`); continue; }
    const old = contract.committedHours;
    console.log(`${old === coef ? "=" : "→"} ${code} ${person.fullName}: ${old} → ${coef}`);
    if (old !== coef) { contract.committedHours = coef; changed += 1; }
  }
  if (process.env.APPLY !== "1") { console.log(`\nDRY-RUN: ${changed} người sẽ đổi. Thêm APPLY=1 để ghi.`); await prisma.$disconnect(); return; }
  const done = await prisma.vpsAppState.updateMany({ where: { key, updatedAt: row!.updatedAt }, data: { value: config } });
  console.log(done.count === 1 ? `\nĐÃ GHI ${changed} giờ cam kết.` : "\nKHÔNG GHI: cấu hình lương vừa bị đổi, chạy lại.");
  await prisma.$disconnect();
})();
