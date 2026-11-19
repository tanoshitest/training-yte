import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { assignedClassWhere, requirePermission } from "@/lib/permissions";
import { WEEKDAY_SHORT, timeToMinutes } from "@/lib/utils";

export const metadata: Metadata = { title: "Lớp của tôi" };

export default async function Page() {
  const user = await requirePermission("class.viewAssigned");

  const classes = await prisma.class.findMany({
    where: assignedClassWhere(user.teacherId ?? ""),
    orderBy: [{ status: "asc" }, { code: "asc" }],
    include: {
      branch: { select: { name: true } },
      level: { select: { name: true } },
      schedules: { select: { id: true, weekday: true, startTime: true } },
      enrollments: { where: { status: { in: ["ACTIVE", "RESERVED"] } }, select: { id: true } },
      _count: { select: { enrollments: true, sessions: true } },
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Lớp của tôi"
          description="Lớp gắn trên thời khoá biểu của bạn. Bấm tên lớp hoặc Vào lớp để mở bảng điểm danh, nhận xét và báo cáo buổi."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <CardTitle>Danh sách lớp ({classes.length})</CardTitle>
              <CardDescription>Số học viên tính theo các lần ghi danh đang học.</CardDescription>
            </div>
            <Link href="/gv/lich-day" className={buttonClass("outline", "sm")}>
              <Plus className="h-4 w-4" />
              Lịch dạy
            </Link>
          </div>
        </CardHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <THead>
              <TR>
                <THIndex />
                <TH>Mã</TH>
                <TH>Tên lớp</TH>
                <TH>Loại</TH>
                <TH>Chi nhánh</TH>
                <TH>Lịch tuần</TH>
                <TH>Học viên</TH>
                <TH>Trạng thái</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {classes.length === 0 ? (
                <EmptyRow colSpan={9}>Chưa có lớp nào trên thời khoá biểu của bạn.</EmptyRow>
              ) : (
                classes.map((cls, index) => {
                  const slots = [...cls.schedules].sort(
                    (a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
                  );

                  return (
                    <TR key={cls.id}>
                      <TDIndex value={index + 1} />
                      <TD className="whitespace-nowrap font-mono text-xs text-slate-500">{cls.code}</TD>
                      <TD>
                        <Link href={`/lop-hoc/${cls.id}?tab=diem-danh`} className="font-medium text-brand-700 hover:underline">
                          {cls.name}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge value={cls.type} />
                      </TD>
                      <TD>{cls.branch?.name ?? <span className="text-slate-400">—</span>}</TD>
                      <TD className="whitespace-nowrap text-xs text-slate-600">
                        {slots.length === 0 ? (
                          <span className="text-slate-400">Chưa có lịch</span>
                        ) : (
                          slots.map((slot) => `${WEEKDAY_SHORT[slot.weekday]} ${slot.startTime}`).join(" · ")
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">{cls.enrollments.length}</TD>
                      <TD>
                        <StatusBadge value={cls.status} />
                      </TD>
                      <TD className="w-px whitespace-nowrap text-right">
                        <Link
                          href={`/lop-hoc/${cls.id}?tab=diem-danh`}
                          className={buttonClass("primary", "sm")}
                        >
                          Vào lớp
                        </Link>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
