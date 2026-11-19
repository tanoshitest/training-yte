/**
 * Kiểm thử end-to-end 7 luồng nghiệp vụ cốt lõi — PRD §28, §29.
 *
 *   npm run test:e2e
 *
 * Script chạy thẳng trên database (cần `npm run db:up` trước), gọi đúng các hàm
 * nghiệp vụ mà Server Action dùng (`createTuitionForEnrollment`, `applySessionCompletion`,
 * `findSessionConflicts`, …) nên nó kiểm tra logic thật chứ không mô phỏng lại.
 *
 * Dữ liệu test đều mang tiền tố `E2E-<timestamp>` và được xoá sạch ở cuối,
 * kể cả khi có assert thất bại. An toàn để chạy trên máy dev có dữ liệu seed.
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { createTuitionForEnrollment, syncStudentStatus } from "@/lib/enrollment";
import {
  advanceBalance,
  applySessionCompletion,
  applyStudentAdvanceToAll,
  remainingSessions,
  revertSessionCompletion,
} from "@/lib/tuition";
import {
  PLAN_HORIZON_DAYS,
  addExtraSession,
  classScheduleHoles,
  loadClassLessons,
  syncClassSessions,
} from "@/lib/class-plan";
import { setClassOffDays } from "@/lib/class-off-days";
import { getTodayAutomaticTasks } from "@/lib/automatic-tasks";
import { assignedSessionWhere } from "@/lib/permissions";
import { loadStaffKpi } from "@/app/(app)/tong-quan/kpi";
import { yearTuitionRevenue } from "@/app/(app)/tong-quan/revenue";
import { findSessionConflicts, nextSequence, parseTestColumns } from "@/lib/session";
import { derivedNormalPackagePrice, normalPackageDiscount } from "@/lib/normal-tuition";

// ---------------------------------------------------------------- tiện ích

const RUN = `E2E-${Date.now().toString(36).toUpperCase()}`;
let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`   ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`   ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), `nhận ${String(actual)}, mong đợi ${String(expected)}`);
}

function flow(title: string) {
  console.log(`\n${title}`);
}

/**
 * Ngày UTC thuần — LessonSession.date là @db.Date.
 *
 * Mốc "hôm nay" lấy theo lịch người dùng đúng như `todayUtc()`, không phải theo UTC:
 * máy chạy ở múi giờ +07 thì trước 7h sáng hai cách tính lệch nhau đúng một ngày.
 */
