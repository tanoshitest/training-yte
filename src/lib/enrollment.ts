import type { Prisma } from "@/generated/prisma/client";
import type { ClassType, StudentStatus, TuitionRevenueKind } from "@/generated/prisma/enums";

import { fail } from "@/lib/form-utils";
import { resolveNormalPackagePrice } from "@/lib/normal-tuition";
import { prisma } from "@/lib/prisma";
import { applyStudentAdvance, recalcTuition } from "@/lib/tuition";
import { startOfDay } from "@/lib/utils";

/**
 * Vòng đời ghi danh — PRD §6.3 và §13.
 *
 * Student ↔ Class luôn đi qua Enrollment để giữ lịch sử (R4 trong PLAN.md),
 * và mỗi lần ghi danh sinh đúng một StudentTuition theo loại lớp:
 *   NORMAL → gắn NormalPackage (gói số buổi)
 *   IELTS  → gắn IeltsCourse (trọn khóa)
 */

/** Gói học phí áp cho một lần ghi danh. */
export type TuitionPlan =
  | { kind: "NORMAL"; packageId: string }
  | { kind: "IELTS"; ieltsCourseId: string };

/** Một dòng bảng giá gói buổi. Giá để dạng chuỗi vì form là client component. */
export type PackageOption = {
  id: string;
  name: string;
  totalSessions: number;
  price: string;
  levelName: string;
  levelId: string;
  subLevelId: string | null;
  discount24Weeks: string | null;
  discount12Weeks: string | null;
};

/**
 * Gói học phí đầu tiên của một hồ sơ học viên tạo mới được tính là đóng mới.
 * Những hồ sơ đã có học phí trước đó, hoặc dữ liệu lịch sử/import, là gia hạn.
 * Kết quả được snapshot vào StudentTuition rồi từng TuitionPayment kế thừa lại.
 */
async function initialRevenueKind(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<TuitionRevenueKind> {
  const [student, previousTuition] = await Promise.all([
    tx.student.findUnique({
      where: { id: studentId },
      select: { isNewRevenueStudent: true },
    }),
    tx.studentTuition.findFirst({
      where: { studentId },
      select: { id: true },
    }),
  ]);

  return student?.isNewRevenueStudent && !previousTuition ? "NEW" : "RENEWAL";
}

/**
 * Rule học phí cho một lần ghi danh — R2: loại lớp quyết định mô hình học phí.
 *
 * - **Lớp IELTS** tính trọn khóa nên học phí thuộc về lớp: gán khóa ở thông tin lớp,
 *   ai vào lớp cũng áp đúng khóa đó.
 * - **Lớp thường** tính theo gói buổi của từng học viên — phụ huynh đóng gói bao nhiêu
 *   buổi thì học viên có bấy nhiêu buổi, học buổi nào trừ buổi đó — nên lớp không giữ
 *   gói. Gói chọn lúc ghi danh; bỏ trống thì chưa sinh hồ sơ học phí, thu sau ở màn
 *   hình Học phí.
 */
export function enrollmentTuitionPlan(
  cls: { type: ClassType; ieltsCourseId: string | null },
  packageId: string | null,
): TuitionPlan | null {
  if (cls.type === "IELTS") {
    if (!cls.ieltsCourseId) {
      fail("Lớp chưa chọn gói học phí IELTS. Hãy chọn gói học phí trong thông tin lớp trước.");
    }
    return { kind: "IELTS", ieltsCourseId: cls.ieltsCourseId };
  }
  return packageId ? { kind: "NORMAL", packageId } : null;
}

/**
 * Bảng giá gói buổi đang bật, dùng cho ô chọn gói lúc ghi danh và ở màn hình Học phí.
 * Sắp theo cấp học rồi tới số buổi để danh sách đọc theo mạch bảng giá.
 */
export async function loadNormalPackages(): Promise<PackageOption[]> {
  const packages = await prisma.normalPackage.findMany({
    where: { isActive: true },
    orderBy: [{ level: { order: "asc" } }, { totalSessions: "asc" }],
    select: {
      id: true,
      name: true,
      totalSessions: true,
      price: true,
      levelId: true,
      subLevelId: true,
      level: { select: { name: true } },
      subLevel: { select: { basePrice: true, discount24Weeks: true, discount12Weeks: true } },
    },
  });

  // Decimal của Prisma không truyền được sang client component.
  return packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    totalSessions: pkg.totalSessions,
    price: resolveNormalPackagePrice({
      price: pkg.price,
      totalSessions: pkg.totalSessions,
      basePrice24: pkg.subLevel?.basePrice,
      discount24: pkg.subLevel?.discount24Weeks,
      discount12: pkg.subLevel?.discount12Weeks,
    }),
    discount24Weeks: pkg.subLevel?.discount24Weeks?.toString() ?? null,
    discount12Weeks: pkg.subLevel?.discount12Weeks?.toString() ?? null,
    levelName: pkg.level.name,
    levelId: pkg.levelId,
    subLevelId: pkg.subLevelId,
  }));
}

/**
 * Tạo StudentTuition + bút toán BASE cho một lần ghi danh.
 * Nếu lần ghi danh đó đã có học phí (học viên quay lại lớp cũ) thì giữ nguyên,
 * tránh tính tiền hai lần.
 *
 * Học viên còn số dư học phí tạm ứng thì trừ luôn vào hồ sơ vừa tạo, nên xếp lớp xong
 * là công nợ đã phản ánh số tiền đã nộp trước. `skipAdvance` để thu tay ghi miễn giảm
 * trước rồi mới trừ tạm ứng — tránh tạm ứng phủ hết rồi mới giảm giá.
 */
