"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  captureRow,
  captureRows,
  diff,
  undoCreate,
  undoDelete,
  undoUpdate,
  undoUpdateAlso,
  writeAudit,
} from "@/lib/audit";
import { nextStudentCode } from "@/lib/code";
import { applyManualStudentStatus } from "@/lib/enrollment";
import { importStudentsFromExcel } from "@/lib/student-excel";
import { advanceBalance, applyStudentAdvanceToAll, revertStudentAdvance } from "@/lib/tuition";
import { formatCurrency, startOfDay } from "@/lib/utils";
import {
  bool,
  fail,
  money,
  optionalDate,
  optionalStr,
  requiredEmail,
  requiredId,
  requiredInt,
  requiredPassword,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";
import type { StudentStatus } from "@/generated/prisma/enums";

/**
 * Server Action cho module Học viên (PRD §6).
 *
 * Trạng thái học viên mặc định do hệ thống suy ra từ các lần ghi danh
 * (`syncStudentStatus` trong `src/lib/enrollment.ts`). Hồ sơ cho phép chọn tay để xử lý
 * trường hợp ngoại lệ, nhưng lần thay đổi ghi danh kế tiếp sẽ tính lại theo ghi danh.
 */

const STUDENT_STATUSES: StudentStatus[] = ["UNASSIGNED", "STUDYING", "RESERVED", "DROPPED"];
const BCRYPT_COST = 10;

function refreshList() {
  revalidatePath("/hoc-vien");
}

function readStudent(fd: FormData) {
  return {
    fullName: requiredStr(fd, "fullName", "Họ và tên", 150),
    dateOfBirth: optionalDate(fd, "dateOfBirth", "Ngày sinh"),
    parentName: optionalStr(fd, "parentName", 150),
    parentPhone: optionalStr(fd, "parentPhone", 50),
    address: optionalStr(fd, "address", 300),
    note: optionalStr(fd, "note", 1000),
  };
}

/** Trạng thái chỉ có ở form hồ sơ — form thêm mới bỏ trống để hệ thống tự đặt. */
function readStatus(fd: FormData) {
  const raw = String(fd.get("status") ?? "").trim();
  if (!raw) return null;
  if (!(STUDENT_STATUSES as string[]).includes(raw)) fail("Trạng thái học viên không hợp lệ.");
  return raw as StudentStatus;
}

export async function createStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("student.manage");

  return runAction(async () => {
    const code = optionalStr(fd, "code", 30) ?? (await nextStudentCode());
    const data = { ...readStudent(fd), code };

    const created = await prisma.student.create({ data });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Student",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "student", id: created.id },
        { label: "Hoàn tác? Học viên vừa thêm sẽ bị xoá." },
      ),
    });
    return `Đã thêm học viên ${created.fullName} (mã ${created.code}).`;
  }).finally(refreshList);
}

/** Nhập hàng loạt từ file mẫu Excel. Có lỗi thì không ghi dòng nào. */
export async function importStudents(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("student.manage");

  return runAction(async () => {
    const file = fd.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file) || !(file as File).size) {
      fail("Vui lòng chọn file Excel.");
    }
    return importStudentsFromExcel(prisma, {
      file: file as File,
      userId: user.id,
    });
  }).finally(() => {
    refreshList();
    revalidatePath("/lop-hoc");
    revalidatePath("/hoc-phi");
    revalidatePath("/tong-quan");
  });
}

