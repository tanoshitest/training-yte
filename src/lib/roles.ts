import type { Role } from "@/generated/prisma/enums";

/**
 * Vai trò người dùng — dùng chung cho cả Edge (middleware) và Node.
 * KHÔNG import Prisma / bcrypt ở đây, middleware chạy trên Edge runtime.
 */

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  ACADEMIC: "Học vụ",
  TEACHER: "Giáo viên",
  ACCOUNTANT: "Kế toán",
  STUDENT: "Học viên",
};

/**
 * Học vụ hiện đăng nhập với quyền **y hệt** Quản trị viên (chốt 2026-08-20).
 *
 * Thay vì nhân đôi `"ACADEMIC"` vào từng dòng của ma trận phân quyền — kiểu gì cũng
 * có chỗ quên rồi lệch nhau — mọi chỗ kiểm tra quyền đều quy vai trò về đây trước.
 * Sau này muốn Học vụ hẹp hơn Admin thì bỏ ánh xạ này và khai báo quyền riêng cho
 * `ACADEMIC` trong `PERMISSIONS`; không phải sửa chỗ nào khác.
 */
export function effectiveRole(role: Role): Role {
  return role === "ACADEMIC" ? "ADMIN" : role;
}

/** Trang mặc định sau đăng nhập: staff vào LMS, học viên vào portal website. */
export function homePathForRole(role: Role | string | undefined): string {
  if (role === "STUDENT") return "/portal";
  if (role === "TEACHER") return "/gv";
  if (role === "ACCOUNTANT") return "/hoc-phi";
  if (role === "ADMIN" || role === "ACADEMIC") return "/tong-quan";
  return "/dang-nhap";
}
