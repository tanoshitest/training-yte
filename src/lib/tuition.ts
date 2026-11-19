import { Prisma } from "@/generated/prisma/client";

import { fail } from "@/lib/form-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/utils";
import type { AttendanceStatus } from "@/generated/prisma/enums";

/**
 * Nghiệp vụ học phí — PRD §13–§16 và Data Rules R7–R11.
 *
 *   NORMAL : học phí theo gói số buổi. Chỉ trừ buổi khi LessonSession COMPLETED (R8).
 *            Buổi vượt gói → phát sinh TuitionEntry EXTRA_SESSION (R11).
 *   IELTS  : học phí theo khóa. Không trừ buổi, không phát sinh phí khi tăng buổi (R9, R10).
 *
 * Nguyên tắc 5: KHÔNG hard-code giá — mọi số tiền đọc từ NormalPackage / IeltsCourse.
 */

const D = Prisma.Decimal;

/** Đơn giá 1 buổi vượt gói. Ưu tiên extraUnitPrice, nếu không có thì price / totalSessions. */
export function extraUnitPrice(pkg: {
  price: Prisma.Decimal;
  totalSessions: number;
  extraUnitPrice: Prisma.Decimal | null;
}) {
  if (pkg.extraUnitPrice) return new D(pkg.extraUnitPrice);
  if (pkg.totalSessions <= 0) return new D(0);
  return new D(pkg.price).div(pkg.totalSessions).toDecimalPlaces(0);
}

/** Tính lại totalAmount / paidAmount từ các bút toán — nguồn sự thật duy nhất. */
export async function recalcTuition(tuitionId: string, tx: Prisma.TransactionClient = prisma) {
  const [entries, payments] = await Promise.all([
    tx.tuitionEntry.findMany({
      where: { tuitionId },
      select: { amount: true, quantity: true, type: true },
    }),
    tx.tuitionPayment.findMany({ where: { tuitionId }, select: { amount: true } }),
  ]);

  const total = entries.reduce((sum, e) => {
    const line = new D(e.amount).mul(e.quantity);
    return e.type === "DISCOUNT" ? sum.sub(line) : sum.add(line);
  }, new D(0));

  const paid = payments.reduce((sum, p) => sum.add(new D(p.amount)), new D(0));

  return tx.studentTuition.update({
    where: { id: tuitionId },
    data: { totalAmount: total, paidAmount: paid },
  });
}

/**
 * Trừ học phí tạm ứng của học viên vào một hồ sơ học phí.
 *
 * Tạm ứng là tiền thu trước khi biết học viên vào lớp nào, nằm ở `student_advances`
 * dưới dạng số dư (`amount - usedAmount`). Khi có hồ sơ học phí còn nợ, phần dư được
 * biến thành một phiếu thu bình thường rồi cộng vào `usedAmount` — tiền chỉ dùng đúng
 * một lần và `tuition_payments` vẫn là nguồn sự thật duy nhất của "đã thu".
 *
 * Trả về số tiền thực sự đã trừ.
 */
export async function applyStudentAdvance(
  tx: Prisma.TransactionClient,
  studentId: string,
  tuitionId: string,
  paidAt?: Date,
) {
  const tuition = await tx.studentTuition.findUnique({
    where: { id: tuitionId },
    select: { totalAmount: true, paidAmount: true },
  });
  if (!tuition) return new D(0);

  const due = new D(tuition.totalAmount).sub(tuition.paidAmount);
  if (due.lte(0)) return new D(0);

  // Tiêu lần tạm ứng cũ trước để số dư còn lại luôn là khoản mới nhất.
  const advances = await tx.studentAdvance.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, usedAmount: true },
  });

  let left = due;
  let applied = new D(0);

  for (const advance of advances) {
    if (left.lte(0)) break;
    const balance = new D(advance.amount).sub(advance.usedAmount);
    if (balance.lte(0)) continue;

    const take = balance.lt(left) ? balance : left;
    await tx.studentAdvance.update({
      where: { id: advance.id },
      data: { usedAmount: new D(advance.usedAmount).add(take) },
    });
    left = left.sub(take);
    applied = applied.add(take);
  }

  if (applied.lte(0)) return new D(0);

  await tx.tuitionPayment.create({
    data: { tuitionId, amount: applied, note: "Trừ từ học phí tạm ứng", paidAt },
  });
  await recalcTuition(tuitionId, tx);
  return applied;
}

