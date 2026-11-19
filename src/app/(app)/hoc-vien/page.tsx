import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, School, Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { DeleteButton, EditButton, ModalForm } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { remainingSessions } from "@/lib/tuition";
import { formatCurrency, startOfDay } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import type { StudentStatus } from "@/generated/prisma/enums";
import { enrollStudent } from "../lop-hoc/actions";
import { createStudent, deleteStudent, importStudents } from "./actions";
import { StudentFilters } from "./filters";

export const metadata: Metadata = { title: "Học viên" };
export const maxDuration = 120;

const STUDENT_STATUSES: StudentStatus[] = ["UNASSIGNED", "STUDYING", "RESERVED", "DROPPED"];

type Search = { q?: string; status?: string; class?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("student.manage");

  const { q = "", status = "", class: classId = "" } = await searchParams;
  const statusFilter = STUDENT_STATUSES.includes(status as StudentStatus)
    ? (status as StudentStatus)
    : undefined;

  const where: Prisma.StudentWhereInput = {
    status: statusFilter,
    ...(classId
      ? {
          enrollments: {
            some: { classId, status: { in: ["ACTIVE", "RESERVED"] } },
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
            { parentPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const [students, classes] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        enrollments: {
          where: { status: { in: ["ACTIVE", "RESERVED"] } },
          select: {
            id: true,
            status: true,
            joinedAt: true,
            class: { select: { id: true, name: true, type: true } },
            tuition: {
              select: {
                type: true,
                totalSessions: true,
                usedSessions: true,
                totalAmount: true,
                paidAmount: true,
              },
            },
          },
        },
        // Đếm đủ cả lịch sử (kể cả lớp đã nghỉ) để câu xác nhận xoá nói đúng số lượng.
        tuitions: { select: { totalAmount: true, paidAmount: true } },
        _count: { select: { enrollments: true, attendances: true, tuitions: true } },
      },
    }),
    prisma.class.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const unpaidNormalClassIds = [
    ...new Set(
      students.flatMap((student) =>
        student.enrollments
          .filter((enrollment) => enrollment.class.type === "NORMAL" && !enrollment.tuition)
          .map((enrollment) => enrollment.class.id),
      ),
    ),
  ];
  const completedSessions =
    unpaidNormalClassIds.length > 0
      ? await prisma.lessonSession.findMany({
          where: { classId: { in: unpaidNormalClassIds }, status: "COMPLETED" },
          select: { classId: true, date: true },
        })
      : [];

  const exportQuery = new URLSearchParams();
  if (statusFilter) exportQuery.set("status", statusFilter);
  if (classId) exportQuery.set("class", classId);
  const exportHref = `/api/xuat/hoc-vien${exportQuery.toString() ? `?${exportQuery}` : ""}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Học viên"
          description="Hồ sơ, lịch sử lớp và tình trạng học phí của từng học viên."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-4">
            <div>
              <CardTitle>Danh sách học viên ({students.length})</CardTitle>
              <CardDescription>
                Trạng thái tự cập nhật theo tình trạng ghi danh, sửa tay được ở hồ sơ học viên.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/api/xuat/mau-hoc-vien"
                className={buttonClass("outline", "md")}
                prefetch={false}
              >
                <Download className="h-4 w-4" />
                Tải mẫu nhập
              </Link>
              <ModalForm
                action={importStudents}
                title="Nhập học viên từ Excel"
                submitLabel="Nhập file"
                encType="multipart/form-data"
                triggerClassName={buttonClass("outline", "md")}
                trigger={
                  <>
                    <Upload className="h-4 w-4" />
                    Nhập Excel
                  </>
                }
              >
                <p className="text-sm text-slate-600">
                  Dùng file từ nút <span className="font-medium">Tải mẫu nhập</span>. Copy mã lớp
                  ở sheet Lop. Cột Học phí: lớp IELTS ghi Còn nợ hoặc Đã đóng đủ; lớp thường ghi
                  số buổi còn lại (âm, 0 hoặc dương).
                </p>
                <p className="text-xs text-slate-500">
                  Có lỗi thì không nhập dòng nào. Mã học viên đã có thì giữ thông tin cũ, chỉ ghi
                  ô Excel còn giá trị.
                </p>
                <Field label="File Excel" hint="Định dạng .xlsx, tối đa 2000 dòng.">
                  <Input
                    name="file"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    required
                    className="h-auto py-1.5"
                  />
                </Field>
              </ModalForm>
              <Link
                href={exportHref}
                className={buttonClass("outline", "md")}
                prefetch={false}
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </Link>
            <ModalForm
              action={createStudent}
              title="Thêm học viên"
              submitLabel="Thêm học viên"
              wide
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Thêm
                </>
              }
            >
              <p className="text-xs text-slate-500">
                Bỏ trống mã để hệ thống tự sinh. Thêm xong bấm Xếp lớp ở cột Thao tác để đưa học
                viên vào lớp; học phí thu ở màn hình Học phí.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Họ và tên">
                  <Input name="fullName" placeholder="Nguyễn Văn A" required />
                </Field>
                <Field label="Mã học viên" hint="Bỏ trống → tự sinh HV0001">
                  <Input name="code" placeholder="HV0001" />
                </Field>
                <Field label="Ngày sinh">
                  <Input name="dateOfBirth" type="date" />
                </Field>
                <Field label="Số điện thoại phụ huynh">
                  <Input name="parentPhone" placeholder="0900 000 000" />
                </Field>
                <Field label="Tên phụ huynh">
                  <Input name="parentName" placeholder="Nguyễn Văn B" />
                </Field>
                <Field label="Địa chỉ" className="sm:col-span-2">
                  <Input name="address" placeholder="123 Nguyễn Văn Cừ, Quận 1" />
                </Field>
              </div>
            </ModalForm>
            </div>
          </div>

          <StudentFilters q={q} status={status} classId={classId} classes={classes} />
        </CardHeader>

        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
            <THead className="sticky top-0 z-[1]">
              <TR>
                <THIndex />
                <TH>Mã</TH>
                <TH>Học viên</TH>
                <TH>SĐT phụ huynh</TH>
                <TH>Lớp đang học</TH>
                <TH>Học phí</TH>
                <TH>Trạng thái</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {students.length === 0 ? (
                <EmptyRow colSpan={8}>Không có học viên nào khớp bộ lọc.</EmptyRow>
              ) : (
                students.map((student, index) => {
                  const paid = student.tuitions.reduce(
                    (sum, item) => sum + Number(item.paidAmount),
                    0,
                  );
                  // Lớp đang học thì bỏ khỏi ô chọn — ghi danh lại vào đúng lớp đó sẽ báo lỗi.
                  // Lớp đang bảo lưu vẫn để chọn được vì xếp lại là cho học viên đi học lại.
                  const activeClassIds = new Set(
                    student.enrollments
                      .filter((e) => e.status === "ACTIVE")
                      .map((e) => e.class.id),
                  );
                  const tuitionLines = student.enrollments.map((enrollment) => {
                    if (enrollment.class.type === "IELTS") {
                      const owed = enrollment.tuition
                        ? Number(enrollment.tuition.totalAmount) -
                          Number(enrollment.tuition.paidAmount)
                        : 0;
                      return {
                        key: enrollment.id,
                        text: !enrollment.tuition
                          ? "Chưa đóng học phí"
                          : owed > 0
                            ? `Còn nợ ${formatCurrency(owed)}`
                            : "Đã đóng đủ",
                        tone: !enrollment.tuition || owed > 0 ? "debt" : "ok",
                      };
                    }
                    const from = startOfDay(enrollment.joinedAt).getTime();
                    const remaining = enrollment.tuition
                      ? remainingSessions(enrollment.tuition)
                      : 0 -
                        completedSessions.filter(
                          (session) =>
                            session.classId === enrollment.class.id &&
                            session.date.getTime() >= from,
                        ).length;
                    const left = remaining ?? 0;
                    return {
                      key: enrollment.id,
                      text: `${left} buổi`,
                      tone: left < 0 ? "debt" : "plain",
                    };
                  });

                  return (
                    <TR key={student.id}>
                      <TDIndex value={index + 1} />
                      <TD className="whitespace-nowrap font-mono text-xs text-slate-500">
                        {student.code}
                      </TD>
                      <TD>
                        <Link
                          href={`/hoc-vien/${student.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {student.fullName}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {student.parentPhone ?? <span className="text-slate-400">—</span>}
                      </TD>
                      <TD>
                        {student.enrollments.length === 0 ? (
                          <span className="text-slate-400">Chưa xếp lớp</span>
                        ) : (
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {student.enrollments.map((e) => (
                              <Link
                                key={e.id}
                                href={`/lop-hoc/${e.class.id}`}
                                className="text-brand-700 hover:underline"
                              >
                                {e.class.name}
                                {e.status === "RESERVED" ? " (bảo lưu)" : ""}
                              </Link>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {tuitionLines.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          tuitionLines.map((line) => (
                            <p
                              key={line.key}
                              className={
                                line.tone === "debt"
                                  ? "text-red-600"
                                  : line.tone === "ok"
                                    ? "text-emerald-600"
                                    : "text-slate-800"
                              }
                            >
                              {line.text}
                            </p>
                          ))
                        )}
                      </TD>
                      <TD>
                        <StatusBadge value={student.status} />
                      </TD>
                      <TD className="w-px whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <EditButton
                            action={enrollStudent}
                            title={`Xếp lớp — ${student.fullName}`}
                            icon={<School className="h-4 w-4" />}
                            label="Xếp lớp"
                            submitLabel="Xếp vào lớp"
                          >
                            <input type="hidden" name="studentIds" value={student.id} />
                            <Field
                              label="Xếp vào lớp"
                              hint="Học viên hiện lên ngay trong danh sách học viên của lớp. Lớp IELTS áp luôn khóa học phí của lớp; lớp thường thu gói buổi sau ở màn hình Học phí."
                            >
                              <Select name="classId" defaultValue="" required>
                                <option value="">— Chọn lớp —</option>
                                {classes
                                  .filter((cls) => !activeClassIds.has(cls.id))
                                  .map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                      {cls.name} ({cls.code})
                                    </option>
                                  ))}
                              </Select>
                            </Field>
                          </EditButton>
                          <DeleteButton
                            action={deleteStudent}
                            id={student.id}
                            message={`Bạn có chắc muốn xóa dữ liệu này? Xoá học viên ${student.fullName} sẽ mất luôn ${student._count.enrollments} lần ghi danh, ${student._count.tuitions} hồ sơ học phí${
                              paid > 0 ? ` (đã thu ${formatCurrency(paid)})` : ""
                            } và ${student._count.attendances} lượt điểm danh. Không khôi phục lại được.`}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
      </Card>
    </div>
  );
}
