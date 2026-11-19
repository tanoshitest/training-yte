"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

import { kindLabel, SKILLS, type Exercise, type SkillId } from "./exercises/types";

export type ExerciseResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const SKILL_IDS = new Set<string>(SKILLS.map((item) => item.id));

function asSkill(value: unknown): SkillId | null {
  return typeof value === "string" && SKILL_IDS.has(value) ? (value as SkillId) : null;
}

function asExercise(value: unknown): Exercise | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Exercise;
  if (!asSkill(row.skill) || typeof row.kind !== "string" || !row.kind) return null;
  return row;
}

async function syllabusIdForLesson(lessonId: string) {
  const lesson = await prisma.syllabusLesson.findUnique({
    where: { id: lessonId },
    select: { courseDay: { select: { syllabusId: true } }, unit: { select: { syllabusId: true } } },
  });
  return lesson?.courseDay?.syllabusId ?? lesson?.unit?.syllabusId ?? null;
}

async function refreshLesson(lessonId: string) {
  const syllabusId = await syllabusIdForLesson(lessonId);
  if (syllabusId) revalidatePath(`/syllabus/${syllabusId}`, "layout");
}

export async function upsertLessonExercise(input: {
  lessonId: string;
  exerciseId?: string;
  exercise: Exercise;
}): Promise<ExerciseResult> {
  await requirePermission("syllabus.update");
  const exercise = asExercise(input.exercise);
  if (!exercise) return { ok: false, error: "Đề bài không hợp lệ." };
  const skill = asSkill(exercise.skill);
  if (!skill) return { ok: false, error: "Kỹ năng không hợp lệ." };

  const lesson = await prisma.syllabusLesson.findUnique({
    where: { id: input.lessonId },
    select: { id: true },
  });
  if (!lesson) return { ok: false, error: "Không tìm thấy buổi học." };

  const title = exercise.title?.trim() || kindLabel(exercise);

  try {
    if (input.exerciseId) {
      const current = await prisma.lessonExercise.findFirst({
        where: { id: input.exerciseId, lessonId: input.lessonId },
        select: { id: true },
      });
      if (!current) return { ok: false, error: "Không tìm thấy bài tập." };
      const payload = { ...exercise, id: current.id };
      await prisma.lessonExercise.update({
        where: { id: current.id },
        data: { skill, kind: exercise.kind, title, payload },
      });
      await refreshLesson(input.lessonId);
      return { ok: true, id: current.id };
    }

    const count = await prisma.lessonExercise.count({ where: { lessonId: input.lessonId } });
    const created = await prisma.lessonExercise.create({
      data: {
        lessonId: input.lessonId,
        skill,
        kind: exercise.kind,
        title,
        sortOrder: count + 1,
        payload: exercise,
      },
    });
    await prisma.lessonExercise.update({
      where: { id: created.id },
      data: { payload: { ...exercise, id: created.id } },
    });
    await refreshLesson(input.lessonId);
    return { ok: true, id: created.id };
  } catch {
    return { ok: false, error: "Không lưu được bài tập." };
  }
}

export async function deleteLessonExercise(input: {
  lessonId: string;
  exerciseId: string;
}): Promise<ExerciseResult> {
  await requirePermission("syllabus.update");
  const current = await prisma.lessonExercise.findFirst({
    where: { id: input.exerciseId, lessonId: input.lessonId },
    select: { id: true },
  });
  if (!current) return { ok: false, error: "Không tìm thấy bài tập." };
  await prisma.lessonExercise.delete({ where: { id: current.id } });
  await refreshLesson(input.lessonId);
  return { ok: true, id: current.id };
}
