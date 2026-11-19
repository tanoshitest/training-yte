import { derivedNormalPackagePrice } from "@/lib/normal-tuition";
import { prisma } from "@/lib/prisma";
import type { ClassStatus, ClassType } from "@/generated/prisma/enums";
import type { PeriodOption, ScheduleSlot } from "./schedule-picker";
import type { SyllabusOption } from "./syllabus-picker";

/** Level trong cấp học, kèm học phí gốc 24 tuần và giá gói 24/48 buổi. */
export type ClassSubLevelOption = {
  id: string;
  name: string;
  basePrice24: string;
  discount24: string;
  discount12: string;
  price24: string;
  price48: string;
};

function decimalString(value: unknown) {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function packagePrice(
  packages: { totalSessions: number; price: unknown }[],
  sessions: number,
) {
  const row = packages.find((item) => item.totalSessions === sessions);
  return row ? decimalString(row.price) : "";
}

function listedFromBase(
  basePrice: unknown,
  sessions: number,
  stored: string,
  discount24?: unknown,
  discount12?: unknown,
) {
  const derived = derivedNormalPackagePrice(Number(basePrice), sessions, discount24, discount12);
  return derived != null ? String(derived) : stored;
}

/** Các danh mục dùng chung cho form tạo / sửa lớp. */
export type ClassOptions = {
  /** Cấp học kèm danh sách level bên trong để form chọn được level đang học. */
  levels: { id: string; name: string; subLevels: ClassSubLevelOption[] }[];
  branches: { id: string; name: string }[];
  syllabuses: SyllabusOption[];
  teachers: { id: string; code: string; user: { fullName: string } }[];
  rooms: { id: string; name: string }[];
  periods: PeriodOption[];
  /**
   * Khóa IELTS cho rule học phí của lớp IELTS (trọn khóa). `price` là học phí toàn khóa,
   * `basePrice` là học phí gốc. Giá để dạng chuỗi vì form lớp là client component.
   */
  ieltsCourses: { id: string; name: string; price: string; basePrice: string }[];
};

export type ClassDefaults = {
  code: string;
  name: string;
  type: ClassType;
  status: ClassStatus;
  levelId: string | null;
  subLevelId: string | null;
  branchId: string | null;
  /** Rule học phí ở cấp lớp — chỉ lớp IELTS có, vì IELTS tính trọn khóa. */
  ieltsCourseId: string | null;
  syllabusIds: string[];
  /** Lịch tuần đã lưu — sửa ngay trong form, và là căn cứ dựng buổi học của lớp. */
  schedules: ScheduleSlot[];
  teacherId: string | null;
  roomId: string | null;
  note: string | null;
};

/**
 * Nạp danh mục cho form lớp. Chỉ lấy mục đang bật để không gán nhầm
 * cấp học / phòng đã ngừng dùng; syllabus lưu trữ cũng bị loại.
 *
 * Syllabus kèm luôn số buổi (đếm qua các unit) để người xếp lớp biết mình đang gán
 * bao nhiêu buổi nội dung vào lớp.
 */
export async function loadClassOptions(): Promise<ClassOptions> {
  const [levels, branches, syllabuses, teachers, rooms, periods, ieltsCourses] =
    await Promise.all([
      prisma.level.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          subLevels: {
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              basePrice: true,
              discount24Weeks: true,
              discount12Weeks: true,
              normalPackages: {
                where: { isActive: true, totalSessions: { in: [24, 48] } },
                select: { totalSessions: true, price: true },
              },
            },
          },
        },
      }),
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.syllabus.findMany({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          level: { select: { name: true } },
          units: { select: { _count: { select: { lessons: true } } } },
        },
      }),
      prisma.teacher.findMany({
        where: { user: { isActive: true } },
        orderBy: { code: "asc" },
        select: { id: true, code: true, user: { select: { fullName: true } } },
      }),
      prisma.room.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.lessonPeriod.findMany({
        where: { isActive: true },
        orderBy: { startTime: "asc" },
        select: { id: true, name: true, startTime: true, endTime: true },
      }),
      prisma.ieltsCourse.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, price: true, basePrice: true },
      }),
    ]);

  return {
    levels: levels.map((level) => ({
      id: level.id,
      name: level.name,
      subLevels: level.subLevels.map((subLevel) => ({
        id: subLevel.id,
        name: subLevel.name,
        basePrice24: decimalString(subLevel.basePrice),
        discount24: decimalString(subLevel.discount24Weeks),
        discount12: decimalString(subLevel.discount12Weeks),
        price24: listedFromBase(
          subLevel.basePrice,
          24,
          packagePrice(subLevel.normalPackages, 24),
          subLevel.discount24Weeks,
          subLevel.discount12Weeks,
        ),
        price48: listedFromBase(
          subLevel.basePrice,
          48,
          packagePrice(subLevel.normalPackages, 48),
          subLevel.discount24Weeks,
          subLevel.discount12Weeks,
        ),
      })),
    })),
    branches,
    syllabuses: syllabuses.map((syllabus) => ({
      id: syllabus.id,
      name: syllabus.name,
      levelName: syllabus.level?.name ?? null,
      lessonCount: syllabus.units.reduce((sum, unit) => sum + unit._count.lessons, 0),
    })),
    teachers,
    rooms,
    periods,
    // Decimal của Prisma không truyền được sang client component.
    ieltsCourses: ieltsCourses.map((course) => ({
      id: course.id,
      name: course.name,
      price: course.price.toString(),
      basePrice: decimalString(course.basePrice),
    })),
  };
}
