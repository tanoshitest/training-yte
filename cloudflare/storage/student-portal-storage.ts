import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Ba nhóm dữ liệu riêng của từng học viên trên cổng học. Khác với các nhóm khác,
 * khóa của chúng có kèm mã học viên (`progress:student-import-0001`) nên được định
 * tuyến theo tiền tố chứ không theo khóa cố định.
 */

export const PROGRESS_PREFIX = "progress:";
export const ACTIVITY_ATTEMPTS_PREFIX = "activity-attempts:";
export const STUDENT_STATE_PREFIX = "student:";

interface ActivityAttempt {
  id: string;
  studentId: string;
  syllabusId: string;
  activityId: string;
  score: number;
  accuracy: number;
  durationSeconds: number;
  answers: unknown[];
  completedAt: string;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function num(value: unknown) {
  return Number(value) || 0;
}

export async function readProgress(prisma: PrismaClient, studentId: string) {
  const rows = await prisma.opsStudentProgress.findMany({ where: { studentId }, orderBy: { itemId: "asc" } });
  if (!rows.length) return null;
  const progress: Record<string, boolean> = {};
  for (const row of rows) progress[row.itemId] = row.completed;
  return progress;
}

export async function writeProgress(prisma: PrismaClient, studentId: string, value: unknown) {
  const entries = Object.entries((value ?? {}) as Record<string, unknown>);
  const rows = entries.map(([itemId, completed]) => ({ studentId, itemId, completed: completed === true }));
  await prisma.$transaction([
    prisma.opsStudentProgress.deleteMany({ where: { studentId, itemId: { notIn: rows.map((row) => row.itemId) } } }),
    ...rows.map((row) => prisma.opsStudentProgress.upsert({
      where: { studentId_itemId: { studentId: row.studentId, itemId: row.itemId } },
      create: row,
      update: { completed: row.completed },
    })),
  ]);
}

export async function readActivityAttempts(prisma: PrismaClient, studentId: string) {
  const rows = await prisma.opsStudentActivityAttempt.findMany({ where: { studentId }, orderBy: { position: "asc" } });
  if (!rows.length) return null;
  return rows.map((row): ActivityAttempt => ({
    id: row.id,
    studentId: row.studentId,
    syllabusId: row.syllabusId,
    activityId: row.activityId,
    score: row.score,
    accuracy: row.accuracy,
    durationSeconds: row.durationSeconds,
    answers: row.answers as unknown[],
    completedAt: row.completedAt,
  }));
}

export async function writeActivityAttempts(prisma: PrismaClient, studentId: string, value: unknown) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const rows = items.map((item, position) => ({
    id: text(item.id),
    studentId,
    position,
    syllabusId: text(item.syllabusId),
    activityId: text(item.activityId),
    score: num(item.score),
    accuracy: num(item.accuracy),
    durationSeconds: num(item.durationSeconds),
    answers: (Array.isArray(item.answers) ? item.answers : []) as object,
    completedAt: text(item.completedAt),
  }));
  await prisma.$transaction([
    prisma.opsStudentActivityAttempt.deleteMany({ where: { studentId, id: { notIn: rows.map((row) => row.id) } } }),
    ...rows.map((row) => prisma.opsStudentActivityAttempt.upsert({ where: { id: row.id }, create: row, update: row })),
  ]);
}

export async function readStudentState(prisma: PrismaClient, studentId: string) {
  const row = await prisma.opsStudentAppState.findUnique({ where: { studentId } });
  return (row?.state as Record<string, unknown> | undefined) ?? null;
}

export async function writeStudentState(prisma: PrismaClient, studentId: string, value: unknown) {
  const state = JSON.parse(JSON.stringify(value ?? {}));
  await prisma.opsStudentAppState.upsert({
    where: { studentId },
    create: { studentId, state },
    update: { state },
  });
}