/** Trừ tạm ứng vào mọi hồ sơ học phí còn nợ của học viên, cũ trước mới sau. */
export async function applyStudentAdvanceToAll(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const tuitions = await tx.studentTuition.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  let applied = new D(0);
  for (const tuition of tuitions) {
    applied = applied.add(await applyStudentAdvance(tx, studentId, tuition.id));
  }
  return applied;
}

/**
 * Xoá một lần thu trên hồ sơ học viên. Phần đã trừ vào học phí được hoàn lại
 * (xoá / giảm phiếu thu *"Trừ từ học phí tạm ứng"* khớp FIFO với lúc trừ).
 */
export async function revertStudentAdvance(tx: Prisma.TransactionClient, advanceId: string) {
  const target = await tx.studentAdvance.findUnique({
    where: { id: advanceId },
    select: { id: true, studentId: true, usedAmount: true },
  });
  if (!target) fail("Không tìm thấy khoản thu.");

  const used = new D(target.usedAmount);
  if (used.gt(0)) {
    const advances = await tx.studentAdvance.findMany({
      where: { studentId: target.studentId },
      orderBy: { createdAt: "asc" },
      select: { id: true, usedAmount: true },
    });
    const payments = await tx.tuitionPayment.findMany({
      where: {
        tuition: { studentId: target.studentId },
        note: "Trừ từ học phí tạm ứng",
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, tuitionId: true, amount: true },
    });

    let payIdx = 0;
    let payLeft = payments[0] ? new D(payments[0].amount) : new D(0);
    const takeByPayment = new Map<string, { tuitionId: string; take: Prisma.Decimal }>();

    for (const item of advances) {
      let need = new D(item.usedAmount);
      while (need.gt(0) && payIdx < payments.length) {
        const take = payLeft.lt(need) ? payLeft : need;
        if (item.id === target.id) {
          const payment = payments[payIdx];
          const prev = takeByPayment.get(payment.id);
          takeByPayment.set(payment.id, {
            tuitionId: payment.tuitionId,
            take: prev ? prev.take.add(take) : take,
          });
        }
        need = need.sub(take);
        payLeft = payLeft.sub(take);
        if (payLeft.lte(0)) {
          payIdx += 1;
          payLeft = payments[payIdx] ? new D(payments[payIdx].amount) : new D(0);
        }
      }
    }

    const touched = new Set<string>();
    for (const payment of payments) {
      const slice = takeByPayment.get(payment.id);
      if (!slice) continue;
      const next = new D(payment.amount).sub(slice.take);
      if (next.lte(0)) await tx.tuitionPayment.delete({ where: { id: payment.id } });
      else await tx.tuitionPayment.update({ where: { id: payment.id }, data: { amount: next } });
      touched.add(slice.tuitionId);
    }
    for (const tuitionId of touched) await recalcTuition(tuitionId, tx);
  }

  await tx.studentAdvance.delete({ where: { id: target.id } });
}

/** Số dư tạm ứng chưa dùng của học viên. */
export function advanceBalance(
  advances: { amount: Prisma.Decimal; usedAmount: Prisma.Decimal }[],
) {
  return advances.reduce((sum, a) => sum + Number(a.amount) - Number(a.usedAmount), 0);
}

/**
 * Trạng thái điểm danh có trừ buổi trong gói học phí (PRD §11.1).
 *
 * Có mặt, vắng phép và vắng không phép đều trừ 1 buổi vì lớp đã dạy.
 * Chỉ buổi tick Nghỉ học (cả lớp) và học viên bảo lưu mới không trừ.
 */
export const BILLABLE_ATTENDANCE = [
  "PRESENT",
  "ABSENT",
  "EXCUSED",
] as const satisfies readonly AttendanceStatus[];

/** Trạng thái điểm danh này có trừ buổi không. */
export function isBillableAttendance(status: AttendanceStatus): boolean {
  return (BILLABLE_ATTENDANCE as readonly AttendanceStatus[]).includes(status);
}

