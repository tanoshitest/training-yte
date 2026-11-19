import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { DeleteButton, ModalForm } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { createTeacher, deleteTeacher } from "./actions";

export const metadata: Metadata = { title: "Giáo viên" };

type Search = { q?: string; active?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("teacher.manage");

  const { q = "", active = "" } = await searchParams;

  const where: Prisma.TeacherWhereInput = {
    ...(active === "1" || active === "0" ? { user: { isActive: active === "1" } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { user: { fullName: { contains: q, mode: "insensitive" as const } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const teachers = await prisma.teacher.findMany({
    where,
    orderBy: { code: "asc" },
    include: {
      user: { select: { fullName: true, email: true, phone: true, isActive: true } },
      // Cột Lớp phụ trách chỉ liệt kê lớp đang học, lớp đã xong xem ở hồ sơ giáo viên.
      classes: {
        where: { status: "ACTIVE" },
        orderBy: { code: "asc" },
        select: { id: true, name: true },
      },
      // Đếm đủ cả lớp đã kết thúc để câu xác nhận xoá nói đúng số lượng.
      _count: { select: { classes: true, lessonSessions: true } },
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Giáo viên"
          description="Tài khoản đăng nhập, lớp phụ trách và chấm công của từng giáo viên."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <CardTitle>Danh sách giáo viên ({teachers.length})</CardTitle>
              <CardDescription>
                Tạm dừng để chặn đăng nhập mà vẫn giữ nguyên lịch sử giảng dạy.
              </CardDescription>
            </div>
            <ModalForm
              action={createTeacher}
              title="Thêm giáo viên"
              submitLabel="Thêm giáo viên"
              wide
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Thêm
                </>
              }
            >
              <p className="text-xs text-slate-500">
                Giáo viên đăng nhập bằng email và mật khẩu đặt ở đây. Hệ thống chỉ lưu bản mã hoá
                — nếu quên, Admin đặt lại mật khẩu mới ở hồ sơ giáo viên.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Họ và tên">
                  <Input name="fullName" placeholder="Trần Thị B" required />
                </Field>
                <Field label="Mã giáo viên" hint="Bỏ trống → tự sinh GV0001">
                  <Input name="code" placeholder="GV0001" />
                </Field>
                <Field label="Email đăng nhập">
                  <Input name="email" type="email" placeholder="giaovien@nzedu.vn" required />
                </Field>
                <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
                  <Input name="password" type="password" minLength={8} required />
                </Field>
                <Field label="Số điện thoại" className="sm:col-span-2">
                  <Input name="phone" placeholder="0900 000 000" />
                </Field>
              </div>
            </ModalForm>
          </div>

          <FilterForm className="grid w-full gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Tìm kiếm">
              <Input name="q" defaultValue={q} placeholder="Tên, mã hoặc email, gõ xong bấm Enter..." />
            </Field>
            <Field label="Trạng thái">
              <Select name="active" defaultValue={active}>
                <option value="">Tất cả</option>
                <option value="1">Đang hoạt động</option>
                <option value="0">Tạm dừng</option>
              </Select>
            </Field>
          </FilterForm>
        </CardHeader>

        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
            <THead className="sticky top-0 z-[1]">
              <TR>
                <THIndex />
                <TH>Mã</TH>
                <TH>Họ và tên</TH>
                <TH>Liên hệ</TH>
                <TH>Lớp phụ trách</TH>
                <TH>Trạng thái</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {teachers.length === 0 ? (
                <EmptyRow colSpan={7}>Không có giáo viên nào khớp bộ lọc.</EmptyRow>
              ) : (
                teachers.map((teacher, index) => (
                  <TR key={teacher.id}>
                    <TDIndex value={index + 1} />
                    <TD className="whitespace-nowrap font-mono text-xs text-slate-500">
                      {teacher.code}
                    </TD>
                    <TD>
                      <Link
                        href={`/giao-vien/${teacher.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {teacher.user.fullName}
                      </Link>
                    </TD>
                    <TD>
                      {teacher.user.email}
                      {teacher.user.phone ? (
                        <p className="text-xs text-slate-500">{teacher.user.phone}</p>
                      ) : null}
                    </TD>
                    <TD>
                      {teacher.classes.length === 0 ? (
                        <span className="text-slate-400">Chưa phân công</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {teacher.classes.map((cls) => (
                            <Link
                              key={cls.id}
                              href={`/lop-hoc/${cls.id}`}
                              className="text-brand-700 hover:underline"
                            >
                              {cls.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </TD>
                    <TD>
                      {teacher.user.isActive ? (
                        <Badge tone="green">Đang hoạt động</Badge>
                      ) : (
                        <Badge tone="amber">Tạm dừng</Badge>
                      )}
                    </TD>
                    <TD className="w-px whitespace-nowrap text-right">
                      <DeleteButton
                        action={deleteTeacher}
                        id={teacher.id}
                        message={`Bạn có chắc muốn xóa dữ liệu này? Xoá giáo viên ${teacher.user.fullName} sẽ mất luôn tài khoản đăng nhập; ${teacher._count.classes} lớp và ${teacher._count.lessonSessions} buổi học chuyển sang chưa phân công. Không khôi phục lại được.`}
                      />
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
