import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { buildStudentImportTemplate } from "@/lib/student-excel";

/** File mẫu nhập học viên — sheet HocVien (điền) và sheet Lop (mã lớp đang có). */
export async function GET() {
  await requirePermission("student.manage");

  const classes = await prisma.class.findMany({
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true, status: true, ieltsCourseId: true },
  });

  const body = await buildStudentImportTemplate(classes);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-nhap-hoc-vien-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
