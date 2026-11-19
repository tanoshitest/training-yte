"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { undoCreate, writeAudit } from "@/lib/audit";
import { assignLessons } from "@/lib/class-plan";
import { setClassOffDays } from "@/lib/class-off-days";
import { dateKey, formatDateUtc, todayUtc } from "@/lib/date";
import { fail, requiredDate, requiredId, requiredTime, runAction, type ActionState } from "@/lib/form-utils";
import { requirePermission } from "@/lib/permissions";
import { findSessionConflicts, nextSequence } from "@/lib/session";
import { timeToMinutes } from "@/lib/utils";

/**
 * Tạo buổi để điểm danh khi lớp chưa có thời khoá biểu tuần
 * (lớp IELTS nhập từ Excel thường rơi vào trường hợp này).
 */
export async function createAttendanceSession(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("attendance.submit");
  const classId = requiredId(fd, "classId", "lớp học");
  let href = "";

  const result = await runAction(async () => {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, status: true, roomId: true, teacherId: true },
    });
    if (!cls) fail("Không tìm thấy lớp học.");
    if (cls.status === "FINISHED") fail("Lớp đã kết thúc không tạo buổi điểm danh được.");

    const date = requiredDate(fd, "date", "Ngày học");
    if (date.getTime() > todayUtc().getTime()) {
      fail("Chỉ tạo được buổi điểm danh cho hôm nay hoặc ngày đã học.");
    }

    const startTime = requiredTime(fd, "startTime", "Giờ bắt đầu");
    const endTime = requiredTime(fd, "endTime", "Giờ kết thúc");
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      fail("Giờ kết thúc phải sau giờ bắt đầu.");
    }

    const existing = await prisma.lessonSession.findFirst({
      where: {
        classId,
        date,
        startTime,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    if (existing) {
      href = `/lop-hoc/${classId}?tab=diem-danh&buoi=${existing.id}`;
      return "Buổi này đã có trên lịch. Đang mở để điểm danh.";
    }

    const slot = {
      date,
      startTime,
      endTime,
      roomId: cls.roomId,
      teacherId: cls.teacherId,
    };
    const conflicts = await findSessionConflicts(prisma, slot);
    if (conflicts.length > 0) {
      fail(`Trùng lịch: ${conflicts.map((item) => item.label).join("; ")}.`);
    }

    const sequence = await nextSequence(prisma, classId);
    const created = await prisma.lessonSession.create({
      data: {
        classId,
        sequence,
        ...slot,
        isExtra: false,
      },
      select: { id: true, sequence: true },
    });
    await assignLessons(prisma, classId);

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "LessonSession",
      entityId: created.id,
      newValue: { classId, date: dateKey(date), startTime, endTime },
      undo: undoCreate(
        { model: "lessonSession", id: created.id },
        {
          label: "Hoàn tác? Buổi vừa tạo để điểm danh sẽ bị xoá.",
          after: { assignLessonsClassIds: [classId] },
        },
      ),
    });

    href = `/lop-hoc/${classId}?tab=diem-danh&buoi=${created.id}`;
    return `Đã tạo buổi ${created.sequence} ngày ${formatDateUtc(date)} (${startTime}–${endTime}).`;
  });

  if (result.ok && href) {
    revalidatePath(`/lop-hoc/${classId}`);
    revalidatePath("/lich-day");
    revalidatePath("/task");
    return { ...result, href };
  }
  return result;
}

/**
 * Học vụ cấu hình nhiều ngày nghỉ của lớp trong một lần.
 *
 * Chỉ đổi `LessonSession.isOff`: buổi nghỉ vẫn nằm trên lịch để mọi người biết lớp nghỉ,
 * không chuyển COMPLETED và không tạo Attendance nên tuyệt đối không trừ học phí.
 */
export async function configureClassOffDays(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("attendance.submit");
  const classId = requiredId(fd, "classId", "lớp học");
  const selectedIds = [
    ...new Set(
      fd
        .getAll("offSessionIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  const result = await runAction(async () => {
    if (selectedIds.length > 400) fail("Danh sách buổi nghỉ vượt quá giới hạn cho phép.");

    const summary = await prisma.$transaction(async (tx) => {
      const changed = await setClassOffDays(tx, classId, selectedIds);
      if (changed.marked > 0 || changed.unmarked > 0) {
        await writeAudit(
          {
            userId: user.id,
            action: "UPDATE",
            entity: "ClassOffDays",
            entityId: classId,
            oldValue: { className: changed.className, offSessions: changed.before },
            newValue: { className: changed.className, offSessions: changed.after },
          },
          tx,
        );
      }
      return changed;
    });

    if (summary.marked === 0 && summary.unmarked === 0) {
      return "Lịch nghỉ không có thay đổi.";
    }
    const parts = [
      summary.marked > 0 ? `đánh dấu nghỉ ${summary.marked} buổi` : "",
      summary.unmarked > 0 ? `bỏ nghỉ ${summary.unmarked} buổi` : "",
    ].filter(Boolean);
    return `Đã ${parts.join(" và ")} cho lớp ${summary.className}.`;
  });

  revalidatePath(`/lop-hoc/${classId}`);
  revalidatePath("/lich-day");
  revalidatePath("/gv/lich-day");
  revalidatePath("/gv");
  revalidatePath("/task");
  revalidatePath("/gv/task");
  revalidatePath("/tong-quan");
  return result;
}
