"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { fail, requiredPassword, runAction, type ActionState } from "@/lib/form-utils";

const BCRYPT_COST = 10;

/**
 * Người dùng tự đổi mật khẩu — PRD §20.
 *
 * Bảo mật:
 * - Phải nhập đúng mật khẩu hiện tại, tránh việc ai đó mượn máy đang đăng nhập rồi chiếm tài khoản.
 * - Audit log chỉ ghi cờ `passwordChanged`, **không bao giờ** ghi mật khẩu hay mã băm.
 */
export async function changeOwnPassword(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  return runAction(async () => {
    const current = requiredPassword(fd, "currentPassword", "Mật khẩu hiện tại", 1);
    const next = requiredPassword(fd, "newPassword", "Mật khẩu mới");
    const confirm = requiredPassword(fd, "confirmPassword", "Xác nhận mật khẩu mới", 1);

    if (next !== confirm) fail("Xác nhận mật khẩu mới không khớp.");
    if (next === current) fail("Mật khẩu mới phải khác mật khẩu hiện tại.");

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!account) fail("Không tìm thấy tài khoản.");

    const ok = await bcrypt.compare(current, account.passwordHash);
    if (!ok) fail("Mật khẩu hiện tại không đúng.");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(next, BCRYPT_COST) },
    });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: user.id,
      newValue: { passwordChanged: true },
    });

    return "Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.";
  });
}
