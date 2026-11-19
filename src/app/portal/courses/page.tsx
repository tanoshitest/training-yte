import type { Metadata } from "next";
import Link from "next/link";

import { getPortalOverview, PortalDataError } from "@/lib/portal-data";

import { PortalStudentPicker } from "../student-picker";
import { isPortalStaff, requirePortalViewer } from "../viewer";

export const metadata: Metadata = { title: "Khóa học" };

export default async function PortalCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { studentId } = await searchParams;
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";

  try {
    const data = await getPortalOverview(viewer, studentId ?? null);
    const current = data.courses.filter((course) => course.status === "active");
    const done = data.courses.filter((course) => course.status === "completed");

    return (
      <>
        {isPortalStaff(viewer.role) ? (
          <PortalStudentPicker options={data.studentOptions} selectedId={studentId} />
        ) : null}
        <h1 className="text-xl font-semibold text-slate-900">Khóa học của bạn</h1>
        {data.requiresStudentSelection ? (
          <p className="mt-6 text-sm text-slate-500">Chọn một học viên để xem Portal.</p>
        ) : (
          <div className="mt-6 space-y-10">
            <section>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {current.length === 0 ? (
                  <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    Bạn đang không theo học khóa học nào.
                  </p>
                ) : (
                  current.map((course) => (
                    <Link
                      key={course.id}
                      href={`/portal/courses/${course.id}${qs}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-600"
                    >
                      <p className="text-xs font-semibold text-slate-500">{course.code}</p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">{course.title}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        Khóa học này có {course.stageIds.length} giai đoạn · {course.progressPercent}%
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </section>
            {done.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold text-slate-900">Khóa học bạn đã hoàn thành</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {done.map((course) => (
                    <div key={course.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold text-slate-500">{course.code}</p>
                      <h3 className="mt-1 font-semibold text-slate-900">{course.title}</h3>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </>
    );
  } catch (error) {
    if (error instanceof PortalDataError) {
      return <p className="text-sm text-red-700">{error.message}</p>;
    }
    throw error;
  }
}
