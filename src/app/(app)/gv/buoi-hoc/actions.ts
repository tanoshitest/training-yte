"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { formatDateUtc } from "@/lib/date";
import { assertCanAccessSession, requirePermission, type SessionUser } from "@/lib/permissions";
import { undoUpdate, writeAudit } from "@/lib/audit";
import type { UndoPlan } from "@/lib/audit-undo";
import {
  applySessionCompletion,
  chargeSessionForStudents,
  isBillableAttendance,
  refundSessionForStudents,
} from "@/lib/tuition";
import { fail, optionalStr, requiredId, runAction, type ActionState } from "@/lib/form-utils";
import { parseTestColumns, type SessionTestColumn } from "@/lib/session";
import { completeFirstMonthCareForStudents } from "@/lib/recruitment-care";
import type { AttendanceStatus, HomeworkRating, LessonRating } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

/**
 * Server Action cho một buổi học — PRD §10, §11, §12.
 *
 * Chia việc theo vai trò: **học vụ / quản trị điểm danh** (`saveAttendance`), **giáo viên
 * nhận xét từng học viên** (`saveAttendanceNotes`) và viết báo cáo buổi (`saveReport`).
 *
 * R5 — mọi action đều đi qua `assertCanAccessSession`: giáo viên chỉ thao tác được
 *      trên buổi thuộc lớp mình phụ trách (admin đi qua theo R6).
 * R8 — điểm danh là lúc buổi được tính đã dạy: lưu điểm danh thì buổi chuyển sang
 *      Hoàn thành và trừ buổi trong gói học phí (qua `applySessionCompletion`).
 */

/** "Bảo lưu" không nằm ở đây: trạng thái đó do ghi danh quyết định, form không gửi lên. */
const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "EXCUSED"];
const LESSON_RATINGS: LessonRating[] = ["A_PLUS", "A", "A_MINUS", "B"];
const HOMEWORK_RATINGS: HomeworkRating[] = ["FULL_100", "EIGHTY_80", "BELOW_50", "ZERO_0"];

function refreshSession(sessionId: string, classId?: string) {
  revalidatePath(`/gv/buoi-hoc/${sessionId}`);
  revalidatePath(`/gv/bao-cao-cham-cong/${sessionId}`);
  revalidatePath("/gv/buoi-hoc");
  revalidatePath("/gv/lich-day");
  revalidatePath("/gv");
  revalidatePath("/gv/task");
  revalidatePath("/task");
  revalidatePath("/tong-quan");
  revalidatePath(`/lich-day/${sessionId}`);
  revalidatePath("/lich-day");
  revalidatePath("/hoc-phi");
  if (classId) revalidatePath(`/lop-hoc/${classId}`);
}

/**
 * Buổi học kèm kiểm tra quyền — dùng chung cho hai action bên dưới.
 * Gọi bên trong `runAction` nên chỉ dùng `fail()`, không redirect.
 *
 * Buổi đã dạy xong vẫn sửa được điểm danh và báo cáo; chỉ buổi đã huỷ là khoá hẳn
 * (R7 — buổi huỷ không tính là đã học nên cũng không có gì để nhập).
 */
async function loadEditableSession(user: SessionUser, sessionId: string) {
  // R5 — giáo viên chỉ thao tác trên buổi thuộc lớp mình.
  if (!(await assertCanAccessSession(user, sessionId))) {
    fail("Bạn không phụ trách buổi học này.");
  }

  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      classId: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      testColumns: true,
      hasHomework: true,
      academicStaffId: true,
      class: { select: { type: true, name: true } },
    },
  });
  if (!session) fail("Không tìm thấy buổi học.");
  if (session.status === "CANCELLED") fail("Buổi đã huỷ nên không nhập được dữ liệu.");
  if (user.role === "TEACHER" && session.academicStaffId) {
    fail("Buổi này do Học vụ phụ trách nên không có phần nhận xét hoặc báo cáo Giáo viên.");
  }

  return session;
}

