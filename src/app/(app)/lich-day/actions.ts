"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { captureRow, captureRows, diff, undoCreate, undoDelete, undoUpdate, writeAudit } from "@/lib/audit";
import { revertSessionCompletion } from "@/lib/tuition";
import { dateKey, formatDateUtc } from "@/lib/date";
import { addExtraSession, assignLessons, classSyllabusIds } from "@/lib/class-plan";
import { findSessionConflicts, nextSequence } from "@/lib/session";
import { timeToMinutes } from "@/lib/utils";
import {
  bool,
  fail,
  optionalId,
  requiredDate,
  requiredId,
  requiredStr,
  requiredTime,
  runAction,
  type ActionState,
} from "@/lib/form-utils";

/**
 * Server Action cho module Lịch dạy (PRD §7, §8, §9).
 *
 * R12 — sửa Ngày / Giờ / Phòng / Giáo viên không đụng tới `syllabusLessonId`.
 *       Muốn đổi bài học phải dùng riêng `setSessionLesson`.
 * PRD §9 — buổi bù là một `LessonSession` **mới**, buổi đã huỷ giữ nguyên lịch sử.
 */

function refreshCalendar(sessionId?: string, classId?: string) {
  revalidatePath("/lich-day");
  revalidatePath("/gv/lich-day");
  revalidatePath("/tong-quan");
  revalidatePath("/gv");
  if (sessionId) {
    revalidatePath(`/lich-day/${sessionId}`);
    revalidatePath(`/gv/buoi-hoc/${sessionId}`);
  }
  if (classId) revalidatePath(`/lop-hoc/${classId}`);
}

function readTimeRange(fd: FormData) {
  const startTime = requiredTime(fd, "startTime", "Giờ bắt đầu");
  const endTime = requiredTime(fd, "endTime", "Giờ kết thúc");
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    fail("Giờ kết thúc phải sau giờ bắt đầu.");
  }
  return { startTime, endTime };
}

/** Một buổi chỉ có một người phụ trách trực tiếp: Giáo viên hoặc Học vụ. */
async function readSessionAssignee(fd: FormData) {
  const raw = String(fd.get("assignee") ?? "").trim();
  if (!raw) return { teacherId: null, academicStaffId: null };

  const separator = raw.indexOf(":");
  const kind = separator > 0 ? raw.slice(0, separator) : "";
  const id = separator > 0 ? raw.slice(separator + 1).trim() : "";
  if (!id) fail("Người phụ trách không hợp lệ.");

  if (kind === "teacher") {
    const teacher = await prisma.teacher.findFirst({
      where: { id, user: { isActive: true } },
      select: { id: true },
    });
    if (!teacher) fail("Giáo viên đã chọn không còn hoạt động.");
    return { teacherId: teacher.id, academicStaffId: null };
  }

  if (kind === "academic") {
    const academic = await prisma.user.findFirst({
      where: { id, role: "ACADEMIC", isActive: true },
      select: { id: true },
    });
    if (!academic) fail("Học vụ đã chọn không còn hoạt động.");
    return { teacherId: null, academicStaffId: academic.id };
  }

  fail("Người phụ trách không hợp lệ.");
}

// ------------------------------------------------------------------
// Sửa buổi học (PRD §8)
// ------------------------------------------------------------------

/**
 * Đổi Ngày / Giờ / Phòng / Giáo viên của một buổi.
 * Đổi giáo viên làm buổi tự chuyển sang lịch của giáo viên mới (§8.4)
 * vì lịch cá nhân đọc theo `LessonSession.teacherId`.
 */
