"use server";

import { revalidatePath } from "next/cache";
import type { AdmissionPaymentStatus, AdmissionStage } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { nextStudentCode } from "@/lib/code";
import { requirePermission } from "@/lib/permissions";
import { ADMISSION_STAGES, STAGE_LABEL, TASK_LABEL, forwardStage, isEnrolledAdmissionStage, nextTaskForStage, normalizePhone } from "@/lib/recruitment";
import { bool, fail, optionalDate, optionalId, optionalInt, optionalMoney, optionalStr, requiredId, requiredStr, runAction, type ActionState } from "@/lib/form-utils";

const PAYMENT_STATUSES: AdmissionPaymentStatus[] = ["UNPAID", "DEPOSIT", "PARTIAL", "PAID", "REFUNDED"];

function refresh(id?: string) {
  revalidatePath("/tuyen-sinh");
  if (id) revalidatePath(`/tuyen-sinh/${id}`);
}

async function defaultAcademicId(tx: Prisma.TransactionClient) {
  return (await tx.user.findFirst({ where: { isActive: true, role: "ACADEMIC" }, orderBy: { fullName: "asc" }, select: { id: true } }))?.id ?? null;
}

async function syncNextTask(tx: Prisma.TransactionClient, caseId: string, stage: AdmissionStage, consultantId: string | null, actorId: string) {
  if (stage === "CARE_COMPLETE") {
    await tx.recruitmentTask.updateMany({ where: { caseId, status: "OPEN" }, data: { status: "COMPLETED", completedAt: new Date(), completedById: actorId } });
    return;
  }
  const kind = nextTaskForStage(stage);
  if (!kind) return;
  const exists = await tx.recruitmentTask.findFirst({ where: { caseId, kind, status: "OPEN" }, select: { id: true } });
  if (exists) return;
  const assigneeId = kind === "ASSESSMENT" || kind === "ONBOARDING" ? await defaultAcademicId(tx) : consultantId;
  await tx.recruitmentTask.create({ data: { caseId, kind, title: TASK_LABEL[kind], assigneeId: assigneeId ?? actorId } });
}

async function applyStageChange(
  tx: Prisma.TransactionClient,
  caseId: string,
  current: AdmissionStage,
  next: AdmissionStage,
  consultantId: string | null,
  actorId: string,
) {
  if (next === current) return;
  await tx.recruitmentTask.updateMany({ where: { caseId, status: "OPEN" }, data: { status: "COMPLETED", completedAt: new Date(), completedById: actorId } });
  await tx.recruitmentActivity.create({ data: { caseId, userId: actorId, action: "STAGE_CHANGE", detail: `${STAGE_LABEL[current]} → ${STAGE_LABEL[next]}`, oldValue: current, newValue: next } });
  await syncNextTask(tx, caseId, next, consultantId, actorId);
}

function readTestAppointment(fd: FormData) {
  const rawDate = String(fd.get("testScheduledAt") ?? "").trim();
  const rawTime = String(fd.get("testScheduledTime") ?? "").trim();
  if (!rawDate) return { at: null, hasTime: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) fail("Hẹn ngày test phải có dạng ngày/tháng/năm.");
  if (rawTime && !/^\d{2}:\d{2}$/.test(rawTime)) fail("Giờ hẹn test không hợp lệ.");
  const at = new Date(`${rawDate}T${rawTime || "00:00"}:00`);
  if (Number.isNaN(at.getTime())) fail("Hẹn ngày test không hợp lệ.");
  return { at, hasTime: Boolean(rawTime) };
}

function readPaymentStatus(fd: FormData) {
  const paymentRaw = requiredStr(fd, "paymentStatus", "Tình trạng học phí") as AdmissionPaymentStatus;
  if (!PAYMENT_STATUSES.includes(paymentRaw)) fail("Tình trạng học phí không hợp lệ.");
  return paymentRaw;
}

