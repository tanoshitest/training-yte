import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { assignedSessionWhere, requirePermission } from "@/lib/permissions";
import { addDaysUtc, formatDateUtc, todayUtc } from "@/lib/date";
import { classAttendanceHref } from "@/lib/session";
import { WEEKDAY_SHORT } from "@/lib/utils";

export const metadata: Metadata = { title: "Buổi học" };

const SELECT = {
  id: true,
  sequence: true,
  date: true,
  startTime: true,
  endTime: true,
  status: true,
  class: { select: { id: true, code: true, name: true } },
  room: { select: { name: true } },
  syllabusLesson: { select: { name: true } },
  report: { select: { id: true } },
  _count: { select: { attendances: true } },
} as const;

type Row = {
  id: string;
  sequence: number;
  date: Date;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: { id: string; code: string; name: string };
  room: { name: string } | null;
  syllabusLesson: { name: string } | null;
  report: { id: string } | null;
  _count: { attendances: number };
};

function SessionTable({ rows, empty }: { rows: Row[]; empty: string }) {
  return (
    <Table>
      <THead>
        <TR>
          <THIndex />
          <TH>Ngày</TH>
          <TH>Giờ</TH>
          <TH>Lớp</TH>
          <TH>Buổi</TH>
          <TH>Phòng</TH>
          <TH>Trạng thái</TH>
          <TH className="text-right">Ghi nhận</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={8}>{empty}</EmptyRow>
        ) : (
          rows.map((row, index) => (
            <TR key={row.id}>
              <TDIndex value={index + 1} />
              <TD>
                <Link
                  href={classAttendanceHref(row.class.id, row.id)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {WEEKDAY_SHORT[row.date.getUTCDay()]}, {formatDateUtc(row.date)}
                </Link>
              </TD>
              <TD>
                {row.startTime}–{row.endTime}
              </TD>
              <TD>
                <span className="font-medium text-slate-800">{row.class.name}</span>{" "}
                <span className="text-xs text-slate-500">{row.class.code}</span>
              </TD>
              <TD>
                Buổi {row.sequence}
                {row.syllabusLesson ? (
                  <span className="block text-xs text-slate-500">{row.syllabusLesson.name}</span>
                ) : null}
              </TD>
              <TD>{row.room?.name ?? "—"}</TD>
              <TD>
                <StatusBadge value={row.status} />
              </TD>
              <TD className="text-right">
                {row.status === "CANCELLED" ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  <span className="inline-flex gap-1.5">
                    <Badge tone={row._count.attendances > 0 ? "green" : "slate"}>
                      {row._count.attendances > 0 ? "Đã điểm danh" : "Chưa điểm danh"}
                    </Badge>
                    <Badge tone={row.report ? "green" : "slate"}>
                      {row.report ? "Đã báo cáo" : "Chưa báo cáo"}
                    </Badge>
                  </span>
                )}
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}

export default async function Page() {
  const user = await requirePermission("calendar.viewOwn");

  // R5 — chỉ lấy buổi mà giáo viên này đứng lớp.
  const teacherId = user.teacherId ?? "";
  const today = todayUtc();

  const [upcoming, recent] = await Promise.all([
    prisma.lessonSession.findMany({
      where: { ...assignedSessionWhere(teacherId), date: { gte: today, lte: addDaysUtc(today, 14) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: SELECT,
    }),
    prisma.lessonSession.findMany({
      where: { ...assignedSessionWhere(teacherId), date: { gte: addDaysUtc(today, -30), lt: today } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 50,
      select: SELECT,
    }),
  ]);

  // Buổi đã qua nhưng chưa có báo cáo — điểm danh là việc của quản trị viên nên không tính.
  const pending = recent.filter((row) => row.status === "SCHEDULED" && !row.report);

  return (
    <>
      <PageHeader
        title="Buổi học"
        description="Nhận xét học viên và báo cáo sau buổi dạy. Bấm vào ngày để mở điểm danh của lớp."
      />

      <div className="space-y-5">
        {pending.length > 0 ? (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle>Cần hoàn tất ({pending.length})</CardTitle>
              <CardDescription>Buổi đã qua nhưng chưa có báo cáo.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SessionTable rows={pending} empty="Không có buổi nào." />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Sắp tới (14 ngày)</CardTitle>
            <CardDescription>Từ hôm nay đến {formatDateUtc(addDaysUtc(today, 14))}.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SessionTable rows={upcoming} empty="Bạn chưa có buổi dạy nào trong 14 ngày tới." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Đã dạy gần đây (30 ngày)</CardTitle>
            <CardDescription>Tối đa 50 buổi gần nhất.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SessionTable rows={recent} empty="Chưa có buổi nào trong 30 ngày qua." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
