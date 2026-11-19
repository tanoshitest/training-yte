import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { assignedClassWhere, assignedSessionWhere, requirePermission } from "@/lib/permissions";
import { dateKey, parseDateParam } from "@/lib/date";
import { classLessonPositions } from "@/lib/class-plan";
import { classAttendanceHref } from "@/lib/session";
import { CalendarFilters } from "../../lich-day/filters";
import {
  CalendarBoard,
  CalendarNav,
  CalendarPage,
  calendarRange,
  parseView,
  type CalendarSession,
} from "../../lich-day/ui";

export const metadata: Metadata = { title: "Lịch dạy của tôi" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("calendar.viewOwn");

  const sp = await searchParams;
  const view = parseView(one(sp.view));
  const date = parseDateParam(one(sp.date));
  const { from, to } = calendarRange(view, date);
  const classId = one(sp.class) ?? "";

  // R5 — chỉ lấy buổi mà giáo viên này đứng lớp.
  const teacherId = user.teacherId ?? "";

  const [classes, rows] = await Promise.all([
    prisma.class.findMany({
      where: assignedClassWhere(teacherId),
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.lessonSession.findMany({
      where: {
        ...assignedSessionWhere(teacherId),
        date: { gte: from, lte: to },
        ...(classId ? { classId } : {}),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        sequence: true,
        isOff: true,
        isExtra: true,
        syllabusLessonId: true,
        classId: true,
        class: { select: { code: true, name: true } },
        room: { select: { name: true } },
        syllabusLesson: {
          select: { name: true, unit: { select: { syllabus: { select: { name: true } } } } },
        },
      },
    }),
  ]);

  // Vị trí bài trong Syllabus ("Bài 10/100") — hỏi một lần cho mọi lớp đang hiện trên lịch.
  const positions = await classLessonPositions(prisma, [...new Set(rows.map((row) => row.classId))]);

  const sessions: CalendarSession[] = rows.map((row) => {
    const plan = positions.get(row.classId);
    return {
      id: row.id,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      sequence: row.sequence,
      classId: row.classId,
      className: row.class.name,
      classCode: row.class.code,
      roomName: row.room?.name ?? null,
      teacherName: user.fullName,
      lessonName: row.syllabusLesson?.name ?? null,
      syllabusName: row.syllabusLesson?.unit?.syllabus.name ?? null,
      isExtra: row.isExtra,
      isOff: row.isOff,
      lessonNo: (row.syllabusLessonId ? plan?.order.get(row.syllabusLessonId) : null) ?? null,
      lessonTotal: plan?.total ?? 0,
    };
  });

  const params: Record<string, string> = {};
  if (classId) params.class = classId;

  return (
    <CalendarPage
      chrome={
        <>
          <PageHeader
            title="Lịch dạy của tôi"
            description="Bấm vào buổi để mở điểm danh, nhận xét và báo cáo buổi học của lớp."
          />
          <Card>
            <CardContent>
              <CalendarNav basePath="/gv/lich-day" view={view} date={date} params={params}>
                <CalendarFilters
                  action="/gv/lich-day"
                  view={view}
                  date={dateKey(date)}
                  groups={[
                    {
                      name: "class",
                      value: classId,
                      all: "Tất cả lớp của tôi",
                      options: classes.map((cls) => ({
                        value: cls.id,
                        label: `${cls.name} (${cls.code})`,
                      })),
                    },
                  ]}
                />
              </CalendarNav>
            </CardContent>
          </Card>
        </>
      }
    >
      <CalendarBoard
        view={view}
        date={date}
        sessions={sessions}
        hrefBase="/lop-hoc"
        sessionHref={(session) => classAttendanceHref(session.classId, session.id)}
      />
    </CalendarPage>
  );
}
