import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarOff, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal";
import { Field, Select } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { EnrollmentBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { assertCanAccessClass, can, requirePermission } from "@/lib/permissions";
import { effectiveRole } from "@/lib/roles";
import { loadNormalPackages } from "@/lib/enrollment";
import { derivedNormalPackagePrice } from "@/lib/normal-tuition";
import { loadClassOffDayOptions } from "@/lib/class-off-days";
import { formatDateUtc } from "@/lib/date";
import { remainingSessions } from "@/lib/tuition";
import { cn, formatCurrency, formatDate, WEEKDAY_LABELS } from "@/lib/utils";
import { PackageField } from "../../hoc-phi/package-field";
import { deleteClass, enrollStudent, transferStudent, updateClass } from "../actions";
import { ClassFields } from "../class-fields";
import { StudentPicker } from "../student-picker";
import { loadClassOptions } from "../ui";
import { AttendanceTab } from "./attendance-tab";
import { configureClassOffDays } from "./attendance-actions";
import { ClassOffDaysPicker } from "./class-off-days-picker";
import { SyllabusTab } from "./syllabus-tab";

export const metadata: Metadata = { title: "Chi tiết lớp học" };

/** Học viên có thể thêm vào lớp — chỉ tab Danh sách học viên mới cần truy vấn này. */
function loadCandidates(classId: string) {
  // Học viên chưa đang học ở lớp này (đã nghỉ / chuyển đi thì vẫn thêm lại được).
  return prisma.student.findMany({
    where: { NOT: { enrollments: { some: { classId, status: "ACTIVE" } } } },
    orderBy: { fullName: "asc" },
    select: { id: true, code: true, fullName: true },
  });
}

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
  searchParams: Promise<{ tab?: string; buoi?: string }>;
}) {
  // Giáo viên vào được lớp mình phụ trách để xem syllabus và nhận xét học viên (PRD §23),
  // nhưng phần sửa lớp / thêm học viên / xoá lớp vẫn chỉ admin mới thấy.
  const user = await requirePermission("class.viewAssigned");
  const { id } = await params;
  if (!(await assertCanAccessClass(user, id))) notFound();

  const { tab, buoi } = await searchParams;
  const isAdmin = effectiveRole(user.role) === "ADMIN";
  const showStudents = tab === "hoc-vien";
  const showAttendance = tab === "diem-danh";
  const showSyllabus = tab === "syllabus";
  const showInfo = !showStudents && !showAttendance && !showSyllabus;

  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      level: { select: { name: true } },
      subLevel: {
        select: {
          name: true,
          basePrice: true,
          discount24Weeks: true,
          discount12Weeks: true,
          normalPackages: {
            where: { isActive: true, totalSessions: { in: [24, 48] } },
            select: { totalSessions: true, price: true },
          },
        },
      },
      ieltsCourse: { select: { name: true, price: true, basePrice: true } },
      syllabuses: { orderBy: { order: "asc" }, select: { syllabusId: true } },
      teacher: { select: { id: true, code: true, user: { select: { fullName: true } } } },
      room: { select: { name: true } },
      schedules: { select: { weekday: true, periodId: true, startTime: true, endTime: true } },
      enrollments: {
        orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
        include: {
          student: { select: { id: true, code: true, fullName: true } },
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
      _count: { select: { sessions: true } },
    },
  });

  if (!cls) notFound();

  const [options, offDayConfig] =
    showInfo && isAdmin
      ? await Promise.all([loadClassOptions(), loadClassOffDayOptions(prisma, id)])
      : [null, null];
  const offDaySessions =
    offDayConfig?.options.map((session) => ({
      id: session.id,
      label: `${WEEKDAY_LABELS[session.date.getUTCDay()]}, ${formatDateUtc(session.date)} · ${session.startTime}–${session.endTime} · Buổi ${session.sequence}`,
      isOff: session.isOff,
      locked: session.locked,
    })) ?? [];
  const candidates = showStudents && isAdmin ? await loadCandidates(id) : null;
  const transferTargets =
    showStudents && isAdmin
        ? await prisma.class.findMany({
            where: {
              id: { not: cls.id },
              type: cls.type,
            },
            orderBy: [{ status: "asc" }, { code: "asc" }],
            select: { id: true, code: true, name: true, status: true },
          })
      : null;
  // Lớp thường chọn gói buổi ngay trên form thêm học viên, nên chỉ nạp bảng giá ở đó.
  const packages =
    showStudents && isAdmin && cls.type === "NORMAL" ? await loadNormalPackages() : null;
  const activeCount = cls.enrollments.filter((e) => e.status === "ACTIVE").length;
  const hasEnrollments = cls.enrollments.length > 0;
  // Lớp IELTS tính trọn khóa nên phải chọn khóa trước, chưa chọn thì thêm học viên sẽ
  // báo lỗi — nhắc trước cho đỡ mất công. Lớp thường không có rule học phí ở cấp lớp.
  const tuitionReady = cls.type === "NORMAL" || !!cls.ieltsCourseId;

  // Tab có bảng dài thì để thẻ chiếm hết chiều cao và tự cuộn bên trong; tab còn lại
  // (Syllabus, thông tin chỉ đọc) thì cuộn cả vùng nội dung.
  const fillsHeight = showStudents || showAttendance || !!options;

  return (
    // Đầu trang + thanh tab đứng yên, chỉ vùng nội dung bên dưới cuộn.
    <div data-fill-page className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Link
        href={isAdmin ? "/lop-hoc" : "/gv/lop-hoc"}
        className="mb-2 inline-flex shrink-0 items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách lớp học
      </Link>

      <PageHeader
        className="mb-3 shrink-0"
        title={cls.name}
        description={`Mã ${cls.code} · ${activeCount} học viên đang học · ${cls._count.sessions} buổi đã tạo`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={cls.type} />
            <StatusBadge value={cls.status} />
            {isAdmin ? (
              <ActionForm action={deleteClass}>
                <input type="hidden" name="id" value={cls.id} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  confirm={`Bạn có chắc muốn xóa dữ liệu này? Xoá lớp ${cls.name} sẽ mất luôn ${cls.enrollments.length} lần ghi danh, ${cls._count.sessions} buổi học cùng toàn bộ điểm danh, học phí và phiếu thu của lớp. Không khôi phục lại được.`}
                >
                  <Trash2 className="h-4 w-4" />
                  Xoá lớp
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        }
      />

      <div className="mb-3 -mx-4 shrink-0 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <nav className="flex w-max min-w-full gap-1 border-b border-slate-200">
          <TabLink href={`/lop-hoc/${cls.id}`} active={showInfo}>
            Thông tin lớp
          </TabLink>
          <TabLink href={`/lop-hoc/${cls.id}?tab=hoc-vien`} active={showStudents}>
            {`Danh sách học viên (${cls.enrollments.length})`}
          </TabLink>
          <TabLink
            href={buoi ? `/lop-hoc/${cls.id}?tab=diem-danh&buoi=${buoi}` : `/lop-hoc/${cls.id}?tab=diem-danh`}
            active={showAttendance}
          >
            Điểm danh
          </TabLink>
          <TabLink href={`/lop-hoc/${cls.id}?tab=syllabus`} active={showSyllabus}>
            Syllabus
          </TabLink>
        </nav>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          fillsHeight ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {showSyllabus ? (
          <SyllabusTab
            classId={cls.id}
            lessonId={buoi}
          />
        ) : null}

        {showAttendance ? (
          <AttendanceTab
            classId={cls.id}
            classType={cls.type}
            lessonId={buoi}
            attendanceMode={
              user.role === "TEACHER"
                ? "comment"
                : can(user.role, "attendance.submit")
                  ? "mark"
                  : "view"
            }
            canCreateSession={can(user.role, "attendance.submit") && cls.status !== "FINISHED"}
            reportReadOnly={user.role !== "TEACHER"}
            viewerId={user.id}
            isAdministrator={user.role === "ADMIN"}
          />
        ) : null}

        {showInfo && !isAdmin ? (
          <Card>
            <CardHeader className="flex-col items-start gap-1">
              <CardTitle>Thông tin lớp</CardTitle>
              <CardDescription>Chỉ quản trị viên mới sửa được thông tin lớp.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {/* Lớp thường: cấp + level. Lớp IELTS: gói học phí trọn khóa. */}
              {cls.type === "NORMAL" ? (
                <>
                  <Info label="Cấp học" value={cls.level?.name} />
                  <Info label="Level" value={cls.subLevel?.name} />
                  <Info
                    label="Học phí gốc 24 tuần"
                    value={
                      cls.subLevel?.basePrice != null ? formatCurrency(cls.subLevel.basePrice) : null
                    }
                  />
                  <Info
                    label="Miễn giảm 24 tuần"
                    value={
                      cls.subLevel?.discount24Weeks != null
                        ? formatCurrency(cls.subLevel.discount24Weeks)
                        : null
                    }
                  />
                  <Info
                    label="Miễn giảm 12 tuần"
                    value={
                      cls.subLevel?.discount12Weeks != null
                        ? formatCurrency(cls.subLevel.discount12Weeks)
                        : null
                    }
                  />
                  <Info
                    label="Giá gói 24 buổi"
                    value={listedPackagePrice(
                      cls.subLevel?.normalPackages,
                      24,
                      cls.subLevel?.basePrice,
                      cls.subLevel?.discount24Weeks,
                      cls.subLevel?.discount12Weeks,
                    )}
                  />
                  <Info
                    label="Giá gói 48 buổi"
                    value={listedPackagePrice(
                      cls.subLevel?.normalPackages,
                      48,
                      cls.subLevel?.basePrice,
                      cls.subLevel?.discount24Weeks,
                      cls.subLevel?.discount12Weeks,
                    )}
                  />
                </>
              ) : (
                <>
                  <Info
                    label="Gói học phí"
                    value={
                      cls.ieltsCourse
                        ? `${cls.ieltsCourse.name} — ${formatCurrency(cls.ieltsCourse.price)}`
                        : null
                    }
                  />
                  <Info
                    label="Học phí gốc"
                    value={
                      cls.ieltsCourse?.basePrice != null
                        ? formatCurrency(cls.ieltsCourse.basePrice)
                        : null
                    }
                  />
                </>
              )}
              <Info label="Giáo viên" value={cls.teacher?.user.fullName} />
              <Info label="Phòng học" value={cls.room?.name} />
            </CardContent>
          </Card>
        ) : null}

        {options ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {hasEnrollments ? (
              <p className="shrink-0 border-b border-slate-200 px-5 py-2 text-xs text-slate-500">
                Lớp đã có học viên nên loại lớp bị khoá — loại lớp quyết định cách tính học phí (R2).
              </p>
            ) : null}
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden py-3">
              <ActionForm action={updateClass} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <input type="hidden" name="id" value={cls.id} />
                <ClassFields
                  layout="split"
                  classId={cls.id}
                  options={options}
                  defaults={{
                    code: cls.code,
                    name: cls.name,
                    type: cls.type,
                    status: cls.status,
                    levelId: cls.levelId,
                    subLevelId: cls.subLevelId,
                    branchId: cls.branchId,
                    ieltsCourseId: cls.ieltsCourseId,
                    syllabusIds: cls.syllabuses.map((item) => item.syllabusId),
                    schedules: cls.schedules,
                    teacherId: cls.teacherId,
                    roomId: cls.roomId,
                    note: cls.note,
                  }}
                  lockType={hasEnrollments}
                  scheduleAction={
                    <ModalForm
                      action={configureClassOffDays}
                      title={`Cấu hình lịch nghỉ — ${cls.name}`}
                      submitLabel="Lưu lịch nghỉ"
                      triggerClassName={buttonClass("outline", "sm")}
                      trigger={
                        <>
                          <CalendarOff className="h-3.5 w-3.5" />
                          Cấu hình lịch nghỉ
                        </>
                      }
                      wide
                    >
                      <input type="hidden" name="classId" value={cls.id} />
                      <ClassOffDaysPicker sessions={offDaySessions} />
                    </ModalForm>
                  }
                />
                <div className="shrink-0">
                  <SubmitButton>Lưu thông tin lớp</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}

        {showStudents ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 flex-wrap gap-3">
              <div className="space-y-1">
                <CardTitle>Danh sách học viên ({cls.enrollments.length})</CardTitle>
                <CardDescription>
                  {!isAdmin
                    ? "Danh sách học viên đang học của lớp."
                    : !tuitionReady
                      ? "Lớp chưa chọn gói học phí IELTS — vào tab Thông tin lớp chọn gói trước khi thêm học viên."
                      : cls.type === "IELTS"
                        ? "Thêm học viên là áp luôn khóa học phí của lớp. Đổi tình trạng học hoặc chuyển lớp ở trang học viên."
                        : "Thêm học viên thì chọn gói buổi của từng đợt thu; chưa thu thì để trống, thu sau ở màn hình Học phí."}
                </CardDescription>
              </div>
              {candidates ? (
                <ModalForm
                  action={enrollStudent}
                  title="Thêm học viên vào lớp"
                  submitLabel="Thêm vào lớp"
                  trigger={
                    <>
                      <Plus className="h-4 w-4" />
                      Thêm
                    </>
                  }
                >
                  <input type="hidden" name="classId" value={cls.id} />
                  <StudentPicker students={candidates} />
                  {/* Gói buổi là của học viên nên chọn ở đây, không nằm trong thông tin lớp. */}
                  {packages ? (
                    <PackageField
                      packages={packages}
                      hint="Áp cho tất cả học viên vừa chọn. Để trống thì thu sau ở màn hình Học phí."
                    />
                  ) : null}
                </ModalForm>
              ) : null}
            </CardHeader>

            {/* Chỉ danh sách cuộn, tiêu đề thẻ và nút Thêm luôn nhìn thấy. */}
            <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
              <THead>
                <TR>
                  <THIndex />
                  <TH>Mã học viên</TH>
                  <TH>Học viên</TH>
                  <TH>Học phí</TH>
                  <TH>Vào lớp</TH>
                  <TH>Trạng thái</TH>
                  <TH>Chuyển lớp</TH>
                </TR>
              </THead>
              <TBody>
                {cls.enrollments.length === 0 ? (
                  <EmptyRow colSpan={7}>Lớp chưa có học viên nào.</EmptyRow>
                ) : (
                  cls.enrollments.map((enrollment, index) => {
                    const tuition = enrollment.tuition;
                    let tuitionText: string;
                    let tuitionTone: "debt" | "ok" | "plain";
                    if (cls.type === "IELTS") {
                      const owed = tuition
                        ? Number(tuition.totalAmount) - Number(tuition.paidAmount)
                        : 0;
                      tuitionText = !tuition
                        ? "Chưa đóng học phí"
                        : owed > 0
                          ? `Còn nợ ${formatCurrency(owed)}`
                          : "Đã đóng đủ";
                      tuitionTone = !tuition || owed > 0 ? "debt" : "ok";
                    } else {
                      const remaining = tuition ? remainingSessions(tuition) : 0;
                      const left = remaining ?? 0;
                      tuitionText = `${left} buổi`;
                      tuitionTone = left < 0 ? "debt" : "plain";
                    }

                    return (
                      <TR key={enrollment.id}>
                        <TDIndex value={index + 1} />
                        <TD className="whitespace-nowrap font-mono text-xs text-slate-500">
                          {enrollment.student.code}
                        </TD>
                        <TD>
                          {isAdmin ? (
                            <Link
                              href={`/hoc-vien/${enrollment.student.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {enrollment.student.fullName}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-800">
                              {enrollment.student.fullName}
                            </span>
                          )}
                        </TD>
                        <TD
                          className={cn(
                            "whitespace-nowrap",
                            tuitionTone === "debt"
                              ? "text-red-600"
                              : tuitionTone === "ok"
                                ? "text-emerald-600"
                                : "text-slate-800",
                          )}
                        >
                          {tuitionText}
                        </TD>
                        <TD className="whitespace-nowrap text-slate-600">
                          {formatDate(enrollment.joinedAt)}
                          {enrollment.leftAt ? ` → ${formatDate(enrollment.leftAt)}` : ""}
                        </TD>
                        <TD>
                          <EnrollmentBadge value={enrollment.status} />
                        </TD>
                        <TD>
                          {isAdmin && enrollment.status === "ACTIVE" && transferTargets && transferTargets.length > 0 ? (
                            <ModalForm
                              action={transferStudent}
                              title={`Chuyển lớp — ${enrollment.student.fullName}`}
                              trigger="Chuyển lớp"
                              submitLabel="Chuyển lớp"
                              triggerClassName={buttonClass("outline", "sm")}
                            >
                              <input type="hidden" name="id" value={enrollment.id} />
                              <Field label="Lớp hiện tại">
                                <input
                                  readOnly
                                  value={`${cls.name} (${cls.code})`}
                                  className="h-9 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                                />
                              </Field>
                              <Field
                                label="Lớp muốn chuyển qua"
                                hint="Chỉ hiện lớp cùng loại. Lần ghi danh này được đánh dấu Đã chuyển lớp."
                              >
                                <Select name="targetClassId" defaultValue="" required>
                                  <option value="">— Chọn lớp —</option>
                                  {transferTargets.map((target) => (
                                    <option key={target.id} value={target.id}>
                                      {target.name} ({target.code})
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                            </ModalForm>
                          ) : isAdmin && enrollment.status === "ACTIVE" ? (
                            <span className="text-xs text-slate-400">Không có lớp cùng loại</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function listedPackagePrice(
  packages: { totalSessions: number; price: unknown }[] | undefined,
  sessions: number,
  basePrice?: unknown,
  discount24?: unknown,
  discount12?: unknown,
) {
  const derived = derivedNormalPackagePrice(Number(basePrice), sessions, discount24, discount12);
  if (derived != null) return formatCurrency(derived);
  const row = packages?.find((item) => item.totalSessions === sessions);
  return row ? formatCurrency(Number(row.price)) : null;
}

/** Ô thông tin chỉ đọc cho giáo viên — họ không có quyền sửa lớp. */
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800">{value || "—"}</p>
    </div>
  );
}
