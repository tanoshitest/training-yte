"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  captureRows,
  diff,
  undoCreate,
  undoDelete,
  undoUpdate,
  undoUpdateAlso,
  writeAudit,
} from "@/lib/audit";
import { nextClassCode } from "@/lib/code";
import {
  createTuitionForEnrollment,
  enrollmentTuitionPlan,
  syncStudentStatus,
} from "@/lib/enrollment";
import { assignLessons, syncClassSessions } from "@/lib/class-plan";
import { timeToMinutes } from "@/lib/utils";
import {
  TIME_RE,
  fail,
  optionalId,
  optionalStr,
  requiredId,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";
import type { Prisma } from "@/generated/prisma/client";
import type { ClassStatus, ClassType, EnrollmentStatus } from "@/generated/prisma/enums";

/**
 * Server Action cho module Lớp học (PRD §5, §6.3).
 *
 * R2 — `Class.type` quyết định mô hình học phí, nên không đổi được sau khi đã có học viên.
 * R4 — Học viên gắn với lớp qua Enrollment; rời lớp là đổi trạng thái + ghi `leftAt`,
 *      không bao giờ xoá bản ghi để giữ lịch sử.
 */

const CLASS_TYPES: ClassType[] = ["NORMAL", "IELTS"];
const CLASS_STATUSES: ClassStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "FINISHED"];
const MANUAL_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "RESERVED", "DROPPED"];

function refreshClass(classId?: string) {
  revalidatePath("/lop-hoc");
  revalidatePath("/gv/lop-hoc");
  if (classId) revalidatePath(`/lop-hoc/${classId}`);
  // Đổi lịch tuần là đổi luôn buổi học nên lịch dạy phải vẽ lại.
  revalidatePath("/lich-day");
  revalidatePath("/gv/lich-day");
  revalidatePath("/tong-quan");
  revalidatePath("/gv");
}

/** Báo cho người dùng biết lịch dạy vừa đổi theo thời khoá biểu. */
function sessionNote({ created, removed }: { created: number; removed: number }) {
  const parts: string[] = [];
  if (created > 0) parts.push(`thêm ${created} buổi`);
  if (removed > 0) parts.push(`bỏ ${removed} buổi chưa dạy`);
  return parts.length > 0 ? ` Lịch dạy đã cập nhật: ${parts.join(", ")}.` : "";
}

function refreshStudent(studentId?: string) {
  revalidatePath("/hoc-vien");
  if (studentId) revalidatePath(`/hoc-vien/${studentId}`);
}

function readEnum<T extends string>(fd: FormData, key: string, allowed: T[], label: string): T {
  const value = String(fd.get(key) ?? "").trim() as T;
  if (!allowed.includes(value)) fail(`Vui lòng chọn ${label}.`);
  return value;
}

/**
 * Các trường chung của form lớp.
 *
 * Lớp không có ngày bắt đầu / ngày kết thúc: cấu hình lịch tuần xong là lớp chạy, và
 * chạy tới khi Admin chuyển trạng thái sang Kết thúc. Ngày bắt đầu học là của từng
 * học viên (`Enrollment.joinedAt`), hiện trong danh sách học viên của lớp.
 *
 * Loại lớp quyết định lớp có những trường nào (R2):
 * - Lớp thường có **cấp học + level** (lộ trình Cấp 1 → Cấp 2, mỗi cấp có Level 1, 2, 3…)
 *   nhưng không có học phí ở cấp lớp, vì gói buổi là của từng học viên.
 * - Lớp IELTS ngược lại: có **khóa học phí** (tính trọn khóa) và không đi theo lộ trình
 *   cấp/level nên bỏ trống hai trường đó.
 *
 * Form ẩn ô nào thì ô đó không gửi lên, nên ở đây ghi thẳng `null` theo loại lớp: đổi loại
 * lớp là dữ liệu của loại cũ tự bị xoá, không để lại giá trị mồ côi lệch với màn hình.
 */
