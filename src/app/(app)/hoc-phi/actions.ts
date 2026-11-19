"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { captureRow, undoCreate, undoDelete, undoUpdate, undoUpdateAlso, writeAudit } from "@/lib/audit";
import { createTuitionForEnrollment } from "@/lib/enrollment";
import { resolveNormalPackagePrice } from "@/lib/normal-tuition";
import { applyStudentAdvance, coverageStartDate, recalcTuition } from "@/lib/tuition";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  fail,
  money,
  optionalDate,
  optionalMoney,
  optionalStr,
  requiredDate,
  requiredId,
  requiredInt,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";
import type { PaymentMethod, TuitionEntryType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Server Action cho học phí — PRD §13–§16.
 *
 * Nguyên tắc: `StudentTuition.totalAmount` / `paidAmount` KHÔNG bao giờ ghi tay.
 * Mọi thay đổi đi qua bút toán (`TuitionEntry`) hoặc phiếu thu (`TuitionPayment`),
 * rồi `recalcTuition()` tính lại — bút toán là nguồn sự thật duy nhất.
 *
 * R11 — bút toán `EXTRA_SESSION` do hệ thống sinh khi hoàn thành buổi vượt gói,
 *       không cho sửa/xoá tay để số liệu khớp với `usedSessions`.
 */

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"];
/** Chỉ hai loại này được nhập tay — BASE do ghi danh sinh, EXTRA_SESSION do hệ thống sinh. */
const MANUAL_ENTRY_TYPES: TuitionEntryType[] = ["DISCOUNT", "ADJUSTMENT"];

function refreshTuition(tuitionId: string, studentId?: string) {
  revalidatePath("/hoc-phi");
  revalidatePath("/hoc-phi/bao-cao");
  revalidatePath(`/hoc-phi/${tuitionId}`);
  revalidatePath("/tong-quan");
  revalidatePath("/nhat-ky");
  if (studentId) revalidatePath(`/hoc-vien/${studentId}`);
}

/** Học phí kèm thông tin định tuyến để revalidate. Gọi trong `runAction`. */
async function loadTuition(tuitionId: string) {
  const tuition = await prisma.studentTuition.findUnique({
    where: { id: tuitionId },
    select: {
      id: true,
      studentId: true,
      type: true,
      note: true,
      currentRevenueKind: true,
    },
  });
  if (!tuition) fail("Không tìm thấy hồ sơ học phí.");
  return tuition;
}

// ------------------------------------------------------------------
// Thu gói buổi của lớp thường
// ------------------------------------------------------------------

/**
 * Gán gói buổi cho một lần ghi danh ở lớp thường và sinh hồ sơ học phí.
 *
 * Lớp thường không giữ gói ở cấp lớp: phụ huynh đóng gói bao nhiêu buổi thì học viên có
 * bấy nhiêu buổi, học buổi nào trừ buổi đó. Gói thu lúc ghi danh, hoặc thu sau ở đây khi
 * học viên đã vào lớp mà chưa đóng tiền.
 */
export async function assignTuitionPackage(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const enrollmentId = requiredId(fd, "enrollmentId", "lần ghi danh");
  const packageId = requiredId(fd, "packageId", "gói học phí");
  let studentId = "";
  let classId = "";

  const result = await runAction(async () => {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        classId: true,
        student: { select: { fullName: true } },
        class: { select: { type: true } },
        tuition: { select: { id: true } },
      },
    });
    if (!enrollment) fail("Không tìm thấy lần ghi danh.");
    if (enrollment.class.type !== "NORMAL") {
      fail("Lớp IELTS tính trọn khóa, học phí lấy theo khóa của lớp.");
    }
    if (enrollment.tuition) fail("Lần ghi danh này đã có hồ sơ học phí.");
    studentId = enrollment.studentId;
    classId = enrollment.classId;

    const tuitionId = await prisma.$transaction((tx) =>
      createTuitionForEnrollment(tx, {
        enrollmentId,
        studentId: enrollment.studentId,
        plan: { kind: "NORMAL", packageId },
      }),
    );

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "StudentTuition",
      entityId: tuitionId,
      newValue: { enrollmentId, packageId },
      // Xoá hồ sơ học phí kéo theo bút toán/phiếu thu (cascade), lần ghi danh vẫn còn.
      undo: undoCreate(
        { model: "studentTuition", id: tuitionId },
        {
          label: "Hoàn tác? Hồ sơ học phí vừa tạo sẽ bị xoá cùng toàn bộ bút toán và phiếu thu của nó.",
          after: {
            revalidate: [`/hoc-vien/${enrollment.studentId}`, `/lop-hoc/${enrollment.classId}`],
          },
        },
      ),
    });
    return `Đã thu gói học phí cho ${enrollment.student.fullName}.`;
  });

  revalidatePath("/hoc-phi");
  revalidatePath("/hoc-phi/bao-cao");
  revalidatePath("/tong-quan");
  revalidatePath("/nhat-ky");
  if (studentId) revalidatePath(`/hoc-vien/${studentId}`);
  // Danh sách học viên của lớp hiện cột Gói học phí nên phải vẽ lại.
  if (classId) revalidatePath(`/lop-hoc/${classId}`);
  return result;
}

