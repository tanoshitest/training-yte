import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DeleteButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { WEEKDAY_SHORT, timeToMinutes } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import type { ClassType } from "@/generated/prisma/enums";
import { createClass, deleteClass } from "./actions";
import { ClassFields } from "./class-fields";
import { ClassFilters } from "./filters";
import { loadClassOptions } from "./ui";

export const metadata: Metadata = { title: "Lớp học" };

const CLASS_TYPES: ClassType[] = ["NORMAL", "IELTS"];

type Search = { q?: string; type?: string; branch?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("class.create");

  const { q = "", type = "", branch = "" } = await searchParams;
  // Lọc theo enum thì phải kiểm tra trước: query string là dữ liệu người dùng gõ,
  // truyền thẳng một giá trị lạ vào Prisma sẽ ném lỗi thay vì ra danh sách rỗng.
  const typeFilter = CLASS_TYPES.includes(type as ClassType) ? (type as ClassType) : undefined;

  const where: Prisma.ClassWhereInput = {
    type: typeFilter,
    branchId: branch || undefined,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [options, classes] = await Promise.all([
    loadClassOptions(),
    prisma.class.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        branch: { select: { name: true } },
        schedules: { select: { id: true, weekday: true, startTime: true } },
        enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
        // Đếm đủ cả ghi danh đã nghỉ để câu xác nhận xoá nói đúng số lượng.
        _count: { select: { enrollments: true, sessions: true } },
      },
    }),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Lớp học"
          description="Quản lý lớp, giáo viên, học viên và lịch học lặp theo tuần."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <CardTitle>Danh sách lớp ({classes.length})</CardTitle>
              <CardDescription>Số học viên tính theo các lần ghi danh đang học.</CardDescription>
            </div>
            <ModalForm
              action={createClass}
              title="Thêm lớp"
              submitLabel="Tạo lớp"
              wide
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Thêm
                </>
              }
            >
              <p className="text-xs text-slate-500">
                Loại lớp quyết định mô hình học phí và không đổi được sau khi lớp đã có học viên
                (R2). Danh sách học viên thêm ở trang chi tiết lớp.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ClassFields options={options} />
              </div>
            </ModalForm>
          </div>

          <ClassFilters q={q} type={type} branch={branch} branches={options.branches} />
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
                <EmptyRow colSpan={9}>Không có lớp nào khớp bộ lọc.</EmptyRow>
              ) : (
                classes.map((cls, index) => {
                  const slots = [...cls.schedules].sort(
                    (a, b) =>
                      a.weekday - b.weekday ||
                      timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
                  );

                  return (
                    <TR key={cls.id}>
                      <TDIndex value={index + 1} />
                      <TD className="whitespace-nowrap font-mono text-xs text-slate-500">
                        {cls.code}
                      </TD>
                      <TD>
                        <Link
                          href={`/lop-hoc/${cls.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
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
                          slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(" · ")
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">{cls.enrollments.length}</TD>
                      <TD>
                        <StatusBadge value={cls.status} />
                      </TD>
                      <TD className="w-px whitespace-nowrap text-right">
                        <DeleteButton
                          action={deleteClass}
                          id={cls.id}
                          message={`Bạn có chắc muốn xóa dữ liệu này? Xoá lớp ${cls.name} sẽ mất luôn ${cls._count.enrollments} lần ghi danh, ${cls._count.sessions} buổi học cùng toàn bộ điểm danh, học phí và phiếu thu của lớp. Không khôi phục lại được.`}
                        />
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
