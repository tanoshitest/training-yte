import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { dateKey, parseDateParam } from "@/lib/date";
import { classLessonPositions, classScheduleHoles } from "@/lib/class-plan";
import { CalendarFilters } from "./filters";
import {
  CalendarBoard,
  CalendarNav,
  CalendarPage,
  calendarRange,
  parseView,
  type CalendarSession,
} from "./ui";

export const metadata: Metadata = { title: "Lịch dạy" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  await requirePermission("calendar.manage");

  const sp = await searchParams;
  const view = parseView(one(sp.view));
  const date = parseDateParam(one(sp.date));
  const { from, to } = calendarRange(view, date);

  const teacherId = one(sp.teacher) ?? "";
  const academicStaffId = one(sp.academic) ?? "";
  const classId = one(sp.class) ?? "";
  const branchId = one(sp.branch) ?? "";

  const [teachers, academics, classes, branches, rooms, rows, holes] = await Promise.all([
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
    prisma.class.findMany({
      where: { status: { not: "FINISHED" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lessonSession.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(teacherId ? { teacherId } : {}),
        ...(academicStaffId ? { academicStaffId } : {}),
        ...(classId ? { classId } : {}),
        // Chi nhánh đọc theo lớp — lớp thuộc chi nhánh nào thì buổi của lớp thuộc chi nhánh đó.
        ...(branchId ? { class: { branchId } } : {}),
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
        academicStaffId: true,
        testColumns: true,
        class: { select: { code: true, name: true } },
        room: { select: { name: true } },
        teacher: { select: { user: { select: { fullName: true } } } },
        academicStaff: { select: { fullName: true } },
        syllabusLesson: {
          select: { name: true, unit: { select: { syllabus: { select: { name: true } } } } },
        },
      },
    }),
    // Lớp đã cấu hình lịch tuần nhưng chưa dựng được buổi vẫn phải thấy trên lịch.
    classScheduleHoles(prisma, { from, to }, { teacherId, classId, branchId }),
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
      teacherName: row.teacher?.user.fullName ?? null,
      academicStaffName: row.academicStaff?.fullName ?? null,
      lessonName: row.syllabusLesson?.name ?? null,
      syllabusName: row.syllabusLesson?.unit?.syllabus.name ?? null,
      isExtra: row.isExtra,
      isOff: row.isOff,
      lessonNo: (row.syllabusLessonId ? plan?.order.get(row.syllabusLessonId) : null) ?? null,
      lessonTotal: plan?.total ?? 0,
      roomId: row.roomId,
      teacherId: row.teacherId,
      academicStaffId: row.academicStaffId,
      isTest: Array.isArray(row.testColumns) && row.testColumns.length > 0,
    };
  });

  // Ô mờ của lớp chưa dựng được buổi: không phải `LessonSession` nên id chỉ để React
  // phân biệt, `sequence` 0 và không bấm sửa được (xem `CalendarSession.placeholder`).
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
      academicStaffName: null,
      lessonName: null,
      syllabusName: null,
      isExtra: false,
      lessonNo: null,
      lessonTotal: 0,
      roomId: hole.roomId,
      teacherId: hole.teacherId,
      academicStaffId: null,
      isTest: false,
      placeholder: hole.reason,
    });
  }

  const edit = {
    rooms,
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: `${teacher.user.fullName} (${teacher.code})`,
    })),
    academics: academics.map((academic) => ({ id: academic.id, name: academic.fullName })),
  };

  // Giữ lại bộ lọc khi bấm ‹ › hoặc đổi chế độ xem.
  const params: Record<string, string> = {};
  if (teacherId) params.teacher = teacherId;
  if (academicStaffId) params.academic = academicStaffId;
  if (classId) params.class = classId;
  if (branchId) params.branch = branchId;

  return (
    <CalendarPage>
      <CalendarBoard
        view={view}
        date={date}
        sessions={sessions}
        hrefBase="/lich-day"
        edit={edit}
        toolbar={
          <CalendarNav basePath="/lich-day" view={view} date={date} params={params}>
            <CalendarFilters
              action="/lich-day"
              view={view}
              date={dateKey(date)}
              groups={[
                {
                  name: "teacher",
                  value: teacherId,
                  all: "Tất cả giáo viên",
                  options: teachers.map((teacher) => ({
                    value: teacher.id,
                    label: `${teacher.user.fullName} (${teacher.code})`,
                  })),
                },
                {
                  name: "academic",
                  value: academicStaffId,
                  all: "Tất cả học vụ",
                  options: academics.map((academic) => ({
                    value: academic.id,
                    label: academic.fullName,
                  })),
                },
                {
                  name: "class",
                  value: classId,
                  all: "Tất cả lớp",
                  options: classes.map((cls) => ({
                    value: cls.id,
                    label: `${cls.name} (${cls.code})`,
                  })),
                },
                {
                  name: "branch",
                  value: branchId,
                  all: "Tất cả chi nhánh",
                  options: branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  })),
                },
              ]}
            />
          </CalendarNav>
        }
      />
    </CalendarPage>
  );
}
