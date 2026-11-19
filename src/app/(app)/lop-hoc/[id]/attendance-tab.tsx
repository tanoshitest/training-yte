import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { attendanceRoster, parseTestColumns } from "@/lib/session";
import { WEEKDAY_SHORT } from "@/lib/utils";
import { dateKey, formatDateUtc, todayUtc, utcDate } from "@/lib/date";
import type { ClassType } from "@/generated/prisma/enums";
import { AttendanceRoster, type AttendanceMode } from "../../gv/buoi-hoc/attendance-roster";
import { LessonReportForm } from "../../gv/buoi-hoc/lesson-report-form";
import { TeacherSessionForm } from "../../gv/buoi-hoc/teacher-session-form";
import { createAttendanceSession } from "./attendance-actions";
import { AttendanceSessionPicker } from "./attendance-session-picker";

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

const SESSION_SELECT = {
  id: true,
  sequence: true,
  date: true,
  startTime: true,
  endTime: true,
  status: true,
  isOff: true,
  hasHomework: true,
  academicStaffId: true,
  testColumns: true,
  syllabusLesson: { select: { name: true } },
  report: {
    select: {
      classSituation: true,
      studentsToNote: true,
      homework: true,
      note: true,
    },
  },
  attendances: {
    orderBy: { student: { fullName: "asc" as const } },
    select: {
      status: true,
      note: true,
      lessonRating: true,
      homeworkRating: true,
      pronunciationVideoDone: true,
      student: { select: { id: true, code: true, fullName: true } },
    },
  },
} as const;

function sessionStamp(session: { date: Date; startTime: string; endTime: string }) {
  return `${WEEKDAY_SHORT[session.date.getUTCDay()]}, ${formatDateUtc(session.date)} · ${session.startTime}–${session.endTime}`;
}

function CreateAttendanceSessionForm({
  classId,
  date,
  periods,
}: {
  classId: string;
  date: string;
  periods: { id: string; name: string; startTime: string; endTime: string }[];
}) {
  const evening = periods.find((period) => period.startTime >= "17:00");
  const fallback = evening ?? periods[periods.length - 1];
  const defaultStart = fallback?.startTime ?? "18:00";
  const defaultEnd = fallback?.endTime ?? "19:30";

  return (
    <ActionForm
      action={createAttendanceSession}
      className="grid gap-3 sm:grid-cols-[8rem_8rem_auto] sm:items-end"
    >
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="date" value={date} />
      <Field label="Giờ bắt đầu">
        <Input type="time" name="startTime" defaultValue={defaultStart} required />
      </Field>
      <Field label="Giờ kết thúc">
        <Input type="time" name="endTime" defaultValue={defaultEnd} required />
      </Field>
      <SubmitButton>Tạo buổi điểm danh</SubmitButton>
      {periods.length > 0 ? (
        <p className="col-span-full text-xs text-slate-500">
          Ca đã khai: {periods.map((period) => `${period.name} ${period.startTime}–${period.endTime}`).join(" · ")}
        </p>
      ) : null}
    </ActionForm>
  );
}