export async function updateStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("student.manage");
  const id = requiredId(fd, "id", "học viên");
  const classIds = new Set<string>();

  return runAction(async () => {
    const status = readStatus(fd);
    const data = {
      ...readStudent(fd),
      code: requiredStr(fd, "code", "Mã học viên", 30),
      ...(status ? { status } : {}),
    };

    const current = await prisma.student.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!current) fail("Không tìm thấy học viên.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    const nameChanged = current.fullName !== data.fullName;
    const statusChanged = Boolean(status && status !== current.status);
    if (!changes.hasChanges && !statusChanged && !(nameChanged && current.userId)) {
      return "Không có thay đổi nào.";
    }

    let derivedStatus = current.status;
    const enrollmentBefore: { id: string; status: string; leftAt: Date | null; classId: string }[] =
      [];

    await prisma.$transaction(async (tx) => {
      if (statusChanged && status) {
        const applied = await applyManualStudentStatus(tx, id, status);
        derivedStatus = applied.derived;
        enrollmentBefore.push(...applied.open);
        for (const row of applied.open) classIds.add(row.classId);

        if (status === "STUDYING" && derivedStatus !== "STUDYING") {
          fail("Học viên không còn lớp đang học hoặc bảo lưu. Hãy xếp lớp lại.");
        }
        if (status === "RESERVED" && derivedStatus !== "RESERVED") {
          fail("Chỉ bảo lưu được khi học viên đang có lớp.");
        }
      }

      const nextData = {
        ...data,
        ...(statusChanged ? { status: derivedStatus } : {}),
      };
      const nextChanges = diff(current as unknown as Record<string, unknown>, nextData);
      if (nextChanges.hasChanges) {
        await tx.student.update({ where: { id }, data: nextData });
      }
      if (current.userId && nameChanged) {
        await tx.user.update({
          where: { id: current.userId },
          data: { fullName: data.fullName },
        });
      }
    });

    const stored = {
      ...changes.newValue,
      ...(statusChanged ? { status: derivedStatus } : {}),
    };
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Student",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: stored,
      undo: undoUpdate(
        "student",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(stored),
        {
          label: "Hoàn tác? Hồ sơ học viên sẽ trở về các giá trị trước đó.",
          also: [
            ...(current.userId && nameChanged
              ? [
                  undoUpdateAlso(
                    "user",
                    current.userId,
                    current.user as unknown as Record<string, unknown>,
                    ["fullName"],
                  ),
                ]
              : []),
            ...enrollmentBefore.map((row) =>
              undoUpdateAlso("enrollment", row.id, row, ["status", "leftAt"]),
            ),
          ],
          after: {
            syncStudentIds: [id],
            revalidate: [`/hoc-vien/${id}`, ...[...classIds].map((classId) => `/lop-hoc/${classId}`)],
          },
        },
      ),
    });
    return statusChanged && derivedStatus === "DROPPED" && status === "UNASSIGNED"
      ? "Đã cho nghỉ học. Học viên từng ghi danh nên trạng thái là Nghỉ học, không phải Chưa xếp lớp."
      : "Đã lưu hồ sơ học viên.";
  }).finally(() => {
    refreshList();
    revalidatePath(`/hoc-vien/${id}`);
    revalidatePath("/lop-hoc");
    for (const classId of classIds) revalidatePath(`/lop-hoc/${classId}`);
  });
}

/**
 * Xoá hẳn hồ sơ học viên. Cơ sở dữ liệu xoá theo (onDelete: Cascade) toàn bộ
 * ghi danh, hồ sơ học phí, phiếu thu, tạm ứng và lượt điểm danh của học viên này.
 * Không có bước khôi phục — số liệu đã mất thì báo cáo doanh thu đổi theo, nên
 * hộp thoại xác nhận ở danh sách phải nói rõ sẽ mất những gì.
 */
