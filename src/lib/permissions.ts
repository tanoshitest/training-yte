import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";

/**
 * Ma trận phân quyền — PRD §23.
 * Backend PHẢI kiểm tra quyền, không chỉ ẩn UI (PRD §25 Security).
 *
 * Vai trò được quy đổi qua `effectiveRole()` trước khi tra bảng, nên Học vụ
 * (`ACADEMIC`) hiện dùng đúng dòng của `ADMIN` — xem src/lib/roles.ts.
 */
export const PERMISSIONS = {
  "dashboard.view": ["ADMIN", "TEACHER"],
  "recruitment.view": ["ADMIN"],
  "recruitment.manage": ["ADMIN"],
  "student.manage": ["ADMIN"],
  "teacher.manage": ["ADMIN"],
  /// Quản lý tài khoản Học vụ. Học vụ hiện cũng là ADMIN nên tự quản lý được nhau.
  "academic.manage": ["ADMIN"],
  "accountant.manage": ["ADMIN"],
  "class.create": ["ADMIN"],
  "class.update": ["ADMIN"],
  "class.viewAssigned": ["ADMIN", "TEACHER"],
  "syllabus.create": ["ADMIN"],
  "syllabus.update": ["ADMIN"],
  "syllabus.view": ["ADMIN", "TEACHER"],
  "calendar.manage": ["ADMIN"],
  "calendar.viewOwn": ["ADMIN", "TEACHER"],
  "session.edit": ["ADMIN"],
  // Quản trị viên điểm danh (chốt buổi đã dạy, trừ học phí), giáo viên nhận xét học viên.
  "attendance.submit": ["ADMIN"],
  "attendance.comment": ["TEACHER"],
  "report.submit": ["TEACHER"],
  "tuition.manage": ["ADMIN", "ACCOUNTANT"],
  "settings.manage": ["ADMIN"],
  "audit.view": ["ADMIN"],
  /// Hoàn tác một thao tác đã ghi trong nhật ký — sửa dữ liệu thật nên chỉ Admin.
  "audit.rollback": ["ADMIN"],
  "export.data": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(effectiveRole(role));
}

export type SessionUser = {
  id: string;
  role: Role;
  fullName: string;
  teacherId: string | null;
  studentId: string | null;
  email: string;
};

export function homeForRole(role: Role) {
  const actual = effectiveRole(role);
  if (actual === "ADMIN") return "/tong-quan";
  if (actual === "TEACHER") return "/gv";
  if (actual === "ACCOUNTANT") return "/hoc-phi";
  return "/hv";
}

/** Lấy user hiện tại, redirect về trang đăng nhập nếu chưa đăng nhập. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/dang-nhap");
  return {
    id: session.user.id,
    role: session.user.role,
    fullName: session.user.fullName,
    teacherId: session.user.teacherId,
    studentId: session.user.studentId ?? null,
    email: session.user.email ?? "",
  };
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(effectiveRole(user.role))) redirect("/khong-co-quyen");
  return user;
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}

export async function requireTeacher() {
  return requireRole("TEACHER");
}

export async function requireStudent() {
  return requireRole("STUDENT");
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/khong-co-quyen");
  return user;
}

/** Lớp giáo viên được phân công trên lớp hoặc trên thời khoá biểu (buổi dạy). */
export function assignedClassWhere(teacherId: string) {
  return {
    OR: [{ teacherId }, { sessions: { some: { teacherId } } }],
  };
}

/** Buổi giáo viên đứng lớp — gán trên buổi hoặc lấy theo giáo viên của lớp. */
export function assignedSessionWhere(teacherId: string) {
  return {
    OR: [
      { teacherId },
      // Chỉ kế thừa giáo viên của lớp khi buổi không được phân công riêng.
      // Buổi gán Học vụ tuyệt đối không sinh quyền nhận xét cho giáo viên chủ nhiệm.
      { teacherId: null, academicStaffId: null, class: { teacherId } },
    ],
  };
}

/**
 * R5 — Teacher chỉ được thao tác trên buổi học thuộc lớp được phân công.
 * Admin đi qua (R6).
 */
export async function assertCanAccessSession(user: SessionUser, sessionId: string) {
  if (effectiveRole(user.role) === "ADMIN") return true;

  const found = await prisma.lessonSession.findFirst({
    where: { id: sessionId, ...assignedSessionWhere(user.teacherId ?? "") },
    select: { id: true },
  });

  return Boolean(found);
}

/** R5 — Teacher chỉ xem được lớp được phân công. */
export async function assertCanAccessClass(user: SessionUser, classId: string) {
  if (effectiveRole(user.role) === "ADMIN") return true;

  const found = await prisma.class.findFirst({
    where: { id: classId, ...assignedClassWhere(user.teacherId ?? "") },
    select: { id: true },
  });

  return Boolean(found);
}
