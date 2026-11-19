import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { assertCanAccessSession, requirePermission } from "@/lib/permissions";
import { classAttendanceHref } from "@/lib/session";

export const metadata: Metadata = { title: "Buổi học" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("attendance.comment");
  const { id } = await params;
  if (!(await assertCanAccessSession(user, id))) notFound();

  const session = await prisma.lessonSession.findUnique({
    where: { id },
    select: { classId: true },
  });
  if (!session) notFound();

  redirect(classAttendanceHref(session.classId, id));
}