/** Buổi của lớp thường. IELTS tính theo khóa nên trả về null để bỏ qua (R9, R10). */
async function loadNormalSession(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await tx.lessonSession.findUnique({
    where: { id: sessionId },
    select: { id: true, classId: true, class: { select: { type: true } } },
  });
  if (!session || session.class.type === "IELTS") return null;
  return session;
}

/** Học viên bị trừ buổi ở buổi này, đọc từ trạng thái điểm danh đã ghi. */
async function billableStudentIds(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<string[]> {
  const rows = await tx.attendance.findMany({
    where: { sessionId, status: { in: [...BILLABLE_ATTENDANCE] } },
    select: { studentId: true },
  });
  return rows.map((row) => row.studentId);
}

/**
 * Trừ 1 buổi trong gói của từng học viên trong danh sách (R8, R11).
 * Vượt gói thì sinh TuitionEntry EXTRA_SESSION theo bảng giá.
 */
export async function chargeSessionForStudents(
  tx: Prisma.TransactionClient,
  sessionId: string,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return;
  const session = await loadNormalSession(tx, sessionId);
  if (!session) return;

  // Chỉ tính cho học viên đang thực học tại lớp.
  const tuitions = await tx.studentTuition.findMany({
    where: {
      type: "NORMAL",
      studentId: { in: studentIds },
      enrollment: { classId: session.classId, status: "ACTIVE" },
    },
    include: {
      package: { select: { price: true, totalSessions: true, extraUnitPrice: true } },
    },
  });

  // Đa số học viên còn trong gói — gộp thành một lệnh UPDATE thay vì mỗi người một lệnh.
  const withinPackage: string[] = [];
  const overPackage: typeof tuitions = [];

  for (const tuition of tuitions) {
    const total = tuition.totalSessions ?? tuition.package?.totalSessions ?? 0;
    const isExtra = total > 0 && tuition.usedSessions + 1 > total;
    if (isExtra) overPackage.push(tuition);
    else withinPackage.push(tuition.id);
  }

  if (withinPackage.length > 0) {
    await tx.studentTuition.updateMany({
      where: { id: { in: withinPackage } },
      data: { usedSessions: { increment: 1 } },
    });
  }

  // R11 — buổi vượt gói phải phát sinh học phí theo cấu hình.
  for (const tuition of overPackage) {
    const used = tuition.usedSessions + 1;
    const total = tuition.totalSessions ?? tuition.package?.totalSessions ?? 0;

    await tx.studentTuition.update({
      where: { id: tuition.id },
      data: { usedSessions: used, extraSessions: { increment: 1 } },
    });

    if (!tuition.package) continue;

    await tx.tuitionEntry.create({
      data: {
        tuitionId: tuition.id,
        type: "EXTRA_SESSION",
        amount: extraUnitPrice(tuition.package),
        quantity: 1,
        sessionId: session.id,
        note: `Buổi vượt gói (buổi thứ ${used}/${total})`,
      },
    });
    await recalcTuition(tuition.id, tx);
  }
}

/**
 * Hoàn lại buổi đã trừ ở `chargeSessionForStudents` cho từng học viên trong danh sách.
 * Dùng khi mở lại / huỷ buổi, và khi sửa điểm danh làm học viên hết bị tính phí.
 */
export async function refundSessionForStudents(
  tx: Prisma.TransactionClient,
  sessionId: string,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return;
  const session = await loadNormalSession(tx, sessionId);
  if (!session) return;

  // Không lọc theo trạng thái ghi danh: học viên rời lớp sau buổi đó vẫn phải được hoàn.
  const tuitions = await tx.studentTuition.findMany({
    where: {
      type: "NORMAL",
      studentId: { in: studentIds },
      enrollment: { classId: session.classId },
    },
    select: { id: true },
  });
  if (tuitions.length === 0) return;
  const tuitionIds = tuitions.map((t) => t.id);

  const entries = await tx.tuitionEntry.findMany({
    where: { sessionId: session.id, type: "EXTRA_SESSION", tuitionId: { in: tuitionIds } },
    select: { id: true, tuitionId: true },
  });
  const extraByTuition = new Set(entries.map((e) => e.tuitionId));

  // Điều kiện `gt: 0` thay cho Math.max — dòng đang ở 0 thì không cần đụng tới.
  await tx.studentTuition.updateMany({
    where: { id: { in: tuitionIds }, usedSessions: { gt: 0 } },
    data: { usedSessions: { decrement: 1 } },
  });

  if (extraByTuition.size > 0) {
    await tx.studentTuition.updateMany({
      where: { id: { in: [...extraByTuition] }, extraSessions: { gt: 0 } },
      data: { extraSessions: { decrement: 1 } },
    });
  }

  if (entries.length > 0) {
    await tx.tuitionEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    for (const tuitionId of extraByTuition) {
      await recalcTuition(tuitionId, tx);
    }
  }
}

/**
 * Áp dụng hệ quả học phí khi một buổi học được hoàn thành.
 * Gọi trong cùng transaction với việc chuyển session → COMPLETED.
 *
 * R7  — session CANCELLED không bao giờ đi vào đây.
 * R8  — NORMAL: usedSessions += 1 cho học viên có mặt, vắng phép hoặc vắng không phép.
 * R9  — IELTS: không làm gì.
 * R11 — NORMAL vượt gói: tạo TuitionEntry EXTRA_SESSION theo bảng giá.
 */
export async function applySessionCompletion(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  await chargeSessionForStudents(tx, sessionId, await billableStudentIds(tx, sessionId));
}

/**
 * Hoàn tác hệ quả học phí khi một buổi đã COMPLETED bị chuyển về SCHEDULED/CANCELLED.
 * Đảm bảo R7: buổi bị huỷ không được tính là buổi đã học.
 */
export async function revertSessionCompletion(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  await refundSessionForStudents(tx, sessionId, await billableStudentIds(tx, sessionId));
}

/** Số buổi còn lại của gói NORMAL. IELTS trả về null (không quản lý theo buổi). */
export function remainingSessions(tuition: {
  type: string;
  totalSessions: number | null;
  usedSessions: number;
}) {
  if (tuition.type !== "NORMAL" || tuition.totalSessions == null) return null;
  return tuition.totalSessions - tuition.usedSessions;
}

/**
 * Ngày buổi học khiến số buổi còn lại về 0 (gói hiện tại).
 * Dùng trên biên lai: học phí gói mới tính từ ngày này; ngày thu là ngày đóng tiền.
 */
export async function dateRemainingHitZero(
  input: {
    studentId: string;
    classId: string;
    joinedAt: Date;
    totalSessions: number | null;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = await tx.attendance.findMany({
    where: {
      studentId: input.studentId,
      status: { in: [...BILLABLE_ATTENDANCE] },
      session: {
        classId: input.classId,
        status: "COMPLETED",
        date: { gte: startOfDay(input.joinedAt) },
      },
    },
    orderBy: [{ session: { date: "asc" } }, { session: { startTime: "asc" } }],
    select: { session: { select: { date: true } } },
  });
  if (rows.length === 0) return null;
  const total = input.totalSessions ?? 0;
  if (total <= 0) return rows[0].session.date;
  const index = Math.min(total - 1, rows.length - 1);
  return rows[Math.max(0, index)].session.date;
}

/**
 * Ngày "Học phí bắt đầu từ" trên biên lai.
 *
 * Còn buổi thì gói mới cộng dồn — không có mốc hết buổi.
 * Hết buổi / lần thu đầu: ngày buổi khiến còn 0, hoặc buổi lớp đã dạy gần nhất,
 * hoặc ngày thu nếu chưa có buổi nào.
 */
export async function coverageStartDate(
  input: {
    studentId: string;
    classId: string;
    joinedAt: Date;
    totalSessions: number | null;
    remainingBefore: number;
    paidAt: Date;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  if (input.remainingBefore > 0) return null;

  const fromAttendance = await dateRemainingHitZero(
    {
      studentId: input.studentId,
      classId: input.classId,
      joinedAt: input.joinedAt,
      totalSessions: input.totalSessions,
    },
    tx,
  );
  if (fromAttendance) return fromAttendance;

  const sessions = await tx.lessonSession.findMany({
    where: {
      classId: input.classId,
      status: "COMPLETED",
      date: { gte: startOfDay(input.joinedAt) },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { date: true },
  });
  if (sessions.length === 0) return input.paidAt;
  const total = input.totalSessions ?? 0;
  if (total <= 0) return sessions[0].date;
  return sessions[Math.min(total - 1, sessions.length - 1)].date;
}