async function readClass(fd: FormData, type: ClassType) {
  const levelId = type === "NORMAL" ? optionalId(fd, "levelId") : null;
  const subLevelId = type === "NORMAL" ? optionalId(fd, "subLevelId") : null;

  // Không tin form: level phải thuộc đúng cấp học đang chọn.
  if (subLevelId) {
    const subLevel = await prisma.subLevel.findUnique({
      where: { id: subLevelId },
      select: { levelId: true },
    });
    if (!subLevel) fail("Không tìm thấy level đã chọn.");
    if (subLevel.levelId !== levelId) fail("Level đã chọn không thuộc cấp học của lớp.");
  }

  return {
    name: requiredStr(fd, "name", "Tên lớp", 150),
    levelId,
    subLevelId,
    // Lớp không giữ gói buổi nữa: luôn xoá gói cũ để dữ liệu khỏi lệch với màn hình.
    packageId: null,
    ieltsCourseId: type === "IELTS" ? optionalId(fd, "ieltsCourseId") : null,
    branchId: optionalId(fd, "branchId"),
    teacherId: optionalId(fd, "teacherId"),
    roomId: optionalId(fd, "roomId"),
    note: optionalStr(fd, "note", 1000),
  };
}

/** Danh sách syllabus gán cho lớp, theo đúng thứ tự người dùng xếp trên form. */
function readSyllabusIds(fd: FormData) {
  const ids = fd
    .getAll("syllabusIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * Thời khoá biểu lặp theo tuần, nhập ngay trong form lớp (PRD §7.4).
 *
 * Mỗi buổi gửi lên 4 input song song nên ghép lại theo chỉ số dòng. Giờ luôn lấy
 * theo ca đã khai báo ở Cấu hình; buổi cũ nhập tay (không có ca) vẫn nhận để
 * không chặn lưu lớp đang chạy.
 */
async function readScheduleSlots(fd: FormData) {
  const weekdays = fd.getAll("slotWeekday");
  const periodIds = fd.getAll("slotPeriodId");
  const startTimes = fd.getAll("slotStartTime");
  const endTimes = fd.getAll("slotEndTime");

  if (weekdays.length === 0) return [];
  if (
    periodIds.length !== weekdays.length ||
    startTimes.length !== weekdays.length ||
    endTimes.length !== weekdays.length
  ) {
    fail("Thời khoá biểu gửi lên không hợp lệ. Vui lòng nhập lại.");
  }

  const usedPeriodIds = [
    ...new Set(periodIds.map((value) => String(value).trim()).filter(Boolean)),
  ];
  const periods = usedPeriodIds.length
    ? await prisma.lessonPeriod.findMany({ where: { id: { in: usedPeriodIds } } })
    : [];
  const periodById = new Map(periods.map((period) => [period.id, period]));

  const slots = weekdays.map((raw, index) => {
    const weekday = Number(String(raw).trim());
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      fail("Thứ trong thời khoá biểu không hợp lệ.");
    }

    const periodId = String(periodIds[index]).trim() || null;
    const period = periodId ? periodById.get(periodId) : null;
    if (periodId && !period) fail("Không tìm thấy ca học đã chọn trong thời khoá biểu.");

    const startTime = period ? period.startTime : String(startTimes[index]).trim();
    const endTime = period ? period.endTime : String(endTimes[index]).trim();
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      fail("Giờ học trong thời khoá biểu phải có dạng HH:mm, ví dụ 08:00.");
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      fail("Giờ kết thúc phải sau giờ bắt đầu trong thời khoá biểu.");
    }

    return { weekday, periodId, startTime, endTime };
  });

  // Bảng có unique [classId, weekday, startTime]; chặn ở đây để báo lỗi dễ hiểu.
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = `${slot.weekday}-${slot.startTime}`;
    if (seen.has(key)) fail("Thời khoá biểu có hai buổi trùng thứ và giờ bắt đầu.");
    seen.add(key);
  }

  return slots;
}

/** Hai lịch tuần coi là giống nhau khi cùng tập buổi, không phân biệt thứ tự dòng. */
function scheduleKey(slots: { weekday: number; periodId: string | null; startTime: string; endTime: string }[]) {
  return slots
    .map((slot) => `${slot.weekday}|${slot.startTime}|${slot.endTime}|${slot.periodId ?? ""}`)
    .sort()
    .join(";");
}