const COLLECT_METHODS = ["CASH", "BANK_TRANSFER"] as const;

/**
 * Sau khi đã có bút toán BASE: ghi miễn giảm (nếu có), trừ tạm ứng, rồi lập phiếu thu
 * phần còn lại. Ngày thu / số hoá đơn đi vào phiếu thu — cùng một chỗ với biên lai.
 */
async function settleCollect(
  tx: Prisma.TransactionClient,
  input: {
    tuitionId: string;
    studentId: string;
    paidAt: Date;
    discount: number;
    discountReason: string | null;
    textbook: number;
    invoiceNo: string | null;
    method: PaymentMethod;
    note: string;
    coverageFrom?: Date | null;
  },
) {
  let discountEntryId: string | null = null;
  if (input.discount > 0) {
    const entry = await tx.tuitionEntry.create({
      data: {
        tuitionId: input.tuitionId,
        type: "DISCOUNT",
        amount: String(input.discount),
        quantity: 1,
        note: input.discountReason
          ? `Miễn giảm học phí. ${input.discountReason}`
          : "Miễn giảm học phí",
      },
    });
    discountEntryId = entry.id;
    await recalcTuition(input.tuitionId, tx);
  }

  let textbookEntryId: string | null = null;
  if (input.textbook > 0) {
    const textbookEntry = await tx.tuitionEntry.create({
      data: {
        tuitionId: input.tuitionId,
        type: "ADJUSTMENT",
        amount: String(input.textbook),
        quantity: 1,
        note: "Giáo trình",
      },
    });
    textbookEntryId = textbookEntry.id;
    await recalcTuition(input.tuitionId, tx);
  }

  const appliedAdvance = await applyStudentAdvance(
    tx,
    input.studentId,
    input.tuitionId,
    input.paidAt,
  );
  await recalcTuition(input.tuitionId, tx);

  const tuition = await tx.studentTuition.findUnique({
    where: { id: input.tuitionId },
    select: { totalAmount: true, paidAmount: true, currentRevenueKind: true },
  });
  const cash = Math.max(0, Number(tuition?.totalAmount ?? 0) - Number(tuition?.paidAmount ?? 0));

  let paymentId: string | null = null;
  if (cash > 0) {
    const payment = await tx.tuitionPayment.create({
      data: {
        tuitionId: input.tuitionId,
        amount: String(cash),
        method: input.method,
        paidAt: input.paidAt,
        coverageFrom: input.coverageFrom ?? undefined,
        reference: input.invoiceNo,
        note: input.note,
        textbookAmount: input.textbook > 0 ? String(input.textbook) : null,
        discountReason: input.discountReason,
        revenueKind: tuition?.currentRevenueKind ?? "RENEWAL",
      },
    });
    paymentId = payment.id;
    await recalcTuition(input.tuitionId, tx);
  } else if (input.invoiceNo) {
    const last = await tx.tuitionPayment.findFirst({
      where: { tuitionId: input.tuitionId, note: "Trừ từ học phí tạm ứng" },
      orderBy: { createdAt: "desc" },
    });
    if (last && !last.reference) {
      await tx.tuitionPayment.update({
        where: { id: last.id },
        data: { reference: input.invoiceNo, paidAt: input.paidAt },
      });
      paymentId = last.id;
    }
  }

  return { paymentId, discountEntryId, textbookEntryId, cash, appliedAdvance: Number(appliedAdvance) };
}