// ------------------------------------------------------------------
// Điểm danh — quản trị viên (PRD §11)
// ------------------------------------------------------------------

/**
 * Lưu điểm danh cả lớp trong một lần gửi. Mỗi học viên gửi lên `status_<studentId>`.
 *
 * Chỉ ghi trạng thái có mặt, **không đụng tới cột nhận xét** — nhận xét là phần của
 * giáo viên (`saveAttendanceNotes`), quản trị viên điểm danh lại không được xoá mất.
 *
 * Điểm danh xong là buổi coi như đã dạy: buổi còn `SCHEDULED` sẽ chuyển sang
 * `COMPLETED` và trừ học phí ngay trong cùng transaction (R8). Sửa lại điểm danh của
 * buổi đã `COMPLETED` thì chỉ bù trừ phần chênh lệch so với lần lưu trước, nên không
 * bao giờ trừ trùng.
 *
 * Lớp thường trừ 1 buổi khi lưu điểm danh (có mặt, vắng phép, vắng không phép).
 * Tick Nghỉ học hoặc học viên bảo lưu thì không trừ. Vượt gói thì sinh phí phát sinh (R11).
 * Lớp IELTS học trọn khoá nên điểm danh không đụng tới học phí (R9, R10).
 */
export async function saveAttendance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("attendance.submit");
  const sessionId = requiredId(fd, "sessionId", "buổi học");

  // Giữ lại để revalidate tab Syllabus của lớp — ở đó cũng điểm danh được.
  let classId: string | undefined;

  const result = await runAction(async () => {
    const session = await loadEditableSession(user, sessionId);
    classId = session.classId;
    const academicMode = String(fd.get("academicMode") ?? "") === "1";
    if (academicMode) {
      if (!session.academicStaffId) fail("Buổi này chưa được phân công cho Học vụ.");
      if (user.role === "ACADEMIC" && session.academicStaffId !== user.id) {
        fail("Buổi kiểm tra này được phân công cho Học vụ khác.");
      }
      if (user.role !== "ACADEMIC" && user.role !== "ADMIN") {
        fail("Chỉ Học vụ được phân công mới được nhập điểm kiểm tra.");
      }
    }
    const previousTests = parseTestColumns(session.testColumns);
    const nextTests = academicMode ? readTestColumns(fd) : previousTests;
    const testColumnsChanged = academicMode && !testsEqual(previousTests, nextTests);

    // Học viên đang bảo lưu vẫn có mặt trong danh sách, chỉ là bị khoá ở "Bảo lưu".
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: session.classId, status: { in: ["ACTIVE", "RESERVED"] } },
      select: { studentId: true, status: true },
    });
    if (enrollments.length === 0) fail("Lớp chưa có học viên đang học để điểm danh.");

    const existing = await prisma.attendance.findMany({
      where: { sessionId },
      select: { studentId: true, pronunciationVideoDone: true },
    });
    const videoByStudent = new Map(existing.map((row) => [row.studentId, row.pronunciationVideoDone]));
    const videoEnabled = String(fd.get("videoEnabled") ?? "") === "1";
    const isOff = String(fd.get("isOff") ?? "") === "1";

    const rows = enrollments.map((enrollment) => {
      // Bảo lưu là trạng thái của lần ghi danh, không cho form đổi.
      if (enrollment.status === "RESERVED") {
        return {
          studentId: enrollment.studentId,
          status: "RESERVED" as AttendanceStatus,
          pronunciationVideoDone: false,
        };
      }
      const raw = isOff ? "EXCUSED" : String(fd.get(`status_${enrollment.studentId}`) ?? "PRESENT");
      if (!(ATTENDANCE_STATUSES as string[]).includes(raw)) {
        fail("Trạng thái điểm danh không hợp lệ.");
      }
      const videoRaw = String(fd.get(`video_${enrollment.studentId}`) ?? "");
      return {
        studentId: enrollment.studentId,
        status: raw as AttendanceStatus,
        pronunciationVideoDone: videoEnabled
          ? videoRaw === "1" || videoRaw.toLowerCase() === "true"
          : (videoByStudent.get(enrollment.studentId) ?? false),
      };
    });

    // Buổi nghỉ học không tính là đã dạy — không chốt COMPLETED, không trừ học phí.
    const completing = !isOff && session.status === "SCHEDULED";

    // Ảnh chụp điểm danh trước khi sửa: vừa để bù trừ đúng phần chênh lệch học phí
    // (không trừ trùng, không bỏ sót hoàn lại), vừa là dữ liệu để hoàn tác sau này.
    const before = completing
      ? []
      : await prisma.attendance.findMany({
          where: { sessionId },
          select: {
            studentId: true,
            status: true,
            lessonRating: true,
            homeworkRating: true,
            pronunciationVideoDone: true,
            note: true,
          },
        });
    const beforeByStudent = new Map(before.map((row) => [row.studentId, row]));
    const chargedBefore = new Set(
      before.filter((row) => isBillableAttendance(row.status)).map((row) => row.studentId),
    );

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: row.studentId } },
          create: {
            sessionId,
            studentId: row.studentId,
            status: row.status,
            pronunciationVideoDone: row.pronunciationVideoDone,
          },
          update: { status: row.status, pronunciationVideoDone: row.pronunciationVideoDone },
        });
      }

      await tx.lessonSession.update({
        where: { id: sessionId },
        data: {
          isOff,
          ...(testColumnsChanged ? { testColumns: nextTests as Prisma.InputJsonValue } : {}),
          ...(completing ? { status: "COMPLETED" as const, completedAt: new Date() } : {}),
        },
      });

      if (completing) {
        // R8, R9, R11 — trừ buổi / sinh phí vượt gói trong cùng transaction.
        await applySessionCompletion(tx, sessionId);
        return;
      }

      // Đổi từ không tính phí sang tính phí thì trừ thêm, và ngược lại thì hoàn lại.
      const chargedAfter = new Set(
        isOff ? [] : rows.filter((row) => isBillableAttendance(row.status)).map((row) => row.studentId),
      );
      await chargeSessionForStudents(
        tx,
        sessionId,
        [...chargedAfter].filter((studentId) => !chargedBefore.has(studentId)),
      );
      await refundSessionForStudents(
        tx,
        sessionId,
        [...chargedBefore].filter((studentId) => !chargedAfter.has(studentId)),
      );
    });

    const present = rows.filter((r) => r.status === "PRESENT").length;

    // Hoàn tác: chốt buổi thì trả buổi về chưa dạy (hoàn học phí + xoá điểm danh),
    // còn sửa điểm danh thì chỉ trả từng học viên về trạng thái trước lúc bấm lưu.
    const undo: UndoPlan = completing
      ? {
          kind: "sessionCompletion",
          sessionId,
          label:
            "Hoàn tác buổi này? Buổi sẽ trở về Đã lên lịch, học phí đã trừ được hoàn lại, và toàn bộ điểm danh + nhận xét của buổi này bị xoá.",
          after: { revalidate: [`/gv/buoi-hoc/${sessionId}`, `/lop-hoc/${session.classId}`] },
        }
      : {
          kind: "attendanceState",
          sessionId,
          rows: rows.map((row) => {
            const old = beforeByStudent.get(row.studentId);
            return {
              studentId: row.studentId,
              status: old?.status ?? null,
              lessonRating: old?.lessonRating ?? null,
              homeworkRating: old?.homeworkRating ?? null,
              pronunciationVideoDone: old?.pronunciationVideoDone ?? false,
              note: old?.note ?? null,
            };
          }),
          label: "Hoàn tác lần sửa điểm danh này? Trạng thái từng học viên và học phí sẽ trở về như trước.",
          after: { revalidate: [`/gv/buoi-hoc/${sessionId}`, `/lop-hoc/${session.classId}`] },
        };

    await writeAudit({
      userId: user.id,
      action: completing ? "COMPLETE_SESSION" : "UPDATE",
      entity: completing ? "LessonSession" : "Attendance",
      entityId: sessionId,
      ...(completing ? { oldValue: { status: "SCHEDULED" } } : {}),
      newValue: {
        className: session.class.name,
        date: formatDateUtc(session.date),
        time: `${session.startTime}–${session.endTime}`,
        present,
        total: rows.length,
        isOff,
        ...(academicMode
          ? { testColumns: nextTests.length, testScores: nextTests.reduce((sum, column) => sum + Object.keys(column.scores).length, 0) }
          : {}),
        ...(completing ? { status: "COMPLETED" } : {}),
      },
      undo,
    });
    if (testColumnsChanged) {
      await writeAudit({
        userId: user.id,
        action: "UPDATE",
        entity: "LessonSessionTests",
        entityId: sessionId,
        oldValue: { columns: previousTests.length },
        newValue: {
          columns: nextTests.length,
          scores: nextTests.reduce((sum, column) => sum + Object.keys(column.scores).length, 0),
        },
        undo: undoUpdate(
          "lessonSession",
          sessionId,
          { testColumns: session.testColumns },
          ["testColumns"],
          {
            label: "Hoàn tác? Các cột và điểm kiểm tra sẽ trở về dữ liệu trước lần lưu này.",
            after: { revalidate: [`/lich-day/${sessionId}`, `/lop-hoc/${session.classId}`] },
          },
        ),
      });
    }

    if (isOff) {
      return "Đã ghi nhận buổi nghỉ học. Cả lớp nghỉ, không trừ số buổi còn lại.";
    }
    const tuition =
      completing && session.class.type === "NORMAL"
        ? " Học viên đã được trừ 1 buổi trong gói học phí."
        : "";
    const testMessage = academicMode
      ? ` Đã lưu ${nextTests.length} cột kiểm tra; có thể quay lại nhập hoặc sửa điểm sau.`
      : "";
    return `Đã lưu điểm danh: ${present}/${rows.length} có mặt.${tuition}${testMessage}`;
  });

  refreshSession(sessionId, classId);
  return result;
}

