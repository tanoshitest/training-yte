import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { dateKey, formatDateUtc, parseDateInput, startOfMonthUtc, todayUtc } from "@/lib/date";
import { requirePermission } from "@/lib/permissions";
import { classAttendanceHref } from "@/lib/session";
import {
  isPayableSession,
  loadTimesheetSessions,
  loadTimesheetTeachers,
  sessionMinutes,
  summarizeByTeacher,
} from "@/lib/teacher-timesheet";
import { WEEKDAY_SHORT } from "@/lib/utils";

export const metadata: Metadata = { title: "Báo cáo chấm công" };

const HOURS = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

type Search = { from?: string; to?: string; teacher?: string };

function formatHours(minutes: number) {
  return `${HOURS.format(minutes / 60)} giờ`;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");
  const { from = "", to = "", teacher: teacherId = "" } = await searchParams;
  const today = todayUtc();
  const requestedFrom = parseDateInput(from) ?? startOfMonthUtc(today);
  const requestedTo = parseDateInput(to) ?? today;
  const start = requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  const end = requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;
  const fromValue = dateKey(start);
  const toValue = dateKey(end);

  const teachers = await loadTimesheetTeachers();
  const teacherFilter = teachers.some((item) => item.id === teacherId) ? teacherId : "";
  const sessions = await loadTimesheetSessions(start, end, teacherFilter);
  const rows = summarizeByTeacher(sessions, teachers);
  const payable = sessions.filter(isPayableSession);
  const totalMinutes = payable.reduce((sum, session) => sum + sessionMinutes(session.startTime, session.endTime), 0);
  const selectedTeacher = teachers.find((item) => item.id === teacherFilter);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Báo cáo chấm công"
          description="Đếm buổi trên lịch dạy để tính lương. Chỉ buổi đã hoàn thành, không nghỉ cả lớp, mới cộng vào số buổi."
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Giáo viên</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Buổi tính lương</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{payable.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Giờ công</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{HOURS.format(totalMinutes / 60)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Buổi loại</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{sessions.length - payable.length}</p>
          </Card>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>
              {selectedTeacher
                ? `Nhật ký ${selectedTeacher.user.fullName}`
                : `Tổng hợp theo giáo viên (${rows.length})`}
            </CardTitle>
            <CardDescription>
              {payable.length} buổi tính lương · {formatHours(totalMinutes)} trong khoảng lọc.
              {selectedTeacher ? (
                <>
                  {" "}
                  <Link href={`/ke-toan/cham-cong?from=${fromValue}&to=${toValue}`} className="font-medium text-brand-700 hover:underline">
                    Về tổng hợp
                  </Link>
                </>
              ) : null}
            </CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Giáo viên">
              <Select name="teacher" defaultValue={teacherFilter}>
                <option value="">Tất cả giáo viên</option>
                {teachers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.user.fullName} ({item.code})
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

        {selectedTeacher ? (
          <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
            <THead className="sticky top-0 z-[1]">
              <TR>
                <THIndex />
                <TH>Ngày</TH>
                <TH>Lớp</TH>
                <TH>Giờ dạy</TH>
                <TH>Số giờ</TH>
                <TH>Phòng</TH>
                <TH>Điểm danh</TH>
                <TH>Tính lương</TH>
                <TH>Trạng thái</TH>
              </TR>
            </THead>
            <TBody>
              {sessions.length === 0 ? (
                <EmptyRow colSpan={9}>Không có buổi dạy nào khớp bộ lọc.</EmptyRow>
              ) : (
                sessions.map((session, index) => {
                  const payableRow = isPayableSession(session);
                  const minutes = payableRow ? sessionMinutes(session.startTime, session.endTime) : 0;
                  return (
                    <TR key={session.id}>
                      <TDIndex value={index + 1} />
                      <TD className="whitespace-nowrap text-slate-600">
                        <Link
                          href={classAttendanceHref(session.classId, session.id)}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {formatDateUtc(session.date)}
                        </Link>
                        <span className="text-slate-400"> ({WEEKDAY_SHORT[session.date.getUTCDay()]})</span>
                      </TD>
                      <TD>
                        <Link href={`/lop-hoc/${session.classId}`} className="font-medium text-brand-700 hover:underline">
                          {session.className}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">{session.classCode}</p>
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-slate-600">
                        {session.startTime}–{session.endTime}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {minutes > 0 ? formatHours(minutes) : <span className="text-slate-400">—</span>}
                      </TD>
                      <TD>{session.roomName ?? <span className="text-slate-400">—</span>}</TD>
                      <TD className="whitespace-nowrap">
                        {session.isOff ? (
                          <span className="text-amber-700">Nghỉ học</span>
                        ) : session.attendanceCount === 0 ? (
                          <span className="text-slate-400">Chưa điểm danh</span>
                        ) : (
                          `${session.present}/${session.attendanceCount} có mặt`
                        )}
                      </TD>
                      <TD>{payableRow ? "Có" : "Không"}</TD>
                      <TD>
                        <StatusBadge value={session.status} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        ) : (
          <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
            <THead className="sticky top-0 z-[1]">
              <TR>
                <THIndex />
                <TH>Mã GV</TH>
                <TH>Họ và tên</TH>
                <TH>Buổi tính lương</TH>
                <TH>Giờ công</TH>
                <TH>Nghỉ</TH>
                <TH>Huỷ</TH>
                <TH>Chưa dạy</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>Chưa có buổi trên lịch dạy trong khoảng ngày.</EmptyRow>
              ) : (
                rows.map((row, index) => (
                  <TR key={row.teacherId}>
                    <TDIndex value={index + 1} />
                    <TD className="font-mono text-xs text-slate-500">{row.code}</TD>
                    <TD>
                      <Link
                        href={`/ke-toan/cham-cong?from=${fromValue}&to=${toValue}&teacher=${row.teacherId}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TD>
                    <TD>{row.payableSessions}</TD>
                    <TD>{HOURS.format(row.hours)}</TD>
                    <TD>{row.off}</TD>
                    <TD>{row.cancelled}</TD>
                    <TD>{row.scheduled}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