async function convertLeadIfReady(
  tx: Prisma.TransactionClient,
  lead: { id: string; fullName: string; phone: string; normalizedPhone: string; code: string; convertedStudentId: string | null; placementClassId: string | null },
  placementClassId: string | null,
  actorId: string,
) {
  if (lead.convertedStudentId || !placementClassId) return lead.convertedStudentId;
  const candidates = await tx.student.findMany({ where: { fullName: { equals: lead.fullName, mode: "insensitive" } }, select: { id: true, parentPhone: true } });
  const existing = candidates.find((row) => normalizePhone(row.parentPhone ?? "") === lead.normalizedPhone);
  const student = existing
    ? await tx.student.findUniqueOrThrow({ where: { id: existing.id } })
    : await tx.student.create({ data: { code: await nextStudentCode(), fullName: lead.fullName, parentPhone: lead.phone, status: "STUDYING", note: `Từ hồ sơ tuyển sinh ${lead.code}` } });
  await tx.enrollment.upsert({
    where: { studentId_classId: { studentId: student.id, classId: placementClassId } },
    update: { status: "ACTIVE", leftAt: null },
    create: { studentId: student.id, classId: placementClassId },
  });
  await tx.recruitmentActivity.create({ data: { caseId: lead.id, userId: actorId, action: "CONVERT_STUDENT", detail: `Đã tạo/gắn học viên ${student.code} và ghi danh lớp` } });
  return student.id;
}

export async function createRecruitmentCase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  return runAction(async () => {
    const fullName = requiredStr(fd, "fullName", "Họ và tên", 150);
    const phone = requiredStr(fd, "phone", "Số điện thoại", 30);
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 9) fail("Số điện thoại chưa hợp lệ.");
    const duplicate = await prisma.recruitmentCase.findFirst({ where: { normalizedPhone, fullName: { equals: fullName, mode: "insensitive" }, stage: { notIn: ["FIRST_MONTH_CARE", "CARE_COMPLETE"] } } });
    if (duplicate) fail(`Hồ sơ ${duplicate.code} cùng tên và số điện thoại đang tồn tại.`);

    const code = `TS-${Date.now().toString(36).toUpperCase()}`;
    const data = {
      code, fullName, phone, normalizedPhone, stage: "RECEIVED" as const,
      birthYear: optionalInt(fd, "birthYear", "Năm sinh", { min: 1950, max: new Date().getFullYear() }),
      schoolGrade: optionalStr(fd, "schoolGrade", 30), schoolName: optionalStr(fd, "schoolName", 150),
      consultationDate: optionalDate(fd, "consultationDate", "Ngày tư vấn") ?? new Date(),
      consultantId: optionalId(fd, "consultantId") ?? user.id, branchId: optionalId(fd, "branchId"),
    };
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.recruitmentCase.create({ data });
      await tx.recruitmentActivity.create({ data: { caseId: row.id, userId: user.id, action: "CREATE", detail: "Tiếp nhận hồ sơ tuyển sinh" } });
      await syncNextTask(tx, row.id, row.stage, row.consultantId, user.id);
      return row;
    });
    await writeAudit({ userId: user.id, action: "CREATE", entity: "RecruitmentCase", entityId: created.id, newValue: { code, fullName, phone } });
    return `Đã tạo hồ sơ ${code}.`;
  }).finally(refresh);
}