// ------------------------------------------------------------------
// Nhận xét học viên — giáo viên (PRD §11)
// ------------------------------------------------------------------

function readTestColumns(fd: FormData): SessionTestColumn[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("testColumns") ?? "[]"));
  } catch {
    fail("Cột kiểm tra không hợp lệ.");
  }
  const columns = parseTestColumns(raw);
  for (const column of columns) {
    for (const score of Object.values(column.scores)) {
      if (score < 0 || score > 100) fail(`Điểm "${column.name}" phải từ 0 đến 100.`);
    }
  }
  return columns;
}

function testsEqual(a: SessionTestColumn[], b: SessionTestColumn[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lưu nhận xét của giáo viên cho từng học viên trong buổi.
 * Mỗi học viên gửi lên `note_<studentId>`, tối đa 300 ký tự.
 *
 * Chỉ ghi đè vào bản ghi điểm danh **đã có**: quản trị viên mới là người điểm danh,
 * chưa điểm danh thì chưa biết học viên có mặt hay không. Nếu tạo mới ở đây thì cột
 * `status` sẽ lấy mặc định `PRESENT` và vô tình đánh dấu cả lớp có mặt.
 */
export async function saveAttendanceNotes(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("attendance.comment");
  const sessionId = requiredId(fd, "sessionId", "buổi học");

  // Giữ lại để revalidate tab Syllabus của lớp — ở đó cũng nhận xét được.
  let classId: string | undefined;

  const result = await runAction(async () => {
    const session = await loadEditableSession(user, sessionId);
    classId = session.classId;

    const marked = await prisma.attendance.findMany({
      where: { sessionId },
      select: {
        studentId: true,
        status: true,
        note: true,
        lessonRating: true,
        homeworkRating: true,
      },
    });
    const homeworkEnabled = String(fd.get("homeworkEnabled") ?? "") === "1";
    if (marked.length === 0) {
      if (homeworkEnabled !== session.hasHomework) {
        await prisma.lessonSession.update({
          where: { id: sessionId },
          data: { hasHomework: homeworkEnabled },
        });
      }
      fail("Chưa điểm danh buổi này nên chưa ghi nhận xét được.");
    }

    const nextTests = readTestColumns(fd);
    const prevTests = parseTestColumns(session.testColumns);

    // Chỉ ghi lại dòng thực sự đổi, tránh update cả lớp mỗi lần bấm lưu.
    const changed: {
      studentId: string;
      note: string | null;
      lessonRating: LessonRating | null;
      homeworkRating: HomeworkRating | null;
    }[] = [];
    let missingRatings = 0;
    for (const row of marked) {
      const note = optionalStr(fd, `note_${row.studentId}`, 300);
      const lessonRatingRaw = String(fd.get(`lessonRating_${row.studentId}`) ?? "");
      const homeworkRatingRaw = String(fd.get(`homeworkRating_${row.studentId}`) ?? "");
      const lessonRating = LESSON_RATINGS.includes(lessonRatingRaw as LessonRating)
        ? (lessonRatingRaw as LessonRating)
        : null;
      const homeworkRating =
        homeworkEnabled && HOMEWORK_RATINGS.includes(homeworkRatingRaw as HomeworkRating)
          ? (homeworkRatingRaw as HomeworkRating)
          : null;
      if (row.status === "PRESENT" && (!lessonRating || (homeworkEnabled && !homeworkRating))) {
        missingRatings += 1;
      }
      if (note !== row.note || lessonRating !== row.lessonRating || homeworkRating !== row.homeworkRating) {
        changed.push({ studentId: row.studentId, note, lessonRating, homeworkRating });
      }
    }
    if (missingRatings > 0) {
      fail(
        homeworkEnabled
          ? `Còn ${missingRatings} học viên có mặt chưa đủ đánh giá tiết học và bài tập về nhà.`
          : `Còn ${missingRatings} học viên có mặt chưa đánh giá tiết học.`,
      );
    }
    const testsChanged = !testsEqual(prevTests, nextTests);
    if (changed.length === 0 && !testsChanged && homeworkEnabled === session.hasHomework) {
      return "Nhận xét không có gì thay đổi.";
    }

    await prisma.$transaction(async (tx) => {
      if (changed.length > 0) {
        await Promise.all(
          changed.map((row) =>
            tx.attendance.update({
              where: { sessionId_studentId: { sessionId, studentId: row.studentId } },
              data: {
                note: row.note,
                lessonRating: row.lessonRating,
                homeworkRating: row.homeworkRating,
              },
            }),
          ),
        );
      }
      if (testsChanged || homeworkEnabled !== session.hasHomework) {
        await tx.lessonSession.update({
          where: { id: sessionId },
          data: {
            hasHomework: homeworkEnabled,
            ...(testsChanged ? { testColumns: nextTests as Prisma.InputJsonValue } : {}),
          },
        });
      }
    });

    if (changed.length > 0) {
      await completeFirstMonthCareForStudents(changed.map((row) => row.studentId));
    }

    // Không ghi nội dung nhận xét vào nhật ký, chỉ ghi số lượng.
    // Nội dung cũ vẫn phải cất trong `undo` thì mới trả lại được khi hoàn tác.
    const noteBefore = new Map(marked.map((row) => [row.studentId, row.note]));
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Attendance",
      entityId: sessionId,
      newValue: { commented: changed.length, total: marked.length },
      undo: {
        kind: "attendanceNotes",
        sessionId,
        rows: changed.map((row) => ({
          studentId: row.studentId,
          note: noteBefore.get(row.studentId) ?? null,
          lessonRating: marked.find((item) => item.studentId === row.studentId)?.lessonRating ?? null,
          homeworkRating: marked.find((item) => item.studentId === row.studentId)?.homeworkRating ?? null,
        })),
        testColumns: testsChanged ? prevTests : undefined,
        label: "Hoàn tác lần lưu nhận xét này? Nhận xét của các học viên vừa sửa sẽ trở về nội dung cũ.",
        after: { revalidate: [`/gv/buoi-hoc/${sessionId}`, `/lop-hoc/${classId}`] },
      },
    });
    if (changed.length > 0) {
      return `Đã lưu nhận xét cho ${changed.length}/${marked.length} học viên.`;
    }
    if (testsChanged) return "Đã lưu cột kiểm tra.";
    return "Đã lưu trạng thái BTVN.";
  });

  refreshSession(sessionId, classId);
  return result;
}

