"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

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
import { nextTeacherCode } from "@/lib/code";
import {
  bool,
  fail,
  optionalStr,
  requiredEmail,
  requiredId,
  requiredPassword,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";

/**
 * Server Action cho module Giáo viên (PRD §5.3, §23).
 *
 * Mỗi giáo viên gồm 2 bản ghi đi kèm nhau: `User` (tài khoản đăng nhập, role TEACHER)
 * và `Teacher` (mã giáo viên, ghi chú). Luôn tạo/xoá trong cùng transaction để không
 * bao giờ tồn tại tài khoản mồ côi.
 *
 * Trạng thái "Đang hoạt động / Tạm dừng" chính là `User.isActive`, sửa ngay trong form hồ sơ.
 *
 * Không có API đổi mật khẩu "biết mật khẩu cũ" ở đây — Admin chỉ được đặt lại
 * mật khẩu mới, không đọc được mật khẩu hiện tại (chỉ lưu hash).
 */

const BCRYPT_COST = 10;

function refresh(id?: string) {
  revalidatePath("/giao-vien");
  if (id) revalidatePath(`/giao-vien/${id}`);
}

export async function createTeacher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("teacher.manage");

  return runAction(async () => {
    const email = requiredEmail(fd, "email", "Email đăng nhập");
    const fullName = requiredStr(fd, "fullName", "Họ và tên", 150);
    const password = requiredPassword(fd, "password", "Mật khẩu");
    const phone = optionalStr(fd, "phone", 50);
    const note = optionalStr(fd, "note", 1000);
    const code = optionalStr(fd, "code", 30) ?? (await nextTeacherCode());

    const created = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          email,
          fullName,
          phone,
          role: "TEACHER",
          passwordHash: await bcrypt.hash(password, BCRYPT_COST),
        },
      });
      return tx.teacher.create({
        data: { userId: account.id, code, note },
      });
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Teacher",
      entityId: created.id,
      newValue: { code, email, fullName, phone },
      // Xoá tài khoản là mất luôn hồ sơ giáo viên (cascade).
      undo: undoCreate(
        { model: "user", id: created.userId },
        { label: `Hoàn tác? Giáo viên ${fullName} và tài khoản đăng nhập vừa tạo sẽ bị xoá.` },
      ),
    });
    return `Đã tạo giáo viên ${fullName} (mã ${code}) — đăng nhập bằng ${email}.`;
  }).finally(() => refresh());
}

export async function updateTeacher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("teacher.manage");
  const id = requiredId(fd, "id", "giáo viên");

  return runAction(async () => {
    const current = await prisma.teacher.findUnique({ where: { id }, include: { user: true } });
    if (!current) fail("Không tìm thấy giáo viên.");

    const account = {
      email: requiredEmail(fd, "email", "Email đăng nhập"),
      fullName: requiredStr(fd, "fullName", "Họ và tên", 150),
      phone: optionalStr(fd, "phone", 50),
      // Form nào không gửi ô Trạng thái thì giữ nguyên trạng thái hiện tại.
      ...(fd.has("isActive") ? { isActive: bool(fd, "isActive") } : {}),
    };
    const profile = {
      code: requiredStr(fd, "code", "Mã giáo viên", 30),
      note: optionalStr(fd, "note", 1000),
    };

    const changedAccount = diff(current.user as unknown as Record<string, unknown>, account);
    const changedProfile = diff(current as unknown as Record<string, unknown>, profile);
    if (!changedAccount.hasChanges && !changedProfile.hasChanges) return "Không có thay đổi nào.";

    await prisma.$transaction(async (tx) => {
      if (changedAccount.hasChanges) {
        await tx.user.update({ where: { id: current.userId }, data: account });
      }
      if (changedProfile.hasChanges) {
        await tx.teacher.update({ where: { id }, data: profile });
      }
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Teacher",
      entityId: id,
      oldValue: { ...changedAccount.oldValue, ...changedProfile.oldValue },
      newValue: { ...changedAccount.newValue, ...changedProfile.newValue },
      undo: undoUpdate(
        "teacher",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changedProfile.newValue),
        {
          label: "Hoàn tác? Hồ sơ giáo viên và tài khoản đăng nhập trở về giá trị trước đó.",
          also: changedAccount.hasChanges
            ? [
                undoUpdateAlso(
                  "user",
                  current.userId,
                  current.user as unknown as Record<string, unknown>,
                  Object.keys(changedAccount.newValue),
                ),
              ]
            : [],
          after: { revalidate: [`/giao-vien/${id}`] },
        },
      ),
    });
    return "Đã lưu hồ sơ giáo viên.";
  }).finally(() => refresh(id));
}

export async function resetTeacherPassword(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("teacher.manage");
  const id = requiredId(fd, "id", "giáo viên");

  return runAction(async () => {
    const password = requiredPassword(fd, "password", "Mật khẩu mới");
    const current = await prisma.teacher.findUnique({
      where: { id },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    if (!current) fail("Không tìm thấy giáo viên.");

    await prisma.user.update({
      where: { id: current.userId },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST) },
    });
    // Không ghi mật khẩu (kể cả hash) vào audit log.
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Teacher",
      entityId: id,
      newValue: { passwordReset: true },
    });
    return `Đã đặt lại mật khẩu cho ${current.user.fullName}.`;
  }).finally(() => refresh(id));
}

/**
 * Xoá hẳn giáo viên cùng tài khoản đăng nhập. Lớp và buổi học không mất, chỉ
 * chuyển về "chưa phân công" (`teacherId` là khoá ngoại tuỳ chọn nên được set null).
 * Nhật ký hệ thống do người này tạo cũng giữ nguyên, chỉ mất tên người thao tác.
 */
export async function deleteTeacher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("teacher.manage");
  const id = requiredId(fd, "id", "giáo viên");

  return runAction(async () => {
    const current = await prisma.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true } },
        _count: { select: { classes: true, lessonSessions: true } },
      },
    });
    if (!current) fail("Không tìm thấy giáo viên.");

    const released = {
      classes: current._count.classes,
      lessonSessions: current._count.lessonSessions,
    };

    // Lớp và buổi học chỉ bị gỡ `teacherId`, ghi lại để hoàn tác gắn giáo viên trở lại.
    const classIds = (
      await prisma.class.findMany({ where: { teacherId: id }, select: { id: true } })
    ).map((row) => row.id);
    const sessionIds = (
      await prisma.lessonSession.findMany({ where: { teacherId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshots = [
      ...(await captureRows(prisma, "user", { id: current.user.id })),
      ...(await captureRows(prisma, "teacher", { id })),
    ];

    // Xoá User kéo theo Teacher (onDelete: Cascade).
    await prisma.user.delete({ where: { id: current.user.id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Teacher",
      entityId: id,
      oldValue: { code: current.code, fullName: current.user.fullName, ...released },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Giáo viên ${current.user.fullName} được khôi phục và nhận lại ${released.classes} lớp, ${released.lessonSessions} buổi học.`,
        relink: [
          ...(classIds.length ? [{ model: "class" as const, ids: classIds, data: { teacherId: id } }] : []),
          ...(sessionIds.length
            ? [{ model: "lessonSession" as const, ids: sessionIds, data: { teacherId: id } }]
            : []),
        ],
        after: { revalidate: [`/giao-vien/${id}`] },
      }),
    });
    return `Đã xoá giáo viên ${current.user.fullName}. ${released.classes} lớp và ${released.lessonSessions} buổi học chuyển sang chưa phân công.`;
  }).finally(() => refresh());
}