/**
 * Thu gói buổi (24 / 48 / 96…) trên màn hình Học phí: cộng buổi, trừ tạm ứng nếu có,
 * ghi phiếu thu tiền mặt / chuyển khoản. Phiếu thu vào báo cáo thu học phí và nhật ký.
 */
export async function collectTuition(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  let studentId = "";
  let classId = "";
  let tuitionId = "";

  const result = await runAction(async () => {
    const enrollmentId = requiredId(fd, "enrollmentId", "lần ghi danh");
    const planId = requiredId(fd, "planId", "gói học phí");
    const methodRaw = String(fd.get("method") ?? "CASH");
    if (!(COLLECT_METHODS as readonly string[]).includes(methodRaw)) {
      fail("Chọn thu tiền mặt hoặc chuyển khoản.");
    }
    const paidAt = requiredDate(fd, "paidAt", "Ngày thu học phí");
    const invoiceNo = optionalStr(fd, "invoiceNo", 120);
    const discountRaw = optionalMoney(fd, "discountAmount", "Miễn giảm học phí");
    const discount = discountRaw ? Number(discountRaw) : 0;
    const discountReason = optionalStr(fd, "discountReason", 300);
    if (discount > 0 && !discountReason) fail("Nhập lý do miễn giảm.");
    const textbookRaw = optionalMoney(fd, "textbookAmount", "Giáo trình");
    const textbook = textbookRaw ? Number(textbookRaw) : 0;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        classId: true,
        joinedAt: true,
        student: {
          select: {
            fullName: true,
          },
        },
        class: { select: { type: true, name: true, ieltsCourseId: true } },
        tuition: {
          select: {
            id: true,
            totalSessions: true,
            usedSessions: true,
            packageId: true,
            totalAmount: true,
            paidAmount: true,
            currentRevenueKind: true,
          },
        },
      },
    });
    if (!enrollment) fail("Không tìm thấy lần ghi danh.");
    studentId = enrollment.studentId;
    classId = enrollment.classId;

    if (enrollment.class.type === "IELTS") {
      const course = await prisma.ieltsCourse.findUnique({
        where: { id: planId },
        select: { id: true, name: true, price: true, basePrice: true, isActive: true },
      });
      if (!course || !course.isActive) fail("Không tìm thấy gói học phí đã chọn.");
      if (enrollment.class.ieltsCourseId && course.id !== enrollment.class.ieltsCourseId) {
        fail("Chọn đúng gói học phí đang gắn với lớp.");
      }

      const price = Number(course.price);
      const owed = enrollment.tuition
        ? Math.max(0, Number(enrollment.tuition.totalAmount) - Number(enrollment.tuition.paidAmount))
        : price;
      if (enrollment.tuition && owed <= 0) {
        fail("Học viên đã đóng đủ học phí khóa này.");
      }
      if (discount > owed) {
        fail("Miễn giảm không được lớn hơn công nợ còn lại.");
      }
      const note = `${course.name} — trọn khóa`;

      const saved = await prisma.$transaction(async (tx) => {
        let nextTuitionId: string;
        let createdTuition = false;
        if (!enrollment.tuition) {
          nextTuitionId = await createTuitionForEnrollment(tx, {
            enrollmentId,
            studentId: enrollment.studentId,
            plan: { kind: "IELTS", ieltsCourseId: course.id },
            skipAdvance: true,
          });
          createdTuition = true;
        } else {
          nextTuitionId = enrollment.tuition.id;
        }

        const settled = await settleCollect(tx, {
          tuitionId: nextTuitionId,
          studentId: enrollment.studentId,
          paidAt,
          discount,
          discountReason,
          textbook,
          invoiceNo,
          method: methodRaw as PaymentMethod,
          note,
        });

        return { tuitionId: nextTuitionId, createdTuition, ...settled };
      });

      if (
        saved.cash <= 0 &&
        !saved.createdTuition &&
        !saved.discountEntryId &&
        saved.appliedAdvance <= 0
      ) {
        fail("Học viên đã đóng đủ học phí khóa này.");
      }

      tuitionId = saved.tuitionId;
      await writeAudit({
        userId: user.id,
        action: "CREATE",
        entity: saved.paymentId ? "TuitionPayment" : "StudentTuition",
        entityId: saved.paymentId ?? saved.tuitionId,
        newValue: {
          enrollmentId,
          courseId: course.id,
          amount: saved.cash,
          method: methodRaw,
          paidAt: paidAt.toISOString(),
          discount,
          invoiceNo,
        },
        undo: undoCreate(
          saved.createdTuition
            ? [{ model: "studentTuition" as const, id: saved.tuitionId }]
            : [
                saved.discountEntryId ? { model: "tuitionEntry" as const, id: saved.discountEntryId } : null,
                saved.textbookEntryId ? { model: "tuitionEntry" as const, id: saved.textbookEntryId } : null,
                saved.paymentId ? { model: "tuitionPayment" as const, id: saved.paymentId } : null,
              ].filter((row): row is { model: "tuitionEntry" | "tuitionPayment"; id: string } => Boolean(row)),
          {
            label: saved.createdTuition
              ? "Hoàn tác? Hồ sơ học phí vừa tạo sẽ bị xoá cùng phiếu thu."
              : "Hoàn tác? Phiếu thu vừa ghi sẽ bị xoá và công nợ tính lại.",
            after: {
              recalcTuitionIds: [saved.tuitionId],
              revalidate: [
                `/hoc-vien/${enrollment.studentId}`,
                `/lop-hoc/${enrollment.classId}`,
                "/hoc-phi",
                "/hoc-phi/bao-cao",
              ],
            },
          },
        ),
      });

      const methodLabel = methodRaw === "BANK_TRANSFER" ? "chuyển khoản" : "tiền mặt";
      const cashLabel =
        saved.cash > 0 ? `thu ${formatCurrency(saved.cash)} (${methodLabel})` : "trừ hết từ tiền tạm ứng";
      const discountLabel = discount > 0 ? ` miễn giảm ${formatCurrency(discount)},` : "";
      return `Đã thu học phí khóa ${course.name} cho ${enrollment.student.fullName},${discountLabel} ${cashLabel}.`;
    }

    const remaining = enrollment.tuition
      ? (enrollment.tuition.totalSessions ?? 0) - enrollment.tuition.usedSessions
      : 0;
    const coverageFrom = await coverageStartDate({
      studentId: enrollment.studentId,
      classId: enrollment.classId,
      joinedAt: enrollment.joinedAt,
      totalSessions: enrollment.tuition?.totalSessions ?? 0,
      remainingBefore: remaining,
      paidAt,
    });

    const pkg = await prisma.normalPackage.findUnique({
      where: { id: planId },
      select: {
        id: true,
        name: true,
        totalSessions: true,
        price: true,
        isActive: true,
        subLevel: { select: { basePrice: true, discount24Weeks: true, discount12Weeks: true } },
      },
    });
    if (!pkg || !pkg.isActive) fail("Không tìm thấy gói học phí đã chọn.");

    const packagePrice = resolveNormalPackagePrice({
      price: pkg.price,
      totalSessions: pkg.totalSessions,
      basePrice24: pkg.subLevel?.basePrice,
      discount24: pkg.subLevel?.discount24Weeks,
      discount12: pkg.subLevel?.discount12Weeks,
    });
    const price = Number(packagePrice);
    if (discount > price) {
      fail("Miễn giảm không được lớn hơn học phí gói.");
    }
    const note = [
      `${pkg.name} — ${pkg.totalSessions} buổi`,
      coverageFrom ? `Học phí kể từ ${formatDate(coverageFrom)}` : null,
    ]
      .filter(Boolean)
      .join(". ");

    const saved = await prisma.$transaction(async (tx) => {
      let nextTuitionId: string;
      let createdTuition = false;
      let entryId: string | null = null;
      const before = enrollment.tuition;

      if (!enrollment.tuition) {
        nextTuitionId = await createTuitionForEnrollment(tx, {
          enrollmentId,
          studentId: enrollment.studentId,
          plan: { kind: "NORMAL", packageId: pkg.id },
          skipAdvance: true,
        });
        createdTuition = true;
        if (coverageFrom) {
          await tx.tuitionEntry.updateMany({
            where: { tuitionId: nextTuitionId, type: "BASE" },
            data: { note },
          });
        }
      } else {
        nextTuitionId = enrollment.tuition.id;
        await tx.studentTuition.update({
          where: { id: nextTuitionId },
          data: {
            totalSessions: (enrollment.tuition.totalSessions ?? 0) + pkg.totalSessions,
            packageId: pkg.id,
            // Lần mua thêm gói trên cùng hồ sơ luôn là gia hạn. Các lần đóng
            // tiếp theo qua màn chi tiết cũng kế thừa loại này.
            currentRevenueKind: "RENEWAL",
          },
        });
        const entry = await tx.tuitionEntry.create({
          data: {
            tuitionId: nextTuitionId,
            type: "BASE",
            amount: packagePrice,
            quantity: 1,
            note,
          },
        });
        entryId = entry.id;
        await recalcTuition(nextTuitionId, tx);
      }

      const settled = await settleCollect(tx, {
        tuitionId: nextTuitionId,
        studentId: enrollment.studentId,
        paidAt,
        discount,
        discountReason,
        textbook,
        invoiceNo,
        method: methodRaw as PaymentMethod,
        note,
        coverageFrom,
      });

      const tuition = await tx.studentTuition.findUnique({
        where: { id: nextTuitionId },
        select: { totalSessions: true, usedSessions: true },
      });

      return {
        tuitionId: nextTuitionId,
        createdTuition,
        entryId,
        paymentId: settled.paymentId,
        discountEntryId: settled.discountEntryId,
        textbookEntryId: settled.textbookEntryId,
        cash: settled.cash,
        before,
        remaining: (tuition?.totalSessions ?? 0) - (tuition?.usedSessions ?? 0),
      };
    });

    tuitionId = saved.tuitionId;
    const undoRows = saved.createdTuition
      ? [{ model: "studentTuition" as const, id: saved.tuitionId }]
      : [
          saved.entryId ? { model: "tuitionEntry" as const, id: saved.entryId } : null,
          saved.discountEntryId ? { model: "tuitionEntry" as const, id: saved.discountEntryId } : null,
          saved.textbookEntryId ? { model: "tuitionEntry" as const, id: saved.textbookEntryId } : null,
          saved.paymentId ? { model: "tuitionPayment" as const, id: saved.paymentId } : null,
        ].filter((row): row is { model: "tuitionEntry" | "tuitionPayment"; id: string } => Boolean(row));

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: saved.paymentId ? "TuitionPayment" : "StudentTuition",
      entityId: saved.paymentId ?? saved.tuitionId,
      newValue: {
        enrollmentId,
        packageId: pkg.id,
        amount: saved.cash,
        method: methodRaw,
        sessions: pkg.totalSessions,
        fromDate: coverageFrom ? formatDate(coverageFrom) : null,
        paidAt: paidAt.toISOString(),
        discount,
        invoiceNo,
      },
      undo:
        undoRows.length === 0
          ? undefined
          : undoCreate(undoRows, {
              label: saved.createdTuition
                ? "Hoàn tác? Hồ sơ học phí vừa tạo sẽ bị xoá cùng phiếu thu."
                : "Hoàn tác? Gói vừa thu sẽ bị gỡ, phiếu thu bị xoá và số buổi trở về trước đó.",
              also:
                saved.createdTuition || !saved.before
                  ? undefined
                  : [
                      undoUpdateAlso("studentTuition", saved.tuitionId, saved.before, [
                        "totalSessions",
                        "packageId",
                        "currentRevenueKind",
                      ]),
                    ],
              after: {
                recalcTuitionIds: [saved.tuitionId],
                revalidate: [
                  `/hoc-vien/${enrollment.studentId}`,
                  `/lop-hoc/${enrollment.classId}`,
                  "/hoc-phi",
                  "/hoc-phi/bao-cao",
                ],
              },
            }),
    });

    const methodLabel = methodRaw === "BANK_TRANSFER" ? "chuyển khoản" : "tiền mặt";
    const cashLabel =
      saved.cash > 0 ? `thu ${formatCurrency(saved.cash)} (${methodLabel})` : "trừ hết từ tiền tạm ứng";
    const discountLabel = discount > 0 ? ` miễn giảm ${formatCurrency(discount)},` : "";
    return `Đã cộng ${pkg.totalSessions} buổi cho ${enrollment.student.fullName},${discountLabel} ${cashLabel}. Còn lại ${saved.remaining} buổi.`;
  });

  revalidatePath("/hoc-phi");
  revalidatePath("/hoc-phi/bao-cao");
  revalidatePath("/tong-quan");
  revalidatePath("/nhat-ky");
  if (studentId) revalidatePath(`/hoc-vien/${studentId}`);
  if (classId) revalidatePath(`/lop-hoc/${classId}`);
  if (tuitionId) revalidatePath(`/hoc-phi/${tuitionId}`);
  return result;
}

