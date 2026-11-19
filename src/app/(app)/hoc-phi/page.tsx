import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EditButton } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { loadNormalPackages } from "@/lib/enrollment";
import { requirePermission } from "@/lib/permissions";
import { remainingSessions, advanceBalance } from "@/lib/tuition";
import { startOfDay } from "@/lib/utils";
import type { ClassType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { collectTuition } from "./actions";
import { CollectTuitionFields } from "./collect-form";
import { HocPhiTabs } from "./tabs";

export const metadata: Metadata = { title: "Quản lý học phí" };

const CLASS_TYPES: Record<ClassType, string> = {
  NORMAL: "Lớp thường",
  IELTS: "IELTS",
};

const DEBT_FILTERS = {
  owing: "Công nợ cần thu",
  clear: "Chưa cần thu",
} as const;
type DebtFilter = keyof typeof DEBT_FILTERS;

type Search = { q?: string; class?: string; type?: string; debt?: string; page?: string };

const PAGE_SIZE = 50;

/**
 * Ô Công nợ — đúng một dòng chữ, không có dòng phụ nào bên dưới.
 * Trước đây dưới nó còn tên gói / "Chưa thu gói" / "Chưa có hồ sơ học phí" khiến mỗi
 * dòng bảng cao gấp đôi; giờ chính dòng chữ này là lối vào trang chi tiết học phí
 * (chỉ khi hồ sơ đã tồn tại — chưa có hồ sơ thì không có gì để mở).
 */
function DebtCell(row: {
  classType: ClassType;
  settled: boolean;
  remaining: number;
  tuitionId: string | null;
}) {
  const ielts = row.classType === "IELTS";
  const text = ielts
    ? row.settled
      ? "Đã đóng học phí"
      : "Còn nợ học phí"
    : row.remaining < 0
      ? `Còn nợ ${-row.remaining} buổi`
      : `Còn ${row.remaining} buổi`;
  const tone = ielts
    ? row.settled
      ? "text-emerald-600"
      : "text-red-600"
    : row.remaining < 0
      ? "text-red-600"
      : row.remaining === 0
        ? "text-amber-700"
        : "text-slate-800";

  return row.tuitionId ? (
    <Link href={`/hoc-phi/${row.tuitionId}`} className={`font-medium hover:underline ${tone}`}>
      {text}
    </Link>
  ) : (
    <span className={`font-medium ${tone}`}>{text}</span>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");

  const { q = "", class: classId = "", type = "", debt = "", page: pageRaw } = await searchParams;
  const typeFilter = type in CLASS_TYPES ? (type as ClassType) : undefined;
  const debtFilter = debt in DEBT_FILTERS ? (debt as DebtFilter) : undefined;

  // Công nợ gắn với một lần ghi danh đang học, không phải với hồ sơ học phí: lớp thường
  // có thể vào lớp trước rồi mới đóng gói, nên dòng chưa có `tuition` vẫn phải hiện ra.
  const where: Prisma.EnrollmentWhereInput = {
    status: "ACTIVE",
    ...(classId ? { classId } : {}),
    ...(typeFilter ? { class: { type: typeFilter } } : {}),
    ...(q
      ? {
          student: {
            OR: [
              { fullName: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [enrollments, classes, packages] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: [{ class: { code: "asc" } }, { student: { fullName: "asc" } }],
      select: {
        id: true,
        joinedAt: true,
        student: { select: { id: true, code: true, fullName: true, parentPhone: true, advances: { select: { amount: true, usedAmount: true } } } },
        class: {
          select: {
            id: true,
            name: true,
            type: true,
            levelId: true,
            subLevelId: true,
            subLevel: { select: { basePrice: true } },
            ieltsCourse: { select: { id: true, name: true, price: true, basePrice: true } },
          },
        },
        tuition: {
          select: {
            id: true,
            type: true,
            totalSessions: true,
            usedSessions: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
    }),
    prisma.class.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    loadNormalPackages(),
  ]);

  // Lớp thường chưa thu gói: mỗi buổi lớp đã dạy từ ngày vào lớp là một buổi học vượt.
  const pendingClassIds = [
    ...new Set(
      enrollments
        .filter((item) => item.class.type === "NORMAL" && !item.tuition)
        .map((item) => item.class.id),
    ),
  ];
  const completedSessions =
    pendingClassIds.length > 0
      ? await prisma.lessonSession.findMany({
          where: { classId: { in: pendingClassIds }, status: "COMPLETED" },
          select: { classId: true, date: true },
        })
      : [];

  /**
   * Công nợ hiện theo loại lớp, đúng như thẻ Học phí trong hồ sơ học viên (R2):
   * - Lớp thường: chỉ có số buổi còn lại, không dính tới tiền.
   * - Lớp IELTS: học trọn khoá nên chỉ có còn nợ bao nhiêu / đã đóng đủ.
   */
  const rows = enrollments
    .map((item) => {
      const tuition = item.tuition;
      const base = {
        id: item.id,
        studentId: item.student.id,
        code: item.student.code,
        fullName: item.student.fullName,
        classId: item.class.id,
        className: item.class.name,
        classType: item.class.type,
        levelId: item.class.levelId,
        subLevelId: item.class.subLevelId,
        parentPhone: item.student.parentPhone,
        advance: advanceBalance(item.student.advances),
        tuitionId: tuition?.id ?? null,
        basePrice24: item.class.subLevel?.basePrice?.toString() ?? null,
        ieltsCourse: item.class.ieltsCourse
          ? {
              id: item.class.ieltsCourse.id,
              name: item.class.ieltsCourse.name,
              price: item.class.ieltsCourse.price.toString(),
              basePrice: item.class.ieltsCourse.basePrice?.toString() ?? null,
            }
          : null,
      };

      if (item.class.type === "IELTS") {
        const coursePrice = item.class.ieltsCourse ? Number(item.class.ieltsCourse.price) : 0;
        const owed = tuition ? Math.max(0, Number(tuition.totalAmount) - Number(tuition.paidAmount)) : coursePrice;
        return {
          ...base,
          // Chưa có hồ sơ học phí cũng tính là còn nợ, không được báo đã đóng đủ.
          settled: !!tuition && owed <= 0,
          owed,
          remaining: 0,
        };
      }

      const from = startOfDay(item.joinedAt).getTime();
      const completed = completedSessions.filter(
        (session) => session.classId === item.class.id && session.date.getTime() >= from,
      ).length;
      const remaining = tuition
        ? (remainingSessions(tuition) ?? (tuition.totalSessions ?? 0) - tuition.usedSessions)
        : 0 - completed;

      return {
        ...base,
        settled: false,
        owed: 0,
        remaining,
      };
    })
    .filter((row) => {
      if (!debtFilter) return true;
      const owing = row.classType === "IELTS" ? !row.settled : row.remaining <= 0;
      return debtFilter === "owing" ? owing : !owing;
    });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(pageRaw) || 1));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Quản lý học phí"
          description="Theo dõi công nợ theo 2 mô hình: lớp thường tính theo số buổi còn lại, IELTS tính trọn khóa."
        />
        <HocPhiTabs />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Công nợ học viên ({rows.length})</CardTitle>
            <CardDescription>
              Học viên đang học ở mọi lớp. Công nợ hiển thị đúng như thẻ Học phí trong hồ sơ học
              viên; nút cuối dòng để thu tiếp.
            </CardDescription>
          </div>

          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tìm kiếm">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Tên hoặc mã học viên, gõ xong bấm Enter..."
              />
            </Field>
            <Field label="Lớp">
              <Select name="class" defaultValue={classId}>
                <option value="">Tất cả lớp</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Loại lớp">
              <Select name="type" defaultValue={type}>
                <option value="">Tất cả</option>
                {Object.entries(CLASS_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Công nợ" hint="Lớp thường: còn 0 buổi hoặc còn nợ buổi. IELTS: còn nợ học phí.">
              <Select name="debt" defaultValue={debt}>
                <option value="">Tất cả</option>
                {Object.entries(DEBT_FILTERS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterForm>
        </CardHeader>

        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Mã HV</TH>
              <TH>Tên HV</TH>
              <TH>Lớp</TH>
              <TH>Loại lớp</TH>
              <TH>Công nợ</TH>
              <TH className="text-right">Thu học phí</TH>
            </TR>
          </THead>
          <TBody>
            {paged.length === 0 ? (
              <EmptyRow colSpan={7}>Không có học viên nào khớp bộ lọc.</EmptyRow>
            ) : (
              paged.map((row, index) => (
                <TR key={row.id}>
                  <TDIndex value={(page - 1) * PAGE_SIZE + index + 1} />
                  <TD className="font-mono text-xs whitespace-nowrap text-slate-500">{row.code}</TD>
                  <TD>
                    <Link
                      href={`/hoc-vien/${row.studentId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {row.fullName}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/lop-hoc/${row.classId}`} className="hover:underline">
                      {row.className}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge value={row.classType} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    <DebtCell {...row} />
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end">
                      <EditButton
                        action={collectTuition}
                        title={`Thu học phí — ${row.fullName}`}
                        icon={<Wallet className="h-4 w-4" />}
                        label="Thu học phí"
                        submitLabel="Lưu"
                        wide
                      >
                        <CollectTuitionFields
                          enrollmentId={row.id}
                          classType={row.classType}
                          studentName={row.fullName}
                          studentCode={row.code}
                          parentPhone={row.parentPhone}
                          className={row.className}
                          remaining={row.remaining}
                          owed={row.owed}
                          advance={row.advance}
                          packages={packages}
                          subLevelId={row.subLevelId}
                          levelId={row.levelId}
                          ieltsCourse={row.ieltsCourse}
                          basePrice24={row.basePrice24}
                        />
                      </EditButton>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        {rows.length > PAGE_SIZE ? (
          <Pagination
            basePath="/hoc-phi"
            params={{ q, class: classId, type, debt }}
            page={page}
            pageSize={PAGE_SIZE}
            total={rows.length}
          />
        ) : null}
      </Card>
    </div>
  );
}