/** Ghi lại danh sách syllabus của lớp: xoá cái bị bỏ, thêm cái mới, đánh lại thứ tự. */
async function saveClassSyllabuses(
  tx: Prisma.TransactionClient,
  classId: string,
  syllabusIds: string[],
) {
  // `notIn: []` không đáng tin trên mọi phiên bản Prisma — lớp bỏ hết syllabus thì xoá hết.
  if (syllabusIds.length === 0) {
    await tx.classSyllabus.deleteMany({ where: { classId } });
    return;
  }
  await tx.classSyllabus.deleteMany({
    where: { classId, syllabusId: { notIn: syllabusIds } },
  });
  for (const [index, syllabusId] of syllabusIds.entries()) {
    await tx.classSyllabus.upsert({
      where: { classId_syllabusId: { classId, syllabusId } },
      create: { classId, syllabusId, order: index + 1 },
      update: { order: index + 1 },
    });
  }
}

// ------------------------------------------------------------------
// Lớp học
// ------------------------------------------------------------------

export async function createClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.create");

  return runAction(async () => {
    const code = optionalStr(fd, "code", 30) ?? (await nextClassCode());
    const type = readEnum(fd, "type", CLASS_TYPES, "loại lớp");
    const data = {
      ...(await readClass(fd, type)),
      code,
      type,
      status: readEnum(fd, "status", CLASS_STATUSES, "trạng thái lớp"),
    };
    const syllabusIds = readSyllabusIds(fd);
    const slots = await readScheduleSlots(fd);

    const created = await prisma.class.create({
      data: {
        ...data,
        syllabuses: {
          create: syllabusIds.map((syllabusId, index) => ({ syllabusId, order: index + 1 })),
        },
        schedules: { create: slots },
      },
    });
    // Có lịch tuần là dựng được buổi ngay, không cần syllabus — lớp lên thẳng màn Lịch dạy.
    const sessions = await syncClassSessions(prisma, created.id);

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Class",
      entityId: created.id,
      newValue: { ...data, syllabusIds, schedules: slots },
      // Xoá lớp kéo theo lịch tuần, syllabus đã gán và các buổi vừa dựng (cascade).
      undo: undoCreate(
        { model: "class", id: created.id },
        {
          label: `Hoàn tác? Lớp vừa tạo sẽ bị xoá cùng lịch tuần và ${sessions.created} buổi vừa dựng.`,
        },
      ),
    });
    return `Đã tạo lớp ${created.name} (mã ${created.code}).${sessionNote(sessions)}`;
  }).finally(() => refreshClass());
}

