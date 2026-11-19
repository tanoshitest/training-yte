import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { AutomaticTaskTable } from "@/components/tasks/automatic-task-table";
import { getTodayAutomaticTasks } from "@/lib/automatic-tasks";
import { requireTeacher } from "@/lib/permissions";

export const metadata: Metadata = { title: "Task giảng dạy" };

export default async function TeacherTaskPage() {
  const user = await requireTeacher();
  const tasks = await getTodayAutomaticTasks({
    teacherId: user.teacherId ?? "",
    includeAttendance: false,
    includeTeacherReview: true,
  });
  return (
    <>
      <PageHeader title="Task" description="Các lớp cần nhận xét hôm nay và các buổi quá hạn chưa nhận xét." />
      <AutomaticTaskTable tasks={tasks} />
    </>
  );
}
