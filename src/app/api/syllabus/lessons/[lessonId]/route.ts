import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { parseVocab } from "@/app/(app)/syllabus/vocab";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const formSelect = {
  id: true,
  name: true,
  lessonType: true,
  pupilBookPage: true,
  activityBookPage: true,
  hasListening: true,
  hasSpeaking: true,
  hasReading: true,
  hasWriting: true,
  tasks: true,
  languageTargets: true,
  lessonOutcomes: true,
  lessonPlan: true,
  homework: true,
  materials: true,
} as const;

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "syllabus.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await context.params;
  const part = new URL(request.url).searchParams.get("part") ?? "form";

  if (part === "vocab") {
    const row = await prisma.syllabusLesson.findUnique({
      where: { id: lessonId },
      select: { vocabulary: true },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(parseVocab(row.vocabulary));
  }

  const lesson = await prisma.syllabusLesson.findUnique({
    where: { id: lessonId },
    select: formSelect,
  });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lesson);
}
