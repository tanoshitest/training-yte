"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUser } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { remainingSessions } from "@/lib/tuition";
import { currentMilestone, milestoneLabel } from "@/lib/tuition-reminders";
import { startOfDay } from "@/lib/utils";
import {
  runAction,
  requiredStr,
  requiredDate,
  requiredId,
  requiredInt,
  fail,
  type ActionState,
} from "@/lib/form-utils";

function refresh() {
  revalidatePath("/task");
  revalidatePath("/nhat-ky");
}

export async function createGeneralTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();

  return runAction(async () => {
    const title = requiredStr(fd, "title", "Nội dung công việc", 1000);
    const startDate = requiredDate(fd, "startDate", "Ngày bắt đầu");
    const endDate = requiredDate(fd, "endDate", "Ngày kết thúc");
    const assigneeId = requiredId(fd, "assigneeId", "Người phụ trách");

    if (endDate < startDate) {
      fail("Ngày kết thúc không được trước ngày bắt đầu.");
    }

    await prisma.generalTask.create({
      data: {
        title,
        startDate,
        endDate,
        assigneeId,
        creatorId: user.id,
      },
    });

    return "Đã giao việc thành công.";
  }).finally(refresh);
}

export async function completeGeneralTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = requiredId(fd, "taskId", "task");

  return runAction(async () => {
    await prisma.generalTask.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: user.id,
      },
    });

    return "Đã hoàn thành công việc.";
  }).finally(refresh);
}

export async function markTuitionReminded(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const enrollmentId = requiredId(fd, "enrollmentId", "lần ghi danh");
  const milestone = requiredInt(fd, "milestone", "mốc nhắc", { min: -20, max: 20 });
  const cycleKey = requiredInt(fd, "cycleKey", "chu kỳ gói");
  const remainingAtTask = requiredInt(fd, "remaining", "số buổi còn lại", { min: -500, max: 500 });
  const round = requiredInt(fd, "round", "lần nhắc");

  return runAction(async () => {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        classId: true,
        joinedAt: true,
        status: true,
        student: { select: { fullName: true } },
        class: { select: { type: true, name: true } },
        tuition: { select: { type: true, totalSessions: true, usedSessions: true } },
      },
    });
    if (!enrollment || enrollment.status !== "ACTIVE") fail("Không tìm thấy học viên trong lớp.");
    if (enrollment.class.type !== "NORMAL") fail("Chỉ nhắc học phí theo buổi với lớp thường.");

    let remaining = remainingAtTask;
    if (enrollment.tuition) {
      remaining =
        remainingSessions(enrollment.tuition) ??
        (enrollment.tuition.totalSessions ?? 0) - enrollment.tuition.usedSessions;
    } else {
      const completed = await prisma.lessonSession.count({
        where: {
          classId: enrollment.classId,
          status: "COMPLETED",
          date: { gte: startOfDay(enrollment.joinedAt) },
        },
      });
      remaining = 0 - completed;
    }

    const current = currentMilestone(remaining);
    if (current !== milestone) {
      fail("Số buổi đã đổi (phụ huynh có thể đã đóng hoặc học thêm). Tải lại danh sách task.");
    }

    const exists = await prisma.tuitionReminder.findUnique({
      where: {
        enrollmentId_milestone_cycleKey: { enrollmentId, milestone, cycleKey },
      },
      select: { id: true },
    });
    if (exists) fail("Mốc này đã được nhắc.");

    const created = await prisma.tuitionReminder.create({
      data: {
        enrollmentId,
        studentId: enrollment.studentId,
        milestone,
        round,
        remaining,
        cycleKey,
        remindedById: user.id,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "TuitionReminder",
      entityId: created.id,
      newValue: {
        student: enrollment.student.fullName,
        class: enrollment.class.name,
        milestone: milestoneLabel(milestone),
        round,
        remaining,
      },
    });

    return `Đã ghi nhận nhắc lần ${round} (${milestoneLabel(milestone)}) cho ${enrollment.student.fullName}.`;
  }).finally(refresh);
}
