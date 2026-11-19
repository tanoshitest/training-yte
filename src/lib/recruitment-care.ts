import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Học viên đang chăm sóc tháng đầu: nhận xét đầu tiên của GV → hoàn tất chăm sóc. */
export async function completeFirstMonthCareForStudents(studentIds: string[]) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return;
  const rows = await prisma.recruitmentCase.findMany({
    where: { convertedStudentId: { in: ids }, stage: "FIRST_MONTH_CARE" },
    select: { id: true },
  });
  if (!rows.length) return;
  const caseIds = rows.map((row) => row.id);
  const now = new Date();
  await prisma.$transaction([
    prisma.recruitmentCase.updateMany({ where: { id: { in: caseIds } }, data: { stage: "CARE_COMPLETE" } }),
    prisma.recruitmentTask.updateMany({ where: { caseId: { in: caseIds }, status: "OPEN" }, data: { status: "COMPLETED", completedAt: now } }),
  ]);
  revalidatePath("/tuyen-sinh");
}