export async function createTuitionForEnrollment(
  tx: Prisma.TransactionClient,
  input: { enrollmentId: string; studentId: string; plan: TuitionPlan; skipAdvance?: boolean },
) {
  const existing = await tx.studentTuition.findUnique({
    where: { enrollmentId: input.enrollmentId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const currentRevenueKind = await initialRevenueKind(tx, input.studentId);

  if (input.plan.kind === "NORMAL") {
    const pkg = await tx.normalPackage.findUnique({
      where: { id: input.plan.packageId },
      include: { subLevel: { select: { basePrice: true, discount24Weeks: true, discount12Weeks: true } } },
    });
    if (!pkg) fail("Không tìm thấy gói học phí đã chọn.");
    const packagePrice = resolveNormalPackagePrice({
      price: pkg.price,
      totalSessions: pkg.totalSessions,
      basePrice24: pkg.subLevel?.basePrice,
      discount24: pkg.subLevel?.discount24Weeks,
      discount12: pkg.subLevel?.discount12Weeks,
    });

    const enrollment = await tx.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: { classId: true, joinedAt: true },
    });
    if (!enrollment) fail("Không tìm thấy lần ghi danh.");

    // Đã điểm danh trước khi đóng gói thì số buổi còn lại phải trừ buổi đã học
    // (24 buổi, đã học 1 → còn 23; chưa đóng mà đã học 1 → gán gói sau vẫn khớp).
    const used = await tx.lessonSession.count({
      where: {
        classId: enrollment.classId,
        status: "COMPLETED",
        date: { gte: startOfDay(enrollment.joinedAt) },
      },
    });

    const tuition = await tx.studentTuition.create({
      data: {
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        type: "NORMAL",
        packageId: pkg.id,
        totalSessions: pkg.totalSessions,
        usedSessions: used,
        extraSessions: Math.max(0, used - pkg.totalSessions),
        currentRevenueKind,
      },
    });
    await tx.tuitionEntry.create({
      data: {
        tuitionId: tuition.id,
        type: "BASE",
        amount: packagePrice,
        quantity: 1,
        note: `${pkg.name} — ${pkg.totalSessions} buổi`,
      },
    });
    await recalcTuition(tuition.id, tx);
    if (!input.skipAdvance) {
      await applyStudentAdvance(tx, input.studentId, tuition.id);
    }
    return tuition.id;
  }

  const course = await tx.ieltsCourse.findUnique({ where: { id: input.plan.ieltsCourseId } });
  if (!course) fail("Không tìm thấy khóa IELTS đã chọn.");

  const tuition = await tx.studentTuition.create({
    data: {
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      type: "IELTS",
      ieltsCourseId: course.id,
      currentRevenueKind,
    },
  });
  await tx.tuitionEntry.create({
    data: {
      tuitionId: tuition.id,
      type: "BASE",
      amount: course.price,
      quantity: 1,
      note: `Khóa ${course.name} (trọn khóa)`,
    },
  });
  await recalcTuition(tuition.id, tx);
  if (!input.skipAdvance) {
    await applyStudentAdvance(tx, input.studentId, tuition.id);
  }
  return tuition.id;
}

/**
 * Trạng thái học viên (PRD §6.2) suy ra từ các lần ghi danh, không nhập tay:
 * còn lớp đang học → Đang học; chỉ còn bảo lưu → Bảo lưu;
 * từng học nhưng đã rời hết → Nghỉ học; chưa từng ghi danh → Chưa xếp lớp.
 *
 * Đổi trạng thái trên hồ sơ phải đi qua `applyManualStudentStatus` — nếu chỉ ghi
 * `Student.status` thì danh sách lớp / cột Lớp đang học vẫn đọc enrollment ACTIVE.
 */
export async function applyManualStudentStatus(
  tx: Prisma.TransactionClient,
  studentId: string,
  next: StudentStatus,
) {
  const open = await tx.enrollment.findMany({
    where: { studentId, status: { in: ["ACTIVE", "RESERVED"] } },
    select: { id: true, status: true, leftAt: true, classId: true },
  });

  if (next === "DROPPED" || next === "UNASSIGNED") {
    const leftAt = new Date();
    for (const row of open) {
      await tx.enrollment.update({
        where: { id: row.id },
        data: { status: "DROPPED", leftAt },
      });
    }
  } else if (next === "RESERVED") {
    for (const row of open.filter((item) => item.status === "ACTIVE")) {
      await tx.enrollment.update({
        where: { id: row.id },
        data: { status: "RESERVED", leftAt: null },
      });
    }
  } else if (next === "STUDYING") {
    for (const row of open.filter((item) => item.status === "RESERVED")) {
      await tx.enrollment.update({
        where: { id: row.id },
        data: { status: "ACTIVE", leftAt: null },
      });
    }
  }

  return { derived: await syncStudentStatus(tx, studentId), open };
}

export async function syncStudentStatus(tx: Prisma.TransactionClient, studentId: string) {
  const enrollments = await tx.enrollment.findMany({
    where: { studentId },
    select: { status: true },
  });

  let status: StudentStatus = "UNASSIGNED";
  if (enrollments.some((e) => e.status === "ACTIVE")) status = "STUDYING";
  else if (enrollments.some((e) => e.status === "RESERVED")) status = "RESERVED";
  else if (enrollments.length > 0) status = "DROPPED";

  await tx.student.update({ where: { id: studentId }, data: { status } });
  return status;
}
