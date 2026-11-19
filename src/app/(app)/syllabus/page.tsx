import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DeleteButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { TableRowLink } from "@/components/ui/table-row-link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import type { SyllabusStatus } from "@/generated/prisma/enums";
import { createSyllabus, deleteSyllabus } from "./actions";
import { LevelSelect, SYLLABUS_STATUS, StatusSelect, SyllabusBadge } from "./ui";

export const metadata: Metadata = { title: "Syllabus" };

type Search = { q?: string; level?: string; status?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();

  const { q = "", level = "", status = "" } = await searchParams;
  const statusFilter =
    status && status in SYLLABUS_STATUS ? (status as SyllabusStatus) : undefined;

  const [levels, syllabuses] = await Promise.all([
    prisma.level.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.syllabus.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { level: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
        levelId: level || undefined,
        status: statusFilter,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        level: true,
        _count: { select: { units: true, classes: true, courseDays: true } },
        units: { select: { _count: { select: { lessons: true } } } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Syllabus"
        description="Nội dung giảng dạy chuẩn của trung tâm — một syllabus dùng được cho nhiều lớp."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-col items-start gap-3">
            <div className="flex w-full items-start justify-between gap-4">
              <div>
                <CardTitle>Danh sách syllabus ({syllabuses.length})</CardTitle>
                <CardDescription>
                  Mỗi syllabus gồm nhiều Unit, mỗi Unit có số buổi học riêng.
                </CardDescription>
              </div>
              <ModalForm
                action={createSyllabus}
                title="Tạo syllabus"
                submitLabel="Lưu syllabus"
                wide
                trigger={
                  <>
                    <Plus className="h-4 w-4" />
                    Tạo syllabus
                  </>
                }
              >
                <p className="text-xs text-slate-500">
                  Thông tin nền để gán syllabus cho lớp học. Nội dung từng buổi soạn ở trang chi
                  tiết.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mã syllabus" hint="Bỏ trống → tự sinh SYL0001">
                    <Input name="code" placeholder="IELTS-FDN-55" />
                  </Field>
                  <Field label="Trình độ">
                    <LevelSelect levels={levels} />
                  </Field>
                  <Field label="Tên syllabus" className="sm:col-span-2">
                    <Input name="name" placeholder="Kids 1 — 48 buổi" required />
                  </Field>
                  <Field label="Mô tả" className="sm:col-span-2">
                    <Textarea
                      name="description"
                      placeholder="Phạm vi nội dung, đối tượng học viên..."
                    />
                  </Field>
                  <Field label="Số unit" hint="Tạo sẵn khung Unit rỗng, sửa được sau">
                    <Input name="unitCount" type="number" min={0} max={50} defaultValue={0} />
                  </Field>
                  <Field label="Trạng thái">
                    <StatusSelect />
                  </Field>
                </div>
              </ModalForm>
            </div>

            <FilterForm className="grid w-full gap-3 sm:grid-cols-[2fr_1.2fr_1fr]">
              <Field label="Tìm kiếm">
                <Input name="q" defaultValue={q} placeholder="Tìm theo mã, tên, trình độ, gõ xong bấm Enter..." />
              </Field>
              <Field label="Trình độ">
                <Select name="level" defaultValue={level}>
                  <option value="">Tất cả trình độ</option>
                  {levels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Trạng thái">
                <Select name="status" defaultValue={status}>
                  <option value="">Tất cả</option>
                  {(Object.keys(SYLLABUS_STATUS) as SyllabusStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {SYLLABUS_STATUS[key].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FilterForm>
          </CardHeader>

          <Table>
            <THead>
              <TR>
                <THIndex />
                <TH>Syllabus</TH>
                <TH>Mô tả</TH>
                <TH>Trình độ</TH>
                <TH>Số unit</TH>
                <TH>Số buổi</TH>
                <TH>Lớp đang dùng</TH>
                <TH>Trạng thái</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {syllabuses.length === 0 ? (
                <EmptyRow colSpan={9}>Không có syllabus nào khớp bộ lọc.</EmptyRow>
              ) : (
                syllabuses.map((item, index) => {
                  const lessons = Math.max(
                    item._count.courseDays,
                    item.units.reduce((sum, u) => sum + u._count.lessons, 0),
                  );
                  return (
                    <TableRowLink key={item.id} href={`/syllabus/${item.id}`}>
                      <TDIndex value={index + 1} />
                      <TD>
                        <Link
                          href={`/syllabus/${item.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.code ? (
                          <p className="mt-0.5 font-mono text-xs text-brand-700">{item.code}</p>
                        ) : null}
                      </TD>
                      <TD className="max-w-xs">
                        {item.description ? (
                          <span className="line-clamp-2 text-slate-600">{item.description}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                      <TD>{item.level?.name ?? "—"}</TD>
                      <TD>{item._count.units}</TD>
                      <TD>{lessons}</TD>
                      <TD>{item._count.classes}</TD>
                      <TD>
                        <SyllabusBadge value={item.status} />
                      </TD>
                      <TD className="w-px whitespace-nowrap text-right">
                        <DeleteButton
                          action={deleteSyllabus}
                          id={item.id}
                          message={`Bạn có chắc muốn xóa dữ liệu này? Xoá syllabus ${item.name} sẽ mất luôn ${item._count.units} unit và ${lessons} buổi nội dung${
                            item._count.classes > 0
                              ? `; ${item._count.classes} lớp đang dùng sẽ bị gỡ khỏi syllabus này`
                              : ""
                          }. Không khôi phục lại được.`}
                        />
                      </TD>
                    </TableRowLink>
                  );
                })
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
