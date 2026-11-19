"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { describeUndo, parseUndo, runUndo } from "@/lib/audit-undo";
import { fail, requiredId, runAction, type ActionState } from "@/lib/form-utils";

/**
 * Hoàn tác một thao tác nghiệp vụ đã ghi trong Nhật ký hệ thống (PRD §26).
 *
 * Nhật ký vẫn chỉ đọc: hoàn tác không xoá dòng log nào, chỉ đóng dấu `rolledBackAt`
 * lên dòng gốc rồi ghi thêm một dòng `ROLLBACK` mới. Cách đảo ngược do chính action
 * gốc khai báo vào cột `undo` lúc ghi audit — ở đây chỉ thi hành bản khai báo đó.
 */

/**
 * Hoàn tác đụng tới rất nhiều màn (học phí, lịch dạy, lớp, học viên…) nên làm mới
 * cả bộ thay vì đoán. Trang chi tiết theo id thì lấy thêm từ `plan.after.revalidate`.
 */
const PATHS = [
  "/nhat-ky",
  "/tong-quan",
  "/hoc-phi",
  "/lich-day",
  "/lop-hoc",
  "/hoc-vien",
  "/giao-vien",
  "/cai-dat",
  "/syllabus",
  "/gv",
  "/gv/lich-day",
  "/gv/buoi-hoc",
];

export async function rollbackAudit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("audit.rollback");
  const id = requiredId(fd, "id", "bản ghi nhật ký");

  const extra: string[] = [];

  return runAction(async () => {
    const log = await prisma.auditLog.findUnique({
      where: { id },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        undo: true,
        rolledBackAt: true,
      },
    });
    if (!log) fail("Không tìm thấy bản ghi nhật ký.");

    const described = describeUndo(log);
    if (!described.ok) fail(described.reason);

    const plan = parseUndo(log.undo);
    if (!plan) fail("Thao tác này không kèm dữ liệu hoàn tác.");

    extra.push(...(plan.after?.revalidate ?? []));

    await prisma.$transaction(async (tx) => {
      await runUndo(tx, plan);

      // Chốt cờ ngay trong transaction: hai người bấm cùng lúc thì chỉ một người thắng.
      const flagged = await tx.auditLog.updateMany({
        where: { id: log.id, rolledBackAt: null },
        data: { rolledBackAt: new Date(), rolledBackById: user.id },
      });
      if (flagged.count === 0) fail("Bản ghi này vừa được hoàn tác bởi người khác.");

      await writeAudit(
        {
          userId: user.id,
          action: "ROLLBACK",
          entity: log.entity,
          entityId: log.entityId,
          oldValue: { auditLogId: log.id, action: log.action },
          newValue: { kind: plan.kind },
          // Bản thân lần hoàn tác thì không hoàn tác tiếp.
        },
        tx,
      );
    });

    return "Đã hoàn tác thao tác này.";
  }).finally(() => {
    for (const path of new Set([...PATHS, ...extra])) revalidatePath(path);
  });
}
