import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { effectiveRole, homePathForRole } from "@/lib/roles";

const { auth } = NextAuth(authConfig);

/** Đường dẫn chỉ dành cho Admin (PRD §23 Permission Matrix) */
const ADMIN_ONLY = [
  "/hoc-vien",
  "/giao-vien",
  "/ke-toan-vien",
  "/hoc-vu",
  "/lop-hoc",
  "/syllabus",
  "/lich-day",
  "/hoc-phi",
  "/ke-toan",
  "/bao-cao-cham-cong",
  "/bao-cao-hoc-vu",
  "/bao-cao-diem-so",
  "/bao-cao",
  "/cai-dat",
  "/nhat-ky",
];

const ACCOUNTANT_ALLOWED = ["/hoc-phi", "/ke-toan", "/bao-cao-cham-cong"];

/** Đường dẫn chỉ dành cho Teacher */
const TEACHER_ONLY = ["/gv"];

/** Đường dẫn chỉ dành cho Học viên */
const STUDENT_ONLY = ["/hv"];

/**
 * Ngoại lệ của ADMIN_ONLY: giáo viên vào được chi tiết lớp mình phụ trách để xem
 * syllabus và nhận xét học viên (PRD §10–§11). Trang tự chặn lớp không được phân công
 * bằng `assertCanAccessClass`, còn danh sách `/lop-hoc` vẫn chỉ admin.
 */
const TEACHER_ALLOWED = [/^\/lop-hoc\/[^/]+$/];

function home(role: string | undefined) {
  return homePathForRole(role);
}

/**
 * `authConfig` chạy trên Edge nên không đụng Prisma; `effectiveRole` là hàm thuần,
 * import kiểu Role bị xoá lúc biên dịch nên an toàn ở đây. Học vụ đi vào nhánh Admin.
 */

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isLoginPage = path === "/dang-nhap";

  if (!session?.user) {
    if (isLoginPage) return NextResponse.next();
    const url = new URL("/dang-nhap", nextUrl);
    url.searchParams.set("callbackUrl", path === "/portal/dang-nhap" ? "/portal" : `${path}${nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Học vụ đi chung nhánh Admin — `effectiveRole` là hàm thuần nên an toàn trên Edge.
  const role = effectiveRole(session.user.role);
  const start = home(role);

  if (isLoginPage || path === "/portal/dang-nhap") {
    return NextResponse.redirect(new URL(start, nextUrl));
  }

  if (path === "/") {
    return NextResponse.redirect(new URL(start, nextUrl));
  }

  if (session.user.role === "STUDENT" && (path === "/hv" || path.startsWith("/hv/"))) {
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }

  const teacherAllowed = role === "TEACHER" && TEACHER_ALLOWED.some((re) => re.test(path));
  const accountantAllowed =
    role === "ACCOUNTANT" &&
    !path.startsWith("/ke-toan-vien") &&
    ACCOUNTANT_ALLOWED.some((p) => path.startsWith(p));

  if (role !== "ADMIN" && !teacherAllowed && !accountantAllowed && ADMIN_ONLY.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL("/khong-co-quyen", nextUrl));
  }

  if (role !== "TEACHER" && TEACHER_ONLY.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL("/khong-co-quyen", nextUrl));
  }

  if (role !== "STUDENT" && STUDENT_ONLY.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL("/khong-co-quyen", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
