import type { Metadata } from "next";

import { getPortalSchedule, PortalDataError } from "@/lib/portal-data";

import { PortalStudentPicker } from "../student-picker";
import { isPortalStaff, requirePortalViewer } from "../viewer";

export const metadata: Metadata = { title: "Lịch & phòng" };

export default async function PortalSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const viewer = await requirePortalViewer();
  const { studentId } = await searchParams;

  try {
    const data = await getPortalSchedule(viewer, studentId ?? null);

    return (
      <>
        {isPortalStaff(viewer.role) ? (
          <PortalStudentPicker options={data.studentOptions} selectedId={studentId} />
        ) : null}
        <h1 className="text-xl font-semibold text-slate-900">Lịch & phòng</h1>
        {data.requiresStudentSelection ? (
          <p className="mt-6 text-sm text-slate-500">Chọn một học viên để xem Portal.</p>
        ) : data.events.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Chưa có buổi học trong khoảng thời gian này.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {data.events.map((event) => (
              <li key={event.id} className="px-5 py-4">
                <p className="font-medium text-slate-900">{event.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {event.weekday} {event.date} · {event.startTime}–{event.endTime}
                  {event.room ? ` · ${event.room}` : ""}
                  {event.teacher ? ` · ${event.teacher}` : ""}
                </p>
              </li>
            ))}
          </ul>
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
