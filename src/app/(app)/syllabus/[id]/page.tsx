import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, Link2, Layers3 } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { SyllabusInfoForm } from "./syllabus-info-form";
import { SyllabusWorkspace } from "./workspace";

export const metadata: Metadata = { title: "Syllabus curriculum" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [syllabus, levels, lessonCount] = await Promise.all([
    prisma.syllabus.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        levelId: true,
        levelLabel: true,
        status: true,
        totalCourseDays: true,
        metadata: true,
        level: true,
        _count: { select: { classes: true, resources: true, courseDays: true } },
        sections: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, type: true, _count: { select: { courseDays: true } } },
        },
      },
    }),
    prisma.level.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.syllabusLesson.count({ where: { courseDay: { syllabusId: id } } }),
  ]);
  if (!syllabus) notFound();

  const cards = [
    [Layers3, "Sections", syllabus.sections.length],
    [CalendarDays, "Course days", syllabus.totalCourseDays || syllabus._count.courseDays],
    [BookOpen, "Lessons", lessonCount],
    [Link2, "Resource links", syllabus._count.resources],
  ] as const;
  const metadata = syllabus.metadata && typeof syllabus.metadata === "object" && !Array.isArray(syllabus.metadata) ? syllabus.metadata as Record<string, unknown> : {};

  return (
    <SyllabusWorkspace
      syllabusId={id}
      overview={
        <div className="space-y-4">
          <SyllabusInfoForm syllabus={syllabus} levels={levels} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(([Icon, label, value]) => (
              <div key={label} className="rounded-xl border bg-white p-4">
                <Icon className="h-5 w-5 text-brand-600" />
                <p className="mt-4 text-2xl font-semibold">{value}</p>
                <p className="text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Curriculum coverage</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-400">Classes using it</dt>
                  <dd className="font-medium">{syllabus._count.classes}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Source verified</dt>
                  <dd className="font-medium">{metadata.sourceVerified === true ? "Yes" : "Needs verification"}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Section sequence</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {syllabus.sections.map((section) => (
                  <li key={section.id} className="flex justify-between gap-3">
                    <span className="truncate">{section.title}</span>
                    <span className="shrink-0 text-slate-400">{section.type} · {section._count.courseDays} days</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      }
    />
  );
}
