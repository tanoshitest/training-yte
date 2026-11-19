import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { financeRepository } from "../cloudflare/storage/finance-repository";
import { readBlock, writeBlock } from "../cloudflare/storage/relational-kv";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import type { TxClient } from "../cloudflare/storage/relational-table-sync";

/** Đo thời gian dựng lại từng nhóm dữ liệu, tách phần transaction và phần truy vấn. */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function measure(label: string, run: () => Promise<unknown>) {
  const times: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const started = Date.now();
    await run();
    times.push(Date.now() - started);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(44)} ${String(times[2])}ms (trung vị)`);
}

async function main() {
  await measure("students — có transaction RepeatableRead", () => readBlock(prisma, studentsRepository));
  await measure("students — không transaction", () => studentsRepository.read(prisma as unknown as TxClient));
  await measure("sessions — có transaction RepeatableRead", () => readBlock(prisma, sessionsRepository));
  await measure("sessions — không transaction", () => sessionsRepository.read(prisma as unknown as TxClient));
  await measure("finance — có transaction RepeatableRead", () => readBlock(prisma, financeRepository));
  await measure("finance — không transaction", () => financeRepository.read(prisma as unknown as TxClient));
  await measure("finance — chỉ đếm dòng biên lai", () => prisma.opsSepayReceipt.count());
  await measure("finance — đọc cấu hình SePay (có ảnh QR)", () => prisma.opsSepaySetting.findUnique({ where: { id: "sepay" } }));

  const finance = await readBlock(prisma, financeRepository);
  const students = await readBlock(prisma, studentsRepository);
  const sessions = await readBlock(prisma, sessionsRepository);
  await measure("finance — ghi lại y nguyên (không đổi gì)", () => writeBlock(prisma, financeRepository, finance!));
  await measure("students — ghi lại y nguyên (không đổi gì)", () => writeBlock(prisma, studentsRepository, students!));
  await measure("sessions — ghi lại y nguyên (không đổi gì)", () => writeBlock(prisma, sessionsRepository, sessions!));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
