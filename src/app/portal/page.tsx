import type { Metadata } from "next";
import Link from "next/link";

import { getPortalOverview, PortalDataError } from "@/lib/portal-data";
import { getPortalSyllabuses } from "@/lib/portal-syllabus";

import { PortalStudentPicker } from "./student-picker";
import { isPortalStaff, requirePortalViewer } from "./viewer";

export const metadata: Metadata = { title: "Bảng điều khiển" };

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { studentId } = await searchParams;
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";

  try {
    const [data, syllabuses] = await Promise.all([
      getPortalOverview(viewer, studentId ?? null),
      getPortalSyllabuses(viewer, studentId ?? null),
    ]);
    const current = data.courses.filter((course) => course.status === "active");

    return (
      <>
        {isPortalStaff(viewer.role) ? (
          <PortalStudentPicker options={data.studentOptions} selectedId={studentId} />
        ) : null}

        {data.requiresStudentSelection ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Chọn một học viên để xem Portal.
          </section>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Xem nhanh quá trình học của bạn</h1>
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-lg font-semibold text-slate-900">
                Bạn đã học xong {data.dashboard.completedCourses} khóa học
              </p>
              <Link
                href={`/portal/courses${qs}`}
                className="mt-4 inline-flex h-8 items-center rounded-lg bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                Xem khóa đã hoàn thành
              </Link>
              <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                <div>
                  <dt className="text-sm text-slate-500">Đi học {data.dashboard.attendedSessions} buổi</dt>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Luyện tập {data.dashboard.completedPractices} bài</dt>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Hoàn thành {data.dashboard.completedAssignments} assignment</dt>
                </div>
              </dl>
            </section>

            <section className="mt-12">
              <h2 className="text-lg font-semibold text-slate-900">Khóa đang học</h2>
              {current.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Bạn đang không theo học khóa học nào.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {current.map((course) => (
                    <Link
                      key={course.id}
                      href={`/portal/courses/${course.id}${qs}`}
                      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-600"
                    >
                      <p className="truncate text-xs font-semibold text-slate-500">{course.code}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{course.title}</h3>
                      <p className="mt-3 text-sm text-slate-600">
                        Assignment: {course.assignmentProgress.completed}/{course.assignmentProgress.total} bài
                      </p>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-600"
                          style={{ width: `${course.progressPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{course.progressPercent}%</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {!data.requiresStudentSelection && syllabuses.items.length > 0 ? (
              <section className="mt-12">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Chương trình học</h2>
                  <Link href={`/portal/syllabus${qs}`} className="text-sm font-medium text-brand-700">
                    Xem tất cả
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {syllabuses.items.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={`/portal/syllabus/${item.id}${qs}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-600"
                    >
                      <p className="text-xs font-semibold text-slate-500">{item.code || "Syllabus"}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{item.name}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {item.unitCount} phần · {item.dayCount} buổi
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </>
    );
  } catch (error) {
    if (error instanceof PortalDataError) {
      return (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error.message}
        </section>
      );
    }
    throw error;
  }
}