export async function updateSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("session.edit");
  const id = requiredId(fd, "id", "buổi học");

  const current = await prisma.lessonSession.findUnique({
    where: { id },
    select: {
      id: true,
      classId: true,
      status: true,
      sequence: true,
      isExtra: true,
      makeupForId: true,
      date: true,
      startTime: true,
      endTime: true,
      roomId: true,
      teacherId: true,
      academicStaffId: true,
      testColumns: true,
      report: { select: { id: true } },
      _count: { select: { attendances: true } },
    },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy buổi học.");
    if (
      user.role === "ACADEMIC" &&
      current.academicStaffId &&
      current.academicStaffId !== user.id
    ) {
      fail("Buổi này được phân công cho Học vụ khác. Bạn chỉ có thể xem dữ liệu.");
    }
    if (current.status === "CANCELLED") {
      fail("Buổi đã huỷ không sửa được. Hãy tạo buổi bù hoặc mở lại buổi trước.");
    }

    const { startTime, endTime } = readTimeRange(fd);
    const assignee = await readSessionAssignee(fd);
    const data = {
      date: requiredDate(fd, "date", "Ngày học"),
      startTime,
      endTime,
      roomId: optionalId(fd, "roomId"),
      ...assignee,
    };

    const switchingResponsibilityType =
      Boolean(current.academicStaffId) !== Boolean(data.academicStaffId);
    const hasSessionData =
      current._count.attendances > 0 ||
      Boolean(current.report) ||
      (Array.isArray(current.testColumns) && current.testColumns.length > 0);
    if (switchingResponsibilityType && hasSessionData) {
      fail(
        "Buổi đã có điểm danh, điểm kiểm tra hoặc báo cáo nên không thể đổi giữa Giáo viên và Học vụ.",
      );
    }

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    if (!bool(fd, "ignoreConflict")) {
      const conflicts = await findSessionConflicts(prisma, { ...data, excludeId: id });
      if (conflicts.length > 0) {
        fail(
          `Trùng lịch: ${conflicts.map((c) => c.label).join("; ")}. ` +
            "Tích «Bỏ qua cảnh báo trùng lịch» nếu vẫn muốn lưu.",
        );
      }
    }

    // R12 — không đụng tới syllabusLessonId ở đây.
    await prisma.lessonSession.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "LessonSession",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "lessonSession",
        id,
        current,
        ["date", "startTime", "endTime", "roomId", "teacherId", "academicStaffId"],
        { label: "Hoàn tác? Ngày / giờ / phòng / người phụ trách của buổi sẽ trở về như trước." },
      ),
    });
    return "Đã lưu thay đổi buổi học. Bài học trong Syllabus giữ nguyên (R12).";
  });

  refreshCalendar(id, current?.classId);
  return result;
}

/**
 * Nút «Thêm buổi» trong popup Lịch dạy: đặt một buổi rời cho riêng lớp này.
 *
 * Buổi thêm tự chọn ngày, giờ, phòng, giáo viên nên **được phép nằm ngoài thời khoá
 * biểu tuần**. Nó không nhận bài của Syllabus, cũng không đẩy bài của buổi nào —
 * kế hoạch bài học của lớp giữ nguyên (`addExtraSession` trong `src/lib/class-plan.ts`).
 */
export async function createExtraSession(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("calendar.manage");
  const classId = requiredId(fd, "classId", "lớp học");

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, status: true },
  });

  const result = await runAction(async () => {
    if (!cls) fail("Không tìm thấy lớp học.");
    if (cls.status === "FINISHED") fail("Lớp đã kết thúc không thêm buổi được.");

    const { startTime, endTime } = readTimeRange(fd);
    const assignee = await readSessionAssignee(fd);
    const data = {
      date: requiredDate(fd, "date", "Ngày học"),
      startTime,
      endTime,
      roomId: optionalId(fd, "roomId"),
      ...assignee,
    };

    if (!bool(fd, "ignoreConflict")) {
      const conflicts = await findSessionConflicts(prisma, data);
      if (conflicts.length > 0) {
        fail(
          `Trùng lịch: ${conflicts.map((c) => c.label).join("; ")}. ` +
            "Tích «Bỏ qua cảnh báo trùng lịch» nếu vẫn muốn lưu.",
        );
      }
    }

    const created = await addExtraSession(prisma, { ...data, classId });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "LessonSession",
      entityId: created.id,
      newValue: { ...data, date: dateKey(data.date), classId, isExtra: true },
      undo: undoCreate(
        { model: "lessonSession", id: created.id },
        { label: "Hoàn tác? Buổi vừa thêm sẽ bị xoá." },
      ),
    });
    return `Đã thêm buổi ${created.sequence} cho lớp ${cls.name} ngày ${formatDateUtc(data.date)}. Buổi thêm không nhận bài của Syllabus.`;
  });

  refreshCalendar(undefined, classId);
  return result;
}

/**
 * Thẻ mờ trên lịch (ô thời khoá biểu chưa có buổi trong database). Lưu thì dựng
 * buổi thật theo lịch tuần — không phải buổi thêm — rồi rót bài Syllabus.
 */