// ------------------------------------------------------------------
// Thanh toán (PRD §15)
// ------------------------------------------------------------------

export async function recordPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const tuitionId = requiredId(fd, "tuitionId", "hồ sơ học phí");
  let studentId: string | undefined;

  const result = await runAction(async () => {
    const tuition = await loadTuition(tuitionId);
    studentId = tuition.studentId;

    const amount = money(fd, "amount", "Số tiền");
    if (amount === "0") fail("Số tiền thanh toán phải lớn hơn 0.");

    const methodRaw = String(fd.get("method") ?? "CASH");
    if (!(PAYMENT_METHODS as string[]).includes(methodRaw)) {
      fail("Hình thức thanh toán không hợp lệ.");
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.tuitionPayment.create({
        data: {
          tuitionId,
          amount,
          method: methodRaw as PaymentMethod,
          paidAt: optionalDate(fd, "paidAt", "Ngày thu") ?? new Date(),
          reference: optionalStr(fd, "reference", 120),
          note: optionalStr(fd, "note", 300),
          revenueKind: tuition.currentRevenueKind,
        },
      });
      await recalcTuition(tuitionId, tx);
      return created;
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "TuitionPayment",
      entityId: payment.id,
      newValue: { tuitionId, amount, method: methodRaw },
      undo: undoCreate(
        { model: "tuitionPayment", id: payment.id },
        {
          label: "Hoàn tác? Phiếu thu vừa ghi sẽ bị xoá và công nợ tính lại.",
          after: { recalcTuitionIds: [tuitionId], revalidate: [`/hoc-phi/${tuitionId}`] },
        },
      ),
    });
    return "Đã ghi nhận thanh toán.";
  });

  refreshTuition(tuitionId, studentId);
  return result;
}

