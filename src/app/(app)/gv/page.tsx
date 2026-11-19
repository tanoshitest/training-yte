import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, DoorOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireTeacher, assignedClassWhere, assignedSessionWhere } from "@/lib/permissions";
import { formatDateUtc, todayUtc, addDaysUtc } from "@/lib/date";
import { classAttendanceHref } from "@/lib/session";

export const metadata: Metadata = { title: "Bảng điều khiển giáo viên" };

export default async function TeacherDashboardPage() {
  const user = await requireTeacher();
  const teacherId = user.teacherId ?? "";

  const today = todayUtc();
  const tomorrow = addDaysUtc(today, 1);

  const [todaySessions, classCount] = await Promise.all([
    prisma.lessonSession.findMany({
      where: {
        ...assignedSessionWhere(teacherId),
        date: { gte: today, lt: tomorrow },
      },
      orderBy: [{ startTime: "asc" }],
      include: {
        class: { select: { name: true } },
        room: { select: { name: true } },
        report: { select: { id: true } },
        attendances: { select: { status: true, note: true } },
      },
    }),
    prisma.class.count({ where: { ...assignedClassWhere(teacherId), status: "ACTIVE" } }),
  ]);

  return (
    <>
      <PageHeader
        title={`Chào ${user.fullName}`}
        description={`Bạn đang phụ trách ${classCount} lớp đang học. Hôm nay có ${todaySessions.length} buổi dạy.`}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
          <CardTitle>Lớp học hôm nay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todaySessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Hôm nay bạn chưa có buổi dạy nào.</p>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((session) => (
                  <Link
                    key={session.id}
                    href={classAttendanceHref(session.classId, session.id)}
                    className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <div className="w-24 shrink-0 text-center">
                      <p className="text-sm font-bold text-brand-700">{session.startTime}</p>
                      <p className="text-xs text-slate-400">{session.endTime}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{session.class.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDateUtc(session.date)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <DoorOpen className="h-3.5 w-3.5" />
                          {session.room?.name ?? "Chưa xếp phòng"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Buổi {session.sequence}
                        </span>
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
