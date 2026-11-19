import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { addDaysUtc, dateKey, formatDateUtc, todayUtc } from "@/lib/date";
import { WEEKDAY_LABELS } from "@/lib/utils";
import { getTodayAutomaticTasks, TASK_HISTORY_START } from "@/lib/automatic-tasks";
import { ROLE_LABEL } from "@/lib/roles";
import { STAGE_LABEL } from "@/lib/recruitment";
import { DashboardTabs } from "./dashboard-tabs";
import { DistributionChart, type DistributionSlice } from "./distribution-chart";
import { RevenueLegend, TuitionRevenueChart } from "./revenue-chart";
import { yearTuitionRevenue } from "./revenue";
import { loadStaffKpi, type StaffKpiRow } from "./kpi";

export const metadata: Metadata = { title: "Tổng quan" };

/** Header compact + tối đa 15 dòng `py-1.5`/`text-sm`; vượt thì cuộn trong bảng. */
const TABLE_MAX_15 = "max-h-[calc(1.75rem+1px+15*(2rem+1px))] overflow-y-auto overscroll-contain";

function PanelCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 px-3 py-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {extra}
      </CardHeader>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </Card>
  );
}

function kpiResult(row: StaffKpiRow) {
  if (row.total === 0) return { percent: null as number | null };
  return { percent: Math.round((row.onTime / row.total) * 100) };
}

