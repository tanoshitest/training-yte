import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import type { HomeworkRating, LessonRating } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Báo cáo học vụ" };

const HOMEWORK: Record<HomeworkRating, number> = {
  FULL_100: 100,
  EIGHTY_80: 80,
  BELOW_50: 50,
  ZERO_0: 0,
};

const LESSON: Record<LessonRating, number> = {
  A_PLUS: 10,
  A: 9,
  A_MINUS: 8,
  B: 7,
};

type Search = { q?: string; class?: string; status?: string };

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("attendance.submit");

  const { q = "", class: classId = "", status = "" } = await searchParams;
  const query = q.trim().toLowerCase();

  const classes = await prisma.class.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, name: true, code: true },
  });
  const classFilter = classes.some((item) => item.id === classId) ? classId : "";

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      ...(classFilter ? { classId: classFilter } : {}),
    },
    orderBy: [{ student: { fullName: "asc" } }],
    select: {
      id: true,
      class: { select: { id: true, name: true } },
      student: { select: { id: true, code: true, fullName: true } },
    },
  });

  const studentIds = enrollments.map((item) => item.student.id);
  const attendances = studentIds.length
    ? await prisma.attendance.findMany({
        where: { studentId: { in: studentIds }, session: { status: { not: "CANCELLED" } } },
        select: { studentId: true, homeworkRating: true, lessonRating: true, note: true },
      })
    : [];
  const byStudent = new Map<string, { homework: number[]; scores: number[]; notes: string[] }>();
  for (const row of attendances) {
    const current = byStudent.get(row.studentId) ?? { homework: [], scores: [], notes: [] };
    if (row.homeworkRating) current.homework.push(HOMEWORK[row.homeworkRating]);
    if (row.lessonRating) current.scores.push(LESSON[row.lessonRating]);
    if (row.note?.trim()) current.notes.push(row.note.trim());
    byStudent.set(row.studentId, current);
  }

  const rows = enrollments.map((item) => {
    const stats = byStudent.get(item.student.id) ?? { homework: [], scores: [], notes: [] };
    const homework = average(stats.homework);
    const score = average(stats.scores);
    const flag = (homework != null && homework < 80) || (score != null && score < 7) ? "WATCH" : "GOOD";
    const note = stats.notes[0] || (flag === "WATCH" ? "Cần hỗ trợ học tập" : "Theo kịp lớp");
    return { ...item, homework, score, note, flag };
  }).filter((row) => {
    if (status && row.flag !== status) return false;
    if (query && !`${row.student.fullName} ${row.student.code} ${row.class.name}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const watch = rows.filter((row) => row.flag === "WATCH").length;
  const avgHw = average(rows.flatMap((row) => (row.homework == null ? [] : [row.homework])));
  const avgScore = average(rows.flatMap((row) => (row.score == null ? [] : [row.score])));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PageHeader title="Báo cáo học vụ" description="Homework, điểm trên lớp và ghi chú học tập của học viên đang xếp lớp." />
      </div>
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Học viên</CardDescription><CardTitle>{rows.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Homework TB</CardDescription><CardTitle>{avgHw == null ? "—" : `${Math.round(avgHw)}%`}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Điểm TB</CardDescription><CardTitle>{avgScore == null ? "—" : avgScore.toFixed(1)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Cần hỗ trợ</CardDescription><CardTitle>{watch}</CardTitle></CardHeader></Card>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Học vụ theo học viên ({rows.length})</CardTitle>
            <CardDescription>Cần hỗ trợ khi homework dưới 80% hoặc điểm dưới 7.</CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tìm kiếm">
              <Input name="q" defaultValue={q} placeholder="Tên hoặc mã học viên..." />
            </Field>
            <Field label="Lớp học">
              <Select name="class" defaultValue={classFilter}>
                <option value="">Tất cả lớp</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                ))}
              </Select>
            </Field>
            <Field label="Tình trạng">
              <Select name="status" defaultValue={status}>
                <option value="">Tất cả</option>
                <option value="GOOD">Đạt</option>
                <option value="WATCH">Cần hỗ trợ</option>
              </Select>
            </Field>
          </FilterForm>
        </CardHeader>
        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Mã HV</TH>
              <TH>Tên HV</TH>
              <TH>Lớp</TH>
              <TH>Homework</TH>
              <TH>Điểm</TH>
              <TH>Ghi chú</TH>
              <TH>Tình trạng</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>Không có học viên nào khớp bộ lọc.</EmptyRow>
            ) : rows.map((row, index) => (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD className="font-mono text-xs">{row.student.code}</TD>
                <TD>
                  <Link href={`/hoc-vien/${row.student.id}`} className="font-medium text-brand-700 hover:underline">
                    {row.student.fullName}
                  </Link>
                </TD>
                <TD>{row.class.name}</TD>
                <TD>{row.homework == null ? "—" : `${Math.round(row.homework)}%`}</TD>
                <TD>{row.score == null ? "—" : `${row.score.toFixed(1)}/10`}</TD>
                <TD>{row.note}</TD>
                <TD>
                  <Badge tone={row.flag === "WATCH" ? "amber" : "green"}>
                    {row.flag === "WATCH" ? "Cần hỗ trợ" : "Đạt"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