export async function AttendanceTab({
  classId,
  classType,
  attendanceMode,
  lessonId,
  reportReadOnly = false,
  canCreateSession = false,
  viewerId,
  isAdministrator = false,
}: {
  classId: string;
  classType: ClassType;
  attendanceMode: AttendanceMode;
  lessonId?: string;
  reportReadOnly?: boolean;
  canCreateSession?: boolean;
  viewerId: string;
  isAdministrator?: boolean;
}) {
  const today = todayUtc();
  const earliest = utcDate(2026, 7, 23);
  const from = addMonthsUtc(today, -6);
  const start = from.getTime() > earliest.getTime() ? from : earliest;
  const to = addMonthsUtc(today, 5);

  const [rangeSessions, requested, enrollments, periods, scheduleCount] = await Promise.all([
    prisma.lessonSession.findMany({
      where: {
        classId,
        date: { gte: start, lte: to },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: SESSION_SELECT,
    }),
    lessonId
      ? prisma.lessonSession.findFirst({
          where: { id: lessonId, classId },
          select: SESSION_SELECT,
        })
      : Promise.resolve(null),
    prisma.enrollment.findMany({
      where: { classId, status: { in: ["ACTIVE", "RESERVED"] } },
      orderBy: { student: { fullName: "asc" } },
      select: { status: true, student: { select: { id: true, code: true, fullName: true } } },
    }),
    prisma.lessonPeriod.findMany({
      orderBy: [{ startTime: "asc" }, { name: "asc" }],
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
    prisma.classSchedule.count({ where: { classId } }),
  ]);

  const sessions = [...rangeSessions];
  if (requested && !sessions.some((session) => session.id === requested.id)) {
    sessions.push(requested);
    sessions.sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime),
    );
  }

  const pastOrToday = sessions.filter((session) => session.date.getTime() <= today.getTime());
  const current = requested ?? pastOrToday[pastOrToday.length - 1];
  const hasToday = sessions.some((session) => session.date.getTime() === today.getTime());
  const todayKey = dateKey(today);

  if (!current) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chưa có buổi để điểm danh</CardTitle>
          <CardDescription>
            {scheduleCount === 0
              ? "Lớp chưa có thời khoá biểu tuần nên hệ thống chưa dựng buổi học. Tạo buổi cho hôm nay để điểm danh ngay, hoặc vào "
              : "Lớp chưa có buổi hôm nay hoặc trước đó trên lịch. Tạo buổi cho hôm nay để điểm danh, hoặc vào "}
            <Link href={`/lop-hoc/${classId}`} className="font-medium text-brand-700 hover:underline">
              thông tin lớp
            </Link>{" "}
            để khai / kiểm tra lịch tuần — lần sau buổi sẽ có sẵn trên lịch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canCreateSession ? (
            <CreateAttendanceSessionForm classId={classId} date={todayKey} periods={periods} />
          ) : (
            <p className="text-sm text-slate-500">Nhờ học vụ tạo buổi hoặc khai thời khoá biểu của lớp.</p>
          )}
        </CardContent>
      </Card>
    );
  }
  const roster = attendanceRoster(
    enrollments.map((item) => ({ ...item.student, reserved: item.status === "RESERVED" })),
    current.attendances,
  );

  const options = sessions.map((session) => ({
    id: session.id,
    label: `${sessionStamp(session)}${session.isOff ? " · Nghỉ học" : ""}`,
    disabled: session.date.getTime() > today.getTime() && session.id !== current.id,
  }));

  const lessonName = current.syllabusLesson?.name;
  const isAcademicSession = Boolean(current.academicStaffId);
  const canEditAcademicSession =
    isAcademicSession && (isAdministrator || current.academicStaffId === viewerId);
  const currentMode: AttendanceMode = isAcademicSession
    ? canEditAcademicSession
      ? "academic"
      : "view"
    : attendanceMode;
  const heading = {
    title: isAcademicSession ? "Điểm danh & kiểm tra" : "Điểm danh & nhận xét",
    status: current.status,
    description: [
      sessionStamp(current),
      `buổi ${current.sequence}`,
      lessonName,
      current.isOff ? "Nghỉ học" : `đã điểm danh ${current.attendances.length}/${roster.length}`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
  const tests = parseTestColumns(current.testColumns);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {canCreateSession && !hasToday && scheduleCount === 0 ? (
        <Card className="mb-4 shrink-0">
          <CardHeader>
            <CardTitle>Chưa có buổi hôm nay</CardTitle>
            <CardDescription>
              Buổi đang mở bên dưới là buổi gần nhất đã có trên lịch. Tạo buổi hôm nay nếu lớp vừa
              học xong mà chưa khai thời khoá biểu tuần.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateAttendanceSessionForm classId={classId} date={todayKey} periods={periods} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4 shrink-0">
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Chọn buổi điểm danh</CardTitle>
            <CardDescription>
              Bấm thẻ trên lịch dạy sẽ mở đúng buổi đó. Danh sách từ 23/08/2026 trở đi.
            </CardDescription>
          </div>
          <AttendanceSessionPicker classId={classId} currentId={current.id} options={options} />
        </CardHeader>
      </Card>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
        {currentMode === "comment" && !reportReadOnly && current.status !== "CANCELLED" ? (
          <TeacherSessionForm
            sessionId={current.id}
            roster={roster}
            classType={classType}
            isCompleted={current.status === "COMPLETED"}
            heading={heading}
            tests={tests}
            isOff={current.isOff}
            hasHomework={current.hasHomework}
            report={current.report}
          />
        ) : (
          <>
            <Card className="shrink-0">
              <CardContent className="p-0">
                <AttendanceRoster
                  sessionId={current.id}
                  roster={roster}
                  mode={currentMode}
                  classType={classType}
                  isCompleted={current.status === "COMPLETED"}
                  heading={heading}
                  tests={tests}
                  isOff={current.isOff}
                  hasHomework={current.hasHomework}
                  academicSession={isAcademicSession}
                />
              </CardContent>
            </Card>

            {current.status !== "CANCELLED" && !isAcademicSession ? (
              <Card className="shrink-0">
                <CardHeader>
                  <CardTitle>Báo cáo buổi học</CardTitle>
                  <CardDescription>
                    {reportReadOnly
                      ? "Giáo viên ghi báo cáo sau buổi dạy. Học vụ và quản trị viên chỉ xem."
                      : "Ghi lại những gì đã diễn ra để lớp sau tiếp nối được."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LessonReportForm sessionId={current.id} report={current.report} readOnly={reportReadOnly} />
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