export async function createPlannedSession(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("calendar.manage");
  const classId = requiredId(fd, "classId", "lớp học");

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, status: true },
  });

  const result = await runAction(async () => {
    if (!cls) fail("Không tìm thấy lớp học.");
    if (cls.status === "FINISHED") fail("Lớp đã kết thúc không thêm buổi được.");

    const { startTime, endTime } = readTimeRange(fd);
    const assignee = await readSessionAssignee(fd);
    const data = {
      date: requiredDate(fd, "date", "Ngày học"),
      startTime,
      endTime,
      roomId: optionalId(fd, "roomId"),
      ...assignee,
    };

    const existing = await prisma.lessonSession.findFirst({
      where: {
        classId,
        date: data.date,
        startTime: data.startTime,
        isExtra: false,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    if (existing) fail("Buổi này đã có trên lịch. Tải lại trang rồi sửa trên thẻ buổi thật.");

    if (!bool(fd, "ignoreConflict")) {
      const conflicts = await findSessionConflicts(prisma, data);
      if (conflicts.length > 0) {
        fail(
          `Trùng lịch: ${conflicts.map((c) => c.label).join("; ")}. ` +
            "Tích «Bỏ qua cảnh báo trùng lịch» nếu vẫn muốn lưu.",
        );
      }
    }

    const sequence = await nextSequence(prisma, classId);
    const created = await prisma.lessonSession.create({
      data: {
        classId,
        sequence,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        roomId: data.roomId,
        teacherId: data.teacherId,
        academicStaffId: data.academicStaffId,
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
      newValue: { ...data, date: dateKey(data.date), classId },
      undo: undoCreate(
        { model: "lessonSession", id: created.id },
        {
          label: "Hoàn tác? Buổi vừa tạo sẽ bị xoá và bài Syllabus của lớp được rót lại.",
          after: { assignLessonsClassIds: [classId] },
        },
      ),
    });
    return `Đã tạo buổi ${created.sequence} cho lớp ${cls.name} ngày ${formatDateUtc(data.date)}.`;
  });

  refreshCalendar(undefined, classId);
  return result;
}

/** Gán / bỏ gán bài học trong Syllabus cho buổi — thao tác riêng, không nằm trong luồng dời lịch. */
export async function setSessionLesson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("session.edit");
  const id = requiredId(fd, "id", "buổi học");

  const current = await prisma.lessonSession.findUnique({
    where: { id },
    select: { id: true, classId: true, syllabusLessonId: true },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy buổi học.");

    const syllabusLessonId = optionalId(fd, "syllabusLessonId");
    if (syllabusLessonId === current.syllabusLessonId) return "Không có thay đổi nào.";

    if (syllabusLessonId) {
      const lesson = await prisma.syllabusLesson.findUnique({
        where: { id: syllabusLessonId },
        select: {
          unit: { select: { syllabusId: true } },
          courseDay: { select: { syllabusId: true } },
        },
      });
      if (!lesson) fail("Không tìm thấy bài học đã chọn.");

      const allowed = await classSyllabusIds(prisma, current.classId);
      const lessonSyllabusId = lesson.unit?.syllabusId ?? lesson.courseDay?.syllabusId;
      if (!lessonSyllabusId || !allowed.includes(lessonSyllabusId)) {
        fail("Bài học không thuộc Syllabus đang gán cho lớp này.");
      }
    }

    await prisma.lessonSession.update({ where: { id }, data: { syllabusLessonId } });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "LessonSession",
      entityId: id,
      oldValue: { syllabusLessonId: current.syllabusLessonId },
      newValue: { syllabusLessonId },
      undo: undoUpdate("lessonSession", id, current, ["syllabusLessonId"], {
        label: "Hoàn tác? Bài học gán cho buổi sẽ trở về như trước.",
      }),
    });
    return syllabusLessonId ? "Đã gán bài học cho buổi." : "Đã bỏ gán bài học khỏi buổi.";
  });

  refreshCalendar(id, current?.classId);
  return result;
}

// ------------------------------------------------------------------
// Huỷ · mở lại · buổi bù (PRD §9)
// ------------------------------------------------------------------

