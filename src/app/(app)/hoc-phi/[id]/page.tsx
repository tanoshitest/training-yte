import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge, EnrollmentBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatCurrency, formatDate, toDateInput } from "@/lib/utils";
import {
  addTuitionEntry,
  deletePayment,
  deleteTuitionEntry,
  recordPayment,
  updateTuitionNote,
} from "../actions";
import { ReceiptActions } from "../receipt-actions";

export const metadata: Metadata = { title: "Chi tiết học phí" };

const ENTRY_LABEL = {
  BASE: "Học phí gốc",
  EXTRA_SESSION: "Buổi vượt gói",
  DISCOUNT: "Giảm giá",
  ADJUSTMENT: "Điều chỉnh",
} as const;

const METHOD_LABEL = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  OTHER: "Khác",
} as const;

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={
          tone === "red"
            ? "text-lg font-semibold text-red-600"
            : tone === "green"
              ? "text-lg font-semibold text-emerald-600"
              : "text-lg font-semibold text-slate-800"
        }
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("tuition.manage");
  const { id } = await params;

  const tuition = await prisma.studentTuition.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      totalSessions: true,
      usedSessions: true,
      extraSessions: true,
      totalAmount: true,
      paidAmount: true,
      note: true,
      student: { select: { id: true, code: true, fullName: true, parentPhone: true } },
      enrollment: {
        select: {
          status: true,
          joinedAt: true,
          class: { select: { id: true, code: true, name: true, type: true } },
        },
      },
      package: { select: { name: true, totalSessions: true, price: true, extraUnitPrice: true } },
      ieltsCourse: { select: { name: true, price: true, plannedSessions: true } },
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amount: true,
          quantity: true,
          note: true,
          createdAt: true,
          session: { select: { id: true, sequence: true, date: true } },
        },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          reference: true,
          note: true,
        },
      },
    },
  });
  if (!tuition) notFound();

  const total = Number(tuition.totalAmount);
  const paid = Number(tuition.paidAmount);
  const due = Math.max(0, total - paid);
  const isNormal = tuition.type === "NORMAL";
  const remaining = isNormal && tuition.totalSessions != null
    ? tuition.totalSessions - tuition.usedSessions
    : null;

  return (
    <>
      <Link
        href="/hoc-phi"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách học phí
      </Link>

      <PageHeader
        title={tuition.student.fullName}
        description={`${tuition.student.code} · Lớp ${tuition.enrollment.class.name} (${tuition.enrollment.class.code})`}
        action={
          <span className="flex items-center gap-2">
            <StatusBadge value={tuition.type} />
            <EnrollmentBadge value={tuition.enrollment.status} />
          </span>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tổng phải thu" value={formatCurrency(total)} />
            <Stat label="Đã thu" value={formatCurrency(paid)} tone="green" />
            <Stat
              label="Còn lại"
              value={formatCurrency(due)}
              tone={due > 0 ? "red" : "green"}
              hint={due > 0 ? "Chưa thu đủ" : "Đã thu đủ"}
            />
            {isNormal ? (
              <Stat
                label="Buổi đã học"
                value={`${tuition.usedSessions}/${tuition.totalSessions ?? 0}`}
                hint={
                  remaining != null && remaining > 0
                    ? `Còn ${remaining} buổi`
                    : `Vượt gói ${tuition.extraSessions} buổi`
                }
              />
            ) : (
              <Stat
                label="Hình thức"
                value="Trọn khóa"
                hint="Tăng buổi không tăng học phí (R9, R10)"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gói học phí</CardTitle>
            <CardDescription>
              Ghi danh từ {formatDate(tuition.enrollment.joinedAt)}. Đổi gói bằng cách ghi danh lại
              ở trang lớp học.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Tên gói / khóa</p>
              <p className="text-slate-800">
                {tuition.package?.name ?? tuition.ieltsCourse?.name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Giá niêm yết</p>
              <p className="text-slate-800">
                {formatCurrency(tuition.package?.price ?? tuition.ieltsCourse?.price ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">
                {isNormal ? "Đơn giá buổi vượt gói" : "Số buổi dự kiến"}
              </p>
              <p className="text-slate-800">
                {isNormal
                  ? tuition.package?.extraUnitPrice
                    ? formatCurrency(tuition.package.extraUnitPrice)
                    : "Theo đơn giá gói"
                  : (tuition.ieltsCourse?.plannedSessions ?? "—")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bút toán (PRD §14) */}
        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Bút toán</CardTitle>
            <CardDescription>
              Tổng phải thu là tổng các bút toán, trong đó Giảm giá được trừ đi.
            </CardDescription>
          </CardHeader>

          <Table>
            <THead>
              <TR>
                <THIndex />
                <TH>Ngày</TH>
                <TH>Loại</TH>
                <TH>Diễn giải</TH>
                <TH className="text-right">Đơn giá</TH>
                <TH className="text-right">SL</TH>
                <TH className="text-right">Thành tiền</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {tuition.entries.length === 0 ? (
                <EmptyRow colSpan={8}>Chưa có bút toán nào.</EmptyRow>
              ) : (
                tuition.entries.map((entry, index) => {
                  const line = Number(entry.amount) * entry.quantity;
                  const isDiscount = entry.type === "DISCOUNT";
                  const manual = entry.type === "DISCOUNT" || entry.type === "ADJUSTMENT";
                  return (
                    <TR key={entry.id}>
                      <TDIndex value={index + 1} />
                      <TD className="whitespace-nowrap">{formatDate(entry.createdAt)}</TD>
                      <TD>
                        <Badge
                          tone={
                            entry.type === "DISCOUNT"
                              ? "green"
                              : entry.type === "EXTRA_SESSION"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {ENTRY_LABEL[entry.type]}
                        </Badge>
                      </TD>
                      <TD>
                        {entry.note ?? "—"}
                        {entry.session ? (
                          <Link
                            href={`/lich-day/${entry.session.id}`}
                            className="block text-xs text-brand-700 hover:underline"
                          >
                            Buổi {entry.session.sequence} · {formatDate(entry.session.date)}
                          </Link>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        {formatCurrency(entry.amount)}
                      </TD>
                      <TD className="text-right">{entry.quantity}</TD>
                      <TD
                        className={
                          isDiscount
                            ? "whitespace-nowrap text-right text-emerald-600"
                            : "whitespace-nowrap text-right"
                        }
                      >
                        {isDiscount ? "−" : ""}
                        {formatCurrency(line)}
                      </TD>
                      <TD className="text-right">
                        {manual ? (
                          <ActionForm action={deleteTuitionEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <SubmitButton
                              variant="ghost"
                              size="sm"
                              confirm="Xoá bút toán này? Công nợ sẽ được tính lại."
                            >
                              Xoá
                            </SubmitButton>
                          </ActionForm>
                        ) : (
                          <span className="text-xs text-slate-400">Tự động</span>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>

          <CardContent className="border-t border-slate-200">
            <ActionForm
              action={addTuitionEntry}
              resetOnSuccess
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <input type="hidden" name="tuitionId" value={tuition.id} />
              <Field label="Loại">
                <Select name="type" defaultValue="DISCOUNT">
                  <option value="DISCOUNT">Giảm giá</option>
                  <option value="ADJUSTMENT">Điều chỉnh</option>
                </Select>
              </Field>
              <Field label="Số tiền">
                <Input name="amount" inputMode="numeric" placeholder="500000" required />
              </Field>
              <Field label="Số lượng">
                <Input name="quantity" type="number" min={1} max={999} defaultValue={1} required />
              </Field>
              <Field label="Diễn giải" className="lg:col-span-2">
                <Input name="note" placeholder="Ưu đãi anh chị em ruột" required />
              </Field>
              <div className="lg:col-span-5">
                <SubmitButton variant="secondary">Thêm bút toán</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        {/* Thanh toán (PRD §15) */}
        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Lịch sử thanh toán</CardTitle>
            <CardDescription>
              Đã thu {formatCurrency(paid)} / {formatCurrency(total)}.
            </CardDescription>
          </CardHeader>

          <Table>
            <THead>
              <TR>
                <THIndex />
                <TH>Ngày thu</TH>
                <TH>Hình thức</TH>
                <TH>Số hoá đơn</TH>
                <TH>Ghi chú</TH>
                <TH className="text-right">Số tiền</TH>
                <TH className="text-right">Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {tuition.payments.length === 0 ? (
                <EmptyRow colSpan={7}>Chưa ghi nhận khoản thu nào.</EmptyRow>
              ) : (
                tuition.payments.map((payment, index) => (
                  <TR key={payment.id}>
                    <TDIndex value={index + 1} />
                    <TD className="whitespace-nowrap">{formatDate(payment.paidAt)}</TD>
                    <TD>{METHOD_LABEL[payment.method]}</TD>
                    <TD className="font-mono text-xs text-slate-500">
                      {payment.reference ?? "—"}
                    </TD>
                    <TD>{payment.note ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </TD>
                    <TD className="text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <ReceiptActions paymentId={payment.id} />
                        <ActionForm action={deletePayment}>
                          <input type="hidden" name="id" value={payment.id} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            confirm="Xoá phiếu thu này? Công nợ sẽ được tính lại."
                          >
                            Xoá
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>

          <CardContent className="border-t border-slate-200">
            <ActionForm
              action={recordPayment}
              resetOnSuccess
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <input type="hidden" name="tuitionId" value={tuition.id} />
              <Field label="Số tiền">
                <Input
                  name="amount"
                  inputMode="numeric"
                  placeholder={String(due || total)}
                  required
                />
              </Field>
              <Field label="Hình thức">
                <Select name="method" defaultValue="CASH">
                  {Object.entries(METHOD_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ngày thu" hint="Bỏ trống → hôm nay">
                <Input name="paidAt" type="date" defaultValue={toDateInput(new Date())} />
              </Field>
              <Field label="Số hoá đơn">
                <Input name="reference" placeholder="Số hoá đơn / mã giao dịch" />
              </Field>
              <Field label="Ghi chú">
                <Input name="note" placeholder="Phụ huynh đóng đợt 1" />
              </Field>
              <div className="lg:col-span-5">
                <SubmitButton>Ghi nhận thanh toán</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ghi chú</CardTitle>
            <CardDescription>
              Thoả thuận riêng với phụ huynh, lịch hẹn đóng tiền...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateTuitionNote} className="space-y-3">
              <input type="hidden" name="tuitionId" value={tuition.id} />
              <Textarea name="note" defaultValue={tuition.note ?? ""} maxLength={500} />
              <SubmitButton variant="secondary">Lưu ghi chú</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