export async function deletePayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const id = requiredId(fd, "id", "phiếu thu");
  let tuitionId = "";
  let studentId: string | undefined;

  const result = await runAction(async () => {
    const payment = await prisma.tuitionPayment.findUnique({
      where: { id },
      select: { id: true, amount: true, method: true, tuition: { select: { id: true, studentId: true } } },
    });
    if (!payment) fail("Không tìm thấy phiếu thu.");
    tuitionId = payment.tuition.id;
    studentId = payment.tuition.studentId;

    // Chụp nguyên phiếu thu trước khi xoá để hoàn tác trả lại đủ ngày thu / tham chiếu / ghi chú.
    const snapshot = await captureRow(prisma, "tuitionPayment", id);

    await prisma.$transaction(async (tx) => {
      await tx.tuitionPayment.delete({ where: { id } });
      await recalcTuition(tuitionId, tx);
    });

    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "TuitionPayment",
      entityId: id,
      oldValue: { tuitionId, amount: payment.amount.toString(), method: payment.method },
      undo: undoDelete([snapshot], {
        label: "Hoàn tác? Phiếu thu vừa xoá sẽ được tạo lại và công nợ tính lại.",
        after: { recalcTuitionIds: [tuitionId], revalidate: [`/hoc-phi/${tuitionId}`] },
      }),
    });
    return "Đã xoá phiếu thu và tính lại công nợ.";
  });

  if (tuitionId) refreshTuition(tuitionId, studentId);
  return result;
}

