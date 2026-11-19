/** Chỉ ĐỌC: xuất toàn bộ dữ liệu học phí + nhật ký của một học viên. Dùng: CODE=HV0942 tsx scripts/dump-hocvien.ts */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { auditRepository } from "../cloudflare/storage/audit-repository";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
(async () => {
  const code = process.env.CODE || "HV0942";
  const students: any[] = await (studentsRepository as any).read(prisma);
  const student = students.find((s) => s.code === code);
  if (!student) throw new Error(`Không thấy ${code}`);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const sessions: any[] = await (sessionsRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const audit: any[] = await (auditRepository as any).read(prisma);
  const sepay = finance.sepay || {};
  const mine = (row: any) => row.studentId === student.id;
  const receivables = (sepay.receivables || []).filter(mine);
  const payments = (sepay.payments || []).filter(mine);
  const receipts = (sepay.receipts || []).filter(mine);
  const receiptIds = new Set(receipts.map((r: any) => r.id));
  const classIds = new Set([...classes.filter((c) => (c.studentIds || []).includes(student.id)).map((c) => c.id), ...Object.keys(student.classJoinedAt || {}), ...receivables.map((r: any) => r.classId)]);
  const text = (row: any) => JSON.stringify(row);
  process.stdout.write(JSON.stringify({
    at: new Date().toISOString(),
    student,
    classes: classes.filter((c) => classIds.has(c.id)),
    receivables, payments, receipts,
    invoices: (sepay.invoices || []).filter(mine),
    credits: (sepay.credits || []).filter(mine),
    cashbook: (finance.cashbook || []).filter((c: any) => receiptIds.has(c.receiptId) || c.studentName === student.fullName),
    audit: audit.filter((a) => a.entityId === student.id || text(a).includes(student.id) || text(a).includes(code) || text(a).includes(student.fullName)),
    sessions: sessions.filter((s) => classIds.has(s.classId) && String(s.date) >= "2026-09-01"),
  }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("LỖI:", e.message); await prisma.$disconnect(); process.exit(1); });
