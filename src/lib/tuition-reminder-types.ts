/** Mốc nhắc học phí: còn 4 buổi, hết buổi, rồi nợ 2 / 6 / 10 buổi. */
export const TUITION_MILESTONES = [4, 0, -2, -6, -10] as const;
export type TuitionMilestone = (typeof TUITION_MILESTONES)[number];

export type TuitionReminderPackage = {
  id: string;
  name: string;
  totalSessions: number;
  price: string;
};

export type TuitionReminderTask = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  parentName: string | null;
  parentPhone: string | null;
  classId: string;
  className: string;
  remaining: number;
  milestone: TuitionMilestone;
  round: number;
  cycleKey: number;
  completed: boolean;
  overdue: boolean;
  remindedAt: string | null;
  packages: TuitionReminderPackage[];
};

export function milestoneLabel(milestone: number) {
  if (milestone > 0) return "Còn ≤ 4 buổi";
  if (milestone === 0) return "Hết buổi (còn 0)";
  return `Trễ ${-milestone} buổi`;
}

/**
 * Mốc đang tới hạn, theo thứ tự: còn ≤ 4 buổi → hết buổi → trễ 2 → trễ 6 → trễ 10.
 * Trễ dùng khoảng (không cần đúng −2/−6/−10) để học viên nợ 4, 5, 7… buổi vẫn hiện task.
 */
export function currentMilestone(remaining: number): TuitionMilestone | null {
  if (remaining >= 1 && remaining <= 4) return 4;
  if (remaining === 0) return 0;
  if (remaining <= -10) return -10;
  if (remaining <= -6) return -6;
  if (remaining <= -2) return -2;
  return null;
}

export function reminderTaskName(task: Pick<TuitionReminderTask, "round">) {
  return `Nhắc học phí · lần ${task.round}`;
}