function overdueDayHeading(date: Date) {
  return `${WEEKDAY_LABELS[date.getUTCDay()]}, ${formatDateUtc(date)}`;
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const today = todayUtc();
  const tomorrow = addDaysUtc(today, 1);
  const year = today.getUTCFullYear();

  const [studentStatusCounts, activeClassTypeCounts, todaySessions, todayRecruitment, monthRevenue, automaticTasks, overdueGeneral, staffKpi] =
    await Promise.all([
    prisma.student.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.class.groupBy({ by: ["type"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    prisma.lessonSession.findMany({
      where: { date: today, status: { not: "CANCELLED" } },
      orderBy: [{ startTime: "asc" }, { class: { name: "asc" } }],
      select: {
        id: true,
        startTime: true,
        endTime: true,
        class: {
          select: {
            id: true,
            name: true,
            _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
          },
        },
        attendances: { select: { status: true } },
      },
    }),
    prisma.recruitmentCase.findMany({
      where: { consultationDate: { gte: today, lt: tomorrow } },
      orderBy: [{ consultationDate: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        stage: true,
        consultant: { select: { fullName: true } },
      },
    }),
    yearTuitionRevenue(year),
    getTodayAutomaticTasks({ includeTeacherReview: true }),
    prisma.generalTask.findMany({
      where: { status: "OPEN", endDate: { lt: today } },
      orderBy: { endDate: "asc" },
      select: { id: true, title: true, endDate: true, assignee: { select: { fullName: true } } },
    }),
    loadStaffKpi(),
  ]);

  const studentCountByStatus = new Map(studentStatusCounts.map((row) => [row.status, row._count._all]));
  const studentDistribution: DistributionSlice[] = [
    { key: "STUDYING", label: "Đang học", value: studentCountByStatus.get("STUDYING") ?? 0, tone: "green" },
    { key: "UNASSIGNED", label: "Chưa xếp lớp", value: studentCountByStatus.get("UNASSIGNED") ?? 0, tone: "brand" },
    { key: "RESERVED", label: "Bảo lưu", value: studentCountByStatus.get("RESERVED") ?? 0, tone: "amber" },
    { key: "DROPPED", label: "Nghỉ học", value: studentCountByStatus.get("DROPPED") ?? 0, tone: "red" },
  ];
  const classCountByType = new Map(activeClassTypeCounts.map((row) => [row.type, row._count._all]));
  const activeClassDistribution: DistributionSlice[] = [
    { key: "NORMAL", label: "Lớp thường", value: classCountByType.get("NORMAL") ?? 0, tone: "brand" },
    { key: "IELTS", label: "IELTS", value: classCountByType.get("IELTS") ?? 0, tone: "amber" },
  ];
  const overdueTasks = automaticTasks.filter((task) => task.overdue);
  const overdueItems = [
    ...overdueTasks.map((task) => ({
      id: task.id,
      date: task.date,
      time: `${task.startTime}–${task.endTime}`,
      href: task.href,
      label: task.className,
      work: task.kind === "ATTENDANCE" ? "Điểm danh" : "Nhận xét",
      assignee: task.assignee,
    })),
    ...overdueGeneral.map((task) => ({
      id: task.id,
      date: task.endDate,
      time: null as string | null,
      href: undefined as string | undefined,
      label: task.title,
      work: "Giao việc",
      assignee: task.assignee.fullName,
    })),
  ].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (a.time ?? "").localeCompare(b.time ?? "") || a.label.localeCompare(b.label, "vi"),
  );

  return (
    <DashboardTabs
      overview={
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
            <PanelCard
              title={`Doanh số lớp thường ${year}`}
              extra={<RevenueLegend />}
            >
              <div className="h-[220px] min-h-0 px-3 pb-2">
                <TuitionRevenueChart months={monthRevenue.normal} />
              </div>
            </PanelCard>

            <PanelCard
              title={`Doanh số IELTS ${year}`}
              extra={<RevenueLegend />}
            >
              <div className="h-[220px] min-h-0 px-3 pb-2">
                <TuitionRevenueChart months={monthRevenue.ielts} />
              </div>
            </PanelCard>
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
            <PanelCard title="Phân bổ học viên theo trạng thái">
              <div className="h-[220px] min-h-0 px-4 pb-2">
                <DistributionChart slices={studentDistribution} centerLabel="Tổng học viên" />
              </div>
            </PanelCard>

            <PanelCard title="Phân bổ lớp đang học">
              <div className="h-[220px] min-h-0 px-4 pb-2">
                <DistributionChart slices={activeClassDistribution} centerLabel="Lớp đang học" />
              </div>
            </PanelCard>
          </div>

        </div>
      }
      activity={
        <div className="grid min-h-0 grid-cols-1 gap-3 pb-1 xl:grid-cols-2 xl:items-start">
          <PanelCard title="Lớp học hôm nay">
            <Table wrapperClassName={TABLE_MAX_15}>
              <THead className="sticky top-0 z-[1]">
                <TR>
                  <THIndex className="px-3 py-1.5" />
                  <TH className="px-3 py-1.5">Giờ</TH>
                  <TH className="px-3 py-1.5">Lớp</TH>
                  <TH className="px-3 py-1.5 text-right">HV</TH>
                  <TH className="px-3 py-1.5 text-right">Điểm danh</TH>
                </TR>
              </THead>
              <TBody>
                {todaySessions.length === 0 ? (
                  <EmptyRow colSpan={5}>Hôm nay không có buổi học nào.</EmptyRow>
                ) : (
                  todaySessions.map((session, index) => {
                    const students = session.class._count.enrollments;
                    const present = session.attendances.filter((row) => row.status === "PRESENT").length;
                    const checkedIn = session.attendances.length > 0;

                    return (
                      <TR key={session.id}>
                        <TDIndex value={index + 1} className="px-3 py-1.5" />
                        <TD className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-600">
                          {session.startTime}–{session.endTime}
                        </TD>
                        <TD className="px-3 py-1.5">
                          <Link
                            href={`/lop-hoc/${session.class.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {session.class.name}
                          </Link>
                        </TD>
                        <TD className="px-3 py-1.5 text-right tabular-nums">{students}</TD>
                        <TD className="px-3 py-1.5 text-right">
                          <Link
                            href={`/lich-day/${session.id}`}
                            className={checkedIn ? "tabular-nums text-brand-700 hover:underline" : "text-slate-500 hover:underline"}
                          >
                            {checkedIn ? `${present}/${students}` : "Chưa"}
                          </Link>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </PanelCard>

          <PanelCard title="Tuyển sinh hôm nay">
            <Table wrapperClassName={TABLE_MAX_15}>
              <THead className="sticky top-0 z-[1]">
                <TR>
                  <THIndex className="px-3 py-1.5" />
                  <TH className="px-3 py-1.5">Mã</TH>
                  <TH className="px-3 py-1.5">Học viên</TH>
                  <TH className="px-3 py-1.5">SĐT</TH>
                  <TH className="px-3 py-1.5">Giai đoạn</TH>
                  <TH className="px-3 py-1.5">Tư vấn viên</TH>
                </TR>
              </THead>
              <TBody>
                {todayRecruitment.length === 0 ? (
                  <EmptyRow colSpan={6}>Hôm nay chưa có hồ sơ tuyển sinh.</EmptyRow>
                ) : (
                  todayRecruitment.map((row, index) => (
                    <TR key={row.id}>
                      <TDIndex value={index + 1} className="px-3 py-1.5" />
                      <TD className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-500">
                        {row.code}
                      </TD>
                      <TD className="px-3 py-1.5">
                        <Link href={`/tuyen-sinh/${row.id}`} className="font-medium text-brand-700 hover:underline">
                          {row.fullName}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap px-3 py-1.5">{row.phone}</TD>
                      <TD className="whitespace-nowrap px-3 py-1.5">{STAGE_LABEL[row.stage]}</TD>
                      <TD className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                        {row.consultant?.fullName ?? "—"}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </PanelCard>
        </div>
      }
      task={
        <div className="grid min-h-0 grid-cols-1 gap-3 pb-1 xl:grid-cols-2 xl:items-start">
          <PanelCard
            title={`Task quá hạn (${overdueItems.length})`}
            extra={
              <Link href="/task" className="text-xs font-medium text-brand-700 hover:underline">
                Xem tất cả
              </Link>
            }
          >
            <Table wrapperClassName={TABLE_MAX_15}>
              <THead className="sticky top-0 z-[1]">
                <TR>
                  <THIndex className="px-3 py-1.5" />
                  <TH className="px-3 py-1.5">Giờ</TH>
                  <TH className="px-3 py-1.5">Lớp / việc</TH>
                  <TH className="px-3 py-1.5">Công việc</TH>
                  <TH className="px-3 py-1.5">Phụ trách</TH>
                  <TH className="px-3 py-1.5">Trạng thái</TH>
                </TR>
              </THead>
              <TBody>
                {overdueItems.length === 0 ? (
                  <EmptyRow colSpan={6}>Không có task quá hạn.</EmptyRow>
                ) : (
                  overdueItems.flatMap((task, index) => {
                    const key = dateKey(task.date);
                    const prevKey = index === 0 ? null : dateKey(overdueItems[index - 1].date);
                    const rows = [];
                    if (key !== prevKey) {
                      rows.push(
                        <TR key={`day-${key}`} className="hover:bg-slate-50">
                          <TD
                            colSpan={6}
                            className="bg-slate-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-600"
                          >
                            {overdueDayHeading(task.date)}
                          </TD>
                        </TR>,
                      );
                    }
                    rows.push(
                      <TR key={task.id}>
                        <TDIndex value={index + 1} className="px-3 py-1.5" />
                        <TD className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-600">
                          {task.time ?? <span className="text-slate-400">—</span>}
                        </TD>
                        <TD className="px-3 py-1.5">
                          {task.href ? (
                            <Link href={task.href} className="font-medium text-brand-700 hover:underline">
                              {task.label}
                            </Link>
                          ) : (
                            <span className="font-medium">{task.label}</span>
                          )}
                        </TD>
                        <TD className="px-3 py-1.5">{task.work}</TD>
                        <TD className="truncate px-3 py-1.5 text-slate-600">{task.assignee}</TD>
                        <TD className="px-3 py-1.5">
                          <Badge tone="red">Quá hạn</Badge>
                        </TD>
                      </TR>,
                    );
                    return rows;
                  })
                )}
              </TBody>
            </Table>
          </PanelCard>

          <PanelCard
            title="Bảng đánh giá KPI"
            extra={
              <span className="text-[11px] text-slate-500">
                Từ {formatDateUtc(TASK_HISTORY_START)}
              </span>
            }
          >
            <Table wrapperClassName={TABLE_MAX_15}>
              <THead className="sticky top-0 z-[1]">
                <TR>
                  <THIndex className="px-3 py-1.5" />
                  <TH className="px-3 py-1.5">Nhân sự</TH>
                  <TH className="px-3 py-1.5">Vai trò</TH>
                  <TH className="px-3 py-1.5 text-right">Kết quả đạt được</TH>
                </TR>
              </THead>
              <TBody>
                {staffKpi.length === 0 ? (
                  <EmptyRow colSpan={4}>Chưa có giáo viên hoặc học vụ.</EmptyRow>
                ) : (
                  staffKpi.map((row, index) => {
                    const result = kpiResult(row);
                    return (
                      <TR key={row.userId}>
                        <TDIndex value={index + 1} className="px-3 py-1.5" />
                        <TD className="px-3 py-1.5 font-medium">{row.name}</TD>
                        <TD className="px-3 py-1.5">
                          <Badge tone={row.role === "TEACHER" ? "brand" : "slate"}>
                            {ROLE_LABEL[row.role]}
                          </Badge>
                        </TD>
                        <TD className="px-3 py-1.5 text-right">
                          {result.percent == null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="inline-flex items-baseline justify-end gap-1.5">
                              <span className="font-semibold tabular-nums text-slate-900">
                                {result.percent}%
                              </span>
                              <span className="text-[11px] tabular-nums text-slate-400">
                                {row.onTime}/{row.total}
                              </span>
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </PanelCard>
        </div>
      }
    />
  );
}
