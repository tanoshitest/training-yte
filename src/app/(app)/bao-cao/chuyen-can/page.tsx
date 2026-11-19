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

export const metadata: Metadata = { title: "Báo cáo chuyên cần" };

type Search = { q?: string; class?: string; status?: string };

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
        select: { studentId: true, status: true },
      })
    : [];
  const byStudent = new Map<string, { present: number; late: number; absent: number; total: number }>();
  for (const row of attendances) {
    const current = byStudent.get(row.studentId) ?? { present: 0, late: 0, absent: 0, total: 0 };
    current.total += 1;
    if (row.status === "PRESENT") current.present += 1;
    else if ((row.status as string) === "LATE") current.late += 1;
    else if (row.status === "ABSENT") current.absent += 1;
    byStudent.set(row.studentId, current);
  }

  const rows = enrollments.map((item) => {
    const stats = byStudent.get(item.student.id) ?? { present: 0, late: 0, absent: 0, total: 0 };
    const rate = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
    const flag = stats.absent >= 2 ? "RISK" : stats.late ? "WATCH" : "GOOD";
    return { ...item, ...stats, rate, flag };
  }).filter((row) => {
    if (status && row.flag !== status) return false;
    if (query && !`${row.student.fullName} ${row.student.code} ${row.class.name}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const risk = rows.filter((row) => row.flag === "RISK").length;
  const watch = rows.filter((row) => row.flag === "WATCH").length;
  const avg = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.rate, 0) / rows.length) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PageHeader title="Báo cáo chuyên cần" description="Điểm danh có mặt, đi trễ và vắng theo từng học viên đang xếp lớp." />
      </div>
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Học viên</CardDescription><CardTitle>{rows.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Chuyên cần TB</CardDescription><CardTitle>{avg}%</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Đi trễ</CardDescription><CardTitle>{watch}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Cần theo dõi</CardDescription><CardTitle>{risk}</CardTitle></CardHeader></Card>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Chuyên cần học viên ({rows.length})</CardTitle>
            <CardDescription>Học viên vắng từ 2 buổi được đánh dấu cần theo dõi.</CardDescription>
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
                <option value="GOOD">Chuyên cần tốt</option>
                <option value="WATCH">Đi trễ</option>
                <option value="RISK">Cần theo dõi</option>
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
              <TH>Buổi</TH>
              <TH>Có mặt</TH>
              <TH>Trễ</TH>
              <TH>Vắng</TH>
              <TH>Tỷ lệ</TH>
              <TH>Tình trạng</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={10}>Không có học viên nào khớp bộ lọc.</EmptyRow>
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
                <TD>{row.total}</TD>
                <TD>{row.present}</TD>
                <TD>{row.late}</TD>
                <TD className={row.absent ? "font-medium text-red-600" : undefined}>{row.absent}</TD>
                <TD>{row.rate}%</TD>
                <TD>
                  <Badge tone={row.flag === "RISK" ? "amber" : row.flag === "WATCH" ? "brand" : "green"}>
                    {row.flag === "RISK" ? "Cần theo dõi" : row.flag === "WATCH" ? "Đi trễ" : "Chuyên cần tốt"}
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
