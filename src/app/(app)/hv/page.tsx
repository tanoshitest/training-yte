import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrollmentBadge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/permissions";
import { remainingSessions } from "@/lib/tuition";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Của tôi" };

export default async function Page() {
  const user = await requireStudent();
  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    include: {
      enrollments: {
        where: { status: { in: ["ACTIVE", "RESERVED"] } },
        orderBy: { joinedAt: "asc" },
        include: {
          class: { select: { name: true, code: true, type: true } },
          tuition: {
            select: {
              type: true,
              totalSessions: true,
              usedSessions: true,
              totalAmount: true,
              paidAmount: true,
            },
          },
        },
      },
    },
  });

  if (!student) notFound();

  return (
    <>
      <PageHeader
        title={`Chào ${student.fullName}`}
        description={`Mã ${student.code} · ${student.enrollments.length} lớp đang theo học`}
      />

      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Lớp của tôi</CardTitle>
          <CardDescription>Buổi còn lại và học phí theo từng lớp đang học hoặc bảo lưu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {student.enrollments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Bạn chưa được xếp lớp.</p>
          ) : (
            student.enrollments.map((enrollment) => {
              const tuition = enrollment.tuition;
              const owed = tuition
                ? Number(tuition.totalAmount) - Number(tuition.paidAmount)
                : 0;
              const remaining =
                enrollment.class.type === "NORMAL" && tuition
                  ? remainingSessions(tuition)
                  : null;

              return (
                <div
                  key={enrollment.id}
                  className="rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{enrollment.class.name}</p>
                    <EnrollmentBadge value={enrollment.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {enrollment.class.type === "IELTS"
                      ? owed > 0
                        ? `Còn nợ ${formatCurrency(owed)}`
                        : tuition
                          ? "Đã đóng đủ"
                          : "Chưa đóng học phí"
                      : remaining != null
                        ? `${remaining} buổi còn lại`
                        : "Chưa có gói học phí"}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
