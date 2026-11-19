import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { dateKey, formatDateUtc, parseDateInput, startOfMonthUtc, todayUtc } from "@/lib/date";
import { requirePermission } from "@/lib/permissions";
import {
  PAYROLL_COMMISSION_PER_SESSION,
  PAYROLL_RATE_PER_HOUR,
  PAYROLL_TAX_RATE,
  assignedTeacherId,
  isPayableSession,
  loadTimesheetSessions,
  loadTimesheetTeachers,
  payrollFromTimesheet,
  sessionMinutes,
  summarizeByTeacher,
  type PayrollRow,
  type TimesheetSession,
} from "@/lib/teacher-timesheet";
import { formatCurrency } from "@/lib/utils";
import { PayrollDetailButton, type PayrollDetailView } from "./payroll-detail";

export const metadata: Metadata = { title: "Quản lý lương" };

const HOURS = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

type Search = { from?: string; to?: string };

function payrollDetail(row: PayrollRow, start: Date, end: Date, sessions: TimesheetSession[]): PayrollDetailView {
  const lines = sessions
    .filter((session) => isPayableSession(session) && assignedTeacherId(session) === row.teacherId)
    .map((session) => ({
      id: session.id,
      date: formatDateUtc(session.date),
      className: session.className,
      time: `${session.startTime}–${session.endTime}`,
      hours: HOURS.format(sessionMinutes(session.startTime, session.endTime) / 60),
    }));
  return {
    name: row.name,
    code: row.code,
    period: `${formatDateUtc(start)} – ${formatDateUtc(end)}`,
    sessions: row.payableSessions,
    hours: HOURS.format(row.hours),
    rate: formatCurrency(PAYROLL_RATE_PER_HOUR),
    commissionRate: formatCurrency(PAYROLL_COMMISSION_PER_SESSION),
    baseSalary: formatCurrency(row.baseSalary),
    commission: formatCurrency(row.commission),
    gross: formatCurrency(row.baseSalary + row.commission),
    tax: formatCurrency(row.tax),
    taxLabel: `Thuế ${PAYROLL_TAX_RATE * 100}%`,
    net: formatCurrency(row.net),
    timesheetHref: `/ke-toan/cham-cong?from=${dateKey(start)}&to=${dateKey(end)}&teacher=${row.teacherId}`,
    lines,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");
  const { from = "", to = "" } = await searchParams;
  const today = todayUtc();
  const requestedFrom = parseDateInput(from) ?? startOfMonthUtc(today);
  const requestedTo = parseDateInput(to) ?? today;
  const start = requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  const end = requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;

  const [sessions, teachers] = await Promise.all([
    loadTimesheetSessions(start, end),
    loadTimesheetTeachers(),
  ]);
  const rows = payrollFromTimesheet(summarizeByTeacher(sessions, teachers));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Quản lý lương"
          description="Lương, hoa hồng và thuế theo số buổi đã chấm công trên lịch dạy."
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Giáo viên</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Buổi đã dạy</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.reduce((sum, row) => sum + row.payableSessions, 0)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Hoa hồng</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCurrency(rows.reduce((sum, row) => sum + row.commission, 0))}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Thực lĩnh</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCurrency(rows.reduce((sum, row) => sum + row.net, 0))}
            </p>
          </Card>
        </div>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Bảng lương giáo viên ({rows.length})</CardTitle>
            <CardDescription>
              {HOURS.format(PAYROLL_RATE_PER_HOUR / 1000)} nghìn/giờ · hoa hồng {formatCurrency(PAYROLL_COMMISSION_PER_SESSION)}/buổi · thuế {PAYROLL_TAX_RATE * 100}%.{" "}
              <Link href={`/ke-toan/cham-cong?from=${dateKey(start)}&to=${dateKey(end)}`} className="font-medium text-brand-700 hover:underline">
                Xem chấm công
              </Link>
            </CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-2">
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={from || dateKey(start)} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={to || dateKey(end)} />
            </Field>
          </FilterForm>
        </CardHeader>
        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Mã GV</TH>
              <TH>Họ và tên</TH>
              <TH>Buổi</TH>
              <TH>Giờ</TH>
              <TH className="text-right">Lương</TH>
              <TH className="text-right">Hoa hồng</TH>
              <TH className="text-right">Thuế</TH>
              <TH className="text-right">Thực lĩnh</TH>
              <TH className="text-right">Thao tác</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={10}>Chưa có buổi hoàn thành trong khoảng ngày.</EmptyRow>
            ) : (
              rows.map((row, index) => (
                <TR key={row.teacherId}>
                  <TDIndex value={index + 1} />
                  <TD className="font-mono text-xs text-slate-500">{row.code}</TD>
                  <TD>
                    <Link href={`/ke-toan/cham-cong?from=${dateKey(start)}&to=${dateKey(end)}&teacher=${row.teacherId}`} className="font-medium text-brand-700 hover:underline">
                      {row.name}
                    </Link>
                  </TD>
                  <TD>{row.payableSessions}</TD>
                  <TD>{HOURS.format(row.hours)}</TD>
                  <TD className="text-right">{formatCurrency(row.baseSalary)}</TD>
                  <TD className="text-right">{formatCurrency(row.commission)}</TD>
                  <TD className="text-right">{formatCurrency(row.tax)}</TD>
                  <TD className="text-right font-medium">{formatCurrency(row.net)}</TD>
                  <TD className="text-right">
                    <PayrollDetailButton detail={payrollDetail(row, start, end, sessions)} />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
