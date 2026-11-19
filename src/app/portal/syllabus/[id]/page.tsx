import type { Metadata } from "next";
import Link from "next/link";

import { PortalDataError } from "@/lib/portal-data";
import { getPortalSyllabusDetail, getPortalSyllabuses } from "@/lib/portal-syllabus";

import { PortalStudentPicker } from "../../student-picker";
import { isPortalStaff, requirePortalViewer } from "../../viewer";
import { PortalSyllabusViewer } from "../viewer";

export const metadata: Metadata = { title: "Chương trình" };

export default async function PortalSyllabusDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { id } = await params;
  const { studentId } = await searchParams;
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";

  try {
    const catalog = await getPortalSyllabuses(viewer, studentId ?? null);
    if (catalog.requiresStudentSelection) {
      return (
        <>
          {isPortalStaff(viewer.role) ? (
            <PortalStudentPicker options={catalog.studentOptions} selectedId={studentId} />
          ) : null}
          <p className="text-sm text-slate-500">Chọn một học viên để xem syllabus.</p>
        </>
      );
    }

    const syllabus = await getPortalSyllabusDetail(viewer, id, studentId ?? null);

    return (
      <>
        {isPortalStaff(viewer.role) ? (
          <PortalStudentPicker options={catalog.studentOptions} selectedId={studentId} />
        ) : null}
        <Link href={`/portal/syllabus${qs}`} className="text-sm font-medium text-brand-700">
          ← Chương trình
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{syllabus.name}</h1>
        <PortalSyllabusViewer syllabus={syllabus} studentId={studentId ?? catalog.studentId} />
      </>
    );
  } catch (error) {
    if (error instanceof PortalDataError) {
      return (
        <div>
          <Link href={`/portal/syllabus${qs}`} className="text-sm font-medium text-brand-700">
            ← Chương trình
          </Link>
          <p className="mt-4 text-sm text-red-700">{error.message}</p>
        </div>
      );
    }
    throw error;
  }
}
