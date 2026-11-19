import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "syllabus.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await context.params;
  const lesson = await prisma.syllabusLesson.findUnique({
    where: { id: lessonId },
    select: { id: true },
  });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.lessonExercise.findMany({
    where: { lessonId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, skill: true, kind: true, title: true, sortOrder: true },
  });
  return NextResponse.json(items);
}
