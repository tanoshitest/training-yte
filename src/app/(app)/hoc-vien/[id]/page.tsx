import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, KeyRound, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select } from "@/components/ui/input";
import { EditButton, DeleteButton } from "@/components/ui/modal";
import { Badge, STATUS_TONE } from "@/components/ui/badge";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/permissions";
import { advanceBalance, remainingSessions } from "@/lib/tuition";
import { cn, formatCurrency, formatDate, startOfDay, toDateInput } from "@/lib/utils";
import type { StudentStatus } from "@/generated/prisma/enums";
import { setEnrollmentStatus, transferStudent } from "../../lop-hoc/actions";
import {
  collectAdvance,
  deleteAdvance,
  deleteStudent,
  resetStudentPassword,
  saveStudentAccount,
  setRemainingSessions,
  updateStudent,
} from "../actions";

export const metadata: Metadata = { title: "Hồ sơ học viên" };

const STUDENT_STATUSES: StudentStatus[] = ["UNASSIGNED", "STUDYING", "RESERVED", "DROPPED"];

const METHOD_LABEL = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  OTHER: "Khác",
} as const;

/** Nhãn cho mốc rời lớp — suy ra từ tình trạng ghi danh hiện tại. */
const LEFT_EVENT = {
  RESERVED: { label: "Bảo lưu", tone: "amber" },
  TRANSFERRED: { label: "Chuyển lớp", tone: "brand" },
  DROPPED: { label: "Nghỉ học", tone: "red" },
} as const;

/** Tên tiếng Việt của các trường trong hồ sơ, dùng khi đọc lại audit log. */
const FIELD_LABEL: Record<string, string> = {
  code: "mã học viên",
  fullName: "họ và tên",
  dateOfBirth: "ngày sinh",
  parentName: "tên phụ huynh",
  parentPhone: "SĐT phụ huynh",
  address: "địa chỉ",
  note: "ghi chú",
  status: "trạng thái",
};

type Tone = "brand" | "green" | "amber" | "red" | "slate";

type Activity = {
  key: string;
  at: Date;
  label: string;
  detail: string;
  tone: Tone;
  /** Lớp liên quan — dòng ghi danh có link sang lớp và nút Tình trạng học / Chuyển lớp. */
  enrollment?: {
    id: string;
    classId: string;
    className: string;
    /** Giá trị mặc định của ô Tình trạng học (Đã chuyển lớp không phải lựa chọn). */
    status: "ACTIVE" | "RESERVED" | "DROPPED";
  };
};

function TabLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
      )}
    >
      {children}
    </Link>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("student.manage");
  const { id } = await params;
  const { tab } = await searchParams;
  const showActivity = tab === "hoat-dong";

  // Tình trạng học và chuyển lớp là thao tác trên lớp — chỉ ai sửa được lớp mới thấy.
  const canEditEnrollment = can(user.role, "class.update");

  const [student, otherClasses] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      include: {
        advances: { orderBy: { createdAt: "desc" } },
        enrollments: {
          orderBy: { joinedAt: "desc" },
          include: {
            class: { select: { id: true, code: true, name: true, type: true } },
            tuition: {
              include: {
                package: { select: { name: true } },
                ieltsCourse: { select: { name: true } },
                payments: { orderBy: { paidAt: "desc" } },
              },
            },
          },
        },
      },
    }),
    canEditEnrollment && showActivity
      ? prisma.class.findMany({
          where: { status: { not: "FINISHED" } },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        })
      : [],
  ]);

  if (!student) notFound();

  const login = student.userId
    ? await prisma.user.findUnique({
        where: { id: student.userId },
        select: { email: true, isActive: true },
      })
    : null;

  const active = student.enrollments.filter((e) => e.status === "ACTIVE");
  const reserved = student.enrollments.filter((e) => e.status === "RESERVED");
  const currentClasses =
    student.status === "STUDYING" ? active : student.status === "RESERVED" ? reserved : [];
  const currentClassLabel =
    currentClasses.length > 0 ? currentClasses.map((item) => item.class.name).join(", ") : "—";
  const balance = advanceBalance(student.advances);

  const normalClassIds = active.filter((e) => e.class.type === "NORMAL").map((e) => e.class.id);
  const completedSessions =
    !showActivity && normalClassIds.length > 0
      ? await prisma.lessonSession.findMany({
          where: { classId: { in: normalClassIds }, status: "COMPLETED" },
          select: { classId: true, date: true },
        })
      : [];

  /**
   * Học phí hiện theo loại lớp (R2):
   * - Lớp thường: chỉ có số buổi còn lại, nhập tay được, không dính tới tiền.
   * - Lớp IELTS: học trọn khoá nên chỉ có hai trạng thái còn nợ / đã đóng đủ.
   */
  const tuitionRows = active.map((enrollment) => {
    const tuition = enrollment.tuition;
    if (enrollment.class.type === "IELTS") {
      const owed = tuition ? Number(tuition.totalAmount) - Number(tuition.paidAmount) : 0;
      return {
        enrollmentId: enrollment.id,
        className: enrollment.class.name,
        kind: "IELTS" as const,
        courseName: tuition?.ieltsCourse?.name ?? null,
        // Chưa có hồ sơ học phí cũng tính là còn nợ, không được báo đã đóng đủ.
        settled: !!tuition && owed <= 0,
        remaining: 0,
      };
    }
    const from = startOfDay(enrollment.joinedAt).getTime();
    const completed = completedSessions.filter(
      (session) => session.classId === enrollment.class.id && session.date.getTime() >= from,
    ).length;
    // Chưa nhập số buổi thì mỗi buổi lớp đã dạy là một buổi học vượt.
    const remaining = tuition
      ? (remainingSessions(tuition) ?? (tuition.totalSessions ?? 0) - tuition.usedSessions)
      : 0 - completed;
    return {
      enrollmentId: enrollment.id,
      className: enrollment.class.name,
      kind: "NORMAL" as const,
      courseName: null,
      settled: false,
      remaining,
    };
  });

  // Tiền chỉ còn ý nghĩa với lớp IELTS; số dư cũ vẫn phải hiện để xoá được lần thu nhầm.
  const showMoney = tuitionRows.some((row) => row.kind === "IELTS") || student.advances.length > 0;

  // Lịch sử hoạt động ghép từ dữ liệu nghiệp vụ (ghi danh, phiếu thu) và audit log của hồ sơ.
  const activities: Activity[] = [];
  if (showActivity) {
    for (const enrollment of student.enrollments) {
      const where = `Lớp ${enrollment.class.name} (${enrollment.class.code})`;
      const tuition = enrollment.tuition;
      const left = tuition ? remainingSessions(tuition) : null;
      const owed = tuition ? Number(tuition.totalAmount) - Number(tuition.paidAmount) : 0;

      activities.push({
        key: `join-${enrollment.id}`,
        at: enrollment.joinedAt,
        label: "Nhập học",
        detail: [
          tuition?.package?.name ?? tuition?.ieltsCourse?.name,
          tuition ? formatCurrency(tuition.totalAmount) : null,
          tuition ? (owed > 0 ? `còn nợ ${formatCurrency(owed)}` : "đã thanh toán đủ") : null,
          tuition && tuition.type === "NORMAL"
            ? `${tuition.usedSessions}/${tuition.totalSessions ?? "—"} buổi${
                left != null && left < 0 ? ` (vượt ${-left})` : ""
              }`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "green",
        enrollment: {
          id: enrollment.id,
          classId: enrollment.class.id,
          className: enrollment.class.name,
          status: enrollment.status === "TRANSFERRED" ? "ACTIVE" : enrollment.status,
        },
      });

      if (enrollment.status !== "ACTIVE") {
        const event = LEFT_EVENT[enrollment.status];
        activities.push({
          key: `left-${enrollment.id}`,
          at: enrollment.leftAt ?? enrollment.updatedAt,
          label: event.label,
          detail: where,
          tone: event.tone,
        });
      }

      for (const payment of enrollment.tuition?.payments ?? []) {
        activities.push({
          key: `pay-${payment.id}`,
          at: payment.paidAt,
          label: "Đóng học phí",
          detail: [
            formatCurrency(payment.amount),
            METHOD_LABEL[payment.method],
            where,
            payment.note,
          ]
            .filter(Boolean)
            .join(" · "),
          tone: "brand",
        });
      }
    }

    for (const advance of student.advances) {
      const used = Number(advance.usedAmount);
      const left = Number(advance.amount) - used;
      activities.push({
        key: `advance-${advance.id}`,
        at: advance.createdAt,
        label: "Thu tạm ứng",
        detail: [
          formatCurrency(advance.amount),
          used > 0 ? `đã trừ ${formatCurrency(used)} vào học phí` : null,
          left > 0 ? `còn dư ${formatCurrency(left)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "brand",
      });
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: "Student",
        entityId: id,
        action: { in: ["CREATE", "UPDATE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        newValue: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    });

    for (const log of logs) {
      const changed =
        log.newValue && typeof log.newValue === "object" && !Array.isArray(log.newValue)
          ? (log.newValue as Record<string, unknown>)
          : {};
      const statusRaw = typeof changed.status === "string" ? changed.status : null;
      const statusLabel =
        statusRaw && statusRaw in STATUS_TONE
          ? STATUS_TONE[statusRaw as keyof typeof STATUS_TONE].label
          : null;
      const others = Object.keys(changed)
        .filter((key) => key !== "status")
        .map((key) => FIELD_LABEL[key] ?? key);

      const detail: string[] = [];
      if (log.action === "CREATE") detail.push("Tạo hồ sơ học viên");
      if (statusLabel) detail.push(`Trạng thái → ${statusLabel}`);
      if (log.action === "UPDATE" && others.length > 0) detail.push(`Sửa ${others.join(", ")}`);
      if (log.user) detail.push(log.user.fullName);

      activities.push({
        key: `log-${log.id}`,
        at: log.createdAt,
        label: log.action === "CREATE" ? "Tạo hồ sơ" : statusLabel ? "Đổi trạng thái" : "Sửa hồ sơ",
        detail: detail.join(" · "),
        tone: "slate",
      });
    }

    // Hồ sơ tạo trước khi có nhật ký (dữ liệu seed, hoặc log đã bị cắt bởi `take`)
    // thì vẫn phải thấy mốc tạo — lấy thẳng từ `students.createdAt`.
    if (!logs.some((log) => log.action === "CREATE")) {
      activities.push({
        key: `created-${student.id}`,
        at: student.createdAt,
        label: "Tạo hồ sơ",
        detail: `Tạo hồ sơ học viên ${student.code}`,
        tone: "slate",
      });
    }

    activities.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  return (
    <div className={cn("flex flex-1 flex-col", showActivity ? "gap-5" : "min-h-0 overflow-hidden")}>
      <Link
        href="/hoc-vien"
        className="mb-2 inline-flex shrink-0 items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách học viên
      </Link>

      <PageHeader
        className="mb-3 shrink-0"
        title={student.fullName}
        description={`Mã ${student.code} · ${active.length} lớp đang học · ${student.enrollments.length} lần ghi danh`}
        action={
          <ActionForm action={deleteStudent}>
            <input type="hidden" name="id" value={student.id} />
            <SubmitButton
              variant="danger"
              size="sm"
              confirm={`Bạn có chắc muốn xóa dữ liệu này? Xoá học viên ${student.fullName} sẽ mất luôn ${student.enrollments.length} lần ghi danh, toàn bộ hồ sơ học phí và điểm danh. Không khôi phục lại được.`}
            >
              <Trash2 className="h-4 w-4" />
              Xoá
            </SubmitButton>
          </ActionForm>
        }
      />

      <div className="mb-3 -mx-4 shrink-0 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <nav className="flex w-max min-w-full gap-1 border-b border-slate-200">
          <TabLink href={`/hoc-vien/${student.id}`} active={!showActivity}>
            Thông tin học viên
          </TabLink>
          <TabLink href={`/hoc-vien/${student.id}?tab=hoat-dong`} active={showActivity}>
            Lịch sử hoạt động
          </TabLink>
        </nav>
      </div>

      {showActivity ? (
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-col items-start gap-1">
              <CardTitle>Lịch sử hoạt động ({activities.length})</CardTitle>
              <CardDescription>
                Một bảng duy nhất từ lúc tạo hồ sơ: ghi danh, thu tạm ứng, đóng học phí, bảo lưu,
                chuyển lớp và các lần sửa hồ sơ — mới nhất ở trên.
              </CardDescription>
            </CardHeader>

            <Table>
              <THead>
                <TR>
                  <THIndex />
                  <TH>Ngày</TH>
                  <TH>Hoạt động</TH>
                  <TH>Chi tiết</TH>
                  {canEditEnrollment ? <TH className="text-right">Thao tác</TH> : null}
                </TR>
              </THead>
              <TBody>
                {activities.length === 0 ? (
                  <EmptyRow colSpan={canEditEnrollment ? 5 : 4}>
                    Chưa có hoạt động nào được ghi nhận.
                  </EmptyRow>
                ) : (
                  activities.map((item, index) => {
                    const enrollment = item.enrollment;

                    return (
                      <TR key={item.key}>
                        <TDIndex value={index + 1} />
                        <TD className="whitespace-nowrap text-slate-600">{formatDate(item.at)}</TD>
                        <TD>
                          <Badge tone={item.tone}>{item.label}</Badge>
                        </TD>
                        <TD className="text-slate-600">
                          {enrollment ? (
                            <>
                              <Link
                                href={`/lop-hoc/${enrollment.classId}`}
                                className="font-medium text-brand-700 hover:underline"
                              >
                                {enrollment.className}
                              </Link>
                              {item.detail ? " · " : null}
                            </>
                          ) : null}
                          {item.detail || (enrollment ? null : "—")}
                        </TD>
                        {canEditEnrollment ? (
                          <TD>
                            {/* Sửa tình trạng học và chuyển lớp gắn ngay vào dòng ghi danh. */}
                            {enrollment ? (
                              <div className="flex items-center justify-end gap-2">
                                <EditButton
                                  action={setEnrollmentStatus}
                                  title={`Tình trạng học — lớp ${enrollment.className}`}
                                >
                                  <input type="hidden" name="id" value={enrollment.id} />
                                  <Field
                                    label="Tình trạng học"
                                    hint="Nghỉ học sẽ ghi lại ngày rời lớp; trạng thái học viên tự cập nhật theo."
                                  >
                                    <Select name="status" defaultValue={enrollment.status}>
                                      <option value="ACTIVE">Đang học</option>
                                      <option value="RESERVED">Bảo lưu</option>
                                      <option value="DROPPED">Nghỉ học</option>
                                    </Select>
                                  </Field>
                                </EditButton>
                                <EditButton
                                  action={transferStudent}
                                  title={`Chuyển lớp — đang ở ${enrollment.className}`}
                                  icon={<ArrowRightLeft className="h-4 w-4" />}
                                  label="Chuyển lớp"
                                  submitLabel="Chuyển lớp"
                                >
                                  <input type="hidden" name="id" value={enrollment.id} />
                                  <Field
                                    label="Chuyển sang lớp"
                                    hint="Lần ghi danh này được đánh dấu Đã chuyển lớp. Lớp IELTS áp luôn khóa học phí của lớp mới; lớp thường thu gói buổi sau ở màn hình Học phí."
                                  >
                                    <Select name="targetClassId" defaultValue="" required>
                                      <option value="">— Chọn lớp —</option>
                                      {otherClasses
                                        .filter((target) => target.id !== enrollment.classId)
                                        .map((target) => (
                                          <option key={target.id} value={target.id}>
                                            {target.name} ({target.code})
                                          </option>
                                        ))}
                                    </Select>
                                  </Field>
                                </EditButton>
                              </div>
                            ) : null}
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </Card>
        </div>
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-3">
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
              <section className="grid content-start gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:overflow-y-auto lg:pr-1 [&_label]:mb-0.5">
                <p className="col-span-full text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Hồ sơ
                </p>
                <ActionForm
                  action={updateStudent}
                  className="col-span-full grid gap-x-3 gap-y-1.5 sm:grid-cols-3"
                >
                  <input type="hidden" name="id" value={student.id} />
                  <Field label="Họ và tên">
                    <Input name="fullName" defaultValue={student.fullName} required />
                  </Field>
                  <Field label="Mã học viên">
                    <Input name="code" defaultValue={student.code} required />
                  </Field>
                  <Field label="Ngày sinh">
                    <Input
                      name="dateOfBirth"
                      type="date"
                      defaultValue={toDateInput(student.dateOfBirth)}
                    />
                  </Field>
                  <Field
                    label="Trạng thái"
                    hint="Nghỉ học / bảo lưu sẽ đổi luôn tình trạng ghi danh các lớp đang học. Danh sách lớp và danh sách học viên dùng cùng nguồn đó."
                  >
                    <Select name="status" defaultValue={student.status}>
                      {STUDENT_STATUSES.map((key) => (
                        <option key={key} value={key}>
                          {STATUS_TONE[key].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Lớp đang học">
                    <Input value={currentClassLabel} disabled readOnly />
                  </Field>
                  <Field label="SĐT phụ huynh">
                    <Input name="parentPhone" defaultValue={student.parentPhone ?? ""} />
                  </Field>
                  <Field label="Tên phụ huynh">
                    <Input name="parentName" defaultValue={student.parentName ?? ""} />
                  </Field>
                  <Field label="Địa chỉ" className="sm:col-span-2">
                    <Input name="address" defaultValue={student.address ?? ""} />
                  </Field>
                  <Field label="Ghi chú" className="sm:col-span-2">
                    <Input name="note" defaultValue={student.note ?? ""} />
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton>Lưu hồ sơ</SubmitButton>
                  </div>
                </ActionForm>

                <div className="col-span-full grid gap-x-3 gap-y-1.5 border-t border-slate-200 pt-2 sm:grid-cols-3">
                  <p className="col-span-full text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Tài khoản đăng nhập
                  </p>
                  <ActionForm
                    action={saveStudentAccount}
                    className="col-span-full grid gap-x-3 gap-y-1.5 sm:grid-cols-3"
                  >
                    <input type="hidden" name="id" value={student.id} />
                    <Field label="Email đăng nhập">
                      <Input
                        name="email"
                        type="email"
                        defaultValue={login?.email ?? student.email ?? ""}
                        required
                      />
                    </Field>
                    {login ? (
                      <Field label="Trạng thái">
                        <Select name="isActive" defaultValue={login.isActive ? "true" : "false"}>
                          <option value="true">Đang hoạt động</option>
                          <option value="false">Tạm dừng</option>
                        </Select>
                      </Field>
                    ) : (
                      <Field label="Mật khẩu">
                        <Input
                          name="password"
                          type="password"
                          minLength={8}
                          placeholder="Tối thiểu 8 ký tự"
                          required
                        />
                      </Field>
                    )}
                    <div className="flex items-end">
                      <SubmitButton>{login ? "Lưu tài khoản" : "Tạo tài khoản"}</SubmitButton>
                    </div>
                  </ActionForm>
                  {login ? (
                    <ActionForm
                      action={resetStudentPassword}
                      resetOnSuccess
                      className="col-span-full grid gap-x-3 gap-y-1.5 sm:grid-cols-3"
                    >
                      <input type="hidden" name="id" value={student.id} />
                      <Field label="Mật khẩu mới" className="sm:col-span-2">
                        <Input
                          name="password"
                          type="password"
                          minLength={8}
                          placeholder="Tối thiểu 8 ký tự"
                        />
                      </Field>
                      <div className="flex items-end">
                        <SubmitButton variant="outline">
                          <KeyRound className="h-4 w-4" />
                          Đặt lại mật khẩu
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  ) : null}
                </div>
              </section>

              <section className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Học phí
                </p>
                {tuitionRows.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
                    Chưa xếp lớp — chưa có học phí.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tuitionRows.map((row) => (
                      <li
                        key={row.enrollmentId}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="font-medium text-slate-800">{row.className}</span>
                          {row.kind === "IELTS" ? (
                            <span
                              className={
                                row.settled
                                  ? "font-medium text-emerald-600"
                                  : "font-medium text-red-600"
                              }
                            >
                              {row.settled ? "Đã đóng đủ" : "Còn nợ học phí"}
                            </span>
                          ) : (
                            <span
                              className={
                                row.remaining < 0
                                  ? "font-medium text-red-600"
                                  : row.remaining === 0
                                    ? "font-medium text-amber-700"
                                    : "font-medium text-slate-800"
                              }
                            >
                              {row.remaining < 0
                                ? `Học vượt ${-row.remaining} buổi`
                                : `Còn ${row.remaining} buổi`}
                            </span>
                          )}
                        </div>
                        {row.kind === "IELTS" ? (
                          row.courseName ? (
                            <p className="mt-0.5 text-xs text-slate-500">{row.courseName}</p>
                          ) : null
                        ) : (
                          /* Lớp thường quản lý bằng số buổi: nhập thẳng số buổi còn lại, không có tiền. */
                          <ActionForm
                            action={setRemainingSessions}
                            className="mt-1.5 flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                            <label
                              htmlFor={`remaining-${row.enrollmentId}`}
                              className="text-xs text-slate-500"
                            >
                              Số buổi còn lại
                            </label>
                            <Input
                              id={`remaining-${row.enrollmentId}`}
                              name="remaining"
                              type="number"
                              min={-999}
                              max={999}
                              required
                              defaultValue={row.remaining}
                              className="h-8 w-20"
                            />
                            <SubmitButton variant="outline" size="sm">
                              Lưu
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {showMoney ? (
                  <>
                    <ActionForm action={collectAdvance} resetOnSuccess>
                      <p className="mb-1 text-sm font-medium text-slate-800">Thu học phí IELTS</p>
                      <p className="mb-2 text-xs text-slate-500">
                        Tiền thu vào sẽ tự trừ vào hồ sơ còn nợ, dư bao nhiêu giữ lại làm số dư.
                        {balance > 0 ? (
                          <span className="font-medium text-brand-700">
                            {" "}
                            Số dư hiện có {formatCurrency(balance)}.
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="studentId" value={student.id} />
                        <Input
                          name="amount"
                          inputMode="numeric"
                          placeholder="1.000.000"
                          required
                          className="h-8 w-40"
                          aria-label="Số tiền"
                        />
                        <SubmitButton size="sm">Lưu</SubmitButton>
                      </div>
                    </ActionForm>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <p className="mb-1.5 text-xs font-medium text-slate-600">Lần thu</p>
                      {student.advances.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500">
                          Chưa có lần thu nào.
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                          {student.advances.map((advance) => {
                            const used = Number(advance.usedAmount);
                            return (
                              <li
                                key={advance.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm"
                              >
                                <span className="w-24 shrink-0 text-slate-500">
                                  {formatDate(advance.createdAt)}
                                </span>
                                <span className="flex-1 font-medium text-slate-800">
                                  {formatCurrency(advance.amount)}
                                </span>
                                {used > 0 ? (
                                  <span className="text-xs text-slate-500">
                                    đã trừ {formatCurrency(used)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-brand-700">số dư</span>
                                )}
                                <DeleteButton
                                  action={deleteAdvance}
                                  id={advance.id}
                                  message={`Xoá khoản thu ${formatCurrency(advance.amount)} ngày ${formatDate(advance.createdAt)}? ${used > 0 ? "Phần đã trừ vào học phí sẽ được hoàn lại." : ""}`.trim()}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
