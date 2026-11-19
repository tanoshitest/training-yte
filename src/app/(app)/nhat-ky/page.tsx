import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { formatDateUtc } from "@/lib/date";
import { can, requirePermission } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/roles";
import { describeUndo } from "@/lib/audit-undo";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

import { rollbackAudit } from "./actions";
import { ReceiptActions } from "../hoc-phi/receipt-actions";

export const metadata: Metadata = { title: "Nhật ký hệ thống" };

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
  DELETE: "Xoá",
  LOGIN: "Đăng nhập",
  COMPLETE_SESSION: "Hoàn thành buổi",
  CANCEL_SESSION: "Huỷ buổi",
  ROLLBACK: "Hoàn tác",
};

const ACTION_TONE: Record<AuditAction, "green" | "brand" | "red" | "slate" | "amber"> = {
  CREATE: "green",
  UPDATE: "brand",
  DELETE: "red",
  LOGIN: "slate",
  COMPLETE_SESSION: "green",
  CANCEL_SESSION: "amber",
  ROLLBACK: "amber",
};

/** Tên thực thể trong DB → tên nghiệp vụ để người dùng đọc được. */
const ENTITY_LABEL: Record<string, string> = {
  Student: "Học viên",
  Teacher: "Giáo viên",
  Class: "Lớp học",
  Enrollment: "Ghi danh",
  LessonSession: "Buổi học",
  Attendance: "Điểm danh",
  SessionReport: "Báo cáo buổi học",
  Syllabus: "Syllabus",
  SyllabusUnit: "Unit syllabus",
  SyllabusLesson: "Bài học",
  StudentTuition: "Hồ sơ học phí",
  TuitionEntry: "Bút toán học phí",
  TuitionPayment: "Phiếu thu",
  TuitionReminder: "Nhắc học phí",
  StudentAdvance: "Thu tạm ứng",
  NormalPackage: "Gói lớp thường",
  IeltsCourse: "Khóa IELTS",
  Level: "Cấp học",
  SubLevel: "Level",
  Room: "Phòng học",
  Shift: "Ca học",
  Center: "Trung tâm",
  User: "Tài khoản",
};

function entityLabel(entity: string) {
  return ENTITY_LABEL[entity] ?? entity;
}

