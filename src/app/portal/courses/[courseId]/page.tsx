import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPortalOverview, PortalDataError } from "@/lib/portal-data";
import { getPortalSyllabuses } from "@/lib/portal-syllabus";

import { requirePortalViewer } from "../../viewer";

export const metadata: Metadata = { title: "Khóa học" };

export default async function PortalCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { courseId } = await params;
  const { studentId } = await searchParams;
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";

  try {
    const [data, syllabuses] = await Promise.all([
      getPortalOverview(viewer, studentId ?? null),
      getPortalSyllabuses(viewer, studentId ?? null),
    ]);
    if (data.requiresStudentSelection) {
      return (
        <p className="text-sm text-slate-500">
          <Link href={`/portal/courses${qs}`} className="text-brand-700 underline">
            Chọn học viên
          </Link>{" "}
          để xem khóa học.
        </p>
      );
    }
    const course = data.courses.find((item) => item.id === courseId);
    if (!course) notFound();
    const stages = data.stagesByCourse[course.id] ?? [];
    const courseSyllabuses = syllabuses.items.filter((item) => item.classIds.includes(course.id));

    return (
      <>
        <Link href={`/portal/courses${qs}`} className="text-sm font-medium text-brand-700">
          ← Khóa học
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">{course.code}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {course.center}
          {course.teachers[0] ? ` · ${course.teachers[0].name}` : ""}
        </p>
        {courseSyllabuses.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900">Chương trình</h2>
            <ul className="mt-3 space-y-3">
              {courseSyllabuses.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/portal/syllabus/${item.id}${qs}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-600"
                  >
                    <p className="text-xs font-semibold text-slate-500">{item.code || "Syllabus"}</p>
                    <p className="mt-1 font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.unitCount} phần · {item.dayCount} buổi
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ul className="mt-8 space-y-3">
          {stages.map((stage) => (
            <li key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-semibold text-slate-900">{stage.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {stage.progress.session.completed}/{stage.progress.session.total} buổi
                {stage.room ? ` · ${stage.room}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </>
    );
  } catch (error) {
    if (error instanceof PortalDataError) {
      return <p className="text-sm text-red-700">{error.message}</p>;
    }
    throw error;
  }
}
