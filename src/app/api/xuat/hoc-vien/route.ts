import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { csvDate, csvResponse, toCsv, type CsvColumn } from "@/lib/csv";
import { STATUS_TONE } from "@/components/ui/badge";
import type { StudentStatus } from "@/generated/prisma/enums";

const STATUSES: StudentStatus[] = ["UNASSIGNED", "STUDYING", "RESERVED", "DROPPED"];

/** Xuất danh sách học viên — PRD §19. Bộ lọc trùng với bộ lọc trên `/hoc-vien`. */
export async function GET(request: Request) {
  await requirePermission("export.data");

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class") ?? "";
  const statusRaw = searchParams.get("status") ?? "";
  const status = (STATUSES as string[]).includes(statusRaw)
    ? (statusRaw as StudentStatus)
    : undefined;

  const rows = await prisma.student.findMany({
    where: {
      ...(status ? { status } : {}),
              ...(classId ? { enrollments: { some: { classId, status: { in: ["ACTIVE", "RESERVED"] } } } } : {}),
    },
    orderBy: { fullName: "asc" },
    select: {
      code: true,
      fullName: true,
      dateOfBirth: true,
      parentName: true,
      parentPhone: true,
      address: true,
      status: true,
      note: true,
      createdAt: true,
      enrollments: {
        where: { status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        select: { class: { select: { code: true, name: true } } },
      },
    },
  });

  type Row = (typeof rows)[number];
  const columns: CsvColumn<Row>[] = [
    { header: "Mã học viên", value: (r) => r.code },
    { header: "Họ và tên", value: (r) => r.fullName },
    { header: "Ngày sinh", value: (r) => csvDate(r.dateOfBirth) },
    { header: "Phụ huynh", value: (r) => r.parentName },
    { header: "SĐT phụ huynh", value: (r) => r.parentPhone },
    { header: "Địa chỉ", value: (r) => r.address },
    { header: "Mã lớp", value: (r) => r.enrollments.map((e) => e.class.code).join(", ") },
    { header: "Lớp đang học", value: (r) => r.enrollments.map((e) => e.class.name).join(", ") },
    { header: "Trạng thái", value: (r) => STATUS_TONE[r.status].label },
    { header: "Ghi chú", value: (r) => r.note },
    { header: "Ngày tạo", value: (r) => csvDate(r.createdAt) },
  ];

  return csvResponse("hoc-vien", toCsv(rows, columns));
}
