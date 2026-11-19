import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge, STATUS_TONE } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { addDaysUtc, dateKey, eachDayUtc, formatDateUtc, parseDateInput, todayUtc } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { assignedClassWhere, requirePermission } from "@/lib/permissions";
import { attendanceRoster } from "@/lib/session";
import { WEEKDAY_SHORT } from "@/lib/utils";
import type { ClassType, HomeworkRating, LessonRating } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Báo cáo học vụ" };

const CLASS_TYPES: Record<ClassType, string> = {
  NORMAL: "Lớp thường",
  IELTS: "IELTS",
};

const LESSON_RATINGS: Record<LessonRating, string> = {
  A_PLUS: "A+",
  A: "A",
  A_MINUS: "A-",
  B: "B",
};

const HOMEWORK_RATINGS: Record<HomeworkRating, string> = {
  FULL_100: "100%",
  EIGHTY_80: "80%",
  BELOW_50: "<50%",
  ZERO_0: "0%",
};

const MAX_DAYS = 31;

type Search = { from?: string; to?: string; type?: string; class?: string };

const cell = "px-2 py-2 align-top";
const head = "px-2 py-2 whitespace-normal leading-tight";

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("attendance.comment");

  const { from = "", to = "", type = "", class: classId = "" } = await searchParams;
  const typeFilter = type in CLASS_TYPES ? (type as ClassType) : undefined;

  const today = todayUtc();
  const requestedFrom = parseDateInput(from) ?? addDaysUtc(today, -6);
  const requestedTo = parseDateInput(to) ?? today;
  const start = requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  let end = requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;
  if (diffDaysInclusive(start, end) > MAX_DAYS) {
    end = addDaysUtc(start, MAX_DAYS - 1);
  }
  const fromValue = dateKey(start);
  const toValue = dateKey(end);
  const days = eachDayUtc(start, end);

  // Chỉ lấy lớp được phân công cho giáo viên
  const classes = await prisma.class.findMany({
    where: {
      ...assignedClassWhere(user.teacherId ?? ""),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, name: true, code: true },
  });
  const classFilter = classes.some((item) => item.id === classId) ? classId : "";

  const sessions = await prisma.lessonSession.findMany({
    where: {
      classId: { in: classes.map(c => c.id) },
      date: { gte: start, lte: end },
      status: { not: "CANCELLED" },
      ...(classFilter ? { classId: classFilter } : {}),
    },
    orderBy: [{ startTime: "asc" }, { class: { name: "asc" } }],
    select: {
      id: true,
      sequence: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      hasHomework: true,
      class: { select: { id: true, name: true, code: true, type: true } },
      attendances: {
        orderBy: { student: { fullName: "asc" } },
        select: {
          status: true,
          note: true,
          lessonRating: true,
          homeworkRating: true,
          pronunciationVideoDone: true,
          student: { select: { id: true, code: true, fullName: true } },
        },
      },
    },
  });

  const classIds = [...new Set(sessions.map((session) => session.class.id))];
  const enrollments =
    classIds.length > 0
      ? await prisma.enrollment.findMany({
          where: { classId: { in: classIds }, status: { in: ["ACTIVE", "RESERVED"] } },
          orderBy: { student: { fullName: "asc" } },
          select: {
            classId: true,
            status: true,
            student: { select: { id: true, code: true, fullName: true } },
          },
        })
      : [];

  const studentsByClass = new Map<string, { id: string; code: string; fullName: string; reserved: boolean }[]>();
  for (const item of enrollments) {
    const list = studentsByClass.get(item.classId) ?? [];
    list.push({ ...item.student, reserved: item.status === "RESERVED" });
    studentsByClass.set(item.classId, list);
  }

  const sessionsByDay = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = dateKey(session.date);
    const list = sessionsByDay.get(key) ?? [];
    list.push(session);
    sessionsByDay.set(key, list);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Báo cáo học vụ"
          description="Nhật ký điểm danh, đánh giá và nhận xét của các lớp bạn dạy. Mỗi ngày trong khoảng lọc là một bảng."
        />
      </div>

      <Card className="shrink-0">
        <CardHeader className="flex-col items-start gap-3">
          <div>
            <CardTitle>Bộ lọc</CardTitle>
            <CardDescription>
              Mặc định hiện 7 ngày gần nhất, tất cả lớp. Chọn cùng ngày bắt đầu và kết thúc để xem
              đúng một ngày. Tối đa {MAX_DAYS} ngày.
            </CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Loại lớp">
              <Select name="type" defaultValue={type}>
                <option value="">Tất cả</option>
                {Object.entries(CLASS_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lớp">
              <Select name="class" defaultValue={classFilter}>
                <option value="">Tất cả lớp</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={fromValue} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={toValue} />
            </Field>
          </FilterForm>
        </CardHeader>
      </Card>

      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-slate-500">
              Không có buổi học nào khớp bộ lọc.
            </CardContent>
          </Card>
        ) : (
          days.map((day) => {
          const key = dateKey(day);
          const daySessions = sessionsByDay.get(key) ?? [];
          if (daySessions.length === 0) return null;
          const rows = daySessions.flatMap((session) => {
            const roster = attendanceRoster(studentsByClass.get(session.class.id) ?? [], session.attendances);
            return roster.map((row) => ({ session, row }));
          });
          const marked = rows.filter((item) => item.row.status !== null).length;
          const weekday = WEEKDAY_SHORT[day.getUTCDay()];

          // Kiểm tra các cột có dữ liệu
          const hasVideoData = rows.some(item => item.row.pronunciationVideoDone !== null);
          const hasRatingData = rows.some(item => item.row.lessonRating !== null);
          const hasHomeworkData = rows.some(item => item.session.hasHomework && item.row.homeworkRating !== null);
          const hasNoteData = rows.some(item => item.row.note?.trim() && item.row.note.trim() !== "—");

          // Tính số cột hiện tại
          const visibleColumns = 6 + (hasVideoData ? 1 : 0) + (hasRatingData ? 1 : 0) + (hasHomeworkData ? 1 : 0) + (hasNoteData ? 1 : 0);

          return (
            <Card key={key}>
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    {weekday}, {formatDateUtc(day)}
                  </h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {`${daySessions.length} buổi · ${new Set(daySessions.map((item) => item.class.id)).size} lớp · đã điểm danh ${marked}/${rows.length}`}
                </p>
              </div>
              <Table className="table-fixed" wrapperClassName="overflow-hidden">
                <THead>
                  <TR>
                    <THIndex className={`w-10 ${head}`} />
                    <TH className={`w-[16%] ${head}`}>Lớp</TH>
                    <TH className={`w-[9%] ${head}`}>Giờ</TH>
                    <TH className={`w-[7%] ${head}`}>Mã</TH>
                    <TH className={`w-[13%] ${head}`}>Học viên</TH>
                    <TH className={`w-[12%] ${head}`}>Điểm danh</TH>
                    {hasVideoData && <TH className={`w-[11%] ${head}`}>Video phát âm</TH>}
                    {hasRatingData && <TH className={`w-[8%] ${head}`}>Đánh giá</TH>}
                    {hasHomeworkData && <TH className={`w-[6%] ${head}`}>BTVN</TH>}
                    {hasNoteData && <TH className={head}>Nhận xét</TH>}
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <EmptyRow colSpan={visibleColumns}>Không có nhật ký lớp trong ngày này.</EmptyRow>
                  ) : (
                    rows.map((item, index) => (
                      <TR key={`${item.session.id}-${item.row.studentId}`}>
                        <TDIndex value={index + 1} className={cell} />
                        <TD className={`${cell} break-words`}>
                          <Link
                            href={`/lop-hoc/${item.session.class.id}?tab=diem-danh&buoi=${item.session.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {item.session.class.name}
                          </Link>
                          <span className="ml-1 text-xs text-slate-400">{item.session.class.code}</span>
                        </TD>
                        <TD className={`${cell} break-words text-slate-600`}>
                          {item.session.startTime}–{item.session.endTime}
                        </TD>
                        <TD className={`${cell} break-all font-mono text-xs text-slate-500`}>
                          {item.row.code}
                        </TD>
                        <TD className={`${cell} break-words font-medium text-slate-800`}>
                          {item.row.fullName}
                          {item.row.inClass ? null : (
                            <span className="ml-1 text-xs font-normal text-slate-400">đã rời lớp</span>
                          )}
                        </TD>
                        <TD className={`${cell} break-words`}>
                          {item.row.reserved ? (
                            <Badge tone="amber" className="whitespace-normal">
                              Bảo lưu
                            </Badge>
                          ) : item.row.status ? (
                            <Badge tone={STATUS_TONE[item.row.status].tone} className="whitespace-normal">
                              {STATUS_TONE[item.row.status].label}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">Chưa điểm danh</span>
                          )}
                        </TD>
                        {hasVideoData && (
                          <TD className={`${cell} break-words text-slate-600`}>
                            {item.row.pronunciationVideoDone ? "Hoàn thành" : "Chưa hoàn thành"}
                          </TD>
                        )}
                        {hasRatingData && (
                          <TD className={cell}>
                            {item.row.lessonRating ? LESSON_RATINGS[item.row.lessonRating] : "—"}
                          </TD>
                        )}
                        {hasHomeworkData && (
                          <TD className={cell}>
                            {item.session.hasHomework
                              ? item.row.homeworkRating
                                ? HOMEWORK_RATINGS[item.row.homeworkRating]
                                : "—"
                              : "Không giao"}
                          </TD>
                        )}
                        {hasNoteData && (
                          <TD className={`${cell} break-words`}>
                            <span className="text-slate-600">{item.row.note?.trim() || "—"}</span>
                          </TD>
                        )}
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </Card>
          );
        })
        )}
      </div>
    </div>
  );
}

function diffDaysInclusive(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}