export async function saveRecruitmentIntake(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const current = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy hồ sơ tuyển sinh.");
    const phone = requiredStr(fd, "phone", "Số điện thoại", 30);
    const appointment = readTestAppointment(fd);
    const testScheduledAt = current.testWaived ? current.testScheduledAt : appointment.at;
    const hasTime = current.testWaived ? false : appointment.hasTime;
    let stage = current.stage;
    if (!isEnrolledAdmissionStage(current.stage) && current.stage !== "LOCKED" && current.stage !== "PLACED" && current.stage !== "CONSULTING") {
      if (!current.testWaived && hasTime && testScheduledAt) stage = forwardStage(current.stage, "WAITING_TEST");
      else stage = forwardStage(current.stage, "COLLECTING");
    }
    const consultantId = optionalId(fd, "consultantId");
    await prisma.$transaction(async (tx) => {
      await tx.recruitmentCase.update({
        where: { id },
        data: {
          fullName: requiredStr(fd, "fullName", "Họ và tên", 150),
          phone, normalizedPhone: normalizePhone(phone),
          birthYear: optionalInt(fd, "birthYear", "Năm sinh", { min: 1950, max: new Date().getFullYear() }),
          schoolGrade: optionalStr(fd, "schoolGrade", 30),
          schoolName: optionalStr(fd, "schoolName", 150),
          learningHistory: optionalStr(fd, "learningHistory", 3000),
          consultantId, branchId: optionalId(fd, "branchId"),
          testScheduledAt, stage,
        },
      });
      if (stage === current.stage) {
        await tx.recruitmentActivity.create({ data: { caseId: id, userId: user.id, action: "UPDATE", detail: "Cập nhật thông tin tiếp nhận" } });
      } else {
        await applyStageChange(tx, id, current.stage, stage, consultantId, user.id);
      }
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage } });
    return stage === current.stage ? "Đã lưu thông tin tiếp nhận." : `Đã lưu. Trạng thái: ${STAGE_LABEL[stage]}.`;
  }).finally(() => refresh(id));
}

export async function waiveRecruitmentTest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const current = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy hồ sơ tuyển sinh.");
    if (isEnrolledAdmissionStage(current.stage)) return "Hồ sơ đã nhập học, không đổi bước test.";
    const stage = forwardStage(current.stage, "CONSULTING");
    await prisma.$transaction(async (tx) => {
      await tx.recruitmentCase.update({ where: { id }, data: { testWaived: true, stage } });
      if (stage === current.stage) {
        await tx.recruitmentActivity.create({ data: { caseId: id, userId: user.id, action: "UPDATE", detail: "Bỏ test đầu vào" } });
      } else {
        await applyStageChange(tx, id, current.stage, stage, current.consultantId, user.id);
      }
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage, testWaived: true } });
    return `Đã bỏ test đầu vào. Trạng thái: ${STAGE_LABEL[stage]}.`;
  }).finally(() => refresh(id));
}

export async function saveRecruitmentAssessment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const current = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy hồ sơ tuyển sinh.");
    const assessment = optionalStr(fd, "assessment", 2000);
    const placementClassId = optionalId(fd, "placementClassId");
    const proposedSchedule = optionalStr(fd, "proposedSchedule", 500);
    let stage = current.stage;
    if (current.stage === "LOCKED" && placementClassId) {
      stage = forwardStage(current.stage, "PLACED");
    } else if (!isEnrolledAdmissionStage(current.stage) && current.stage !== "LOCKED" && current.stage !== "PLACED") {
      if (!assessment && !current.testWaived) fail("Nhập kết quả test trước khi chuyển sang tư vấn học phí.");
      stage = forwardStage(current.stage, "CONSULTING");
    }
    await prisma.$transaction(async (tx) => {
      await tx.recruitmentCase.update({ where: { id }, data: { assessment, placementClassId, proposedSchedule, stage } });
      if (stage === current.stage) {
        await tx.recruitmentActivity.create({ data: { caseId: id, userId: user.id, action: "UPDATE", detail: "Cập nhật kết quả test / xếp lớp" } });
      } else {
        await applyStageChange(tx, id, current.stage, stage, current.consultantId, user.id);
      }
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage } });
    return stage === current.stage ? "Đã lưu kết quả test và xếp lớp." : `Đã lưu. Trạng thái: ${STAGE_LABEL[stage]}.`;
  }).finally(() => refresh(id));
}