export async function updateClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const id = requiredId(fd, "id", "lớp học");

  return runAction(async () => {
    const current = await prisma.class.findUnique({
      where: { id },
      include: {
        _count: { select: { enrollments: true } },
        syllabuses: { orderBy: { order: "asc" }, select: { syllabusId: true } },
        schedules: {
          select: { weekday: true, periodId: true, startTime: true, endTime: true },
        },
      },
    });
    if (!current) fail("Không tìm thấy lớp học.");

    const type = readEnum(fd, "type", CLASS_TYPES, "loại lớp");
    // R2 — đổi loại lớp sẽ làm sai toàn bộ học phí đã tạo cho học viên đang học.
    if (type !== current.type && current._count.enrollments > 0) {
      fail(
        "Không đổi được loại lớp khi đã có học viên, vì loại lớp quyết định cách tính học phí. " +
          "Hãy tạo lớp mới rồi chuyển học viên sang.",
      );
    }

    const data = {
      ...(await readClass(fd, type)),
      code: requiredStr(fd, "code", "Mã lớp", 30),
      type,
      status: readEnum(fd, "status", CLASS_STATUSES, "trạng thái lớp"),
    };

    const syllabusIds = readSyllabusIds(fd);
    const oldSyllabusIds = current.syllabuses.map((item) => item.syllabusId);
    const syllabusChanged = oldSyllabusIds.join(",") !== syllabusIds.join(",");

    const slots = await readScheduleSlots(fd);
    const scheduleChanged = scheduleKey(current.schedules) !== scheduleKey(slots);

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges && !syllabusChanged && !scheduleChanged) {
      return "Không có thay đổi nào.";
    }

    const sessions = await prisma.$transaction(async (tx) => {
      await tx.class.update({ where: { id }, data });
      if (syllabusChanged) await saveClassSyllabuses(tx, id, syllabusIds);
      // Lịch tuần không có gì để giữ lại (buổi học đã tạo là bảng khác) nên ghi đè cả cụm.
      if (scheduleChanged) {
        await tx.classSchedule.deleteMany({ where: { classId: id } });
        await tx.classSchedule.createMany({
          data: slots.map((slot) => ({ ...slot, classId: id })),
        });
      }
      // Lịch cũ phải được truyền vào ngay trong cùng transaction: nếu đồng bộ lỗi thì
      // cả lịch tuần lẫn các buổi cụ thể đều quay về trạng thái trước khi bấm Lưu.
      const synced = await syncClassSessions(tx, id, {
        previousSchedules: scheduleChanged ? current.schedules : undefined,
        // `loadClassLessons` đọc nhiều relation; rót bài sau commit để pg không chạy
        // nhiều query đồng thời trên cùng interactive transaction.
        assignLessons: false,
      });
      return synced;
    });
    await assignLessons(prisma, id);

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Class",
      entityId: id,
      oldValue: {
        ...changes.oldValue,
        ...(syllabusChanged ? { syllabusIds: oldSyllabusIds } : {}),
        ...(scheduleChanged ? { schedules: current.schedules } : {}),
      },
      newValue: {
        ...changes.newValue,
        ...(syllabusChanged ? { syllabusIds } : {}),
        ...(scheduleChanged ? { schedules: slots } : {}),
      },
      // Đổi lịch tuần / syllabus là dựng lại cả cụm buổi học, không đảo trọn vẹn được —
      // chỉ hoàn tác được khi lần sửa này chỉ đụng tới thông tin lớp.
      undo:
        syllabusChanged || scheduleChanged
          ? undefined
          : undoUpdate(
              "class",
              id,
              current as unknown as Record<string, unknown>,
              Object.keys(changes.newValue),
              { label: "Hoàn tác? Thông tin lớp sẽ trở về các giá trị trước đó." },
            ),
    });
    return `Đã lưu thông tin lớp học.${sessionNote(sessions)}`;
  }).finally(() => refreshClass(id));
}

/**
 * Gán / bỏ syllabus ngay trên trang chi tiết lớp — không phải chờ nút Lưu thông tin lớp.
 * Bài học được rót lại vào các buổi trống sau khi danh sách syllabus đổi.
 */
export async function setClassSyllabuses(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const id = requiredId(fd, "id", "lớp học");

  return runAction(async () => {
    const current = await prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        syllabuses: { orderBy: { order: "asc" }, select: { syllabusId: true } },
      },
    });
    if (!current) fail("Không tìm thấy lớp học.");

    const syllabusIds = readSyllabusIds(fd);
    const oldSyllabusIds = current.syllabuses.map((item) => item.syllabusId);
    if (oldSyllabusIds.join(",") === syllabusIds.join(",")) {
      return "Syllabus của lớp không đổi.";
    }

    if (syllabusIds.length > 0) {
      const found = await prisma.syllabus.findMany({
        where: { id: { in: syllabusIds }, status: { not: "ARCHIVED" } },
        select: { id: true },
      });
      if (found.length !== syllabusIds.length) {
        fail("Có syllabus không còn dùng được. Hãy chọn lại.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await saveClassSyllabuses(tx, id, syllabusIds);
    });
    await assignLessons(prisma, id);

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Class",
      entityId: id,
      oldValue: { syllabusIds: oldSyllabusIds },
      newValue: { syllabusIds },
    });

    if (syllabusIds.length === 0) return `Đã bỏ toàn bộ syllabus khỏi lớp ${current.name}.`;
    return `Đã gán ${syllabusIds.length} syllabus cho lớp ${current.name}.`;
  }).finally(() => refreshClass(id));
}

/**
 * Xoá hẳn lớp học. Cơ sở dữ liệu xoá theo (onDelete: Cascade) toàn bộ lịch tuần,
 * buổi học, điểm danh, báo cáo buổi dạy, ghi danh, hồ sơ học phí và phiếu thu của
 * lớp này. Không khôi phục được nên hộp thoại xác nhận ở danh sách phải liệt kê rõ.
 */