function day(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

/**
 * Số buổi mà lịch tuần sinh ra trong chân trời `[hôm nay, hôm nay + PLAN_HORIZON_DAYS]`.
 * Tính lại ngay trong test để khỏi phụ thuộc hôm nay là thứ mấy.
 */
function countSlots(weekdays: number[]) {
  let total = 0;
  for (let i = 0; i <= PLAN_HORIZON_DAYS; i += 1) {
    if (weekdays.includes(day(i).getUTCDay())) total += 1;
  }
  return total;
}

/** Ngày gần nhất kể từ mai rơi đúng vào thứ cần tìm (0 = Chủ nhật). */
function nextWeekday(weekday: number) {
  for (let i = 1; i <= 7; i += 1) {
    const candidate = day(i);
    if (candidate.getUTCDay() === weekday) return candidate;
  }
  throw new Error(`Không tìm được thứ ${weekday}`);
}

// ---------------------------------------------------------------- kịch bản

async function main() {
  console.log(`Bộ dữ liệu kiểm thử: ${RUN}\n`);

  flow("RULE — Bảng giá lớp thường");
  equal(
    "Gói 24 tuần = gốc − miễn giảm 24 tuần",
    derivedNormalPackagePrice(4_500_000, 48, 600_000, 200_000),
    3_900_000,
  );
  equal(
    "Gói 12 tuần = (gốc − miễn giảm 12 tuần) ÷ 2",
    derivedNormalPackagePrice(4_500_000, 24, 600_000, 200_000),
    2_150_000,
  );
  equal("Biên lai 12 tuần lấy đúng mức giảm riêng", normalPackageDiscount(24, 600_000, 200_000), 200_000);
  equal(
    "Dữ liệu cũ chưa có mức 12 tuần vẫn giữ công thức nửa mức 24 tuần",
    normalPackageDiscount(24, 600_000, null),
    300_000,
  );

  // ============================================================ FLOW 1
  // Admin → Syllabus → Unit → Lesson → Class → Teacher → Student → Schedule
  flow("FLOW 1 — Tạo lớp");

  const level = await prisma.level.create({ data: { name: `${RUN} Level`, order: 99 } });

  const syllabus = await prisma.syllabus.create({
    data: {
      name: `${RUN} Syllabus`,
      levelId: level.id,
      status: "ACTIVE",
      units: {
        create: [
          {
            name: "Unit 1",
            order: 1,
            lessons: {
              create: [
                { name: "Bài 1", order: 1 },
                { name: "Bài 2", order: 2 },
              ],
            },
          },
          {
            name: "Unit 2",
            order: 2,
            lessons: { create: [{ name: "Bài 3", order: 1 }] },
          },
        ],
      },
    },
  });

  const room = await prisma.room.create({ data: { name: `${RUN} P.101`, capacity: 20 } });

  const teacherA = await prisma.teacher.create({
    data: {
      code: `${RUN}-GVA`,
      user: {
        create: {
          email: `${RUN.toLowerCase()}-gva@e2e.local`,
          passwordHash: "x",
          fullName: "GV Kiểm Thử A",
          role: "TEACHER",
        },
      },
    },
  });
  const teacherB = await prisma.teacher.create({
    data: {
      code: `${RUN}-GVB`,
      user: {
        create: {
          email: `${RUN.toLowerCase()}-gvb@e2e.local`,
          passwordHash: "x",
          fullName: "GV Kiểm Thử B",
          role: "TEACHER",
        },
      },
    },
  });

  const normalClass = await prisma.class.create({
    data: {
      code: `${RUN}-N`,
      name: `${RUN} Lớp thường`,
      type: "NORMAL",
      levelId: level.id,
      syllabuses: { create: { syllabusId: syllabus.id, order: 1 } },
      teacherId: teacherA.id,
      roomId: room.id,
      status: "ACTIVE",
    },
    include: { syllabuses: { select: { syllabusId: true } } },
  });

  check(
    "Class gắn được Syllabus và Teacher",
    normalClass.syllabuses.map((item) => item.syllabusId).includes(syllabus.id) &&
      normalClass.teacherId === teacherA.id,
  );

  const lessons = await loadClassLessons(prisma, normalClass.id);
  equal(
    "Buổi học của lớp phẳng theo thứ tự Syllabus → Chặng → Buổi",
    lessons.map((l) => l.name).join(","),
    "Bài 1,Bài 2,Bài 3",
  );

  // Gói 48 buổi (PRD §28 FLOW 3) — giá lấy từ bảng giá, không hard-code trong nghiệp vụ.
  const pkg48 = await prisma.normalPackage.create({
    data: { levelId: level.id, name: `${RUN} Gói 48`, totalSessions: 48, price: 9_600_000 },
  });

  const student = await prisma.student.create({
    data: { code: `${RUN}-HV1`, fullName: "Học Viên Kiểm Thử" },
  });

  const tuitionId = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: { studentId: student.id, classId: normalClass.id, status: "ACTIVE" },
    });
    const id = await createTuitionForEnrollment(tx, {
      enrollmentId: enrollment.id,
      studentId: student.id,
      plan: { kind: "NORMAL", packageId: pkg48.id },
    });
    await syncStudentStatus(tx, student.id);
    return id;
  });

  const afterEnroll = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
  equal("Ghi danh xong học viên chuyển sang Đang học", afterEnroll.status, "STUDYING");

  // Tạo lịch: 3 buổi, gắn bài học theo thứ tự syllabus.
  const sessionIds: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const sequence = await nextSequence(prisma, normalClass.id);
    const created = await prisma.lessonSession.create({
      data: {
        classId: normalClass.id,
        sequence,
        date: day(i),
        startTime: "18:00",
        endTime: "20:00",
        roomId: room.id,
        teacherId: teacherA.id,
        syllabusLessonId: lessons[i]?.id ?? null,
      },
    });
    sessionIds.push(created.id);
  }
  equal("Sinh đủ 3 buổi học", sessionIds.length, 3);

  const conflicts = await findSessionConflicts(prisma, {
    date: day(0),
    startTime: "19:00",
    endTime: "21:00",
    roomId: room.id,
    teacherId: teacherA.id,
  });
  check("Phát hiện trùng phòng và trùng giáo viên", conflicts.length === 2, `nhận ${conflicts.length} xung đột`);

  const tuitionAfterSchedule = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuitionId } });
  equal("R6 — tạo lịch KHÔNG trừ buổi", tuitionAfterSchedule.usedSessions, 0);
  equal("Học phí gốc lấy từ bảng giá", Number(tuitionAfterSchedule.totalAmount), 9_600_000);

  // ============================================================ FLOW 2
  // Teacher → điểm danh → báo cáo → hoàn thành buổi
  flow("FLOW 2 — Dạy học");

  const s1 = sessionIds[0]!;
  await prisma.attendance.create({
    data: { sessionId: s1, studentId: student.id, status: "PRESENT" },
  });
  await prisma.lessonReport.create({
    data: {
      sessionId: s1,
      taughtContent: "Bài 1 — Unit 1",
      classSituation: "Lớp học tốt",
      homework: "Workbook trang 5",
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.attendance.create({
      data: { sessionId: sessionIds[1]!, studentId: student.id, status: "PRESENT" },
    });
    await tx.lessonSession.update({
      where: { id: s1 },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await applySessionCompletion(tx, s1);
  });

  const s1Full = await prisma.lessonSession.findUniqueOrThrow({
    where: { id: s1 },
    include: { attendances: true, report: true },
  });
  check(
    "Buổi có điểm danh + báo cáo và đã hoàn thành",
    s1Full.status === "COMPLETED" && s1Full.attendances.length === 1 && s1Full.report !== null,
  );

  // ============================================================ FLOW 3
  // NORMAL: 48 buổi → học buổi 1 còn 47 → học buổi 2 còn 46
  flow("FLOW 3 — Lớp thường trừ buổi");

  const afterS1 = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuitionId } });
  equal("Học buổi 1 → còn 47 buổi", remainingSessions(afterS1), 47);

  await prisma.$transaction(async (tx) => {
    await tx.lessonSession.update({
      where: { id: sessionIds[1]! },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await applySessionCompletion(tx, sessionIds[1]!);
  });

  const afterS2 = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuitionId } });
  equal("Học buổi 2 → còn 46 buổi", remainingSessions(afterS2), 46);
  equal("Học phí không đổi khi chưa vượt gói", Number(afterS2.totalAmount), 9_600_000);

  // R7 — mở lại buổi đã hoàn thành thì phải hoàn buổi đã trừ.
  await prisma.$transaction(async (tx) => {
    await tx.lessonSession.update({
      where: { id: sessionIds[1]! },
      data: { status: "CANCELLED", completedAt: null, cancelReason: "Kiểm thử R7" },
    });
    await revertSessionCompletion(tx, sessionIds[1]!);
  });
  const afterRevert = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuitionId } });
  equal("R7 — huỷ buổi đã hoàn thành thì hoàn lại buổi", remainingSessions(afterRevert), 47);

  // R11 — buổi vượt gói phát sinh bút toán EXTRA_SESSION.
  flow("FLOW 3b — Buổi vượt gói (R11)");

  const pkg1 = await prisma.normalPackage.create({
    data: {
      levelId: level.id,
      name: `${RUN} Gói 1`,
      totalSessions: 1,
      price: 500_000,
      extraUnitPrice: 500_000,
    },
  });
  const smallClass = await prisma.class.create({
    data: {
      code: `${RUN}-X`,
      name: `${RUN} Lớp vượt gói`,
      type: "NORMAL",
      levelId: level.id,
      teacherId: teacherA.id,
      status: "ACTIVE",
    },
  });
  const student2 = await prisma.student.create({
    data: { code: `${RUN}-HV2`, fullName: "Học Viên Vượt Gói" },
  });
  const tuition2Id = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: { studentId: student2.id, classId: smallClass.id, status: "ACTIVE" },
    });
    return createTuitionForEnrollment(tx, {
      enrollmentId: enrollment.id,
      studentId: student2.id,
      plan: { kind: "NORMAL", packageId: pkg1.id },
    });
  });

  for (let i = 0; i < 2; i += 1) {
    const sequence = await nextSequence(prisma, smallClass.id);
    const created = await prisma.lessonSession.create({
      data: {
        classId: smallClass.id,
        sequence,
        date: day(i),
        startTime: "08:00",
        endTime: "10:00",
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.attendance.create({
        data: { sessionId: created.id, studentId: student2.id, status: "PRESENT" },
      });
      await tx.lessonSession.update({
        where: { id: created.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await applySessionCompletion(tx, created.id);
    });
  }

  const tuition2 = await prisma.studentTuition.findUniqueOrThrow({
    where: { id: tuition2Id },
    include: { entries: true },
  });
  equal("Học 2 buổi trên gói 1 buổi → vượt 1 buổi", tuition2.extraSessions, 1);
  equal(
    "R11 — sinh bút toán EXTRA_SESSION",
    tuition2.entries.filter((e) => e.type === "EXTRA_SESSION").length,
    1,
  );
  equal("Học phí tăng đúng đơn giá buổi vượt", Number(tuition2.totalAmount), 1_000_000);

  // ============================================================ FLOW 4
  // IELTS: trọn khóa, tăng buổi không tăng học phí
  flow("FLOW 4 — IELTS trọn khóa");

  const course = await prisma.ieltsCourse.create({
    data: { name: `${RUN} IELTS 6.5`, price: 10_000_000, plannedSessions: 30 },
  });
  const ieltsClass = await prisma.class.create({
    data: {
      code: `${RUN}-I`,
      name: `${RUN} Lớp IELTS`,
      type: "IELTS",
      teacherId: teacherA.id,
      status: "ACTIVE",
    },
  });
  const student3 = await prisma.student.create({
    data: { code: `${RUN}-HV3`, fullName: "Học Viên IELTS" },
  });
  const tuition3Id = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: { studentId: student3.id, classId: ieltsClass.id, status: "ACTIVE" },
    });
    return createTuitionForEnrollment(tx, {
      enrollmentId: enrollment.id,
      studentId: student3.id,
      plan: { kind: "IELTS", ieltsCourseId: course.id },
    });
  });

  const ieltsBefore = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuition3Id } });
  equal("Học phí IELTS = giá khóa", Number(ieltsBefore.totalAmount), 10_000_000);
  equal("R10 — IELTS không quản lý theo buổi", remainingSessions(ieltsBefore), null);

  // Học 1 buổi + tăng thêm 5 buổi ngoài kế hoạch.
  for (let i = 0; i < 6; i += 1) {
    const sequence = await nextSequence(prisma, ieltsClass.id);
    const created = await prisma.lessonSession.create({
      data: {
        classId: ieltsClass.id,
        sequence,
        date: day(i),
        startTime: "14:00",
        endTime: "16:00",
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.lessonSession.update({
        where: { id: created.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await applySessionCompletion(tx, created.id);
    });
  }

  const ieltsAfter = await prisma.studentTuition.findUniqueOrThrow({
    where: { id: tuition3Id },
    include: { entries: true },
  });
  equal("R9 — IELTS học buổi nào cũng không trừ buổi", ieltsAfter.usedSessions, 0);
  equal("R10 — tăng 5 buổi vẫn không tăng học phí", Number(ieltsAfter.totalAmount), 10_000_000);
  equal("IELTS không sinh bút toán buổi vượt", ieltsAfter.entries.length, 1);

  // ============================================================ FLOW 5
  // Admin đổi giáo viên của một buổi → buổi thuộc lịch giáo viên mới
  flow("FLOW 5 — Admin đổi giáo viên");

  const s3 = sessionIds[2]!;
  const before = await prisma.lessonSession.findUniqueOrThrow({ where: { id: s3 } });
  await prisma.lessonSession.update({ where: { id: s3 }, data: { teacherId: teacherB.id } });
  const after = await prisma.lessonSession.findUniqueOrThrow({ where: { id: s3 } });

  equal("Buổi chuyển sang giáo viên B", after.teacherId, teacherB.id);
  equal("R12 — đổi giáo viên không đổi bài học", after.syllabusLessonId, before.syllabusLessonId);
  equal("R12 — đổi giáo viên không đổi số thứ tự buổi", after.sequence, before.sequence);

  const scheduleB = await prisma.lessonSession.count({
    where: { teacherId: teacherB.id, date: { gte: day(-1) } },
  });
  equal("Buổi xuất hiện trong lịch của giáo viên B", scheduleB, 1);

  const scheduleA = await prisma.lessonSession.count({
    where: { teacherId: teacherA.id, classId: normalClass.id },
  });
  equal("Lịch giáo viên A còn 2 buổi của lớp", scheduleA, 2);

  // ============================================================ FLOW 6
  // Thu tạm ứng cho học viên chưa xếp lớp → xếp lớp thì học phí tự trừ khoản đã nộp
  flow("FLOW 6 — Thu học phí tạm ứng");

  const student4 = await prisma.student.create({
    data: { code: `${RUN}-HV4`, fullName: "Học Viên Tạm Ứng" },
  });

  // Chưa có hồ sơ học phí nào — tiền phải nằm lại thành số dư.
  await prisma.$transaction(async (tx) => {
    await tx.studentAdvance.create({ data: { studentId: student4.id, amount: 600_000 } });
    await applyStudentAdvanceToAll(tx, student4.id);
  });
  const advancesBefore = await prisma.studentAdvance.findMany({
    where: { studentId: student4.id },
    select: { amount: true, usedAmount: true },
  });
  equal("Thu tạm ứng khi chưa xếp lớp → số dư dương", advanceBalance(advancesBefore), 600_000);

  // Xếp vào lớp gói 500.000 → trừ hết nợ, còn dư 100.000.
  const tuition4Id = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: { studentId: student4.id, classId: smallClass.id, status: "ACTIVE" },
    });
    return createTuitionForEnrollment(tx, {
      enrollmentId: enrollment.id,
      studentId: student4.id,
      plan: { kind: "NORMAL", packageId: pkg1.id },
    });
  });

  const tuition4 = await prisma.studentTuition.findUniqueOrThrow({
    where: { id: tuition4Id },
    include: { payments: true },
  });
  equal("Xếp lớp xong tự trừ tạm ứng vào học phí", Number(tuition4.paidAmount), 500_000);
  equal("Khoản trừ được ghi thành phiếu thu", tuition4.payments.length, 1);
  equal(
    "Công nợ về 0 sau khi trừ",
    Number(tuition4.totalAmount) - Number(tuition4.paidAmount),
    0,
  );

  const advancesAfter = await prisma.studentAdvance.findMany({
    where: { studentId: student4.id },
    select: { amount: true, usedAmount: true },
  });
  equal("Phần chưa dùng vẫn là số dư", advanceBalance(advancesAfter), 100_000);

  // Chạy lại không được trừ thêm lần nữa — tiền chỉ dùng đúng một lần.
  await prisma.$transaction((tx) => applyStudentAdvanceToAll(tx, student4.id));
  const tuition4Again = await prisma.studentTuition.findUniqueOrThrow({ where: { id: tuition4Id } });
  equal("Hết nợ thì không trừ thêm tạm ứng", Number(tuition4Again.paidAmount), 500_000);

  // ============================================================ FLOW 7
  // Lớp cần dạy thêm một buổi ngoài giáo trình → đặt buổi rời cho riêng lớp đó
  flow("FLOW 7 — Thêm buổi cho riêng lớp");

  // Lớp không có ngày bắt đầu / ngày kết thúc: chỉ cần lịch tuần là buổi được dựng
  // kín chân trời `PLAN_HORIZON_DAYS`, Syllabus (3 bài) rót xuống các buổi đầu tiên.
  const extraClass = await prisma.class.create({
    data: {
      code: `${RUN}-EX`,
      name: `${RUN} Lớp thêm buổi`,
      type: "NORMAL",
      levelId: level.id,
      syllabuses: { create: { syllabusId: syllabus.id, order: 1 } },
      teacherId: teacherA.id,
      roomId: room.id,
      status: "ACTIVE",
      schedules: {
        create: [
          { weekday: 1, startTime: "18:00", endTime: "20:00" },
          { weekday: 3, startTime: "18:00", endTime: "20:00" },
        ],
      },
    },
  });

  await syncClassSessions(prisma, extraClass.id);
  const planBefore = await prisma.lessonSession.findMany({
    where: { classId: extraClass.id },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, syllabusLesson: { select: { name: true } } },
  });
  equal("Thời khoá biểu dựng buổi kín chân trời", planBefore.length, countSlots([1, 3]));
  equal(
    "Ba buổi đầu nhận đúng ba bài của Syllabus",
    planBefore.slice(0, 3).map((s) => s.syllabusLesson?.name ?? "—").join(","),
    "Bài 1,Bài 2,Bài 3",
  );
  check(
    "Hết bài thì buổi để trống, chờ gán syllabus tiếp theo",
    planBefore.slice(3).every((s) => s.syllabusLesson === null),
  );
  check(
    "Buổi chỉ rơi vào đúng thứ đã cấu hình",
    planBefore.every((s) => s.date.getUTCDay() === 1 || s.date.getUTCDay() === 3),
  );

  // Đặt một buổi rời vào Thứ 7 gần nhất — ngày **ngoài** thời khoá biểu tuần.
  const extraDate = nextWeekday(6);
  await addExtraSession(prisma, {
    classId: extraClass.id,
    date: extraDate,
    startTime: "08:00",
    endTime: "10:00",
    roomId: room.id,
    teacherId: teacherA.id,
  });

  const planAfter = await prisma.lessonSession.findMany({
    where: { classId: extraClass.id },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      isExtra: true,
      syllabusLessonId: true,
      syllabusLesson: { select: { name: true } },
    },
  });
  const extraSession = planAfter.find((s) => s.isExtra);

  equal("Lớp có thêm đúng một buổi", planAfter.length, planBefore.length + 1);
  equal(
    "Kế hoạch bài học của các buổi cũ giữ nguyên",
    planAfter
      .filter((s) => s.syllabusLesson !== null)
      .map((s) => s.syllabusLesson!.name)
      .join(","),
    "Bài 1,Bài 2,Bài 3",
  );
  check(
    "Buổi thêm không nhận bài của Syllabus",
    extraSession != null && extraSession.syllabusLessonId === null,
  );
  check(
    "Buổi thêm nằm đúng ngày giờ đã chọn, ngoài thời khoá biểu",
    extraSession?.date.toISOString() === extraDate.toISOString()
      && extraSession?.startTime === "08:00",
  );
  check(
    "Các buổi còn lại không bị đánh dấu buổi thêm",
    planAfter.filter((s) => s.isExtra).length === 1,
  );

  // Dựng lại buổi từ thời khoá biểu không được xoá hay lấn buổi thêm.
  const resync = await syncClassSessions(prisma, extraClass.id);
  equal("Dựng lại buổi không sinh thêm", resync.created, 0);
  equal("Dựng lại buổi không xoá buổi thêm", resync.removed, 0);

  // Syllabus gốc và lớp khác không được đổi gì.
  const lessonsAfter = await loadClassLessons(prisma, extraClass.id);
  equal(
    "Syllabus gốc không đổi số bài",
    lessonsAfter.map((l) => l.name).join(","),
    "Bài 1,Bài 2,Bài 3",
  );
  const otherClassExtras = await prisma.lessonSession.count({
    where: { classId: normalClass.id, isExtra: true },
  });
  equal("Lớp khác không bị thêm buổi", otherClassExtras, 0);
  const otherClassCount = await prisma.lessonSession.count({ where: { classId: normalClass.id } });
  equal("Lớp khác giữ nguyên số buổi", otherClassCount, 3);

  // Lớp chưa gán syllabus vẫn chạy: có lịch tuần là có buổi để điểm danh hằng ngày.
  const holeClass = await prisma.class.create({
    data: {
      code: `${RUN}-HOLE`,
      name: `${RUN} Lớp chưa gán syllabus`,
      type: "NORMAL",
      levelId: level.id,
      teacherId: teacherA.id,
      roomId: room.id,
      status: "ACTIVE",
      schedules: { create: [{ weekday: 1, startTime: "18:00", endTime: "20:00" }] },
    },
  });

  await syncClassSessions(prisma, holeClass.id);
  const holeSessions = await prisma.lessonSession.findMany({
    where: { classId: holeClass.id },
    select: { date: true, startTime: true, syllabusLessonId: true },
  });
  equal("Lớp chưa gán syllabus vẫn dựng đủ buổi", holeSessions.length, countSlots([1]));
  check(
    "Buổi của lớp chưa gán syllabus để trống bài",
    holeSessions.every((s) => s.syllabusLessonId === null),
  );

  // Trong chân trời đã có buổi thật nên không vẽ ô mờ chồng lên.
  const holesInHorizon = await classScheduleHoles(
    prisma,
    { from: day(0), to: day(13) },
    { classId: holeClass.id },
  );
  equal("Trong chân trời không vẽ ô mờ chồng lên buổi thật", holesInHorizon.length, 0);

  // Vượt quá chân trời thì buổi chưa dựng — lịch tháng sau nữa vẫn thấy lớp chiếm chỗ.
  const holes = await classScheduleHoles(
    prisma,
    { from: day(PLAN_HORIZON_DAYS + 1), to: day(PLAN_HORIZON_DAYS + 14) },
    { classId: holeClass.id },
  );
  equal("Vượt chân trời thì hiện ô mờ theo thời khoá biểu", holes.length, 2);
  equal("Ô mờ nói rõ lý do", holes[0]?.reason, "Lịch dự kiến theo thời khoá biểu");
  check(
    "Ô mờ đúng thứ và khung giờ đã cấu hình",
    holes.every((hole) => hole.date.getUTCDay() === 1 && hole.startTime === "18:00"),
  );

  // ============================================================ FLOW 8
  // Đổi thời khoá biểu giữa tuần: buổi rỗng của lịch cũ phải biến mất, dữ liệu đã dạy phải giữ lại.
  flow("FLOW 8 — Đổi thời khoá biểu giữa tuần");

  const oldSchedule = {
    weekday: day(-1).getUTCDay(),
    startTime: "15:00",
    endTime: "16:30",
  };
  const newSchedule = {
    weekday: day(1).getUTCDay(),
    startTime: "19:00",
    endTime: "20:30",
  };
  const changedClass = await prisma.class.create({
    data: {
      code: `${RUN}-CHANGE`,
      name: `${RUN} Lớp đổi lịch`,
      type: "NORMAL",
      levelId: level.id,
      teacherId: teacherA.id,
      roomId: room.id,
      status: "ACTIVE",
      schedules: { create: [oldSchedule] },
    },
  });

  const oldEmpty = await prisma.lessonSession.create({
    data: {
      classId: changedClass.id,
      sequence: 1,
      date: day(-1),
      startTime: oldSchedule.startTime,
      endTime: oldSchedule.endTime,
      teacherId: teacherA.id,
      roomId: room.id,
    },
  });
  const oldWithReport = await prisma.lessonSession.create({
    data: {
      classId: changedClass.id,
      sequence: 2,
      date: day(-8),
      startTime: oldSchedule.startTime,
      endTime: oldSchedule.endTime,
      teacherId: teacherA.id,
      roomId: room.id,
      report: { create: { taughtContent: "Nội dung đã dạy cần giữ lại" } },
    },
  });

  const changedSync = await prisma.$transaction(async (tx) => {
    await tx.classSchedule.deleteMany({ where: { classId: changedClass.id } });
    await tx.classSchedule.create({ data: { ...newSchedule, classId: changedClass.id } });
    const synced = await syncClassSessions(tx, changedClass.id, {
      previousSchedules: [oldSchedule],
      assignLessons: false,
    });
    return synced;
  });

  equal("Đổi lịch xoá đúng buổi rỗng của lịch cũ đã qua ngày", changedSync.removed, 1);
  equal(
    "Buổi rỗng lịch cũ không còn xuất hiện lần hai",
    await prisma.lessonSession.count({ where: { id: oldEmpty.id } }),
    0,
  );
  equal(
    "Buổi lịch sử đã có báo cáo vẫn được giữ nguyên",
    await prisma.lessonSession.count({ where: { id: oldWithReport.id } }),
    1,
  );
  equal(
    "Lịch mới được dựng đủ trong chân trời",
    await prisma.lessonSession.count({
      where: { classId: changedClass.id, date: { gte: day(0) }, startTime: newSchedule.startTime },
    }),
    countSlots([newSchedule.weekday]),
  );

  // Mô phỏng dữ liệu trùng đã tồn tại trước khi deploy bản vá: lúc này DB chỉ còn biết
  // lịch mới, không còn `previousSchedules` để đối chiếu. Backfill khi server khởi động
  // vẫn phải dọn được thẻ rỗng lệch lịch trong tuần hiện tại.
  const existingDuplicate = await prisma.lessonSession.create({
    data: {
      classId: changedClass.id,
      sequence: 999,
      date: day(-1),
      startTime: oldSchedule.startTime,
      endTime: oldSchedule.endTime,
      teacherId: teacherA.id,
      roomId: room.id,
    },
  });
  const repaired = await syncClassSessions(prisma, changedClass.id);
  equal("Backfill tự dọn một lịch cũ đã trùng sẵn trong tuần", repaired.removed, 1);
  equal(
    "Thẻ lịch cũ tồn tại trước deploy được xoá",
    await prisma.lessonSession.count({ where: { id: existingDuplicate.id } }),
    0,
  );

  // ============================================================ FLOW 9
  // Học vụ chọn nhiều ngày nghỉ từ đúng các buổi tương lai của thời khoá biểu.
  flow("FLOW 9 — Cấu hình lịch nghỉ hàng loạt");

  const offCandidates = await prisma.lessonSession.findMany({
    where: { classId: holeClass.id, date: { gte: day(0) }, status: "SCHEDULED", isExtra: false },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 3,
    select: { id: true },
  });
  check("Có đủ buổi tương lai để cấu hình lịch nghỉ", offCandidates.length === 3);
  if (offCandidates.length !== 3) throw new Error("Không đủ buổi tương lai cho FLOW 9.");

  await prisma.lessonReport.create({
    data: { sessionId: offCandidates[2].id, taughtContent: "Dữ liệu thật cần được bảo vệ" },
  });
  const markedOff = await prisma.$transaction((tx) =>
    setClassOffDays(tx, holeClass.id, offCandidates.map((session) => session.id)),
  );
  equal("Đánh dấu nghỉ hàng loạt các buổi chưa phát sinh dữ liệu", markedOff.marked, 2);

  const afterMarkedOff = await prisma.lessonSession.findMany({
    where: { id: { in: offCandidates.map((session) => session.id) } },
    orderBy: { date: "asc" },
    select: { id: true, isOff: true, attendances: { select: { id: true } } },
  });
  check(
    "Hai buổi đã chọn được tích nghỉ học",
    offCandidates.slice(0, 2).every((candidate) =>
      afterMarkedOff.some((session) => session.id === candidate.id && session.isOff),
    ),
  );
  check(
    "Cấu hình nghỉ không tự tạo điểm danh hay trừ học phí",
    afterMarkedOff.slice(0, 2).every((session) => session.attendances.length === 0),
  );
  equal(
    "Buổi đã có báo cáo bị khoá và không bị ghi đè",
    afterMarkedOff.find((session) => session.id === offCandidates[2].id)?.isOff,
    false,
  );

  const offToday = await prisma.lessonSession.create({
    data: {
      classId: holeClass.id,
      sequence: 1000,
      date: day(0),
      startTime: "06:00",
      endTime: "07:00",
      teacherId: teacherA.id,
      roomId: room.id,
      isOff: true,
    },
  });
  const tasksForOffClass = await getTodayAutomaticTasks({
    classId: holeClass.id,
    from: day(0),
    to: day(0),
  });
  check(
    "Buổi nghỉ không sinh task điểm danh hoặc nhận xét",
    tasksForOffClass.every((task) => task.sessionId !== offToday.id),
  );

  const resumed = await prisma.$transaction((tx) => setClassOffDays(tx, holeClass.id, []));
  equal("Bỏ tích khôi phục lại toàn bộ buổi nghỉ có thể sửa", resumed.unmarked, 2);
  equal(
    "Các buổi bỏ tích trở lại trạng thái học bình thường",
    await prisma.lessonSession.count({
      where: { id: { in: offCandidates.slice(0, 2).map((session) => session.id) }, isOff: true },
    }),
    0,
  );

  // ============================================================ FLOW 10
  // Buổi kiểm tra do Học vụ phụ trách: điểm danh + điểm thang 100, không có việc nhận xét Giáo viên.
  flow("FLOW 10 — Học vụ phụ trách buổi kiểm tra");

  const academic = await prisma.user.create({
    data: {
      email: `${RUN.toLowerCase()}-academic@e2e.local`,
      passwordHash: "x",
      fullName: "Học vụ Kiểm Thử",
      role: "ACADEMIC",
    },
  });
  const academicSession = await prisma.lessonSession.create({
    data: {
      classId: normalClass.id,
      sequence: await nextSequence(prisma, normalClass.id),
      date: day(-1),
      startTime: "08:00",
      endTime: "09:30",
      roomId: room.id,
      teacherId: null,
      academicStaffId: academic.id,
      status: "COMPLETED",
      completedAt: new Date(day(-1).getTime() + 10 * 60 * 60 * 1000),
      testColumns: [
        {
          id: "midterm",
          name: "Kiểm tra giữa kỳ",
          scores: { [student.id]: 87.5 },
        },
        { id: "final", name: "Kiểm tra cuối kỳ", scores: { [student.id]: 100 } },
      ],
      attendances: { create: { studentId: student.id, status: "PRESENT" } },
    },
  });

  const storedAcademicSession = await prisma.lessonSession.findUniqueOrThrow({
    where: { id: academicSession.id },
    select: { teacherId: true, academicStaffId: true, testColumns: true },
  });
  check(
    "Buổi chỉ gán Học vụ, không đồng thời gán Giáo viên",
    storedAcademicSession.teacherId === null && storedAcademicSession.academicStaffId === academic.id,
  );
  const storedTests = parseTestColumns(storedAcademicSession.testColumns);
  equal("Điểm kiểm tra thang 100 được lưu nguyên vẹn", storedTests[1]?.scores[student.id], 100);
  equal("Điểm kiểm tra hỗ trợ một chữ số thập phân", storedTests[0]?.scores[student.id], 87.5);

  const academicConflicts = await findSessionConflicts(prisma, {
    date: day(-1),
    startTime: "08:30",
    endTime: "09:00",
    academicStaffId: academic.id,
  });
  check(
    "Phát hiện Học vụ bị xếp trùng giờ",
    academicConflicts.some((conflict) => conflict.kind === "academic"),
  );
  equal(
    "Giáo viên chủ nhiệm không được nhận buổi đã gán Học vụ",
    await prisma.lessonSession.count({
      where: { id: academicSession.id, ...assignedSessionWhere(teacherA.id) },
    }),
    0,
  );

  const academicTasks = await getTodayAutomaticTasks({
    classId: normalClass.id,
    from: day(-1),
    to: day(-1),
  });
  const sessionTasks = academicTasks.filter((task) => task.sessionId === academicSession.id);
  check(
    "Buổi Học vụ chỉ sinh task điểm danh, không sinh task nhận xét Giáo viên",
    sessionTasks.length === 1 && sessionTasks[0]?.kind === "ATTENDANCE",
  );
  equal("Task điểm danh giao đúng Học vụ", sessionTasks[0]?.assigneeId, academic.id);

  const academicKpi = (await loadStaffKpi()).find((row) => row.userId === academic.id);
  check(
    "KPI điểm danh chỉ tính cho Học vụ được phân công",
    academicKpi?.total === 1 && academicKpi.onTime === 1,
  );

  // ============================================================ FLOW 11
  // Dashboard doanh số: thực thu, tách lớp, tách đóng mới/gia hạn và loại trừ
  // giáo trình, dữ liệu cũ, phương thức kỹ thuật.
  flow("FLOW 11 — Doanh số học phí mới và gia hạn");

  const normalRevenueTuition = await prisma.studentTuition.findUniqueOrThrow({
    where: { id: tuitionId },
    select: { currentRevenueKind: true },
  });
  equal(
    "Gói đầu tiên của học viên tạo mới được phân loại đóng mới",
    normalRevenueTuition.currentRevenueKind,
    "NEW",
  );

  await prisma.tuitionPayment.createMany({
    data: [
      {
        tuitionId,
        amount: 600_000,
        method: "CASH",
        paidAt: day(0),
        revenueKind: "NEW",
      },
      {
        tuitionId,
        amount: 400_000,
        textbookAmount: 100_000,
        method: "BANK_TRANSFER",
        paidAt: day(0),
        revenueKind: "NEW",
      },
      {
        tuitionId,
        amount: 8_000_000,
        method: "CASH",
        paidAt: day(0),
        revenueKind: null,
        note: "Dữ liệu cũ không lên biểu đồ",
      },
      {
        tuitionId,
        amount: 7_000_000,
        method: "OTHER",
        paidAt: day(0),
        revenueKind: "NEW",
        note: "Bút toán kỹ thuật không lên biểu đồ",
      },
    ],
  });

  await prisma.studentTuition.update({
    where: { id: tuitionId },
    data: { currentRevenueKind: "RENEWAL" },
  });
  await prisma.tuitionPayment.create({
    data: {
      tuitionId,
      amount: 500_000,
      method: "BANK_TRANSFER",
      paidAt: day(0),
      revenueKind: "RENEWAL",
    },
  });
  await prisma.tuitionPayment.create({
    data: {
      tuitionId: tuition3Id,
      amount: 2_000_000,
      method: "CASH",
      paidAt: day(0),
      revenueKind: "NEW",
    },
  });

  const oldStudent = await prisma.student.create({
    data: {
      code: `${RUN}-HV-OLD`,
      fullName: "Học Viên Lịch Sử",
      isNewRevenueStudent: false,
    },
  });
  const oldTuitionId = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: { studentId: oldStudent.id, classId: normalClass.id, status: "ACTIVE" },
    });
    return createTuitionForEnrollment(tx, {
      enrollmentId: enrollment.id,
      studentId: oldStudent.id,
      plan: { kind: "NORMAL", packageId: pkg48.id },
    });
  });
  const oldTuition = await prisma.studentTuition.findUniqueOrThrow({
    where: { id: oldTuitionId },
    select: { currentRevenueKind: true },
  });
  equal("Học viên lịch sử luôn bắt đầu chu kỳ ở loại gia hạn", oldTuition.currentRevenueKind, "RENEWAL");

  const revenue = await yearTuitionRevenue(day(0).getUTCFullYear());
  const monthIndex = day(0).getUTCMonth();
  equal(
    "Lớp thường cộng thực thu đóng mới và trừ tiền giáo trình",
    revenue.normal[monthIndex]?.newTuition,
    900_000,
  );
  equal("Lớp thường tách riêng doanh số gia hạn", revenue.normal[monthIndex]?.renewal, 500_000);
  equal("IELTS có biểu đồ doanh số riêng", revenue.ielts[monthIndex]?.newTuition, 2_000_000);
  equal("IELTS chưa có gia hạn thì để trống", revenue.ielts[monthIndex]?.renewal, 0);
}

