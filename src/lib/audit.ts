import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { UndoPlan } from "@/lib/audit-undo";

export {
  captureRow,
  captureRows,
  undoCreate,
  undoDelete,
  undoUpdate,
  undoUpdateAlso,
} from "@/lib/audit-undo";

type AuditInput = {
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  /**
   * Cách đảo ngược thao tác này, để nút Hoàn tác ở Nhật ký hệ thống thi hành.
   * Bỏ trống = không hoàn tác được (đăng nhập, đổi mật khẩu, thao tác ghép không đảo trọn vẹn).
   */
  undo?: UndoPlan;
};

/**
 * Ghi Audit Log — PRD §26 và nguyên tắc kiến trúc 8.
 * Không bao giờ để lỗi ghi log làm hỏng nghiệp vụ chính.
 */
export async function writeAudit(input: AuditInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldValue: (input.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        undo: (input.undo ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] không ghi được audit log:", error);
  }
}

/** Chỉ giữ các field thực sự thay đổi, để Audit Log gọn và dễ đọc. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const same = a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
    if (!same) {
      oldValue[key] = a instanceof Date ? a.toISOString() : a;
      newValue[key] = b instanceof Date ? b.toISOString() : b;
    }
  }

  return { oldValue, newValue, hasChanges: Object.keys(newValue).length > 0 };
}
