import { NextResponse } from "next/server";

import { auth } from "@/auth";
import type { Exercise } from "@/app/(app)/syllabus/exercises/types";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string; exerciseId: string }> },
) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "syllabus.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId, exerciseId } = await context.params;
  const row = await prisma.lessonExercise.findFirst({
    where: { id: exerciseId, lessonId },
    select: { id: true, skill: true, kind: true, title: true, payload: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Exercise) : null;
  const exercise = {
    ...(payload ?? {}),
    id: row.id,
    skill: row.skill,
    kind: row.kind,
    title: row.title,
  } as Exercise;
  return NextResponse.json(exercise);
}