const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** JSON audit → vài dòng `khoá: giá trị` đủ đọc, cắt bớt cho khỏi vỡ bảng. */
function summarize(value: Prisma.JsonValue | null) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return String(value).slice(0, 120);

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;

  return entries
    .slice(0, 6)
    .map(([key, raw]) => {
      const text = raw === null ? "—" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
      return `${key}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
    })
    .join(" · ");
}

type Search = {
  user?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("audit.view");
  const canRollback = can(user.role, "audit.rollback");

  const { user: userId = "", action = "", entity = "", from = "", to = "" } = await searchParams;

  const actionFilter = action in ACTION_LABEL ? (action as AuditAction) : undefined;

  // Ngày lọc là ngày địa phương của người nhập; "đến ngày" lấy trọn ngày đó.
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00`) : undefined;
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999`) : undefined;

  const where: Prisma.AuditLogWhereInput = {
    ...(userId ? { userId } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entity ? { entity } : {}),
    ...(fromDate || toDate ? { createdAt: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } } : {}),
  };

  const [rows, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        undo: true,
        rolledBackAt: true,
        rolledBackBy: { select: { fullName: true } },
        user: { select: { fullName: true, email: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    }),
  ]);

  const sessionIds = [
    ...new Set(
      rows
        .filter((row) => row.entityId && (row.entity === "LessonSession" || row.entity === "Attendance"))
        .map((row) => row.entityId as string),
    ),
  ];
  const sessions =
    sessionIds.length > 0
      ? await prisma.lessonSession.findMany({
          where: { id: { in: sessionIds } },
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            class: { select: { name: true } },
          },
        })
      : [];
  const sessionLabelById = new Map(
    sessions.map((session) => [
      session.id,
      `${session.class.name} · ${formatDateUtc(session.date)} · ${session.startTime}–${session.endTime}`,
    ]),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Nhật ký hệ thống"
          description="Mọi thao tác thêm / sửa / xoá đều được ghi lại (PRD §26). Nhật ký chỉ đọc; riêng thao tác nghiệp vụ có thể hoàn tác một lần, và chính lần hoàn tác đó cũng được ghi lại."
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Bản ghi ({rows.length})</CardTitle>
            <CardDescription>
              Mật khẩu và mã băm mật khẩu không bao giờ được ghi vào nhật ký.
            </CardDescription>
          </div>

          <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Người thực hiện">
              <Select name="user" defaultValue={userId}>
                <option value="">Tất cả</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({ROLE_LABEL[u.role]})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hành động">
              <Select name="action" defaultValue={action}>
                <option value="">Tất cả</option>
                {Object.entries(ACTION_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Thực thể">
              <Select name="entity" defaultValue={entity}>
                <option value="">Tất cả</option>
                {Object.entries(ENTITY_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={from} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={to} />
            </Field>
          </FilterForm>
        </CardHeader>

        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Thời điểm</TH>
              <TH>Người thực hiện</TH>
              <TH>Hành động</TH>
              <TH>Thực thể</TH>
              <TH>Thay đổi</TH>
              <TH className="text-right">Hoàn tác</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>Không có bản ghi nào khớp bộ lọc.</EmptyRow>
            ) : (
              rows.map((row, index) => {
                const before = summarize(row.oldValue);
                const after = summarize(row.newValue);
                const undo = describeUndo(row);
                return (
                  <TR key={row.id} className={row.rolledBackAt ? "opacity-60" : undefined}>
                    <TDIndex value={index + 1} />
                    <TD className="whitespace-nowrap text-slate-500">
                      {DATE_TIME.format(row.createdAt)}
                    </TD>
                    <TD>
                      {row.user ? (
                        <>
                          <span className="font-medium text-slate-800">{row.user.fullName}</span>
                          <p className="text-xs text-slate-500">{row.user.email}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">Hệ thống</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={ACTION_TONE[row.action]}>{ACTION_LABEL[row.action]}</Badge>
                    </TD>
                    <TD>
                      {entityLabel(row.entity)}
                      {row.entityId ? (
                        <p className={sessionLabelById.has(row.entityId) ? "text-sm font-medium text-slate-700" : "font-mono text-[11px] text-slate-400"}>
                          {sessionLabelById.get(row.entityId) ?? row.entityId}
                        </p>
                      ) : null}
                      {row.entity === "TuitionPayment" && row.action === "CREATE" && row.entityId && !row.rolledBackAt ? (
                        <div className="mt-2">
                          <ReceiptActions paymentId={row.entityId} stacked={false} />
                        </div>
                      ) : null}
                    </TD>
                    <TD className="max-w-md">
                      {before ? (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Trước:</span> {before}
                        </p>
                      ) : null}
                      {after ? (
                        <p className="text-xs text-slate-700">
                          <span className="font-medium">Sau:</span> {after}
                        </p>
                      ) : null}
                      {!before && !after ? <span className="text-slate-400">—</span> : null}
                    </TD>
                    <TD className="text-right align-middle whitespace-nowrap">
                      {row.rolledBackAt ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge tone="slate">Đã hoàn tác</Badge>
                          <span className="text-[11px] text-slate-400">
                            {DATE_TIME.format(row.rolledBackAt)}
                            {row.rolledBackBy ? ` · ${row.rolledBackBy.fullName}` : ""}
                          </span>
                        </div>
                      ) : undo.ok && canRollback ? (
                        <ActionForm
                          action={rollbackAudit}
                          className="flex flex-col items-end gap-1 text-right"
                        >
                          <input type="hidden" name="id" value={row.id} />
                          <SubmitButton variant="ghost" size="sm" confirm={undo.label}>
                            Hoàn tác
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <span
                          className="cursor-help text-xs text-slate-400"
                          title={undo.ok ? "Bạn không có quyền hoàn tác." : undo.reason}
                        >
                          Không hoàn tác được
                        </span>
                      )}
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
