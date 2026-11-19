import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { dateKey, parseDateParam } from "@/lib/date";
import { classLessonPositions, classScheduleHoles } from "@/lib/class-plan";
import { CalendarFilters } from "../../lich-day/filters";
import {
  CalendarBoard,
  CalendarNav,
  CalendarPage,
  calendarRange,
  parseView,
  type CalendarSession,
} from "../../lich-day/ui";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lịch dạy trên hồ sơ giáo viên — cùng lưới ngày/tuần/tháng với `/lich-day`,
 * chỉ hiện tiết đã phân công cho giáo viên này.
 */
export async function TeacherScheduleTab({
  teacherId,
  searchParams,
}: {
  teacherId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const view = parseView(one(searchParams.view));
  const date = parseDateParam(one(searchParams.date));
  const { from, to } = calendarRange(view, date);
  const classId = one(searchParams.class) ?? "";
  const basePath = `/giao-vien/${teacherId}`;

  const [classes, teachers, academics, rooms, rows, holes] = await Promise.all([
    prisma.class.findMany({
      where: {
        status: { not: "FINISHED" },
        OR: [{ teacherId }, { sessions: { some: { teacherId } } }],
      },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.teacher.findMany({
      where: { user: { isActive: true } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, user: { select: { fullName: true } } },
    }),
    prisma.user.findMany({
      where: { role: "ACADEMIC", isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lessonSession.findMany({
      where: {
        teacherId,
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
        roomId: true,
        teacherId: true,
        class: { select: { code: true, name: true } },
        room: { select: { name: true } },
        teacher: { select: { user: { select: { fullName: true } } } },
        syllabusLesson: {
          select: { name: true, unit: { select: { syllabus: { select: { name: true } } } } },
        },
      },
    }),
    classScheduleHoles(prisma, { from, to }, { teacherId, classId }),
  ]);

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
      teacherName: row.teacher?.user.fullName ?? null,
      lessonName: row.syllabusLesson?.name ?? null,
      syllabusName: row.syllabusLesson?.unit?.syllabus.name ?? null,
      isExtra: row.isExtra,
      isOff: row.isOff,
      lessonNo: (row.syllabusLessonId ? plan?.order.get(row.syllabusLessonId) : null) ?? null,
      lessonTotal: plan?.total ?? 0,
      roomId: row.roomId,
      teacherId: row.teacherId,
    };
  });

  for (const hole of holes) {
    sessions.push({
      id: `cho-${hole.classId}-${dateKey(hole.date)}-${hole.startTime}`,
      date: hole.date,
      startTime: hole.startTime,
      endTime: hole.endTime,
      status: "SCHEDULED",
      sequence: 0,
      classId: hole.classId,
      className: hole.className,
      classCode: hole.classCode,
      roomName: hole.roomName,
      teacherName: hole.teacherName,
      lessonName: null,
      syllabusName: null,
      isExtra: false,
      lessonNo: null,
      lessonTotal: 0,
      roomId: hole.roomId,
      teacherId: hole.teacherId,
      placeholder: hole.reason,
    });
  }

  const params: Record<string, string> = { tab: "lich-day" };
  if (classId) params.class = classId;

  return (
    <CalendarPage
      chrome={
        <Card>
          <CardContent>
            <CalendarNav basePath={basePath} view={view} date={date} params={params}>
              <CalendarFilters
                action={basePath}
                view={view}
                date={dateKey(date)}
                hidden={{ tab: "lich-day" }}
                groups={[
                  {
                    name: "class",
                    value: classId,
                    all: "Tất cả lớp phân công",
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
      }
    >
      <CalendarBoard
        view={view}
        date={date}
        sessions={sessions}
        hrefBase="/lich-day"
        edit={{
          rooms,
          teachers: teachers.map((teacher) => ({
            id: teacher.id,
            name: `${teacher.user.fullName} (${teacher.code})`,
          })),
          academics: academics.map((academic) => ({ id: academic.id, name: academic.fullName })),
        }}
      />
    </CalendarPage>
  );
}