/** Xoá sạch dữ liệu của lần chạy này. Thứ tự theo chiều phụ thuộc khoá ngoại. */
async function cleanup() {
  const classes = await prisma.class.findMany({
    where: { code: { startsWith: RUN } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);

  if (classIds.length > 0) {
    const tuitions = await prisma.studentTuition.findMany({
      where: { enrollment: { classId: { in: classIds } } },
      select: { id: true },
    });
    const tuitionIds = tuitions.map((t) => t.id);

    await prisma.tuitionPayment.deleteMany({ where: { tuitionId: { in: tuitionIds } } });
    await prisma.tuitionEntry.deleteMany({ where: { tuitionId: { in: tuitionIds } } });
    await prisma.studentTuition.deleteMany({ where: { id: { in: tuitionIds } } });
    // Attendance / LessonReport / Enrollment / LessonSession xoá theo cascade của Class.
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  }

  await prisma.student.deleteMany({ where: { code: { startsWith: RUN } } });
  await prisma.syllabus.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.normalPackage.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.ieltsCourse.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.teacher.deleteMany({ where: { code: { startsWith: RUN } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: RUN.toLowerCase() } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.level.deleteMany({ where: { name: { startsWith: RUN } } });
}

main()
  .catch((error) => {
    failures.push(`Lỗi khi chạy: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  })
  .finally(async () => {
    await cleanup().catch((error) => {
      console.error("Không dọn được dữ liệu kiểm thử:", error);
    });
    await prisma.$disconnect();

    console.log(`\n${"─".repeat(60)}`);
    if (failures.length === 0) {
      console.log(`✅ ${passed}/${passed} kiểm tra đạt — F1–F11 hoạt động đúng.`);
      process.exit(0);
    }
    console.log(`❌ ${failures.length} kiểm tra thất bại (${passed} đạt):`);
    for (const line of failures) console.log(`   • ${line}`);
    process.exit(1);
  });
