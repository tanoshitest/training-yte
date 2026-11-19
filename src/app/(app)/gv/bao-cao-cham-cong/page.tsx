import type { Metadata } from "next";
import Link from "next/link";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { assignedSessionWhere, requirePermission } from "@/lib/permissions";
import { formatDateUtc, todayUtc } from "@/lib/date";
import { classAttendanceHref } from "@/lib/session";

export const metadata: Metadata = { title: "Báo cáo chấm công" };

const SELECT = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  status: true,
  class: { select: { id: true, code: true, name: true } },
  report: { select: { id: true } },
} as const;

type Search = { from?: string; to?: string };

function normalizeDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

type SessionRow = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: { id: string; code: string; name: string };
  report: { id: string } | null;
};

function lessonReportBadge(row: SessionRow, today: number) {
  if (row.report) return { tone: "green" as const, label: "Đã hoàn thành" };
  if (row.date.getTime() < today) return { tone: "red" as const, label: "Quá hạn" };
  return { tone: "slate" as const, label: "Chưa hoàn thành" };
}

function HistoryTable({
  rows,
  empty,
}: {
  rows: SessionRow[];
  empty: string;
}) {
  const today = todayUtc().getTime();
  return (
    <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
      <THead>
        <TR>
          <THIndex />
          <TH>Ngày</TH>
          <TH>Giờ</TH>
          <TH>Lớp</TH>
          <TH>Trạng thái</TH>
          <TH className="text-right">Báo cáo buổi học</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={6}>{empty}</EmptyRow>
        ) : (
          rows.map((row, index) => {
            const report = lessonReportBadge(row, today);
            return (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD>
                  <Link href={classAttendanceHref(row.class.id, row.id)} className="font-medium text-brand-700 hover:underline">
                    {formatDateUtc(row.date)}
                  </Link>
                </TD>
                <TD>
                  {row.startTime}–{row.endTime}
                </TD>
                <TD>
                  <Link href={`/lop-hoc/${row.class.id}`} className="font-medium text-slate-800 hover:underline">
                    {row.class.name}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">{row.class.code}</span>
                </TD>
                <TD>
                  <StatusBadge value={row.status} />
                </TD>
                <TD className="text-right">
                  {row.status === "CANCELLED" ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <Badge tone={report.tone}>{report.label}</Badge>
                  )}
                </TD>
              </TR>
            );
          })
        )}
      </TBody>
    </Table>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("calendar.viewOwn");
  const teacherId = user.teacherId ?? "";
  const { from, to } = await searchParams;

  const fromDate = normalizeDate(from);
  const toDate = normalizeDate(to);
  const toEnd = toDate ? new Date(toDate) : undefined;
  if (toEnd) toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const where = {
    ...assignedSessionWhere(teacherId),
    ...(fromDate || toEnd
      ? {
          date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toEnd ? { lt: toEnd } : {}),
          },
        }
      : {
          date: { lt: new Date() },
        }),
  };

  const history = await prisma.lessonSession.findMany({
    where,
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    select: SELECT,
  });

  const pastCount = history.filter((row) => row.status !== "CANCELLED").length;

  return (
    <div data-fill-page className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0">
        <CardHeader className="py-4">
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Từ ngày</span>
              <input
                type="date"
                name="from"
                defaultValue={from ?? ""}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-brand-400"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Đến ngày</span>
              <input
                type="date"
                name="to"
                defaultValue={to ?? ""}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-brand-400"
              />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                Lọc
              </button>
              <Link href="/gv/bao-cao-cham-cong" className="h-9 rounded-lg border border-slate-300 px-4 text-sm leading-9 text-slate-700 hover:bg-slate-50">
                Xóa lọc
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <HistoryTable rows={history} empty="Chưa có buổi dạy nào trong khoảng thời gian này." />
          <div className="shrink-0 border-t border-slate-200 px-5 py-2 text-sm text-slate-500">
            Tổng {pastCount}/{history.length} buổi đã kết thúc, bấm vào ngày hoặc tên lớp để mở đúng buổi cần xem.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