export async function deleteStudent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("student.manage");
  const id = requiredId(fd, "id", "học viên");

  return runAction(async () => {
    const current = await prisma.student.findUnique({
      where: { id },
      include: {
        _count: {
          select: { enrollments: true, attendances: true, tuitions: true },
        },
      },
    });
    if (!current) fail("Không tìm thấy học viên.");

    // Ghi lại quy mô dữ liệu mất theo trước khi xoá — audit log là dấu vết duy nhất còn lại.
    const removed = {
      enrollments: current._count.enrollments,
      attendances: current._count.attendances,
      tuitions: current._count.tuitions,
    };
    const loginUserId = current.userId;

    // Chụp trọn cây dữ liệu bị cascade, xếp cha trước con để khôi phục lại đúng thứ tự FK.
    const tuitionIds = (
      await prisma.studentTuition.findMany({ where: { studentId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshots = [
      ...(loginUserId ? await captureRows(prisma, "user", { id: loginUserId }) : []),
      ...(await captureRows(prisma, "student", { id })),
      ...(await captureRows(prisma, "enrollment", { studentId: id })),
      ...(await captureRows(prisma, "studentTuition", { studentId: id })),
      ...(await captureRows(prisma, "tuitionEntry", { tuitionId: { in: tuitionIds } })),
      ...(await captureRows(prisma, "tuitionPayment", { tuitionId: { in: tuitionIds } })),
      ...(await captureRows(prisma, "attendance", { studentId: id })),
      ...(await captureRows(prisma, "studentAdvance", { studentId: id })),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.student.delete({ where: { id } });
      if (loginUserId) await tx.user.delete({ where: { id: loginUserId } });
    });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Student",
      entityId: id,
      oldValue: { code: current.code, fullName: current.fullName, ...removed },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Học viên ${current.fullName} sẽ được khôi phục cùng ${removed.enrollments} lần ghi danh, ${removed.tuitions} hồ sơ học phí và ${removed.attendances} lượt điểm danh.`,
        after: { syncStudentIds: [id], revalidate: [`/hoc-vien/${id}`] },
      }),
    });
    return `Đã xoá học viên ${current.fullName} cùng ${removed.enrollments} lần ghi danh, ${removed.tuitions} hồ sơ học phí và ${removed.attendances} lượt điểm danh.`;
  }).finally(refreshList);
}

/**
 * Tạo hoặc cập nhật tài khoản đăng nhập của học viên. Email là tên đăng nhập,
 * dùng chung bảng `users` với giáo viên (role STUDENT).
 */
export async function saveStudentAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePermission("student.manage");
  const id = requiredId(fd, "id", "học viên");

  return runAction(async () => {
    const email = requiredEmail(fd, "email", "Email đăng nhập");
    const current = await prisma.student.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!current) fail("Không tìm thấy học viên.");

    if (!current.user) {
      const password = requiredPassword(fd, "password", "Mật khẩu");
      const created = await prisma.$transaction(async (tx) => {
        const account = await tx.user.create({
          data: {
            email,
            fullName: current.fullName,
            role: "STUDENT",
            passwordHash: await bcrypt.hash(password, BCRYPT_COST),
          },
        });
        await tx.student.update({
          where: { id },
          data: { userId: account.id, email },
        });
        return account;
      });
      await writeAudit({
        userId: actor.id,
        action: "UPDATE",
        entity: "Student",
        entityId: id,
        newValue: { loginEmail: created.email },
      });
      return `Đã tạo tài khoản đăng nhập ${email} cho ${current.fullName}.`;
    }

    const account = {
      email,
      ...(fd.has("isActive") ? { isActive: bool(fd, "isActive") } : {}),
    };
    const changed = diff(current.user as unknown as Record<string, unknown>, account);
    if (!changed.hasChanges && current.email === email) return "Không có thay đổi nào.";

    await prisma.$transaction(async (tx) => {
      if (changed.hasChanges) {
        await tx.user.update({
          where: { id: current.user!.id },
          data: account,
        });
      }
      if (current.email !== email) {
        await tx.student.update({ where: { id }, data: { email } });
      }
    });
    await writeAudit({
      userId: actor.id,
      action: "UPDATE",
      entity: "Student",
      entityId: id,
      oldValue: changed.oldValue,
      newValue: changed.newValue,
    });
    return "Đã lưu tài khoản đăng nhập.";
  }).finally(() => {
    refreshList();
    revalidatePath(`/hoc-vien/${id}`);
  });
}

export async function resetStudentPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePermission("student.manage");
  const id = requiredId(fd, "id", "học viên");

  return runAction(async () => {
    const password = requiredPassword(fd, "password", "Mật khẩu mới");
    const current = await prisma.student.findUnique({
      where: { id },
      select: { fullName: true, userId: true },
    });
    if (!current) fail("Không tìm thấy học viên.");
    if (!current.userId) fail("Học viên chưa có tài khoản đăng nhập.");

    await prisma.user.update({
      where: { id: current.userId },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST) },
    });
    await writeAudit({
      userId: actor.id,
      action: "UPDATE",
      entity: "Student",
      entityId: id,
      newValue: { passwordReset: true },
    });
    return `Đã đặt lại mật khẩu cho ${current.fullName}.`;
  }).finally(() => revalidatePath(`/hoc-vien/${id}`));
}

/**
 * Đặt số buổi còn lại của một lần ghi danh lớp thường.
 *
 * Lớp thường không quản lý bằng tiền: phụ huynh đóng gói ở ngoài rồi đổi ra số buổi,
 * học buổi nào trừ buổi đó. Ở đây chỉ ghi số buổi học viên còn được học.
 *
 * Số buổi đã học giữ nguyên, chỉ dời tổng số buổi của gói:
 * `totalSessions = usedSessions + số buổi còn lại`, nên `remainingSessions()` trả về
 * đúng con số vừa nhập.
 *
 * Chưa có hồ sơ học phí thì tạo mới, không gắn gói. Số buổi đã học đếm lại từ các buổi
 * lớp đã dạy kể từ ngày vào lớp — giống `createTuitionForEnrollment`.
 *
 * `extraSessions` để nguyên: đó là số buổi vượt gói đã phát sinh phí trước đây, nạp
 * thêm buổi mới không xoá được khoản đã ghi.
 */
export async function setRemainingSessions(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const enrollmentId = requiredId(fd, "enrollmentId", "lần ghi danh");
  let studentId = "";
  let classId = "";

  return runAction(async () => {
    const remaining = requiredInt(fd, "remaining", "Số buổi còn lại", {
      min: -999,
      max: 999,
    });

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        classId: true,
        joinedAt: true,
        class: { select: { type: true, name: true } },
        tuition: {
          select: { id: true, usedSessions: true, totalSessions: true },
        },
      },
    });
    if (!enrollment) fail("Không tìm thấy lần ghi danh.");
    if (enrollment.class.type !== "NORMAL") {
      fail("Chỉ lớp thường mới quản lý theo số buổi còn lại.");
    }
    studentId = enrollment.studentId;
    classId = enrollment.classId;

    const before = enrollment.tuition
      ? (enrollment.tuition.totalSessions ?? 0) - enrollment.tuition.usedSessions
      : null;

    const undoLabel = "Hoàn tác? Số buổi còn lại sẽ trở về như trước.";
    const undoAfter = {
      revalidate: [`/hoc-vien/${enrollment.studentId}`, `/lop-hoc/${enrollment.classId}`],
    };
    let undo;

    if (enrollment.tuition) {
      await prisma.studentTuition.update({
        where: { id: enrollment.tuition.id },
        data: { totalSessions: enrollment.tuition.usedSessions + remaining },
      });
      undo = undoUpdate(
        "studentTuition",
        enrollment.tuition.id,
        enrollment.tuition,
        ["totalSessions"],
        { label: undoLabel, after: undoAfter },
      );
    } else {
      const used = await prisma.lessonSession.count({
        where: {
          classId: enrollment.classId,
          status: "COMPLETED",
          date: { gte: startOfDay(enrollment.joinedAt) },
        },
      });
      const created = await prisma.studentTuition.create({
        data: {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          type: "NORMAL",
          totalSessions: used + remaining,
          usedSessions: used,
        },
      });
      undo = undoCreate(
        { model: "studentTuition", id: created.id },
        {
          label: "Hoàn tác? Hồ sơ học phí vừa tạo cho lần ghi danh này sẽ bị xoá.",
          after: undoAfter,
        },
      );
    }

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "StudentTuition",
      entityId: enrollmentId,
      ...(before === null ? {} : { oldValue: { remaining: before } }),
      newValue: { remaining },
      undo,
    });
    return `Lớp ${enrollment.class.name} còn lại ${remaining} buổi.`;
  }).finally(() => {
    if (!studentId) return;
    refreshList();
    revalidatePath(`/hoc-vien/${studentId}`);
    revalidatePath("/hoc-phi");
    revalidatePath("/tong-quan");
    revalidatePath(`/lop-hoc/${classId}`);
  });
}

/**
 * Thu học phí trên hồ sơ học viên — chỉ dùng cho lớp IELTS (học trọn khoá theo tiền).
 *
 * Tiền vào `student_advances` rồi trừ vào hồ sơ còn nợ (cũ trước mới sau). Chưa xếp lớp
 * thì nằm lại làm số dư, xếp lớp xong tự trừ (`createTuitionForEnrollment`).
 */
export async function collectAdvance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const studentId = requiredId(fd, "studentId", "học viên");

  return runAction(async () => {
    const amount = money(fd, "amount", "Số tiền");
    if (amount === "0") fail("Số tiền phải lớn hơn 0.");

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) fail("Không tìm thấy học viên.");

    const { advance, applied } = await prisma.$transaction(async (tx) => {
      const created = await tx.studentAdvance.create({
        data: { studentId, amount },
      });
      const used = await applyStudentAdvanceToAll(tx, studentId);
      return { advance: created, applied: used };
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "StudentAdvance",
      entityId: advance.id,
      newValue: { studentId, amount: advance.amount.toString() },
      undo: {
        kind: "studentAdvance",
        op: "delete",
        studentId,
        advanceId: advance.id,
        label: "Hoàn tác? Khoản thu này bị xoá, phần đã trừ vào học phí được hoàn lại.",
        after: { revalidate: [`/hoc-vien/${studentId}`] },
      },
    });

    const balance = advanceBalance(
      await prisma.studentAdvance.findMany({
        where: { studentId },
        select: { amount: true, usedAmount: true },
      }),
    );

    const appliedAmount = Number(applied);
    const parts = [`Đã thu ${formatCurrency(amount)}`];
    if (appliedAmount > 0) parts.push(`trừ ${formatCurrency(appliedAmount)} vào học phí`);
    parts.push(balance > 0 ? `số dư còn ${formatCurrency(balance)}` : "không còn số dư");
    return `${parts.join(", ")}.`;
  }).finally(() => {
    refreshList();
    revalidatePath(`/hoc-vien/${studentId}`);
    revalidatePath("/hoc-phi");
    revalidatePath("/hoc-phi/bao-cao");
    revalidatePath("/tong-quan");
  });
}

/** Xoá một lần thu nhầm trên hồ sơ — hoàn lại phần đã trừ vào học phí nếu có. */
export async function deleteAdvance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const id = requiredId(fd, "id", "khoản thu");
  let studentId = "";
  let classIds: string[] = [];

  return runAction(async () => {
    const advance = await prisma.studentAdvance.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        studentId: true,
        student: { select: { enrollments: { select: { classId: true } } } },
      },
    });
    if (!advance) fail("Không tìm thấy khoản thu.");
    studentId = advance.studentId;
    classIds = [...new Set(advance.student.enrollments.map((item) => item.classId))];

    const snapshot = await captureRow(prisma, "studentAdvance", id);

    await prisma.$transaction((tx) => revertStudentAdvance(tx, id));

    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "StudentAdvance",
      entityId: id,
      oldValue: { studentId, amount: advance.amount.toString() },
      undo: snapshot
        ? {
            kind: "studentAdvance",
            op: "restore",
            studentId,
            advanceId: id,
            data: snapshot.data,
            label: "Hoàn tác? Khoản thu được tạo lại và trừ vào các hồ sơ học phí còn nợ.",
            after: { revalidate: [`/hoc-vien/${studentId}`] },
          }
        : undefined,
    });
    return `Đã xoá khoản thu ${formatCurrency(advance.amount)}.`;
  }).finally(() => {
    if (!studentId) return;
    refreshList();
    revalidatePath(`/hoc-vien/${studentId}`);
    revalidatePath("/hoc-phi");
    revalidatePath("/hoc-phi/bao-cao");
    revalidatePath("/tong-quan");
    for (const classId of classIds) revalidatePath(`/lop-hoc/${classId}`);
  });
}
