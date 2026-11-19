import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ClassType, PaymentMethod } from "@/generated/prisma/enums";
import { HocPhiTabs } from "../tabs";
import { ReceiptActions } from "../receipt-actions";

export const metadata: Metadata = { title: "Nhật ký thu hp" };

const CLASS_TYPES: Record<ClassType, string> = {
  NORMAL: "Lớp thường",
  IELTS: "IELTS",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  OTHER: "Khác",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDay(raw?: string) {
  if (!raw || !DATE_RE.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type Search = { from?: string; to?: string; type?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");

  const { from = "", to = "", type = "" } = await searchParams;
  const typeFilter = type in CLASS_TYPES ? (type as ClassType) : undefined;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromDate = parseLocalDay(from) ?? monthStart;
  const toDate = parseLocalDay(to) ?? today;
  const start = fromDate.getTime() <= toDate.getTime() ? fromDate : toDate;
  const end = fromDate.getTime() <= toDate.getTime() ? toDate : fromDate;
  const fromValue = localDayKey(start);
  const toValue = localDayKey(end);
  const until = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

  const payments = await prisma.tuitionPayment.findMany({
    where: {
      paidAt: { gte: start, lt: until },
      // Nhật ký thu học phí chỉ phản ánh tiền thực thu. Các bút toán kỹ thuật
      // (nhập dữ liệu dùng OTHER/CARD, hoặc bút toán trừ tạm ứng) vẫn được giữ
      // trong hồ sơ học phí nhưng không được trộn vào báo cáo tiền thực thu.
      method: { in: ["CASH", "BANK_TRANSFER"] },
      NOT: { note: "Trừ từ học phí tạm ứng" },
      ...(typeFilter ? { tuition: { type: typeFilter } } : {}),
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amount: true,
      method: true,
      paidAt: true,
      reference: true,
      tuition: {
        select: {
          id: true,
          type: true,
          student: { select: { id: true, code: true, fullName: true } },
          enrollment: {
            select: { class: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const total = payments.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Học phí"
          description="Nhật ký các lần thu học phí. Xem thông tin thu tiền hoặc tải biên lai PDF gửi phụ huynh."
        />
        <HocPhiTabs />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Nhật ký thu hp ({payments.length})</CardTitle>
            <CardDescription>
              Chỉ các lần thu bằng tiền mặt hoặc chuyển khoản trong khoảng lọc. Tổng đã thu:{" "}
              {formatCurrency(total)}.
            </CardDescription>
          </div>

          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={fromValue} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={toValue} />
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
          </FilterForm>
        </CardHeader>

        <Table
          className="[&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-slate-100 [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-slate-200"
          wrapperClassName="min-h-0 flex-1 overflow-auto"
        >
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Ngày thu</TH>
              <TH>Mã HV</TH>
              <TH>Học viên</TH>
              <TH>Lớp</TH>
              <TH>Loại lớp</TH>
              <TH>Hình thức</TH>
              <TH>Số hoá đơn</TH>
              <TH className="text-right">Số tiền</TH>
              <TH className="text-right">Thao tác</TH>
            </TR>
          </THead>
          <TBody>
            {payments.length === 0 ? (
              <EmptyRow colSpan={10}>Không có lệnh thu nào khớp bộ lọc.</EmptyRow>
            ) : (
              payments.map((row, index) => (
                <TR key={row.id}>
                  <TDIndex value={index + 1} />
                  <TD className="whitespace-nowrap">{formatDate(row.paidAt)}</TD>
                  <TD className="font-mono text-xs whitespace-nowrap text-slate-500">
                    {row.tuition.student.code}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <Link
                      href={`/hoc-vien/${row.tuition.student.id}`}
                      className="font-medium whitespace-nowrap text-brand-700 hover:underline"
                    >
                      {row.tuition.student.fullName}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">
                    <Link
                      href={`/lop-hoc/${row.tuition.enrollment.class.id}`}
                      className="whitespace-nowrap hover:underline"
                    >
                      {row.tuition.enrollment.class.name}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge value={row.tuition.type} />
                  </TD>
                  <TD>{METHOD_LABEL[row.method]}</TD>
                  <TD className="font-mono text-xs whitespace-nowrap text-slate-500">{row.reference ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-right font-medium">
                    <Link href={`/hoc-phi/${row.tuition.id}`} className="hover:underline">
                      {formatCurrency(row.amount)}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    <ReceiptActions paymentId={row.id} stacked={false} />
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
