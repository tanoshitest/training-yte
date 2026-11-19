import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { completeGeneralTask } from "@/app/(app)/task/actions";
import { TuitionReminderActions } from "@/components/tasks/tuition-reminder-dialog";

export type UnifiedTaskType = "SCHEDULE" | "GENERAL" | "TUITION";

export type UnifiedTaskRow = {
  id: string;
  type: UnifiedTaskType;
  /** Tên công việc: "Điểm danh", "Nhận xét & đánh giá", or assigned task title */
  taskName: string;
  /** Chi tiết: tên lớp + giờ (schedule) hoặc mô tả task giao */
  detail: string;
  detailSub?: string;
  /** Link đến trang thực hiện */
  href?: string;
  /** Người phụ trách */
  assignee: string;
  assigneeId?: string;
  /** Người giao việc */
  creator: string;
  /** Ngày bắt đầu */
  startDate: string;
  /** Ngày kết thúc */
  endDate: string;
  /** Đã hoàn thành chưa */
  completed: boolean;
  /** Quá hạn: đã qua ngày kết thúc mà chưa xong */
  overdue?: boolean;
  /** ID dùng cho nút hoàn thành task giao thủ công */
  generalTaskId?: string;
  tuitionTask?: import("@/lib/tuition-reminder-types").TuitionReminderTask;
};

const TYPE_BADGE: Record<UnifiedTaskType, { label: string; tone: "brand" | "green" | "amber" }> = {
  SCHEDULE: { label: "Lịch dạy", tone: "brand" },
  GENERAL: { label: "Giao việc", tone: "green" },
  TUITION: { label: "Nhắc học phí", tone: "amber" },
};

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === "—") return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function dayHeading(dateStr: string): string {
  if (!dateStr || dateStr === "—") return "Khác";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatDate(dateStr);
  return `${WEEKDAY[d.getUTCDay()]}, ${formatDate(dateStr)}`;
}

function dateKey(dateStr: string): string {
  if (!dateStr || dateStr === "—") return "";
  try {
    return new Date(dateStr).toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

export function UnifiedTaskTable({
  tasks,
  showAssignee = false,
}: {
  tasks: UnifiedTaskRow[];
  showAssignee?: boolean;
}) {
  const completed = tasks.filter((t) => t.completed).length;
  const colCount = showAssignee ? 10 : 9;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">
          Tất cả task ({completed}/{tasks.length} hoàn thành)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Gom theo ngày. Điểm danh đã xong vẫn giữ trong lịch sử; nhận xét chưa xong và buổi chưa điểm danh hiện quá hạn.
        </p>
      </div>
      <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
        <THead className="sticky top-0 z-[1]">
          <TR>
            <THIndex />
            <TH>Loại</TH>
            <TH>Công việc</TH>
            <TH>Chi tiết</TH>
            <TH>Người giao việc</TH>
            {showAssignee && <TH>Phụ trách</TH>}
            <TH>Ngày bắt đầu</TH>
            <TH>Ngày kết thúc</TH>
            <TH>Trạng thái</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {tasks.length === 0 ? (
            <EmptyRow colSpan={colCount}>Chưa có task nào.</EmptyRow>
          ) : (
            tasks.flatMap((task, index) => {
              const typeCfg = TYPE_BADGE[task.type];
              const key = dateKey(task.startDate);
              const prevKey = index === 0 ? null : dateKey(tasks[index - 1].startDate);
              const rows = [];
              if (key !== prevKey) {
                rows.push(
                  <TR key={`day-${key || "other"}`}>
                    <TD colSpan={colCount} className="bg-slate-50 py-2 text-xs font-semibold tracking-wide text-slate-600">
                      {dayHeading(task.startDate)}
                    </TD>
                  </TR>,
                );
              }
              rows.push(
                <TR key={task.id}>
                  <TDIndex value={index + 1} />
                  <TD>
                    <Badge tone={typeCfg.tone}>{typeCfg.label}</Badge>
                  </TD>
                  <TD className="font-medium">{task.taskName}</TD>
                  <TD>
                    {task.type === "TUITION" && task.tuitionTask ? (
                      <>
                        <TuitionReminderActions task={task.tuitionTask} label={task.detail} />
                        {task.detailSub ? (
                          <p className="text-xs text-slate-400">{task.detailSub}</p>
                        ) : null}
                      </>
                    ) : task.href ? (
                      <Link
                        href={task.href}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {task.detail}
                      </Link>
                    ) : (
                      <span className="font-medium">{task.detail}</span>
                    )}
                    {task.type !== "TUITION" && task.detailSub ? (
                      <p className="text-xs text-slate-400">{task.detailSub}</p>
                    ) : null}
                  </TD>
                  <TD className="font-medium text-slate-600">{task.creator}</TD>
                  {showAssignee && <TD>{task.assignee}</TD>}
                  <TD className="tabular-nums whitespace-nowrap">
                    {formatDate(task.startDate)}
                  </TD>
                  <TD className="tabular-nums whitespace-nowrap">
                    {formatDate(task.endDate)}
                  </TD>
                  <TD>
                    <Badge tone={task.completed ? "green" : task.overdue ? "red" : "slate"}>
                      {task.completed ? "Hoàn thành" : task.overdue ? "Quá hạn" : "Chưa hoàn thành"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {task.type === "TUITION" && task.tuitionTask ? (
                      <TuitionReminderActions task={task.tuitionTask} />
                    ) : null}
                    {task.type === "SCHEDULE" && task.href && !task.completed && (
                      <Link
                        className="font-medium text-brand-700 hover:underline"
                        href={task.href}
                      >
                        Thực hiện
                      </Link>
                    )}
                    {task.type === "SCHEDULE" && task.href && task.completed && (
                      <Link
                        className="font-medium text-slate-500 hover:underline"
                        href={task.href}
                      >
                        Xem lại
                      </Link>
                    )}
                    {task.type === "GENERAL" && task.generalTaskId && !task.completed && (
                      <ActionForm action={completeGeneralTask}>
                        <input
                          type="hidden"
                          name="taskId"
                          value={task.generalTaskId}
                        />
                        <SubmitButton size="sm" variant="outline">
                          Hoàn thành
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </TD>
                </TR>,
              );
              return rows;
            })
          )}
        </TBody>
      </Table>
    </section>
  );
}
