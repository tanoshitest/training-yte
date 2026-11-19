/**
 * STEPS LMS — dữ liệu mẫu.
 *
 *   npm run db:seed
 *
 * Script idempotent: chạy lại nhiều lần vẫn ra cùng một kết quả (dùng upsert
 * theo các trường unique). Riêng buổi học / điểm danh / học phí sẽ được bỏ qua
 * nếu lớp đã có dữ liệu để không nhân bản.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("Thiếu biến môi trường DATABASE_URL — sao chép .env.example thành .env");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_VOCAB: Record<string, { front: string; back: string }[]> = {
  "Introducing yourself": [
    { front: "hello", back: "xin chào" },
    { front: "my name is", back: "tên tôi là" },
    { front: "nice to meet you", back: "rất vui được gặp bạn" },
    { front: "where are you from?", back: "bạn đến từ đâu?" },
    { front: "I am", back: "tôi là" },
  ],
  "Daily routine": [
    { front: "wake up", back: "thức dậy" },
    { front: "have breakfast", back: "ăn sáng" },
    { front: "go to work", back: "đi làm" },
    { front: "have lunch", back: "ăn trưa" },
    { front: "go to bed", back: "đi ngủ" },
  ],
  Shopping: [
    { front: "how much", back: "bao nhiêu tiền" },
    { front: "cheap", back: "rẻ" },
    { front: "expensive", back: "đắt" },
    { front: "size", back: "kích cỡ" },
    { front: "receipt", back: "hóa đơn" },
  ],
  "Ordering food": [
    { front: "menu", back: "thực đơn" },
    { front: "I'd like", back: "tôi muốn" },
    { front: "the bill", back: "tính tiền" },
    { front: "delicious", back: "ngon" },
    { front: "water", back: "nước" },
  ],
};

const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@stepslms.vn";
const ADMIN_PASSWORD = process.env["SEED_ADMIN_PASSWORD"] ?? "Admin@123";
const ADMIN_NAME = process.env["SEED_ADMIN_NAME"] ?? "Quản trị STEPS";
const SEED_MODE = process.env["SEED_MODE"] ?? "demo";
const CENTER_NAME = process.env["SEED_CENTER_NAME"] ?? "STEPS English Center";
const TEACHER_PASSWORD = process.env["SEED_TEACHER_PASSWORD"] ?? "Teacher@123";
const ACADEMIC_EMAIL = process.env["SEED_ACADEMIC_EMAIL"] ?? "hocvu@stepslms.vn";
const ACADEMIC_PASSWORD = process.env["SEED_ACADEMIC_PASSWORD"] ?? "Academic@123";
const ACCOUNTANT_EMAIL = process.env["SEED_ACCOUNTANT_EMAIL"] ?? "ketoan@stepslms.vn";
const ACCOUNTANT_PASSWORD = process.env["SEED_ACCOUNTANT_PASSWORD"] ?? "Accountant@123";

/** Ngày local, cắt bỏ phần giờ — LessonSession.date là @db.Date. */
function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Thứ 2 của tuần chứa `d` (0 = CN). */
function mondayOf(d: Date) {
  const out = new Date(d);
  const dow = out.getDay();
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

async function main() {
  console.log("→ Seeding STEPS LMS…");
  if (SEED_MODE !== "demo" && SEED_MODE !== "bootstrap") {
    throw new Error('SEED_MODE chỉ nhận "demo" hoặc "bootstrap".');
  }

  // ---------------------------------------------------------------
  // 1. Trung tâm
  // ---------------------------------------------------------------
  const existingCenter = await prisma.center.findFirst();
  if (!existingCenter) {
    await prisma.center.create({
      data: {
        name: SEED_MODE === "bootstrap" ? CENTER_NAME : "Trung tâm Anh ngữ STEPS",
        address: SEED_MODE === "bootstrap" ? null : "123 Nguyễn Văn Cừ, Quận 1, TP. Hồ Chí Minh",
        phone: SEED_MODE === "bootstrap" ? null : "0900 000 000",
        email: SEED_MODE === "bootstrap" ? null : "lienhe@stepslms.vn",
      },
    });
  }

  // ---------------------------------------------------------------
  // 2. Tài khoản
  // ---------------------------------------------------------------
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: SEED_MODE === "bootstrap"
      ? { role: "ADMIN", isActive: true, fullName: ADMIN_NAME, passwordHash: adminPasswordHash }
      : { role: "ADMIN", isActive: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      fullName: SEED_MODE === "bootstrap" ? ADMIN_NAME : "Quản trị viên",
      phone: SEED_MODE === "bootstrap" ? null : "0900 000 001",
      role: "ADMIN",
    },
  });

  if (SEED_MODE === "bootstrap") {
    console.log("✓ Khởi tạo production hoàn tất: chỉ tạo trung tâm và tài khoản Admin.");
    console.log(`  Admin: ${ADMIN_EMAIL}`);
    return;
  }

  const teacherSeeds = [
    { email: "an.nguyen@stepslms.vn", fullName: "Nguyễn Thị An", code: "GV001" },
    { email: "binh.tran@stepslms.vn", fullName: "Trần Văn Bình", code: "GV002" },
    { email: "chi.le@stepslms.vn", fullName: "Lê Minh Chi", code: "GV003" },
  ];

  const teacherHash = await bcrypt.hash(TEACHER_PASSWORD, 10);
  const teachers = [];
  for (const t of teacherSeeds) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { fullName: t.fullName, role: "TEACHER", isActive: true },
      create: {
        email: t.email,
        passwordHash: teacherHash,
        fullName: t.fullName,
        role: "TEACHER",
      },
    });
    const teacher = await prisma.teacher.upsert({
      where: { userId: user.id },
      update: { code: t.code },
      create: { userId: user.id, code: t.code },
    });
    teachers.push(teacher);
  }

  await prisma.user.upsert({
    where: { email: ACADEMIC_EMAIL },
    update: { fullName: "Học vụ", role: "ACADEMIC", isActive: true },
    create: {
      email: ACADEMIC_EMAIL,
      passwordHash: await bcrypt.hash(ACADEMIC_PASSWORD, 10),
      fullName: "Học vụ",
      phone: "0900 000 002",
      role: "ACADEMIC",
    },
  });

  await prisma.user.upsert({
    where: { email: ACCOUNTANT_EMAIL },
    update: { fullName: "Kế toán", role: "ACCOUNTANT", isActive: true },
    create: {
      email: ACCOUNTANT_EMAIL,
      passwordHash: await bcrypt.hash(ACCOUNTANT_PASSWORD, 10),
      fullName: "Kế toán",
      phone: "0900 000 003",
      role: "ACCOUNTANT",
    },
  });

  // ---------------------------------------------------------------
  // 3. Cấu hình: chi nhánh, phòng học, cấp học, ca học
  // ---------------------------------------------------------------
  const branchSeeds = ["Chi nhánh Cầu Giấy", "Chi nhánh Hà Đông", "Chi nhánh Nguyễn Trãi"];
  const branches: Record<string, { id: string }> = {};
  for (const name of branchSeeds) {
    branches[name] = await prisma.branch.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const roomSeeds = ["Phòng A101", "Phòng A102", "Phòng B101", "Phòng C101"];
  const rooms = [];
  for (const name of roomSeeds) {
    rooms.push(
      await prisma.room.upsert({
        where: { name },
        update: { branchId: null },
        create: { name },
      }),
    );
  }

  // Mỗi cấp học có danh sách level bên trong, tên tự đặt (PRD §17.4).
  // Bảng giá và lớp học chọn level từ danh mục này.
  const levelSeeds = [
    { name: "Kids 1", order: 1, subLevels: ["Starters 1", "Starters 2", "Movers 1", "Movers 2", "Flyers 1", "Flyers 2"] },
    { name: "Kids 2", order: 2, subLevels: ["KET 1", "KET 2", "PET 1", "PET 2", "PET 3"] },
    { name: "Teens 1", order: 3, subLevels: ["Teens A", "Teens B", "Teens C", "Teens D"] },
    { name: "Basic", order: 4, subLevels: ["Basic 1", "Basic 2", "Basic 3"] },
    { name: "Intermediate", order: 5, subLevels: ["Intermediate 1", "Intermediate 2", "Intermediate 3"] },
    { name: "Giao tiếp cơ bản", order: 6, subLevels: ["Giao tiếp 1", "Giao tiếp 2"] },
    { name: "IELTS Foundation", order: 7, subLevels: ["Foundation"] },
  ];
  const levels: Record<string, { id: string }> = {};
  // Khóa tra cứu là "Cấp học|Level" vì tên level chỉ duy nhất trong một cấp học.
  const subLevels: Record<string, { id: string }> = {};
  for (const l of levelSeeds) {
    const level = await prisma.level.upsert({
      where: { name: l.name },
      update: { order: l.order },
      create: { name: l.name, order: l.order },
    });
    levels[l.name] = level;

    for (const [index, subName] of l.subLevels.entries()) {
      subLevels[`${l.name}|${subName}`] = await prisma.subLevel.upsert({
        where: { levelId_name: { levelId: level.id, name: subName } },
        update: { order: index + 1 },
        create: { levelId: level.id, name: subName, order: index + 1 },
      });
    }
  }

  const periodSeeds = [
    { name: "Ca 1", startTime: "08:00", endTime: "09:30" },
    { name: "Ca 2", startTime: "09:45", endTime: "11:15" },
    { name: "Ca 3", startTime: "14:00", endTime: "15:30" },
    { name: "Ca 4", startTime: "17:30", endTime: "19:00" },
    { name: "Ca tối", startTime: "19:15", endTime: "20:45" },
  ];
  const periods: Record<string, { id: string; startTime: string; endTime: string }> = {};
  for (const p of periodSeeds) {
    periods[p.name] = await prisma.lessonPeriod.upsert({
      where: { name: p.name },
      update: { startTime: p.startTime, endTime: p.endTime },
      create: p,
    });
  }

  // ---------------------------------------------------------------
  // 4. Bảng giá (PRD §17.6 — giá là dữ liệu, không hard-code)
  // ---------------------------------------------------------------
  // Giá đặt cho từng level · số buổi.
  const packagePlans = [
    { level: "Kids 1", subLevel: "Starters 1", sessions: 48, price: 9_600_000 },
    { level: "Kids 1", subLevel: "Starters 1", sessions: 96, price: 18_240_000 },
    { level: "Kids 1", subLevel: "Starters 2", sessions: 48, price: 9_840_000 },
    { level: "Kids 2", subLevel: "KET 1", sessions: 48, price: 10_080_000 },
    { level: "Kids 2", subLevel: "KET 1", sessions: 96, price: 19_200_000 },
    { level: "Teens 1", subLevel: "Teens A", sessions: 48, price: 11_000_000 },
    { level: "Teens 1", subLevel: "Teens A", sessions: 144, price: 30_240_000 },
    { level: "Giao tiếp cơ bản", subLevel: "Giao tiếp 1", sessions: 48, price: 11_520_000 },
    { level: "Giao tiếp cơ bản", subLevel: "Giao tiếp 1", sessions: 96, price: 21_600_000 },
  ];
  for (const p of packagePlans) {
    const levelId = levels[p.level]!.id;
    const subLevelId = subLevels[`${p.level}|${p.subLevel}`]!.id;
    await prisma.normalPackage.upsert({
      where: { subLevelId_totalSessions: { subLevelId, totalSessions: p.sessions } },
      update: { price: p.price },
      create: {
        levelId,
        subLevelId,
        // Tên sinh giống hệt màn hình Cấu hình → Bảng giá.
        name: `${p.level} · ${p.subLevel} · ${p.sessions} buổi`,
        totalSessions: p.sessions,
        price: p.price,
      },
    });
  }

  const ieltsSeeds = [
    { name: "IELTS Foundation 3.5–4.5", price: 12_000_000, plannedSessions: 32 },
    { name: "IELTS Target 5.5", price: 15_000_000, plannedSessions: 36 },
    { name: "IELTS Target 6.5", price: 18_000_000, plannedSessions: 40 },
  ];
  const ieltsCourses = [];
  for (const c of ieltsSeeds) {
    ieltsCourses.push(
      await prisma.ieltsCourse.upsert({
        where: { name: c.name },
        update: { price: c.price, plannedSessions: c.plannedSessions },
        create: c,
      }),
    );
  }

  // ---------------------------------------------------------------
  // 5. Syllabus → Unit → Buổi (PRD §4)
  // ---------------------------------------------------------------
  const syllabusSeeds = [
    {
      name: "Kids 1 — Starters",
      level: "Kids 1",
      units: [
        { name: "Unit 1 · Làm quen", lessons: ["Greetings", "Numbers 1–20", "Colours", "My family"] },
        { name: "Unit 2 · Trường lớp", lessons: ["Classroom objects", "My school day", "Ôn tập & Kiểm tra"] },
      ],
    },
    {
      name: "Giao tiếp cơ bản — Everyday English",
      level: "Giao tiếp cơ bản",
      units: [
        { name: "Unit 1 · Đời sống hằng ngày", lessons: ["Introducing yourself", "Daily routine", "Shopping", "Ordering food"] },
        { name: "Unit 2 · Đi lại & Du lịch", lessons: ["Asking for directions", "At the airport", "Ôn tập giữa khóa"] },
      ],
    },
    {
      name: "IELTS Foundation — 4 kỹ năng",
      level: "IELTS Foundation",
      units: [
        { name: "Unit 1 · Listening & Reading", lessons: ["Listening Part 1", "Listening Part 2", "Reading skimming", "Reading scanning"] },
        { name: "Unit 2 · Writing & Speaking", lessons: ["Writing Task 1 overview", "Writing Task 2 structure", "Speaking Part 1", "Speaking Part 2"] },
      ],
    },
  ];

  const syllabusIds: Record<string, string> = {};
  for (const s of syllabusSeeds) {
    let syllabus = await prisma.syllabus.findFirst({ where: { name: s.name } });
    if (!syllabus) {
      syllabus = await prisma.syllabus.create({
        data: {
          name: s.name,
          levelId: levels[s.level]!.id,
          status: "ACTIVE",
          description: `Nội dung giảng dạy chuẩn cho cấp ${s.level}.`,
        },
      });
    }
    syllabusIds[s.name] = syllabus.id;

    for (const [unitIndex, unit] of s.units.entries()) {
      const unitRow = await prisma.syllabusUnit.upsert({
        where: { syllabusId_order: { syllabusId: syllabus.id, order: unitIndex + 1 } },
        update: { name: unit.name },
        create: { syllabusId: syllabus.id, name: unit.name, order: unitIndex + 1 },
      });

      for (const [lessonIndex, lessonName] of unit.lessons.entries()) {
        const demoVocab = DEMO_VOCAB[lessonName];
        const vocabulary = demoVocab ? JSON.stringify(demoVocab) : undefined;
        await prisma.syllabusLesson.upsert({
          where: { unitId_order: { unitId: unitRow.id, order: lessonIndex + 1 } },
          update: { name: lessonName, ...(vocabulary ? { vocabulary } : {}) },
          create: {
            unitId: unitRow.id,
            name: lessonName,
            order: lessonIndex + 1,
            lessonPlan: `Mục tiêu buổi học: ${lessonName}.\n1. Warm-up (10 phút)\n2. Presentation (25 phút)\n3. Practice (35 phút)\n4. Production (15 phút)\n5. Wrap-up (5 phút)`,
            vocabulary: vocabulary ?? "Danh sách từ vựng trọng tâm của buổi (cập nhật sau).",
            grammar: "Cấu trúc ngữ pháp trọng tâm của buổi (cập nhật sau).",
            homework: "Hoàn thành workbook trang tương ứng và ôn lại từ vựng.",
            materials: [
              { title: "Slide bài giảng", url: "https://example.com/slides" },
              { title: "Audio luyện nghe", url: "https://example.com/audio" },
            ] as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------
  // 6. Lớp học + lịch học
  // ---------------------------------------------------------------
  const monday = mondayOf(new Date());
  const classSeeds = [
    {
      code: "KID1-A",
      name: "Kids 1 — Lớp A",
      type: "NORMAL" as const,
      level: "Kids 1",
      subLevel: "Starters 1",
      syllabus: "Kids 1 — Starters",
      teacher: 0,
      room: 0,
      branch: "Chi nhánh Cầu Giấy",
      // weekday: 1 = Thứ 2 … 6 = Thứ 7, 0 = CN
      schedule: [
        { weekday: 2, period: "Ca 4" },
        { weekday: 5, period: "Ca 4" },
      ],
      packageSessions: 48,
    },
    {
      code: "COM1-A",
      name: "Giao tiếp cơ bản — Lớp tối",
      type: "NORMAL" as const,
      level: "Giao tiếp cơ bản",
      subLevel: "Giao tiếp 1",
      syllabus: "Giao tiếp cơ bản — Everyday English",
      teacher: 2,
      room: 1,
      branch: "Chi nhánh Cầu Giấy",
      schedule: [
        { weekday: 3, period: "Ca tối" },
        { weekday: 6, period: "Ca 2" },
      ],
      packageSessions: 48,
    },
    {
      code: "IELTS-F1",
      name: "IELTS Foundation — Khóa 1",
      type: "IELTS" as const,
      syllabus: "IELTS Foundation — 4 kỹ năng",
      teacher: 1,
      room: 2,
      branch: "Chi nhánh Hà Đông",
      schedule: [
        { weekday: 1, period: "Ca tối" },
        { weekday: 4, period: "Ca tối" },
      ],
      ieltsCourse: 0,
    },
  ];

  for (const c of classSeeds) {
    // Lớp thường đi theo lộ trình cấp + level; lớp IELTS tính trọn khóa nên chỉ gắn khóa học phí.
    const isNormal = c.type === "NORMAL";
    const levelId = isNormal && "level" in c ? levels[c.level]!.id : null;
    const subLevelId =
      isNormal && "subLevel" in c ? subLevels[`${c.level}|${c.subLevel}`]!.id : null;
    const ieltsCourseId =
      !isNormal && "ieltsCourse" in c ? ieltsCourses[c.ieltsCourse]!.id : null;
    const klass = await prisma.class.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        levelId,
        subLevelId,
        ieltsCourseId,
        branchId: branches[c.branch]!.id,
        teacherId: teachers[c.teacher]!.id,
        roomId: rooms[c.room]!.id,
        status: "ACTIVE",
      },
      create: {
        code: c.code,
        name: c.name,
        type: c.type,
        levelId,
        subLevelId,
        ieltsCourseId,
        branchId: branches[c.branch]!.id,
        teacherId: teachers[c.teacher]!.id,
        roomId: rooms[c.room]!.id,
        status: "ACTIVE",
      },
    });

    await prisma.classSyllabus.upsert({
      where: {
        classId_syllabusId: { classId: klass.id, syllabusId: syllabusIds[c.syllabus]! },
      },
      update: { order: 1 },
      create: { classId: klass.id, syllabusId: syllabusIds[c.syllabus]!, order: 1 },
    });

    for (const s of c.schedule) {
      const period = periods[s.period]!;
      await prisma.classSchedule.upsert({
        where: {
          classId_weekday_startTime: {
            classId: klass.id,
            weekday: s.weekday,
            startTime: period.startTime,
          },
        },
        update: { endTime: period.endTime, periodId: period.id },
        create: {
          classId: klass.id,
          weekday: s.weekday,
          periodId: period.id,
          startTime: period.startTime,
          endTime: period.endTime,
        },
      });
    }
  }

  // ---------------------------------------------------------------
  // 7. Học viên
  // ---------------------------------------------------------------
  const studentSeeds = [
    { code: "HV001", fullName: "Nguyễn Gia Bảo", parentName: "Nguyễn Văn Hùng", parentPhone: "0901 111 111", classCode: "KID1-A" },
    { code: "HV002", fullName: "Trần Khánh Linh", parentName: "Trần Thị Mai", parentPhone: "0901 111 112", classCode: "KID1-A" },
    { code: "HV003", fullName: "Phạm Minh Khang", parentName: "Phạm Văn Nam", parentPhone: "0901 111 113", classCode: "KID1-A" },
    { code: "HV004", fullName: "Lê Thu Hà", parentPhone: "0901 111 114", classCode: "COM1-A" },
    { code: "HV005", fullName: "Đỗ Quang Huy", parentPhone: "0901 111 115", classCode: "COM1-A" },
    { code: "HV006", fullName: "Vũ Ngọc Ánh", parentPhone: "0901 111 116", classCode: "IELTS-F1" },
    { code: "HV007", fullName: "Hoàng Đức Duy", parentPhone: "0901 111 117", classCode: "IELTS-F1" },
    { code: "HV008", fullName: "Bùi Thanh Trúc", parentPhone: "0901 111 118", classCode: null },
  ];

  for (const s of studentSeeds) {
    await prisma.student.upsert({
      where: { code: s.code },
      update: { fullName: s.fullName },
      create: {
        code: s.code,
        fullName: s.fullName,
        parentName: s.parentName ?? null,
        parentPhone: s.parentPhone,
        status: s.classCode ? "STUDYING" : "UNASSIGNED",
      },
    });
  }

  // ---------------------------------------------------------------
  // 8. Ghi danh + học phí
  // ---------------------------------------------------------------
  for (const s of studentSeeds) {
    if (!s.classCode) continue;

    const student = await prisma.student.findUniqueOrThrow({ where: { code: s.code } });
    const klass = await prisma.class.findUniqueOrThrow({
      where: { code: s.classCode },
      include: { level: true },
    });

    const enrollment = await prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: student.id, classId: klass.id } },
      update: {},
      create: { studentId: student.id, classId: klass.id, joinedAt: monday },
    });

    const existingTuition = await prisma.studentTuition.findUnique({
      where: { enrollmentId: enrollment.id },
    });
    if (existingTuition) continue;

    if (klass.type === "NORMAL") {
      const plan = classSeeds.find((c) => c.code === s.classCode)!;
      const pkg = await prisma.normalPackage.findUniqueOrThrow({
        where: {
          subLevelId_totalSessions: {
            subLevelId: klass.subLevelId!,
            totalSessions: plan.packageSessions!,
          },
        },
      });

      const tuition = await prisma.studentTuition.create({
        data: {
          studentId: student.id,
          enrollmentId: enrollment.id,
          type: "NORMAL",
          packageId: pkg.id,
          totalSessions: pkg.totalSessions,
          totalAmount: pkg.price,
        },
      });
      await prisma.tuitionEntry.create({
        data: {
          tuitionId: tuition.id,
          type: "BASE",
          amount: pkg.price,
          note: `Gói ${pkg.name}`,
        },
      });
    } else {
      const course = ieltsCourses[0]!;
      const tuition = await prisma.studentTuition.create({
        data: {
          studentId: student.id,
          enrollmentId: enrollment.id,
          type: "IELTS",
          ieltsCourseId: course.id,
          totalAmount: course.price,
        },
      });
      await prisma.tuitionEntry.create({
        data: {
          tuitionId: tuition.id,
          type: "BASE",
          amount: course.price,
          note: `Khóa ${course.name}`,
        },
      });
    }
  }

  // ---------------------------------------------------------------
  // 9. Sinh buổi học 4 tuần quanh tuần hiện tại
  // ---------------------------------------------------------------
  const allClasses = await prisma.class.findMany({
    include: {
      schedules: true,
      syllabuses: {
        orderBy: { order: "asc" },
        include: {
          syllabus: {
            include: { units: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
          },
        },
      },
      enrollments: { where: { status: "ACTIVE" } },
      _count: { select: { sessions: true } },
    },
  });

  for (const klass of allClasses) {
    if (klass._count.sessions > 0) continue; // đã sinh rồi
    if (klass.schedules.length === 0) continue;

    const lessons = klass.syllabuses.flatMap((item) =>
      item.syllabus.units.flatMap((unit) => unit.lessons),
    );

    // 2 tuần trước → 2 tuần sau tuần hiện tại
    const dates: Date[] = [];
    for (let w = -2; w <= 2; w++) {
      for (const sch of klass.schedules) {
        const d = new Date(monday);
        d.setDate(d.getDate() + w * 7 + ((sch.weekday + 6) % 7));
        dates.push(d);
      }
    }
    dates.sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sequence = 0;
    for (const d of dates) {
      const sch = klass.schedules.find((x) => x.weekday === d.getDay())!;
      sequence += 1;
      const lesson = lessons[sequence - 1];
      const isPast = d < today;

      const session = await prisma.lessonSession.create({
        data: {
          classId: klass.id,
          syllabusLessonId: lesson?.id ?? null,
          sequence,
          date: dateOnly(d),
          startTime: sch.startTime,
          endTime: sch.endTime,
          roomId: klass.roomId,
          teacherId: klass.teacherId,
          status: isPast ? "COMPLETED" : "SCHEDULED",
          completedAt: isPast ? d : null,
        },
      });

      if (!isPast) continue;

      // Điểm danh + báo cáo cho buổi đã học
      await prisma.attendance.createMany({
        data: klass.enrollments.map((e, i) => ({
          sessionId: session.id,
          studentId: e.studentId,
          status: i === 0 && sequence % 4 === 0 ? ("ABSENT" as const) : ("PRESENT" as const),
          lessonRating: i === 0 ? ("A_PLUS" as const) : ("A" as const),
          homeworkRating: i === 0 ? ("FULL_100" as const) : ("EIGHTY_80" as const),
          pronunciationVideoDone: i === 0,
          note: i === 0 ? "Tham gia tốt, phát âm rõ." : "Cần ôn lại từ vựng buổi trước.",
        })),
        skipDuplicates: true,
      });

      await prisma.lessonReport.create({
        data: {
          sessionId: session.id,
          taughtContent: lesson ? `Đã dạy: ${lesson.name}.` : `Buổi ${sequence}.`,
          classSituation: "Lớp học tập trung, tham gia hoạt động tốt.",
          homework: "Hoàn thành workbook và ôn tập từ vựng.",
        },
      });

      // R8 — chỉ trừ buổi khi session COMPLETED, và chỉ với lớp NORMAL (R9)
      if (klass.type === "NORMAL") {
        const enrollmentIds = klass.enrollments.map((e) => e.id);
        await prisma.studentTuition.updateMany({
          where: { enrollmentId: { in: enrollmentIds }, type: "NORMAL" },
          data: { usedSessions: { increment: 1 } },
        });
      }
    }
  }

  // ---------------------------------------------------------------
  // 10. Một khoản thanh toán mẫu
  // ---------------------------------------------------------------
  const firstTuition = await prisma.studentTuition.findFirst({
    where: { payments: { none: {} } },
    orderBy: { createdAt: "asc" },
  });
  if (firstTuition) {
    const amount = Number(firstTuition.totalAmount) / 2;
    await prisma.tuitionPayment.create({
      data: {
        tuitionId: firstTuition.id,
        amount,
        method: "BANK_TRANSFER",
        note: "Đóng đợt 1",
      },
    });
    await prisma.studentTuition.update({
      where: { id: firstTuition.id },
      data: { paidAmount: amount },
    });
  }

  await prisma.auditLog.create({
    data: { userId: admin.id, action: "CREATE", entity: "Seed", newValue: { source: "prisma/seed.ts" } },
  });

  const counts = {
    users: await prisma.user.count(),
    teachers: await prisma.teacher.count(),
    students: await prisma.student.count(),
    classes: await prisma.class.count(),
    syllabuses: await prisma.syllabus.count(),
    sessions: await prisma.lessonSession.count(),
    tuitions: await prisma.studentTuition.count(),
  };

  console.log("✓ Seed hoàn tất:", counts);
  console.log(`  Admin   : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Học vụ  : ${ACADEMIC_EMAIL} / ${ACADEMIC_PASSWORD}`);
  console.log(`  Kế toán : ${ACCOUNTANT_EMAIL} / ${ACCOUNTANT_PASSWORD}`);
  console.log(`  Giáo viên: ${teacherSeeds.map((t) => t.email).join(", ")} / ${TEACHER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