// ------------------------------------------------------------------
// Bút toán thủ công: giảm giá / điều chỉnh (PRD §14.5)
// ------------------------------------------------------------------

export async function addTuitionEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const tuitionId = requiredId(fd, "tuitionId", "hồ sơ học phí");
  let studentId: string | undefined;

  const result = await runAction(async () => {
    const tuition = await loadTuition(tuitionId);
    studentId = tuition.studentId;

    const typeRaw = String(fd.get("type") ?? "");
    if (!(MANUAL_ENTRY_TYPES as string[]).includes(typeRaw)) {
      fail("Chỉ được thêm bút toán Giảm giá hoặc Điều chỉnh.");
    }

    const amount = money(fd, "amount", "Số tiền");
    if (amount === "0") fail("Số tiền phải lớn hơn 0.");
    const quantity = requiredInt(fd, "quantity", "Số lượng", { min: 1, max: 999 });
    const note = requiredStr(fd, "note", "Diễn giải", 300);

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.tuitionEntry.create({
        data: { tuitionId, type: typeRaw as TuitionEntryType, amount, quantity, note },
      });
      await recalcTuition(tuitionId, tx);
      return created;
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "TuitionEntry",
      entityId: entry.id,
      newValue: { tuitionId, type: typeRaw, amount, quantity },
      undo: undoCreate(
        { model: "tuitionEntry", id: entry.id },
        {
          label: "Hoàn tác? Bút toán vừa thêm sẽ bị xoá và công nợ tính lại.",
          after: { recalcTuitionIds: [tuitionId], revalidate: [`/hoc-phi/${tuitionId}`] },
        },
      ),
    });
    return typeRaw === "DISCOUNT" ? "Đã thêm khoản giảm giá." : "Đã thêm khoản điều chỉnh.";
  });

  refreshTuition(tuitionId, studentId);
  return result;
}

