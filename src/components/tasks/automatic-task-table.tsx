import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import type { AutomaticTask } from "@/lib/automatic-tasks";

const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function dayHeading(date: Date): string {
  return `${WEEKDAY[date.getUTCDay()]}, ${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}`;
}

export function AutomaticTaskTable({ tasks, showAssignee = false }: { tasks: AutomaticTask[]; showAssignee?: boolean }) {
  const completed = tasks.filter((task) => task.completed).length;
  const colCount = showAssignee ? 8 : 7;
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Task cần làm ({completed}/{tasks.length} hoàn thành)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table wrapperClassName="max-h-[calc(100vh-15rem)] overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Ngày</TH>
              <TH>Giờ</TH>
              <TH>Lớp</TH>
              <TH>Công việc</TH>
              {showAssignee && <TH>Phụ trách</TH>}
              <TH>Trạng thái</TH>
              <TH className="text-right">Thao tác</TH>
            </TR>
          </THead>
          <TBody>
            {tasks.length === 0 ? (
              <EmptyRow colSpan={colCount}>Chưa có task theo thời khóa biểu.</EmptyRow>
            ) : tasks.flatMap((task, index) => {
              const prev = index === 0 ? null : tasks[index - 1];
              const showDay = !prev || prev.date.getTime() !== task.date.getTime();
              const rows = [];
              if (showDay) {
                rows.push(
                  <TR key={`day-${task.date.toISOString()}`}>
                    <TD colSpan={colCount} className="bg-slate-50 py-2 text-xs font-semibold tracking-wide text-slate-600">
                      {dayHeading(task.date)}
                    </TD>
                  </TR>,
                );
              }
              rows.push(
                <TR key={task.id}>
                  <TDIndex value={index + 1} />
                  <TD className="whitespace-nowrap tabular-nums">
                    {task.date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
                  </TD>
                  <TD className="font-mono text-xs">{task.startTime}–{task.endTime}</TD>
                  <TD className="font-medium">{task.className}</TD>
                  <TD>{task.kind === "ATTENDANCE" ? "Điểm danh" : "Nhận xét & đánh giá"}</TD>
                  {showAssignee && <TD>{task.assignee}</TD>}
                  <TD>
                    <Badge tone={task.completed ? "green" : task.overdue ? "red" : "slate"}>
                      {task.completed ? "Hoàn thành" : task.overdue ? "Quá hạn" : "Chưa hoàn thành"}
                    </Badge>
                  </TD>
                  <TD className="text-right"><Link className="font-medium text-brand-700 hover:underline" href={task.href}>{task.completed ? "Xem lại" : "Thực hiện"}</Link></TD>
                </TR>,
              );
              return rows;
            })}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