export async function cancelSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("session.edit");
  const id = requiredId(fd, "id", "buổi học");

  const current = await prisma.lessonSession.findUnique({
    where: { id },
    select: {
      id: true,
      classId: true,
      status: true,
      sequence: true,
      cancelReason: true,
      completedAt: true,
    },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy buổi học.");
    if (current.status === "CANCELLED") return "Buổi này đã ở trạng thái Đã huỷ.";

    const cancelReason = requiredStr(fd, "cancelReason", "Lý do huỷ", 300);

    await prisma.$transaction(async (tx) => {
      // R7 — buổi đã huỷ không được tính là buổi đã học, nên phải hoàn tác học phí.
      if (current.status === "COMPLETED") {
        await revertSessionCompletion(tx, id);
      }
      await tx.lessonSession.update({
        where: { id },
        data: { status: "CANCELLED", cancelReason, completedAt: null },
      });
    });

    await writeAudit({
      userId: user.id,
      action: "CANCEL_SESSION",
      entity: "LessonSession",
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: "CANCELLED", cancelReason },
      undo: {
        kind: "sessionStatus",
        sessionId: id,
        expect: "CANCELLED",
        status: current.status,
        cancelReason: current.cancelReason,
        completedAt: current.completedAt?.toISOString() ?? null,
        label:
          current.status === "COMPLETED"
            ? "Hoàn tác? Buổi trở lại Hoàn thành và học phí được trừ lại như trước khi huỷ."
            : "Hoàn tác? Buổi trở lại trạng thái trước khi huỷ.",
      },
    });
    return `Đã huỷ buổi ${current.sequence}. Tạo buổi bù bên dưới nếu cần dạy lại.`;
  });

  refreshCalendar(id, current?.classId);
  return result;
}

/**
 * Mở lại buổi đã huỷ hoặc đã hoàn thành về `SCHEDULED`.
 * Buổi đã hoàn thành phải hoàn tác học phí trước (R7) — điểm danh và báo cáo giữ nguyên.
 */
export async function reopenSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("session.edit");
  const id = requiredId(fd, "id", "buổi học");

  const current = await prisma.lessonSession.findUnique({
    where: { id },
    select: {
      id: true,
      classId: true,
      status: true,
      sequence: true,
      cancelReason: true,
      completedAt: true,
    },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy buổi học.");
    if (current.status === "SCHEDULED") return "Buổi này đang ở trạng thái Đã lên lịch.";

    await prisma.$transaction(async (tx) => {
      if (current.status === "COMPLETED") {
        await revertSessionCompletion(tx, id);
      }
      await tx.lessonSession.update({
        where: { id },
        data: { status: "SCHEDULED", cancelReason: null, completedAt: null },
      });
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "LessonSession",
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: "SCHEDULED" },
      undo: {
        kind: "sessionStatus",
        sessionId: id,
        expect: "SCHEDULED",
        status: current.status,
        cancelReason: current.cancelReason,
        completedAt: current.completedAt?.toISOString() ?? null,
        label:
          current.status === "COMPLETED"
            ? "Hoàn tác? Buổi trở lại Hoàn thành và học phí được trừ lại theo điểm danh hiện có."
            : "Hoàn tác? Buổi trở lại trạng thái Đã huỷ kèm lý do cũ.",
      },
    });
    return current.status === "COMPLETED"
      ? `Đã mở lại buổi ${current.sequence}. Học phí đã trừ cho buổi này được hoàn tác.`
      : `Đã mở lại buổi ${current.sequence}.`;
  });

  refreshCalendar(id, current?.classId);
  return result;
}

/**
 * Tạo buổi bù cho một buổi đã huỷ — PRD §9: tạo session **mới**, không sửa lịch sử.
 * Buổi bù nhận lại bài học của buổi gốc để không lệch tiến độ Syllabus.
 */
export async function createMakeupSession(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("calendar.manage");
  const sourceId = requiredId(fd, "sourceId", "buổi cần bù");

  const source = await prisma.lessonSession.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      classId: true,
      sequence: true,
      status: true,
      syllabusLessonId: true,
      makeup: { select: { id: true } },
    },
  });

  const result = await runAction(async () => {
    if (!source) fail("Không tìm thấy buổi cần bù.");
    if (source.status !== "CANCELLED") fail("Chỉ tạo buổi bù cho buổi đã huỷ.");
    if (source.makeup) fail("Buổi này đã có buổi bù rồi.");

    const { startTime, endTime } = readTimeRange(fd);
    const assignee = await readSessionAssignee(fd);
    const data = {
      date: requiredDate(fd, "date", "Ngày học bù"),
      startTime,
      endTime,
      roomId: optionalId(fd, "roomId"),
      ...assignee,
    };

    if (!bool(fd, "ignoreConflict")) {
      const conflicts = await findSessionConflicts(prisma, data);
      if (conflicts.length > 0) {
        fail(
          `Trùng lịch: ${conflicts.map((c) => c.label).join("; ")}. ` +
            "Tích «Bỏ qua cảnh báo trùng lịch» nếu vẫn muốn lưu.",
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const sequence = await nextSequence(tx, source.classId);
      return tx.lessonSession.create({
        data: {
          ...data,
          classId: source.classId,
          sequence,
          syllabusLessonId: source.syllabusLessonId,
          makeupForId: source.id,
        },
        select: { id: true, sequence: true },
      });
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "LessonSession",
      entityId: created.id,
      newValue: { ...data, date: dateKey(data.date), makeupForId: source.id },
      undo: undoCreate(
        { model: "lessonSession", id: created.id },
        { label: "Hoàn tác? Buổi bù vừa tạo sẽ bị xoá, buổi gốc vẫn ở trạng thái Đã huỷ." },
      ),
    });
    return `Đã tạo buổi bù (buổi ${created.sequence}) ngày ${formatDateUtc(data.date)}.`;
  });

  refreshCalendar(sourceId, source?.classId);
  return result;
}

