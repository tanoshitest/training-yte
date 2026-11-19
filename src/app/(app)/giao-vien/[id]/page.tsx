import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, KeyRound, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { WEEKDAY_SHORT, cn, timeToMinutes } from "@/lib/utils";
import {
  dateKey,
  endOfMonthUtc,
  formatDateUtc,
  formatMonthLabel,
  parseDateParam,
  startOfMonthUtc,
  todayUtc,
  utcDate,
} from "@/lib/date";
import { deleteTeacher, resetTeacherPassword, updateTeacher } from "../actions";
import { TeacherScheduleTab } from "./schedule-tab";

export const metadata: Metadata = { title: "Hồ sơ giáo viên" };

const HOURS = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** Độ dài một buổi dạy, tính từ giờ bắt đầu / kết thúc đã lưu ở lịch dạy. */
function sessionMinutes(session: { startTime: string; endTime: string }) {
  return Math.max(0, timeToMinutes(session.endTime) - timeToMinutes(session.startTime));
}

function formatHours(minutes: number) {
  return `${HOURS.format(minutes / 60)} giờ`;
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
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
  searchParams: Promise<{ tab?: string; date?: string; view?: string; class?: string }>;
}) {
  await requirePermission("teacher.manage");
  const { id } = await params;
  const sp = await searchParams;
  const { tab, date: dateRaw } = sp;
  const showSchedule = tab === "lich-day";
  const showTimesheet = tab === "cham-cong";
  const showInfo = !showSchedule && !showTimesheet;

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      user: true,
      classes: { select: { status: true } },
    },
  });

  if (!teacher) notFound();

  const activeClasses = teacher.classes.filter((cls) => cls.status === "ACTIVE").length;

  // Chấm công đọc thẳng từ lịch dạy của tháng đang xem — mỗi buổi là một dòng công.
  const month = startOfMonthUtc(parseDateParam(dateRaw));
  const sessions = showTimesheet
    ? await prisma.lessonSession.findMany({
        where: { teacherId: teacher.id, date: { gte: month, lte: endOfMonthUtc(month) } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: {
          class: { select: { id: true, code: true, name: true } },
          syllabusLesson: { select: { name: true } },
          room: { select: { name: true } },
          attendances: { select: { status: true } },
        },
      })
    : [];

  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const completedMinutes = completed.reduce((sum, s) => sum + sessionMinutes(s), 0);
  const scheduledCount = sessions.filter((s) => s.status === "SCHEDULED").length;
  const cancelledCount = sessions.filter((s) => s.status === "CANCELLED").length;

  const monthHref = (target: Date) =>
    `/giao-vien/${teacher.id}?tab=cham-cong&date=${dateKey(target)}`;
  const prevMonth = utcDate(month.getUTCFullYear(), month.getUTCMonth() - 1, 1);
  const nextMonth = utcDate(month.getUTCFullYear(), month.getUTCMonth() + 1, 1);

  const stats = [
    { label: "Buổi đã dạy", value: String(completed.length) },
    { label: "Tổng giờ công", value: formatHours(completedMinutes) },
    { label: "Buổi chưa dạy", value: String(scheduledCount) },
    { label: "Buổi đã huỷ", value: String(cancelledCount) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <Link
          href="/giao-vien"
          className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Danh sách giáo viên
        </Link>

        <PageHeader
          className="mb-2"
          title={teacher.user.fullName}
          description={`Mã ${teacher.code} · ${teacher.classes.length} lớp phụ trách (${activeClasses} đang học)`}
          action={
            <ActionForm action={deleteTeacher}>
              <input type="hidden" name="id" value={teacher.id} />
              <SubmitButton
                variant="danger"
                size="sm"
                confirm={`Bạn có chắc muốn xóa dữ liệu này? Xoá giáo viên ${teacher.user.fullName} sẽ mất luôn tài khoản đăng nhập; ${teacher.classes.length} lớp phụ trách chuyển sang chưa phân công. Không khôi phục lại được.`}
              >
                <Trash2 className="h-4 w-4" />
                Xoá
              </SubmitButton>
            </ActionForm>
          }
        />

        <nav className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
          <TabLink href={`/giao-vien/${teacher.id}`} active={showInfo}>
            Thông tin giáo viên
          </TabLink>
          <TabLink href={`/giao-vien/${teacher.id}?tab=lich-day`} active={showSchedule}>
            Lịch dạy
          </TabLink>
          <TabLink href={`/giao-vien/${teacher.id}?tab=cham-cong`} active={showTimesheet}>
            Báo cáo chấm công
          </TabLink>
        </nav>
      </div>

      {showTimesheet ? (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 flex-col items-start gap-2 py-3">
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <CardTitle>Chấm công {formatMonthLabel(month)}</CardTitle>
                <div className="flex items-center gap-1">
                  <Link
                    href={monthHref(prevMonth)}
                    className={buttonClass("ghost", "sm", "px-2")}
                    aria-label="Tháng trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href={monthHref(startOfMonthUtc(todayUtc()))}
                    className={buttonClass("ghost", "sm")}
                  >
                    Tháng này
                  </Link>
                  <Link
                    href={monthHref(nextMonth)}
                    className={buttonClass("ghost", "sm", "px-2")}
                    aria-label="Tháng sau"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <dl className="flex w-full flex-wrap gap-x-6 gap-y-1 text-sm">
                {stats.map((item) => (
                  <div key={item.label} className="flex items-baseline gap-2">
                    <dt className="text-slate-500">{item.label}</dt>
                    <dd className="font-semibold text-slate-800">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardHeader>

            <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
              <THead className="sticky top-0 z-[1]">
                <TR>
                  <THIndex />
                  <TH>Ngày</TH>
                  <TH>Lớp</TH>
                  <TH>Buổi</TH>
                  <TH>Giờ dạy</TH>
                  <TH>Số giờ</TH>
                  <TH>Phòng</TH>
                  <TH>Điểm danh</TH>
                  <TH>Trạng thái</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.length === 0 ? (
                  <EmptyRow colSpan={9}>
                    Tháng này giáo viên chưa có buổi dạy nào trong lịch.
                  </EmptyRow>
                ) : (
                  <>
                    {sessions.map((session, index) => {
                      const present = session.attendances.filter(
                        (a) => a.status === "PRESENT",
                      ).length;

                      return (
                        <TR key={session.id}>
                          <TDIndex value={index + 1} />
                          <TD className="whitespace-nowrap text-slate-600">
                            {formatDateUtc(session.date)}
                            <span className="text-slate-400">
                              {" "}
                              ({WEEKDAY_SHORT[session.date.getUTCDay()]})
                            </span>
                          </TD>
                          <TD>
                            <Link
                              href={`/lop-hoc/${session.class.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {session.class.name}
                            </Link>
                            <p className="font-mono text-xs text-slate-400">{session.class.code}</p>
                          </TD>
                          <TD>
                            <Link
                              href={`/lich-day/${session.id}`}
                              className="text-brand-700 hover:underline"
                            >
                              Buổi {session.sequence}
                            </Link>
                            {session.syllabusLesson ? (
                              <p className="text-xs text-slate-500">
                                {session.syllabusLesson.name}
                              </p>
                            ) : null}
                          </TD>
                          <TD className="whitespace-nowrap font-mono text-slate-600">
                            {session.startTime}–{session.endTime}
                          </TD>
                          <TD className="whitespace-nowrap">
                            {session.status === "COMPLETED" ? (
                              formatHours(sessionMinutes(session))
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TD>
                          <TD>{session.room?.name ?? <span className="text-slate-400">—</span>}</TD>
                          <TD className="whitespace-nowrap">
                            {session.attendances.length === 0 ? (
                              <span className="text-slate-400">Chưa điểm danh</span>
                            ) : (
                              `${present}/${session.attendances.length} có mặt`
                            )}
                          </TD>
                          <TD>
                            <StatusBadge value={session.status} />
                          </TD>
                        </TR>
                      );
                    })}
                    <TR className="bg-slate-50 font-medium">
                      {/* Cộng thêm cột STT nên nhãn tổng trải từ STT tới Giờ dạy. */}
                      <TD colSpan={5} className="text-right">
                        Tổng giờ công {formatMonthLabel(month).toLowerCase()}
                      </TD>
                      <TD className="whitespace-nowrap">{formatHours(completedMinutes)}</TD>
                      <TD colSpan={3} />
                    </TR>
                  </>
                )}
              </TBody>
            </Table>
        </Card>
      ) : null}

      {showInfo ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 py-3">
              <div>
                <CardTitle>Hồ sơ &amp; tài khoản</CardTitle>
                <CardDescription className="text-xs">
                  Đổi email là đổi tên đăng nhập. Tạm dừng thì không đăng nhập được.
                </CardDescription>
              </div>
              <ActionForm
                action={updateTeacher}
                className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
              >
                <input type="hidden" name="id" value={teacher.id} />
                <Field label="Họ và tên">
                  <Input name="fullName" defaultValue={teacher.user.fullName} required />
                </Field>
                <Field label="Mã giáo viên">
                  <Input name="code" defaultValue={teacher.code} required />
                </Field>
                <Field label="Email đăng nhập">
                  <Input name="email" type="email" defaultValue={teacher.user.email} required />
                </Field>
                <Field label="Số điện thoại">
                  <Input name="phone" defaultValue={teacher.user.phone ?? ""} />
                </Field>
                <Field label="Trạng thái">
                  <Select name="isActive" defaultValue={teacher.user.isActive ? "true" : "false"}>
                    <option value="true">Đang hoạt động</option>
                    <option value="false">Tạm dừng</option>
                  </Select>
                </Field>
                <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-3">
                  <Textarea name="note" rows={2} className="min-h-16" defaultValue={teacher.note ?? ""} />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4">
                  <SubmitButton>Lưu hồ sơ</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex flex-col gap-3 py-3">
              <div>
                <CardTitle>Đặt lại mật khẩu</CardTitle>
                <CardDescription className="text-xs">
                  Chỉ lưu bản mã hoá — đặt mật khẩu mới rồi gửi cho giáo viên.
                </CardDescription>
              </div>
              <ActionForm action={resetTeacherPassword} resetOnSuccess className="grid gap-2.5">
                <input type="hidden" name="id" value={teacher.id} />
                <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
                  <Input name="password" type="password" minLength={8} required />
                </Field>
                <SubmitButton variant="outline">
                  <KeyRound className="h-4 w-4" />
                  Đặt lại mật khẩu
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showSchedule ? <TeacherScheduleTab teacherId={teacher.id} searchParams={sp} /> : null}
    </div>
  );
}