export async function saveRecruitmentTuition(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const current = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy hồ sơ tuyển sinh.");
    const paymentStatus = readPaymentStatus(fd);
    const tuitionAmount = optionalMoney(fd, "tuitionAmount", "Học phí");
    const textbookAmount = optionalMoney(fd, "textbookAmount", "Giáo trình");
    const discountAmount = optionalMoney(fd, "discountAmount", "Giảm giá");
    const quotedTotal = Math.max(0, Number(tuitionAmount ?? 0) + Number(textbookAmount ?? 0) - Number(discountAmount ?? 0)).toString();
    const registrationPackage = optionalStr(fd, "registrationPackage", 150);
    if (!isEnrolledAdmissionStage(current.stage) && !registrationPackage) fail("Chọn gói đăng ký trước khi chốt.");

    let stage = current.stage;
    let placementClassId = current.placementClassId;
    let proposedSchedule = current.proposedSchedule;
    const lockingNow = !isEnrolledAdmissionStage(current.stage) && ADMISSION_STAGES.indexOf(current.stage) < ADMISSION_STAGES.indexOf("LOCKED");
    if (lockingNow) {
      stage = forwardStage(current.stage, "LOCKED");
      placementClassId = null;
      proposedSchedule = null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.recruitmentCase.update({
        where: { id },
        data: {
          registrationPackage, tuitionAmount, textbookAmount, discountAmount,
          discountReason: optionalStr(fd, "discountReason", 500), quotedTotal,
          paymentStatus, paidAmount: optionalMoney(fd, "paidAmount", "Đã đóng") ?? "0",
          tuitionNote: optionalStr(fd, "tuitionNote", 1000),
          placementClassId, proposedSchedule, stage,
        },
      });
      if (stage === current.stage) {
        await tx.recruitmentActivity.create({ data: { caseId: id, userId: user.id, action: "UPDATE", detail: "Cập nhật gói học phí" } });
      } else {
        await applyStageChange(tx, id, current.stage, stage, current.consultantId, user.id);
      }
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage } });
    return stage === current.stage
      ? "Đã lưu gói học phí."
      : `Đã chốt gói. Học sinh đang ở trạng thái chưa xếp lớp — chọn lại lớp chính thức ở khối Kết quả test.`;
  }).finally(() => refresh(id));
}

export async function saveRecruitmentOnboarding(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const current = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy hồ sơ tuyển sinh.");
    const now = new Date();
    const textbookIssuedAt = bool(fd, "textbookIssued") ? current.textbookIssuedAt ?? now : null;
    const paymentStatus = current.paymentStatus;
    let stage = current.stage;
    let convertedStudentId = current.convertedStudentId;
    const readyToEnroll = paymentStatus === "PAID" && Boolean(textbookIssuedAt) && Boolean(current.placementClassId);

    await prisma.$transaction(async (tx) => {
      if (readyToEnroll) {
        convertedStudentId = await convertLeadIfReady(tx, current, current.placementClassId, user.id);
        stage = forwardStage(current.stage, "FIRST_MONTH_CARE");
      }
      await tx.recruitmentCase.update({
        where: { id },
        data: {
          expectedStartDate: optionalDate(fd, "expectedStartDate", "Ngày bắt đầu"),
          lostReason: optionalStr(fd, "lostReason", 1000),
          textbookIssuedAt,
          photoReceivedAt: bool(fd, "photoReceived") ? current.photoReceivedAt ?? now : null,
          zaloAddedAt: bool(fd, "zaloAdded") ? current.zaloAddedAt ?? now : null,
          attendanceListAddedAt: bool(fd, "attendanceListAdded") ? current.attendanceListAddedAt ?? now : null,
          consultantConfirmedAt: bool(fd, "consultantConfirmed") ? current.consultantConfirmedAt ?? now : null,
          convertedStudentId, stage,
        },
      });
      if (stage === current.stage) {
        await tx.recruitmentActivity.create({ data: { caseId: id, userId: user.id, action: "UPDATE", detail: "Cập nhật thủ tục nhập học" } });
      } else {
        await applyStageChange(tx, id, current.stage, stage, current.consultantId, user.id);
      }
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage } });
    if (readyToEnroll && stage !== current.stage) {
      revalidatePath("/hoc-vien");
      revalidatePath("/lop-hoc");
      return `Đã nhập học. Trạng thái: ${STAGE_LABEL[stage]}.`;
    }
    if (paymentStatus === "PAID" && textbookIssuedAt && !current.placementClassId) {
      return "Đã đóng học phí và giáo trình — cần xếp lớp chính thức trước khi nhập học.";
    }
    return "Đã lưu thủ tục nhập học.";
  }).finally(() => refresh(id));
}

