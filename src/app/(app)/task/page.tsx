import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { UnifiedTaskTable, type UnifiedTaskRow } from "@/components/tasks/unified-task-table";
import { getTodayAutomaticTasks, TASK_HISTORY_START } from "@/lib/automatic-tasks";
import {
  getTuitionReminderTasks,
  milestoneLabel,
  reminderTaskName,
} from "@/lib/tuition-reminders";
import { addDaysUtc, dateKey, parseDateInput, todayUtc } from "@/lib/date";
import { requireUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ModalForm } from "@/components/ui/modal";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { createGeneralTask } from "./actions";
import type { ClassType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Task" };

const TASK_STATUSES = ["open", "done"] as const;
type TaskStatusFilter = (typeof TASK_STATUSES)[number] | "";

const CLASS_TYPES: Record<ClassType, string> = {
  NORMAL: "Lớp thường",
  IELTS: "IELTS",
};

export default async function StaffTaskPage({
  searchParams,
}: {
  searchParams: Promise<{
    assigneeId?: string;
    status?: string;
    from?: string;
    to?: string;
    type?: string;
    class?: string;
  }>;
}) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "ACADEMIC") redirect("/khong-co-quyen");

  const params = await searchParams;
  const filteredAssigneeId = params.assigneeId || "";
  const statusFilter: TaskStatusFilter = TASK_STATUSES.includes(params.status as (typeof TASK_STATUSES)[number])
    ? (params.status as TaskStatusFilter)
    : "";
  const typeFilter = params.type && params.type in CLASS_TYPES ? (params.type as ClassType) : undefined;

  const isAdmin = user.role === "ADMIN";
  const today = todayUtc();
  const requestedFrom = parseDateInput(params.from) ?? TASK_HISTORY_START;
  const requestedTo = parseDateInput(params.to) ?? today;
  const rangeStart = requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  const rangeEnd = requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;
  const fromValue = dateKey(rangeStart);
  const toValue = dateKey(rangeEnd);

  const classes = await prisma.class.findMany({
    where: typeFilter ? { type: typeFilter } : {},
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, name: true, code: true },
  });
  const classFilter = classes.some((item) => item.id === params.class) ? params.class! : "";

  const [automaticTasks, generalTasks, tuitionReminders, users] = await Promise.all([
    getTodayAutomaticTasks({
      includeTeacherReview: isAdmin,
      from: rangeStart,
      to: rangeEnd,
      classType: classFilter ? undefined : typeFilter,
      classId: classFilter || undefined,
    }),
    typeFilter || classFilter
      ? Promise.resolve([])
      : prisma.generalTask.findMany({
          where: {
            ...(isAdmin ? {} : { assigneeId: user.id }),
            startDate: { lte: rangeEnd },
            endDate: { gte: rangeStart },
            OR: [
              { status: "OPEN" },
              { completedAt: { gte: today, lt: addDaysUtc(today, 1) } },
            ],
          },
          orderBy: [{ endDate: "asc" }, { createdAt: "asc" }],
          include: {
            assignee: { select: { fullName: true } },
            creator: { select: { fullName: true } },
          },
        }),
    typeFilter === "IELTS"
      ? Promise.resolve({ open: [], done: [] })
      : getTuitionReminderTasks({
          from: rangeStart,
          to: rangeEnd,
          classId: classFilter || undefined,
        }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "ACADEMIC", "TEACHER"] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    }),
  ]);

  const scheduleRows: UnifiedTaskRow[] = automaticTasks.map((task) => ({
    id: task.id,
    type: "SCHEDULE" as const,
    taskName: task.kind === "ATTENDANCE" ? "Điểm danh" : "Nhận xét & đánh giá",
    detail: task.className,
    detailSub: `${task.startTime}–${task.endTime}`,
    href: task.href,
    assignee: task.assignee,
    assigneeId: task.assigneeId,
    creator: "Super Admin",
    startDate: task.date.toISOString(),
    endDate: task.date.toISOString(),
    completed: task.completed,
    overdue: task.overdue,
  }));

  const generalRows: UnifiedTaskRow[] = generalTasks.map((task) => ({
    id: task.id,
    type: "GENERAL" as const,
    taskName: task.title,
    detail: "Task được giao",
    assignee: task.assignee.fullName,
    assigneeId: task.assigneeId,
    creator: task.creator.fullName,
    startDate: task.startDate.toISOString(),
    endDate: task.endDate.toISOString(),
    completed: task.status === "COMPLETED",
    overdue: task.status !== "COMPLETED" && task.endDate.getTime() < today.getTime(),
    generalTaskId: task.id,
  }));

  const includeOpenTuition = rangeEnd.getTime() >= today.getTime();
  const tuitionSource = [
    ...(includeOpenTuition ? tuitionReminders.open : []),
    ...tuitionReminders.done,
  ];
  const tuitionRows: UnifiedTaskRow[] = tuitionSource.map((task) => ({
    id: `tuition:${task.enrollmentId}:${task.milestone}:${task.cycleKey}:${task.round}:${task.completed ? "done" : "open"}`,
    type: "TUITION" as const,
    taskName: reminderTaskName(task),
    detail: `${task.studentName} · ${task.className}`,
    detailSub: milestoneLabel(task.milestone),
    assignee: "Học vụ",
    creator: "Hệ thống",
    startDate: task.remindedAt ?? today.toISOString(),
    endDate: task.remindedAt ?? today.toISOString(),
    completed: task.completed,
    overdue: task.overdue,
    tuitionTask: task,
  }));

  const allTasks = [...scheduleRows, ...generalRows, ...tuitionRows].sort((a, b) => {
    const aDate = a.startDate === "—" ? "" : a.startDate;
    const bDate = b.startDate === "—" ? "" : b.startDate;
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.taskName === "Điểm danh" && b.taskName !== "Điểm danh") return -1;
    if (a.taskName !== "Điểm danh" && b.taskName === "Điểm danh") return 1;
    return (a.detailSub ?? a.detail).localeCompare(b.detailSub ?? b.detail);
  });

  const filteredTasks = allTasks.filter((task) => {
    if (statusFilter === "open" && task.completed) return false;
    if (statusFilter === "done" && !task.completed) return false;

    if (!filteredAssigneeId) return true;
    if (task.assigneeId === filteredAssigneeId) return true;

    if (task.type === "SCHEDULE") {
      if (task.assigneeId) return false;
      const targetUser = users.find((u) => u.id === filteredAssigneeId);
      if (!targetUser) return false;
      if (task.taskName === "Điểm danh") {
        return targetUser.role === "ACADEMIC" || targetUser.role === "ADMIN";
      }
      return targetUser.fullName === task.assignee;
    }
    if (task.type === "TUITION") {
      const targetUser = users.find((u) => u.id === filteredAssigneeId);
      return targetUser?.role === "ACADEMIC" || targetUser?.role === "ADMIN";
    }
    return false;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          className="mb-0"
          title="Task"
          description={
            isAdmin
              ? "Lịch sử theo ngày: điểm danh, nhắc học phí (còn 4 / 0 / nợ 2·6·10 buổi) và việc được giao."
              : "Điểm danh, nhắc học phí khi học viên còn 4 buổi / hết buổi / đang nợ, và việc được giao."
          }
          action={
            <ModalForm
              action={createGeneralTask}
              title="Giao việc mới"
              trigger={
                <>
                  <Plus className="h-4 w-4" /> Giao việc
                </>
              }
              submitLabel="Giao việc"
              wide
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nội dung công việc *
                  </label>
                  <textarea
                    name="title"
                    required
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    placeholder="Nhập nội dung công việc cần giao..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Người giao việc
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={user.fullName}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 cursor-not-allowed outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Người phụ trách *
                  </label>
                  <select
                    name="assigneeId"
                    required
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Chọn người phụ trách</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role === "ADMIN" ? "Quản trị" : u.role === "ACADEMIC" ? "Học vụ" : "Giáo viên"})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ngày bắt đầu *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ngày kết thúc *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
            </ModalForm>
          }
        />

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <FilterForm className="grid grid-cols-2 gap-x-3 gap-y-2 xl:grid-cols-4">
            <Field label="Thời gian">
              <div className="flex items-center gap-1.5">
                <Input name="from" type="date" defaultValue={fromValue} className="min-w-0" />
                <span className="shrink-0 text-slate-400">–</span>
                <Input name="to" type="date" defaultValue={toValue} className="min-w-0" />
              </div>
            </Field>
            <Field label="Loại lớp">
              <Select name="type" defaultValue={typeFilter ?? ""}>
                <option value="">Tất cả</option>
                {Object.entries(CLASS_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lớp">
              <Select name="class" defaultValue={classFilter}>
                <option value="">Tất cả lớp</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid min-w-0 grid-cols-2 gap-1.5">
              <Field label="Phụ trách">
                <Select name="assigneeId" defaultValue={filteredAssigneeId}>
                  <option value="">Tất cả</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role === "ADMIN" ? "Quản trị" : u.role === "ACADEMIC" ? "Học vụ" : "Giáo viên"})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Trạng thái">
                <Select name="status" defaultValue={statusFilter}>
                  <option value="">Tất cả</option>
                  <option value="open">Chưa xong / quá hạn</option>
                  <option value="done">Hoàn thành</option>
                </Select>
              </Field>
            </div>
          </FilterForm>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <UnifiedTaskTable tasks={filteredTasks} showAssignee={isAdmin} />
      </div>
    </div>
  );
}
