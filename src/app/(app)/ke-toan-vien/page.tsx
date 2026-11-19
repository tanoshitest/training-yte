import type { Metadata } from "next";
import { KeyRound, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { DeleteButton, EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

import {
  createAccountant,
  deleteAccountant,
  resetAccountantPassword,
  updateAccountant,
} from "./actions";

export const metadata: Metadata = { title: "Kế toán" };

type Search = { q?: string; active?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("accountant.manage");

  const { q = "", active = "" } = await searchParams;

  const where: Prisma.UserWhereInput = {
    role: "ACCOUNTANT",
    ...(active === "1" || active === "0" ? { isActive: active === "1" } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const staff = await prisma.user.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true, phone: true, isActive: true },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Kế toán"
          description="Tài khoản role Kế toán vào được học phí, thu chi, đối soát và quản lý lương."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <CardTitle>Danh sách kế toán ({staff.length})</CardTitle>
              <CardDescription>
                Tạm dừng để chặn đăng nhập mà vẫn giữ nguyên lịch sử thao tác trong nhật ký.
              </CardDescription>
            </div>
            <ModalForm
              action={createAccountant}
              title="Thêm kế toán"
              submitLabel="Thêm kế toán"
              wide
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Thêm
                </>
              }
            >
              <p className="text-xs text-slate-500">
                Kế toán đăng nhập bằng email và mật khẩu đặt ở đây. Hệ thống chỉ lưu bản mã hoá —
                nếu quên, đặt lại mật khẩu mới bằng nút chìa khoá trên danh sách.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Họ và tên">
                  <Input name="fullName" placeholder="Nguyễn Thị Hà" required />
                </Field>
                <Field label="Email đăng nhập">
                  <Input name="email" type="email" placeholder="ketoan@nzedu.vn" required />
                </Field>
                <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
                  <Input name="password" type="password" minLength={8} required />
                </Field>
                <Field label="Số điện thoại">
                  <Input name="phone" placeholder="0900 000 000" />
                </Field>
              </div>
            </ModalForm>
          </div>

          <FilterForm className="grid w-full gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Tìm kiếm">
              <Input name="q" defaultValue={q} placeholder="Tên hoặc email, gõ xong bấm Enter..." />
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
              <TH>Họ và tên</TH>
              <TH>Email đăng nhập</TH>
              <TH>Điện thoại</TH>
              <TH>Trạng thái</TH>
              <TH className="text-right">Thao tác</TH>
            </TR>
          </THead>
          <TBody>
            {staff.length === 0 ? (
              <EmptyRow colSpan={6}>Chưa có tài khoản kế toán nào khớp bộ lọc.</EmptyRow>
            ) : (
              staff.map((person, index) => (
                <TR key={person.id}>
                  <TDIndex value={index + 1} />
                  <TD className="font-medium text-slate-900">
                    {person.fullName}
                    {person.id === me.id ? (
                      <span className="ml-2 text-xs font-normal text-slate-400">(bạn)</span>
                    ) : null}
                  </TD>
                  <TD>{person.email}</TD>
                  <TD>{person.phone ?? <span className="text-slate-400">—</span>}</TD>
                  <TD>
                    {person.isActive ? (
                      <Badge tone="green">Đang hoạt động</Badge>
                    ) : (
                      <Badge tone="amber">Tạm dừng</Badge>
                    )}
                  </TD>
                  <TD className="w-px whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton action={updateAccountant} title="Sửa tài khoản kế toán" wide>
                        <input type="hidden" name="id" value={person.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Họ và tên">
                            <Input name="fullName" defaultValue={person.fullName} required />
                          </Field>
                          <Field label="Email đăng nhập">
                            <Input
                              name="email"
                              type="email"
                              defaultValue={person.email}
                              required
                            />
                          </Field>
                          <Field label="Số điện thoại">
                            <Input name="phone" defaultValue={person.phone ?? ""} />
                          </Field>
                          <Field label="Trạng thái">
                            <Select name="isActive" defaultValue={person.isActive ? "1" : "0"}>
                              <option value="1">Đang hoạt động</option>
                              <option value="0">Tạm dừng</option>
                            </Select>
                          </Field>
                        </div>
                      </EditButton>
                      <EditButton
                        action={resetAccountantPassword}
                        title={`Đặt lại mật khẩu — ${person.fullName}`}
                        icon={<KeyRound className="h-4 w-4" />}
                        label="Đặt lại mật khẩu"
                        submitLabel="Đặt lại mật khẩu"
                      >
                        <input type="hidden" name="id" value={person.id} />
                        <p className="text-xs text-slate-500">
                          Mật khẩu cũ không đọc được (chỉ lưu bản mã hoá). Đặt mật khẩu mới rồi
                          báo lại cho {person.fullName}.
                        </p>
                        <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
                          <Input name="password" type="password" minLength={8} required />
                        </Field>
                      </EditButton>
                      <DeleteButton
                        action={deleteAccountant}
                        id={person.id}
                        message={`Bạn có chắc muốn xóa dữ liệu này? Tài khoản kế toán ${person.fullName} sẽ không đăng nhập được nữa. Các dòng nhật ký người này đã tạo vẫn giữ nguyên nhưng mất tên người thao tác.`}
                      />
                    </div>
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
