import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { dateKey, formatDateUtc, parseDateInput } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { classAttendanceHref, parseTestColumns, type SessionTestColumn } from "@/lib/session";
import type { ClassType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Báo cáo điểm số" };

const CLASS_TYPES: Record<ClassType, string> = {
  NORMAL: "Lớp thường",
  IELTS: "IELTS",
};

const KINDS = {
  academic: "Học vụ phụ trách",
  teacher: "Kiểm tra giáo viên",
} as const;
type KindFilter = keyof typeof KINDS;

type Search = { class?: string; type?: string; kind?: string; from?: string; to?: string };

function formatScore(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function columnAverage(column: SessionTestColumn, studentIds: string[]) {
  const scores = studentIds
    .map((id) => column.scores[id])
    .filter((score): score is number => Number.isFinite(score));
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

function hasStoredTests(value: unknown) {
  return parseTestColumns(value).length > 0;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("attendance.submit");

  const { class: classId = "", type = "", kind = "", from = "", to = "" } = await searchParams;
  const typeFilter = type in CLASS_TYPES ? (type as ClassType) : undefined;
  const kindFilter = kind in KINDS ? (kind as KindFilter) : undefined;
  const start = parseDateInput(from);
  const end = parseDateInput(to);
  const fromValue = start ? dateKey(start) : "";
  const toValue = end ? dateKey(end) : "";
  const dateFilter =
    start || end
      ? {
          date: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
        }
      : {};

  const classes = await prisma.class.findMany({
    where: typeFilter ? { type: typeFilter } : {},
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, name: true, code: true, type: true },
  });
  const classFilter = classes.some((item) => item.id === classId) ? classId : "";
  const selectedClass = classes.find((item) => item.id === classFilter) ?? null;

  const examWhere = {
    status: { not: "CANCELLED" as const },
    isOff: false,
    ...dateFilter,
    ...(typeFilter ? { class: { type: typeFilter } } : {}),
    OR: [{ academicStaffId: { not: null } }, { NOT: { testColumns: { equals: [] } } }],
  };

  if (!classFilter) {
    const sessions = await prisma.lessonSession.findMany({
      where: examWhere,
      select: {
        classId: true,
        academicStaffId: true,
        testColumns: true,
        class: { select: { id: true, name: true, code: true, type: true } },
      },
    });

    const byClass = new Map<
      string,
      { id: string; name: string; code: string; type: ClassType; academic: number; teacher: number }
    >();
    for (const session of sessions) {
      const academic = Boolean(session.academicStaffId);
      const teacherTests = !academic && hasStoredTests(session.testColumns);
      if (kindFilter === "academic" && !academic) continue;
      if (kindFilter === "teacher" && !teacherTests) continue;
      if (!academic && !teacherTests) continue;

      const current = byClass.get(session.class.id) ?? {
        ...session.class,
        academic: 0,
        teacher: 0,
      };
      if (academic) current.academic += 1;
      else current.teacher += 1;
      byClass.set(session.class.id, current);
    }
    const rows = [...byClass.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));

    return (
      <ReportShell
        type={type}
        classFilter=""
        kind={kind}
        fromValue={fromValue}
        toValue={toValue}
        classes={classes}
      >
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>Danh sách lớp ({rows.length})</CardTitle>
            <CardDescription>
              Chỉ lớp đã có buổi kiểm tra học vụ hoặc cột điểm do giáo viên thêm. Chọn lớp để xem
              bảng điểm.
            </CardDescription>
          </CardHeader>
          <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
            <THead className="sticky top-0 z-[1]">
              <TR>
                <THIndex />
                <TH>Lớp</TH>
                <TH>Loại</TH>
                <TH className="text-right">Học vụ phụ trách</TH>
                <TH className="text-right">Kiểm tra giáo viên</TH>
                <TH className="text-right">Tổng bài</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={6}>Chưa có bài kiểm tra nào khớp bộ lọc.</EmptyRow>
              ) : (
                rows.map((row, index) => {
                  const params = new URLSearchParams();
                  if (typeFilter) params.set("type", typeFilter);
                  if (kindFilter) params.set("kind", kindFilter);
                  if (fromValue) params.set("from", fromValue);
                  if (toValue) params.set("to", toValue);
                  params.set("class", row.id);
                  return (
                    <TR key={row.id}>
                      <TDIndex value={index + 1} />
                      <TD>
                        <Link
                          href={`/bao-cao-diem-so?${params.toString()}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="ml-1 text-xs text-slate-400">{row.code}</span>
                      </TD>
                      <TD>
                        <Badge tone={row.type === "IELTS" ? "brand" : "slate"}>
                          {CLASS_TYPES[row.type]}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{row.academic}</TD>
                      <TD className="text-right tabular-nums">{row.teacher}</TD>
                      <TD className="text-right tabular-nums font-medium">
                        {row.academic + row.teacher}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </Card>
      </ReportShell>
    );
  }

  const [sessions, enrollments] = await Promise.all([
    prisma.lessonSession.findMany({
      where: { ...examWhere, classId: classFilter },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { sequence: "asc" }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        sequence: true,
        academicStaffId: true,
        testColumns: true,
        syllabusLesson: { select: { name: true } },
        teacher: { select: { code: true, user: { select: { fullName: true } } } },
        academicStaff: { select: { fullName: true } },
        attendances: { select: { studentId: true, status: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { classId: classFilter, status: { in: ["ACTIVE", "RESERVED"] } },
      orderBy: { student: { fullName: "asc" } },
      select: {
        status: true,
        student: { select: { id: true, code: true, fullName: true } },
      },
    }),
  ]);

  const exams = sessions
    .map((session) => {
      const columns = parseTestColumns(session.testColumns);
      const academic = Boolean(session.academicStaffId);
      return { ...session, columns, academic };
    })
    .filter((session) => {
      if (kindFilter === "academic") return session.academic;
      if (kindFilter === "teacher") return !session.academic && session.columns.length > 0;
      return session.academic || session.columns.length > 0;
    });

  const roster = enrollments.map((item) => ({
    ...item.student,
    reserved: item.status === "RESERVED",
  }));
  const rosterIds = new Set(roster.map((item) => item.id));

  return (
    <ReportShell
      type={type}
      classFilter={classFilter}
      kind={kind}
      fromValue={fromValue}
      toValue={toValue}
      classes={classes}
    >
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4">
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedClass?.name}{" "}
              <span className="font-normal text-slate-500">{selectedClass?.code}</span>
            </CardTitle>
            <CardDescription>
              {exams.length} bài kiểm tra
              {exams.some((item) => item.academic)
                ? ` · ${exams.filter((item) => item.academic).length} học vụ phụ trách`
                : ""}
              {exams.some((item) => !item.academic)
                ? ` · ${exams.filter((item) => !item.academic).length} kiểm tra giáo viên`
                : ""}
              . Điểm thang 100, lấy từ buổi đã ghi trên lớp.
            </CardDescription>
          </CardHeader>
        </Card>

        {exams.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-slate-500">
              Lớp này chưa có bài kiểm tra khớp bộ lọc.
            </CardContent>
          </Card>
        ) : (
          exams.map((session) => {
            const scoredIds = new Set(session.columns.flatMap((column) => Object.keys(column.scores)));
            const extra = [...scoredIds]
              .filter((id) => !rosterIds.has(id))
              .map((id) => ({ id, code: "", fullName: "Học viên đã rời lớp", reserved: false, left: true }));
            const students = [
              ...roster.map((item) => ({ ...item, left: false })),
              ...extra,
            ];
            const studentIds = students.map((item) => item.id);
            const attendanceByStudent = new Map(
              session.attendances.map((row) => [row.studentId, row.status]),
            );
            const assignee = session.academic
              ? session.academicStaff?.fullName ?? "Học vụ"
              : session.teacher?.user.fullName ?? "Giáo viên lớp";
            const lesson = session.syllabusLesson?.name;

            return (
              <Card key={session.id}>
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      <Link
                        href={classAttendanceHref(classFilter, session.id)}
                        className="hover:text-brand-700 hover:underline"
                      >
                        Buổi {session.sequence} · {formatDateUtc(session.date)}
                      </Link>
                    </h3>
                    <Badge tone={session.academic ? "brand" : "slate"}>
                      {session.academic ? "Học vụ phụ trách" : "Kiểm tra giáo viên"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {[
                      `${session.startTime}–${session.endTime}`,
                      lesson,
                      assignee,
                      session.columns.length > 0
                        ? `${session.columns.length} cột điểm`
                        : "Chưa nhập cột điểm",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {session.columns.length === 0 ? (
                  <CardContent className="text-sm text-slate-500">
                    Buổi đã gán Học vụ nhưng chưa có cột kiểm tra. Mở{" "}
                    <Link
                      href={classAttendanceHref(classFilter, session.id)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      điểm danh buổi này
                    </Link>{" "}
                    để thêm cột và nhập điểm.
                  </CardContent>
                ) : (
                  <Table wrapperClassName="overflow-x-auto">
                    <THead>
                      <TR>
                        <THIndex />
                        <TH>Mã</TH>
                        <TH>Học viên</TH>
                        {session.columns.map((column) => (
                          <TH key={column.id} className="text-right">
                            {column.name}
                          </TH>
                        ))}
                      </TR>
                    </THead>
                    <TBody>
                      {students.length === 0 ? (
                        <EmptyRow colSpan={3 + session.columns.length}>
                          Lớp chưa có học viên để ghi điểm.
                        </EmptyRow>
                      ) : (
                        students.map((student, index) => (
                          <TR key={student.id}>
                            <TDIndex value={index + 1} />
                            <TD className="font-mono text-xs whitespace-nowrap text-slate-500">
                              {student.code || "—"}
                            </TD>
                            <TD className="whitespace-nowrap font-medium text-slate-800">
                              {student.fullName}
                              {student.reserved ? (
                                <span className="ml-2 text-xs font-normal text-slate-400">bảo lưu</span>
                              ) : null}
                              {student.left ? (
                                <span className="ml-2 text-xs font-normal text-slate-400">đã rời lớp</span>
                              ) : null}
                              {attendanceByStudent.get(student.id) === "ABSENT" ||
                              attendanceByStudent.get(student.id) === "EXCUSED" ? (
                                <span className="ml-2 text-xs font-normal text-slate-400">vắng</span>
                              ) : null}
                            </TD>
                            {session.columns.map((column) => (
                              <TD key={column.id} className="text-right tabular-nums">
                                {formatScore(column.scores[student.id])}
                              </TD>
                            ))}
                          </TR>
                        ))
                      )}
                      {students.length > 0 ? (
                        <TR>
                          <TD className="w-10 text-xs tabular-nums whitespace-nowrap text-slate-400" />
                          <TD />
                          <TD className="text-xs font-medium text-slate-500">Trung bình</TD>
                          {session.columns.map((column) => (
                            <TD key={column.id} className="text-right tabular-nums font-medium text-slate-800">
                              {formatScore(columnAverage(column, studentIds) ?? undefined)}
                            </TD>
                          ))}
                        </TR>
                      ) : null}
                    </TBody>
                  </Table>
                )}
              </Card>
            );
          })
        )}
      </div>
    </ReportShell>
  );
}

function ReportShell({
  type,
  classFilter,
  kind,
  fromValue,
  toValue,
  classes,
  children,
}: {
  type: string;
  classFilter: string;
  kind: string;
  fromValue: string;
  toValue: string;
  classes: { id: string; name: string; code: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Báo cáo điểm số"
          description="Điểm kiểm tra đã ghi trên buổi: buổi Học vụ phụ trách và cột kiểm tra nhỏ do giáo viên thêm."
        />
      </div>

      <Card className="shrink-0">
        <CardHeader className="flex-col items-start gap-3">
          <div>
            <CardTitle>Bộ lọc</CardTitle>
            <CardDescription>
              Chọn lớp để xem từng bài kiểm tra. Để trống lớp thì hiện danh sách lớp đã có điểm.
            </CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <Field label="Loại kiểm tra">
              <Select name="kind" defaultValue={kind}>
                <option value="">Tất cả</option>
                {Object.entries(KINDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
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

      {children}
    </div>
  );
}
