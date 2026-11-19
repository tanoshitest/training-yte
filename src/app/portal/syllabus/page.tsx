import type { Metadata } from "next";
import Link from "next/link";

import { PortalDataError } from "@/lib/portal-data";
import { getPortalSyllabuses } from "@/lib/portal-syllabus";

import { PortalStudentPicker } from "../student-picker";
import { isPortalStaff, requirePortalViewer } from "../viewer";

export const metadata: Metadata = { title: "Chương trình" };

export default async function PortalSyllabusListPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { studentId } = await searchParams;
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";

  try {
    const data = await getPortalSyllabuses(viewer, studentId ?? null);

    return (
      <>
        {isPortalStaff(viewer.role) ? (
          <PortalStudentPicker options={data.studentOptions} selectedId={studentId} />
        ) : null}
        <h1 className="text-xl font-semibold text-slate-900">Chương trình học</h1>
        <p className="mt-1 text-sm text-slate-500">Syllabus được gán cho lớp bạn đang học hoặc đã học.</p>
        {data.requiresStudentSelection ? (
          <p className="mt-6 text-sm text-slate-500">Chọn một học viên để xem syllabus.</p>
        ) : data.items.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Lớp của bạn chưa được gán syllabus.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.items.map((item) => (
              <Link
                key={item.id}
                href={`/portal/syllabus/${item.id}${qs}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-600"
              >
                <p className="text-xs font-semibold text-slate-500">{item.code || "Syllabus"}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{item.name}</h2>
                {item.levelLabel ? <p className="mt-1 text-sm text-slate-500">{item.levelLabel}</p> : null}
                <p className="mt-3 text-sm text-slate-600">
                  {item.unitCount} phần · {item.dayCount} buổi
                </p>
                {item.classNames.length ? (
                  <p className="mt-2 text-xs text-slate-400">Lớp: {item.classNames.join(", ")}</p>
                ) : null}
              </Link>
            ))}
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