/** Chỉ xoá được buổi chưa diễn ra và chưa có dữ liệu điểm danh / báo cáo. */
export async function deleteSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("calendar.manage");
  const id = requiredId(fd, "id", "buổi học");

  const current = await prisma.lessonSession.findUnique({
    where: { id },
    select: {
      id: true,
      classId: true,
      sequence: true,
      status: true,
      date: true,
      testColumns: true,
      makeup: { select: { id: true } },
      _count: { select: { attendances: true, tuitionEntries: true } },
      report: { select: { id: true } },
    },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy buổi học.");
    if (current.status === "COMPLETED") {
      fail("Buổi đã hoàn thành thì không xoá. Hãy mở lại buổi rồi huỷ để giữ lịch sử.");
    }
    if (
      current._count.attendances > 0 ||
      current.report ||
      (Array.isArray(current.testColumns) && current.testColumns.length > 0)
    ) {
      fail("Buổi này đã có điểm danh, điểm kiểm tra hoặc báo cáo. Hãy huỷ buổi thay vì xoá để giữ lịch sử.");
    }
    if (current._count.tuitionEntries > 0) {
      fail("Buổi này đang gắn với bút toán học phí nên không xoá được.");
    }
    if (current.makeup) fail("Buổi này đang có buổi bù tham chiếu tới. Hãy xoá buổi bù trước.");

    // Chụp nguyên dòng trước khi xoá để còn khôi phục được (buổi ở đây luôn là buổi trống).
    const snapshot = await captureRow(prisma, "lessonSession", id);

    await prisma.lessonSession.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "LessonSession",
      entityId: id,
      oldValue: { classId: current.classId, sequence: current.sequence, date: dateKey(current.date) },
      undo: undoDelete([snapshot], {
        label: "Hoàn tác? Buổi vừa xoá sẽ được tạo lại.",
        after: { assignLessonsClassIds: [current.classId] },
      }),
    });
    return `Đã xoá buổi ${current.sequence}.`;
  });

  refreshCalendar(id, current?.classId);
  return result;
}

/** Xoá hàng loạt buổi chưa diễn ra của một lớp trong khoảng ngày — dùng khi sinh nhầm lịch. */
export async function deleteSessionRange(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("calendar.manage");
  const classId = requiredId(fd, "classId", "lớp học");

  return runAction(async () => {
    const from = requiredDate(fd, "from", "Từ ngày");
    const to = requiredDate(fd, "to", "Đến ngày");
    if (to < from) fail("«Đến ngày» phải sau «Từ ngày».");

    // Chỉ đụng vào buổi chưa có dấu vết dạy học, để không mất lịch sử.
    const removable = await prisma.lessonSession.findMany({
      where: {
        classId,
        date: { gte: from, lte: to },
        status: "SCHEDULED",
        attendances: { none: {} },
        report: null,
        tuitionEntries: { none: {} },
        makeup: null,
      },
      select: { id: true, testColumns: true },
    });

    const emptySessions = removable.filter(
      (session) => !Array.isArray(session.testColumns) || session.testColumns.length === 0,
    );

    if (emptySessions.length === 0) {
      return "Không có buổi nào xoá được trong khoảng ngày này (buổi đã dạy hoặc đã có dữ liệu được giữ lại).";
    }

    const ids = emptySessions.map((s) => s.id);
    const snapshots = await captureRows(prisma, "lessonSession", { id: { in: ids } });

    await prisma.lessonSession.deleteMany({ where: { id: { in: ids } } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "LessonSession",
      entityId: classId,
      oldValue: { classId, from: dateKey(from), to: dateKey(to), count: emptySessions.length },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? ${snapshots.length} buổi vừa xoá sẽ được tạo lại.`,
        after: { assignLessonsClassIds: [classId] },
      }),
    });
    return `Đã xoá ${emptySessions.length} buổi chưa diễn ra.`;
  }).finally(() => refreshCalendar(undefined, classId));
}
