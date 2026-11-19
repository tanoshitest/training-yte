import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 bắt buộc dùng driver adapter.
 * Singleton để tránh tạo nhiều connection pool khi hot-reload ở dev.
 * `CLIENT_REV` tăng khi schema đổi — client cũ trong `globalThis` không biết field mới.
 */
const CLIENT_REV = "lesson-exercises-1";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRev: string | undefined;
};

function createPrismaClient() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("Thiếu biến môi trường DATABASE_URL — xem .env.example");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

if (globalForPrisma.prismaRev !== CLIENT_REV) {
  void globalForPrisma.prisma?.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = createPrismaClient();
  globalForPrisma.prismaRev = CLIENT_REV;
}

export const prisma = globalForPrisma.prisma!;
