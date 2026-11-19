"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { captureRows, diff, undoCreate, undoDelete, undoUpdate, writeAudit } from "@/lib/audit";
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

const BCRYPT_COST = 10;

function refresh() {
  revalidatePath("/ke-toan-vien");
}

async function findAccountant(id: string) {
  const found = await prisma.user.findFirst({ where: { id, role: "ACCOUNTANT" } });
  if (!found) fail("Không tìm thấy tài khoản kế toán.");
  return found;
}

export async function createAccountant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("accountant.manage");

  return runAction(async () => {
    const email = requiredEmail(fd, "email", "Email đăng nhập");
    const fullName = requiredStr(fd, "fullName", "Họ và tên", 150);
    const password = requiredPassword(fd, "password", "Mật khẩu");
    const phone = optionalStr(fd, "phone", 50);

    const created = await prisma.user.create({
      data: {
        email,
        fullName,
        phone,
        role: "ACCOUNTANT",
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      },
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: created.id,
      newValue: { email, fullName, phone, role: "ACCOUNTANT" },
      undo: undoCreate(
        { model: "user", id: created.id },
        { label: `Hoàn tác? Tài khoản kế toán ${fullName} vừa tạo sẽ bị xoá.` },
      ),
    });
    return `Đã tạo tài khoản kế toán ${fullName} — đăng nhập bằng ${email}.`;
  }).finally(() => refresh());
}

export async function updateAccountant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("accountant.manage");
  const id = requiredId(fd, "id", "tài khoản kế toán");

  return runAction(async () => {
    const current = await findAccountant(id);

    const data = {
      email: requiredEmail(fd, "email", "Email đăng nhập"),
      fullName: requiredStr(fd, "fullName", "Họ và tên", 150),
      phone: optionalStr(fd, "phone", 50),
      isActive: bool(fd, "isActive"),
    };

    if (id === user.id && !data.isActive) {
      fail("Không thể tạm dừng tài khoản bạn đang đăng nhập.");
    }

    const changed = diff(current as unknown as Record<string, unknown>, data);
    if (!changed.hasChanges) return "Không có thay đổi nào.";

    await prisma.user.update({ where: { id }, data });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      oldValue: changed.oldValue,
      newValue: changed.newValue,
      undo: undoUpdate(
        "user",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changed.newValue),
        { label: "Hoàn tác? Tài khoản kế toán trở về thông tin trước đó." },
      ),
    });
    return `Đã lưu tài khoản kế toán ${data.fullName}.`;
  }).finally(() => refresh());
}

export async function resetAccountantPassword(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("accountant.manage");
  const id = requiredId(fd, "id", "tài khoản kế toán");

  return runAction(async () => {
    const password = requiredPassword(fd, "password", "Mật khẩu mới");
    const current = await findAccountant(id);

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST) },
    });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      newValue: { passwordReset: true },
    });
    return `Đã đặt lại mật khẩu cho ${current.fullName}.`;
  }).finally(() => refresh());
}

export async function deleteAccountant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("accountant.manage");
  const id = requiredId(fd, "id", "tài khoản kế toán");

  return runAction(async () => {
    const current = await findAccountant(id);
    if (id === user.id) fail("Không thể xoá tài khoản bạn đang đăng nhập.");

    const snapshots = await captureRows(prisma, "user", { id });

    await prisma.user.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "User",
      entityId: id,
      oldValue: { email: current.email, fullName: current.fullName, role: current.role },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Tài khoản kế toán ${current.fullName} được khôi phục.`,
      }),
    });
    return `Đã xoá tài khoản kế toán ${current.fullName}.`;
  }).finally(() => refresh());
}