export async function deleteClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const id = requiredId(fd, "id", "lớp học");

  return runAction(async () => {
    const current = await prisma.class.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true, sessions: true } } },
    });
    if (!current) fail("Không tìm thấy lớp học.");

    const removed = {
      enrollments: current._count.enrollments,
      sessions: current._count.sessions,
    };

    // Chụp trọn cây bị cascade, xếp cha trước con để khôi phục đúng thứ tự khoá ngoại.
    const sessionIds = (
      await prisma.lessonSession.findMany({ where: { classId: id }, select: { id: true } })
    ).map((row) => row.id);
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: id },
      select: { id: true, studentId: true },
    });
    const tuitionIds = (
      await prisma.studentTuition.findMany({
        where: { enrollmentId: { in: enrollments.map((row) => row.id) } },
        select: { id: true },
      })
    ).map((row) => row.id);
    const snapshots = [
      ...(await captureRows(prisma, "class", { id })),
      ...(await captureRows(prisma, "classSchedule", { classId: id })),
      ...(await captureRows(prisma, "classSyllabus", { classId: id })),
      ...(await captureRows(prisma, "enrollment", { classId: id })),
      ...(await captureRows(prisma, "studentTuition", { id: { in: tuitionIds } })),
      ...(await captureRows(prisma, "lessonSession", { classId: id })),
      ...(await captureRows(prisma, "attendance", { sessionId: { in: sessionIds } })),
      ...(await captureRows(prisma, "lessonReport", { sessionId: { in: sessionIds } })),
      ...(await captureRows(prisma, "tuitionEntry", { tuitionId: { in: tuitionIds } })),
      ...(await captureRows(prisma, "tuitionPayment", { tuitionId: { in: tuitionIds } })),
    ];

    await prisma.class.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Class",
      entityId: id,
      oldValue: { code: current.code, name: current.name, ...removed },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Lớp ${current.name} sẽ được khôi phục cùng ${removed.enrollments} lần ghi danh và ${removed.sessions} buổi học.`,
        after: {
          syncStudentIds: [...new Set(enrollments.map((row) => row.studentId))],
          revalidate: [`/lop-hoc/${id}`],
        },
      }),
    });
    return `Đã xoá lớp ${current.name} cùng ${removed.enrollments} lần ghi danh và ${removed.sessions} buổi học.`;
  }).finally(() => {
    refreshClass();
    // Học phí và phiếu thu của lớp mất theo nên báo cáo tiền phải vẽ lại.
    revalidatePath("/hoc-phi");
  });
}

// ------------------------------------------------------------------
// Ghi danh
// ------------------------------------------------------------------

/**
 * Thêm một hoặc nhiều học viên vào lớp.
 *
 * Học phí theo R2: lớp IELTS áp thẳng khóa của lớp (`Class.ieltsCourseId`), lớp thường
 * áp gói buổi chọn ngay trên form — cả nhóm vừa chọn cùng một gói. Để trống gói thì
 * học viên vào lớp trước, thu sau ở màn hình Học phí.
 *
 * Học viên từng học rồi quay lại thì dùng lại bản ghi ghi danh cũ
 * (unique [studentId, classId]) và giữ nguyên học phí đã tính.
 */
export async function enrollStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const classId = requiredId(fd, "classId", "lớp học");
  const studentIds = [
    ...new Set(
      fd
        .getAll("studentIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  return runAction(async () => {
    if (studentIds.length === 0) fail("Vui lòng chọn ít nhất một học viên.");

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, type: true, ieltsCourseId: true },
    });
    if (!cls) fail("Không tìm thấy lớp học.");

    const plan = enrollmentTuitionPlan(cls, optionalId(fd, "packageId"));

    const added = await prisma.$transaction(async (tx) => {
      const students = await tx.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, fullName: true },
      });
      if (students.length !== studentIds.length) fail("Có học viên không còn trong danh sách.");

      const result: {
        enrollmentId: string;
        studentId: string;
        fullName: string;
        /** Lần ghi danh mới tinh hay dùng lại bản ghi cũ — quyết định cách hoàn tác. */
        reused: { status: EnrollmentStatus; leftAt: Date | null; joinedAt: Date } | null;
        tuitionId: string | null;
      }[] = [];

      for (const student of students) {
        const existing = await tx.enrollment.findUnique({
          where: { studentId_classId: { studentId: student.id, classId } },
          select: { id: true, status: true, leftAt: true, joinedAt: true },
        });
        if (existing?.status === "ACTIVE") {
          fail(`${student.fullName} đã có trong lớp này.`);
        }

        const enrollment = existing
          ? await tx.enrollment.update({
              where: { id: existing.id },
              data: { status: "ACTIVE", leftAt: null, joinedAt: new Date() },
            })
          : await tx.enrollment.create({
              data: { studentId: student.id, classId, status: "ACTIVE" },
            });

        // Chưa chọn gói thì chưa sinh hồ sơ học phí — màn hình Học phí sẽ nhắc thu sau.
        let tuitionId: string | null = null;
        if (plan) {
          tuitionId = await createTuitionForEnrollment(tx, {
            enrollmentId: enrollment.id,
            studentId: student.id,
            plan,
          });
        }
        await syncStudentStatus(tx, student.id);

        result.push({
          enrollmentId: enrollment.id,
          studentId: student.id,
          fullName: student.fullName,
          reused: existing
            ? { status: existing.status, leftAt: existing.leftAt, joinedAt: existing.joinedAt }
            : null,
          tuitionId,
        });
      }

      return result;
    });

    for (const item of added) {
      await writeAudit({
        userId: user.id,
        action: "CREATE",
        entity: "Enrollment",
        entityId: item.enrollmentId,
        newValue: { studentId: item.studentId, classId, plan },
        undo: undoCreate(
          [
            // Lần ghi danh cũ thì giữ lại bản ghi (R4), chỉ trả trạng thái về như trước.
            ...(item.reused ? [] : [{ model: "enrollment" as const, id: item.enrollmentId }]),
            ...(item.tuitionId ? [{ model: "studentTuition" as const, id: item.tuitionId }] : []),
          ],
          {
            label: item.reused
              ? `Hoàn tác? ${item.fullName} trở lại trạng thái trước khi được thêm vào lớp.`
              : `Hoàn tác? ${item.fullName} sẽ bị gỡ khỏi lớp cùng hồ sơ học phí vừa sinh.`,
            ...(item.reused
              ? { also: [undoUpdateAlso("enrollment", item.enrollmentId, item.reused, ["status", "leftAt", "joinedAt"])] }
              : {}),
            after: {
              syncStudentIds: [item.studentId],
              revalidate: [`/lop-hoc/${classId}`, `/hoc-vien/${item.studentId}`],
            },
          },
        ),
      });
    }

    return added.length === 1
      ? `Đã thêm ${added[0].fullName} vào lớp ${cls.name}.`
      : `Đã thêm ${added.length} học viên vào lớp ${cls.name}.`;
  }).finally(() => {
    refreshClass(classId);
    // Ghi danh sinh hồ sơ học phí, hoặc để lại một dòng chờ chọn gói ở màn hình Học phí.
    revalidatePath("/hoc-phi");
    for (const studentId of studentIds) refreshStudent(studentId);
  });
}

/** Đổi trạng thái ghi danh: đang học / bảo lưu / cho nghỉ (PRD §6.2). */
export async function setEnrollmentStatus(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const id = requiredId(fd, "id", "lần ghi danh");

  const current = await prisma.enrollment.findUnique({
    where: { id },
    select: { id: true, studentId: true, classId: true, status: true, leftAt: true },
  });

  const result = await runAction(async () => {
    if (!current) fail("Không tìm thấy lần ghi danh.");

    const status = readEnum(fd, "status", MANUAL_ENROLLMENT_STATUSES, "trạng thái");
    if (status === current.status) return "Không có thay đổi nào.";

    await prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id },
        data: { status, leftAt: status === "DROPPED" ? new Date() : null },
      });
      await syncStudentStatus(tx, current.studentId);
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Enrollment",
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status },
      undo: undoUpdate("enrollment", id, current, ["status", "leftAt"], {
        label: "Hoàn tác? Trạng thái học viên trong lớp trở về như trước.",
        after: {
          syncStudentIds: [current.studentId],
          revalidate: [`/lop-hoc/${current.classId}`, `/hoc-vien/${current.studentId}`],
        },
      }),
    });
    return "Đã cập nhật trạng thái học viên trong lớp.";
  });

  refreshClass(current?.classId);
  refreshStudent(current?.studentId);
  return result;
}

/**
 * Chuyển học viên sang lớp khác.
 * Lần ghi danh cũ giữ nguyên với trạng thái TRANSFERRED (R4) — học phí cũ không bị xoá.
 * Lớp mới là IELTS thì sinh học phí trọn khóa theo khóa của lớp; lớp thường thì chưa
 * sinh học phí vì gói buổi là của học viên, chọn sau ở màn hình Học phí.
 */
export async function transferStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("class.update");
  const id = requiredId(fd, "id", "lần ghi danh");
  const targetClassId = requiredId(fd, "targetClassId", "lớp muốn chuyển đến");

  const source = await prisma.enrollment.findUnique({
    where: { id },
    select: { id: true, studentId: true, classId: true, status: true, leftAt: true },
  });

  const result = await runAction(async () => {
    if (!source) fail("Không tìm thấy lần ghi danh.");
    if (source.classId === targetClassId) fail("Học viên đã ở trong lớp này rồi.");

    const sourceClass = await prisma.class.findUnique({
      where: { id: source.classId },
      select: { id: true, type: true, name: true },
    });
    const target = await prisma.class.findUnique({
      where: { id: targetClassId },
      select: { id: true, name: true, type: true, ieltsCourseId: true },
    });
    if (!sourceClass) fail("Không tìm thấy lớp hiện tại.");
    if (!target) fail("Không tìm thấy lớp muốn chuyển đến.");
    if (target.type !== sourceClass.type) {
      fail("Chỉ được chuyển sang lớp cùng loại.");
    }

    const plan = enrollmentTuitionPlan(target, null);
    const studentId = source.studentId;

    const moved = await prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id },
        data: { status: "TRANSFERRED", leftAt: new Date() },
      });

      const existing = await tx.enrollment.findUnique({
        where: { studentId_classId: { studentId, classId: targetClassId } },
        select: { id: true, status: true, leftAt: true, joinedAt: true },
      });

      const enrollment = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: "ACTIVE", leftAt: null, joinedAt: new Date() },
          })
        : await tx.enrollment.create({
            data: { studentId, classId: targetClassId, status: "ACTIVE" },
          });

      // Lớp thường chưa có gói ngay lúc chuyển — thu ở màn hình Học phí.
      let tuitionId: string | null = null;
      if (plan) {
        tuitionId = await createTuitionForEnrollment(tx, {
          enrollmentId: enrollment.id,
          studentId,
          plan,
        });
      }
      await syncStudentStatus(tx, studentId);
      return { targetEnrollmentId: enrollment.id, reused: existing, tuitionId };
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Enrollment",
      entityId: id,
      oldValue: { classId: source.classId, status: "ACTIVE" },
      newValue: { classId: targetClassId, status: "TRANSFERRED" },
      undo: undoCreate(
        [
          ...(moved.reused
            ? []
            : [{ model: "enrollment" as const, id: moved.targetEnrollmentId }]),
          ...(moved.tuitionId ? [{ model: "studentTuition" as const, id: moved.tuitionId }] : []),
        ],
        {
          label: `Hoàn tác? Học viên quay lại lớp cũ, phần ghi danh ở lớp ${target.name} bị gỡ.`,
          also: [
            undoUpdateAlso("enrollment", id, source, ["status", "leftAt"]),
            ...(moved.reused
              ? [
                  undoUpdateAlso("enrollment", moved.targetEnrollmentId, moved.reused, [
                    "status",
                    "leftAt",
                    "joinedAt",
                  ]),
                ]
              : []),
          ],
          after: {
            syncStudentIds: [studentId],
            revalidate: [
              `/lop-hoc/${source.classId}`,
              `/lop-hoc/${targetClassId}`,
              `/hoc-vien/${studentId}`,
            ],
          },
        },
      ),
    });
    return `Đã chuyển học viên sang lớp ${target.name}.`;
  });

  refreshClass(source?.classId);
  refreshClass(targetClassId);
  revalidatePath("/hoc-phi");
  refreshStudent(source?.studentId);
  return result;
}