export async function deleteTuitionEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const id = requiredId(fd, "id", "bút toán");
  let tuitionId = "";
  let studentId: string | undefined;

  const result = await runAction(async () => {
    const entry = await prisma.tuitionEntry.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        amount: true,
        quantity: true,
        tuition: { select: { id: true, studentId: true } },
      },
    });
    if (!entry) fail("Không tìm thấy bút toán.");

    // BASE gắn với lần ghi danh, EXTRA_SESSION gắn với buổi đã hoàn thành (R11).
    if (entry.type === "BASE") {
      fail("Không xoá được học phí gốc. Hãy dùng bút toán Điều chỉnh nếu cần sửa số tiền.");
    }
    if (entry.type === "EXTRA_SESSION") {
      fail("Phí buổi vượt gói do hệ thống sinh. Mở lại buổi học tương ứng nếu muốn huỷ khoản này.");
    }

    tuitionId = entry.tuition.id;
    studentId = entry.tuition.studentId;

    const snapshot = await captureRow(prisma, "tuitionEntry", id);

    await prisma.$transaction(async (tx) => {
      await tx.tuitionEntry.delete({ where: { id } });
      await recalcTuition(tuitionId, tx);
    });

    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "TuitionEntry",
      entityId: id,
      oldValue: { tuitionId, type: entry.type, amount: entry.amount.toString() },
      undo: undoDelete([snapshot], {
        label: "Hoàn tác? Bút toán vừa xoá sẽ được tạo lại và công nợ tính lại.",
        after: { recalcTuitionIds: [tuitionId], revalidate: [`/hoc-phi/${tuitionId}`] },
      }),
    });
    return "Đã xoá bút toán và tính lại công nợ.";
  });

  if (tuitionId) refreshTuition(tuitionId, studentId);
  return result;
}

// ------------------------------------------------------------------
// Ghi chú hồ sơ học phí
// ------------------------------------------------------------------

export async function updateTuitionNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("tuition.manage");
  const tuitionId = requiredId(fd, "tuitionId", "hồ sơ học phí");
  let studentId: string | undefined;

  const result = await runAction(async () => {
    const tuition = await loadTuition(tuitionId);
    studentId = tuition.studentId;

    const note = optionalStr(fd, "note", 500);
    await prisma.studentTuition.update({ where: { id: tuitionId }, data: { note } });

    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "StudentTuition",
      entityId: tuitionId,
      oldValue: { note: tuition.note },
      newValue: { note },
      undo: undoUpdate("studentTuition", tuitionId, tuition, ["note"], {
        label: "Hoàn tác? Ghi chú sẽ trở về nội dung trước đó.",
        after: { revalidate: [`/hoc-phi/${tuitionId}`] },
      }),
    });
    return "Đã lưu ghi chú.";
  });

  refreshTuition(tuitionId, studentId);
  return result;
}