// ------------------------------------------------------------------
// Báo cáo buổi học (PRD §12)
// ------------------------------------------------------------------

export async function saveReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("report.submit");
  const sessionId = requiredId(fd, "sessionId", "buổi học");

  const result = await runAction(async () => {
    await loadEditableSession(user, sessionId);

    const data = {
      classSituation: optionalStr(fd, "classSituation", 4000),
      studentsToNote: optionalStr(fd, "studentsToNote", 4000),
      homework: optionalStr(fd, "homework", 4000),
      note: optionalStr(fd, "note", 4000),
    };

    const before = await prisma.lessonReport.findUnique({
      where: { sessionId },
      select: {
        id: true,
        taughtContent: true,
        classSituation: true,
        studentsToNote: true,
        homework: true,
        note: true,
      },
    });

    const report = await prisma.lessonReport.upsert({
      where: { sessionId },
      create: { sessionId, ...data },
      update: data,
      select: { id: true },
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "LessonReport",
      entityId: sessionId,
      newValue: data,
      // Lần đầu viết báo cáo thì hoàn tác là xoá hẳn; sửa lại thì trả về nội dung cũ.
      undo: before
        ? {
            kind: "restoreFields",
            model: "lessonReport",
            id: before.id,
            data: {
              taughtContent: before.taughtContent,
              classSituation: before.classSituation,
              studentsToNote: before.studentsToNote,
              homework: before.homework,
              note: before.note,
            },
            label: "Hoàn tác lần sửa báo cáo này? Nội dung báo cáo sẽ trở về bản trước đó.",
            after: { revalidate: [`/gv/buoi-hoc/${sessionId}`] },
          }
        : {
            kind: "deleteCreated",
            rows: [{ model: "lessonReport", id: report.id }],
            label: "Hoàn tác? Báo cáo buổi học này sẽ bị xoá.",
            after: { revalidate: [`/gv/buoi-hoc/${sessionId}`] },
          },
    });
    return "Đã lưu báo cáo buổi học.";
  });

  refreshSession(sessionId);
  return result;
}

/**
 * Một nút trên tab điểm danh của giáo viên: lưu nhận xét (nếu học vụ đã điểm danh)
 * và báo cáo buổi học cùng lúc.
 */
export async function saveTeacherReport(prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("report.submit");

  const notes = await saveAttendanceNotes(prev, fd);
  const skipNotes = notes.error === "Chưa điểm danh buổi này nên chưa ghi nhận xét được.";
  if (notes.error && !skipNotes) return notes;

  const report = await saveReport(prev, fd);
  if (report.error) return report;

  if (skipNotes) {
    return { ok: true, message: report.message ?? "Đã lưu báo cáo buổi học." };
  }
  return { ok: true, message: "Đã lưu nhận xét và báo cáo buổi học." };
}
