import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { dateKey, formatDateUtc, parseDateInput, startOfMonthUtc, todayUtc } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { classAttendanceHref } from "@/lib/session";

export const metadata: Metadata = { title: "Báo cáo buổi học" };

const STATUSES = {
  SCHEDULED: "Đã xếp lịch",
  COMPLETED: "Đã dạy",
  CANCELLED: "Huỷ",
} as const;

type Search = { q?: string; class?: string; status?: string; from?: string; to?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("calendar.manage");

  const { q = "", class: classId = "", status = "", from = "", to = "" } = await searchParams;
  const today = todayUtc();
  const requestedFrom = parseDateInput(from) ?? startOfMonthUtc(today);
  const requestedTo = parseDateInput(to) ?? today;
  const start = requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  const end = requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;
  const statusFilter = status in STATUSES ? (status as keyof typeof STATUSES) : "";
  const query = q.trim().toLowerCase();

  const classes = await prisma.class.findMany({
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, name: true, code: true },
  });
  const classFilter = classes.some((item) => item.id === classId) ? classId : "";

  const sessions = await prisma.lessonSession.findMany({
    where: {
      date: { gte: start, lte: end },
      ...(classFilter ? { classId: classFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      sequence: true,
      class: { select: { id: true, name: true, code: true } },
      teacher: { select: { user: { select: { fullName: true } } } },
      room: { select: { name: true } },
      syllabusLesson: { select: { name: true } },
    },
  });

  const rows = sessions.filter((session) => {
    if (!query) return true;
    return `${session.class.name} ${session.class.code} ${session.teacher?.user.fullName ?? ""}`.toLowerCase().includes(query);
  });
  const done = rows.filter((row) => row.status === "COMPLETED").length;
  const planned = rows.filter((row) => row.status === "SCHEDULED").length;
  const cancelled = rows.filter((row) => row.status === "CANCELLED").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PageHeader title="Báo cáo buổi học" description="Tổng hợp buổi đã dạy, buổi sắp tới và buổi huỷ theo lớp." />
      </div>
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Tổng buổi</CardDescription><CardTitle>{rows.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Đã dạy</CardDescription><CardTitle>{done}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Đã xếp lịch</CardDescription><CardTitle>{planned}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Huỷ</CardDescription><CardTitle>{cancelled}</CardTitle></CardHeader></Card>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Danh sách buổi học ({rows.length})</CardTitle>
            <CardDescription>Lọc theo lớp, trạng thái và khoảng ngày.</CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tìm kiếm">
              <Input name="q" defaultValue={q} placeholder="Tên lớp hoặc giáo viên..." />
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
              <Select name="status" defaultValue={statusFilter}>
                <option value="">Tất cả</option>
                {Object.entries(STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={dateKey(start)} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={dateKey(end)} />
            </Field>
          </FilterForm>
        </CardHeader>
        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Ngày</TH>
              <TH>Lớp</TH>
              <TH>Giờ</TH>
              <TH>Giáo viên</TH>
              <TH>Phòng</TH>
              <TH>Nội dung</TH>
              <TH>Tình trạng</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>Không có buổi học nào khớp bộ lọc.</EmptyRow>
            ) : rows.map((session, index) => (
              <TR key={session.id}>
                <TDIndex value={index + 1} />
                <TD className="whitespace-nowrap">
                  <Link href={classAttendanceHref(session.class.id, session.id)} className="font-medium text-brand-700 hover:underline">
                    {formatDateUtc(session.date)}
                  </Link>
                </TD>
                <TD>{session.class.name}</TD>
                <TD className="whitespace-nowrap">{session.startTime}–{session.endTime}</TD>
                <TD>{session.teacher?.user.fullName ?? "Chưa phân công"}</TD>
                <TD>{session.room?.name ?? "Chưa xếp phòng"}</TD>
                <TD>{session.syllabusLesson?.name ?? `Buổi ${session.sequence}`}</TD>
                <TD><StatusBadge value={session.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