export async function updateRecruitmentStage(fd: FormData): Promise<void> {
  const user = await requirePermission("recruitment.manage");
  const id = fd.get("id") as string;
  const stage = fd.get("stage") as AdmissionStage;
  if (!id || !ADMISSION_STAGES.includes(stage)) return;

  const current = await prisma.recruitmentCase.findUnique({ where: { id }, select: { stage: true, consultantId: true } });
  if (!current || current.stage === stage) return;

  await prisma.$transaction(async (tx) => {
    await tx.recruitmentCase.update({ where: { id }, data: { stage } });
    await applyStageChange(tx, id, current.stage, stage, current.consultantId, user.id);
  });
  await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, oldValue: { stage: current.stage }, newValue: { stage } });
  refresh(id);
}

export async function deleteRecruitmentCase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");

  return runAction(async () => {
    const lead = await prisma.recruitmentCase.findUnique({
      where: { id },
      select: { id: true, code: true, fullName: true, phone: true, stage: true, convertedStudentId: true },
    });
    if (!lead) fail("Không tìm thấy hồ sơ tuyển sinh.");

    await prisma.$transaction(async (tx) => {
      await tx.recruitmentCase.delete({ where: { id } });
      await writeAudit({ userId: user.id, action: "DELETE", entity: "RecruitmentCase", entityId: id, oldValue: lead }, tx);
    });

    refresh();
    return `Đã xóa lead ${lead.fullName}.`;
  });
}

export async function completeRecruitmentTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "taskId", "task");
  return runAction(async () => {
    const task = await prisma.recruitmentTask.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: user.id }, select: { caseId: true, title: true } });
    await prisma.recruitmentActivity.create({ data: { caseId: task.caseId, userId: user.id, action: "TASK_COMPLETED", detail: task.title } });
    refresh(task.caseId);
    return "Đã hoàn thành task.";
  });
}

export async function convertRecruitmentCase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("recruitment.manage");
  const id = requiredId(fd, "id", "hồ sơ");
  return runAction(async () => {
    const lead = await prisma.recruitmentCase.findUnique({ where: { id } });
    if (!lead) fail("Không tìm thấy hồ sơ.");
    if (!lead.placementClassId) fail("Cần xếp lớp trước khi nhập học.");
    if (lead.paymentStatus !== "PAID") fail("Học phí chưa ở trạng thái đã đóng đủ.");
    if (lead.convertedStudentId) return "Hồ sơ đã được chuyển thành học viên trước đó.";
    await prisma.$transaction(async (tx) => {
      const convertedStudentId = await convertLeadIfReady(tx, lead, lead.placementClassId, user.id);
      const stage = forwardStage(lead.stage, "FIRST_MONTH_CARE");
      await tx.recruitmentCase.update({ where: { id }, data: { convertedStudentId, stage } });
      await applyStageChange(tx, id, lead.stage, stage, lead.consultantId, user.id);
    });
    await writeAudit({ userId: user.id, action: "UPDATE", entity: "RecruitmentCase", entityId: id, newValue: { stage: "FIRST_MONTH_CARE" } });
    return "Đã chuyển thành học viên và ghi danh vào lớp.";
  }).finally(() => { refresh(id); revalidatePath("/hoc-vien"); revalidatePath("/lop-hoc"); });
}
