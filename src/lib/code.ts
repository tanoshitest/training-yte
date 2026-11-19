import { prisma } from "@/lib/prisma";

/**
 * Sinh mã tự động cho Học viên / Giáo viên / Lớp học.
 *
 * Lấy phần số lớn nhất trong các mã cùng tiền tố rồi cộng 1 (`HV0007` → `HV0008`).
 * So sánh theo số chứ không theo chuỗi, vì dữ liệu cũ có thể dùng độ dài khác
 * (`GV001` và `GV0004` cùng tồn tại thì `GV001` mới là "lớn hơn" khi so chuỗi).
 *
 * Mã do người dùng tự nhập luôn được tôn trọng — hàm này chỉ chạy khi bỏ trống ô mã.
 */

const WIDTH = 4;

function nextOf(codes: { code: string }[], prefix: string) {
  const max = codes.reduce((acc, { code }) => {
    const n = Number.parseInt(code.slice(prefix.length), 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(WIDTH, "0")}`;
}

export async function nextStudentCode(prefix = "HV") {
  const codes = await prisma.student.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return nextOf(codes, prefix);
}

export async function nextTeacherCode(prefix = "GV") {
  const codes = await prisma.teacher.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return nextOf(codes, prefix);
}

export async function nextClassCode(prefix = "LOP") {
  const codes = await prisma.class.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return nextOf(codes, prefix);
}

export async function nextSyllabusCode(prefix = "SYL") {
  // `code` của syllabus là cột nullable (dữ liệu cũ chưa có mã) nên phải lọc bỏ null.
  const rows = await prisma.syllabus.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  const codes = rows.filter((row): row is { code: string } => Boolean(row.code));
  return nextOf(codes, prefix);
}
