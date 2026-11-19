import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { remainingSessions } from "@/lib/tuition";
import { currentMilestone, milestoneLabel } from "@/lib/tuition-reminders";
import { formatCurrency, formatDate, startOfDay } from "@/lib/utils";

import { PrintReceiptButton } from "../../bien-lai/print-button";

export const metadata: Metadata = { title: "Nhắc đóng học phí" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  await requirePermission("tuition.manage");
  const { enrollmentId } = await params;
  const { print } = await searchParams;
  const autoPrint = print === "1";

  const [enrollment, center, packages] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        joinedAt: true,
        student: {
          select: { code: true, fullName: true, parentName: true, parentPhone: true, address: true },
        },
        class: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            levelId: true,
            subLevelId: true,
          },
        },
        tuition: { select: { type: true, totalSessions: true, usedSessions: true } },
      },
    }),
    prisma.center.findFirst({
      orderBy: { createdAt: "asc" },
      select: { name: true, logoUrl: true, address: true, phone: true, email: true },
    }),
    prisma.normalPackage.findMany({
      where: { isActive: true },
      orderBy: { totalSessions: "asc" },
      select: { id: true, name: true, totalSessions: true, price: true, levelId: true, subLevelId: true },
    }),
  ]);
  if (!enrollment || enrollment.class.type !== "NORMAL") notFound();

  let remaining: number;
  if (enrollment.tuition) {
    remaining =
      remainingSessions(enrollment.tuition) ??
      (enrollment.tuition.totalSessions ?? 0) - enrollment.tuition.usedSessions;
  } else {
    const completed = await prisma.lessonSession.count({
      where: {
        classId: enrollment.class.id,
        status: "COMPLETED",
        date: { gte: startOfDay(enrollment.joinedAt) },
      },
    });
    remaining = 0 - completed;
  }

  const listed = packages.filter((pkg) =>
    enrollment.class.subLevelId
      ? pkg.subLevelId === enrollment.class.subLevelId
      : enrollment.class.levelId
        ? pkg.levelId === enrollment.class.levelId
        : false,
  );
  const milestone = currentMilestone(remaining);
  const centerName = center?.name || "STEPS Education";
  const remainingText =
    remaining > 0 ? `còn ${remaining} buổi` : remaining === 0 ? "đã hết buổi (còn 0)" : `đang nợ ${-remaining} buổi`;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
        }
      `}</style>
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/task" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Task
        </Link>
        <PrintReceiptButton auto={autoPrint} label="Tải PDF nhắc phụ huynh" />
      </div>
      <p className="print:hidden mb-4 text-xs text-slate-500">
        Bấm tải PDF rồi chọn <span className="font-medium text-slate-700">Lưu thành PDF</span> để gửi phụ huynh.
      </p>

      <article className="mx-auto w-full max-w-[148mm] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-brand-600" />
        <div className="px-6 py-5 sm:px-7">
          <header className="flex items-start gap-4 border-b border-slate-100 pb-4">
            {center?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={center.logoUrl} alt={centerName} className="h-14 w-14 shrink-0 rounded-lg object-contain" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
                ST
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold tracking-tight text-slate-900">{centerName}</p>
              {center?.address ? <p className="mt-0.5 text-xs text-slate-500">{center.address}</p> : null}
              <p className="mt-0.5 text-xs text-slate-500">
                {[center?.phone ? `ĐT: ${center.phone}` : null, center?.email].filter(Boolean).join(" · ")}
              </p>
            </div>
          </header>

          <div className="py-4 text-center">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-600 uppercase">Thông báo</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">NHẮC ĐÓNG HỌC PHÍ</h1>
            <p className="mt-1 text-xs text-slate-500">Ngày {formatDate(new Date())}</p>
          </div>

          <p className="text-sm leading-relaxed text-slate-700">
            Kính gửi quý phụ huynh của học viên{" "}
            <span className="font-semibold text-slate-900">{enrollment.student.fullName}</span>{" "}
            <span className="font-mono text-xs text-slate-500">({enrollment.student.code})</span>, lớp{" "}
            <span className="font-semibold">{enrollment.class.name}</span>.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Hiện tại học viên <span className="font-semibold">{remainingText}</span>
            {milestone ? ` — mốc nhắc: ${milestoneLabel(milestone)}` : ""}. Xin quý phụ huynh sắp xếp đóng học phí
            để các em học liên tục.
          </p>

          <section className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3.5 py-3 text-sm">
            <div>
              <p className="text-[11px] text-slate-400">Phụ huynh</p>
              <p className="font-medium text-slate-800">{enrollment.student.parentName || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">SĐT</p>
              <p className="font-medium text-slate-800">{enrollment.student.parentPhone || "—"}</p>
            </div>
          </section>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                <th className="w-12 pb-2 font-semibold">STT</th>
                <th className="pb-2 font-semibold">Gói học phí</th>
                <th className="pb-2 text-right font-semibold">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {listed.length === 0 ? (
                <tr>
                  <td className="py-2 text-slate-500" colSpan={3}>
                    Chưa khai báo gói cho lớp này.
                  </td>
                </tr>
              ) : (
                listed.map((pkg, index) => (
                  <tr key={pkg.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500 tabular-nums">{index + 1}</td>
                    <td className="py-2 text-slate-800">
                      {pkg.totalSessions} buổi — {pkg.name}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(pkg.price)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Khi đóng tiền, biên lai ghi <span className="font-medium text-slate-700">học phí bắt đầu từ ngày hết buổi
            (còn 0)</span>. Ngày thu trên biên lai là ngày quý phụ huynh đóng thực tế.
          </p>
          {enrollment.student.address ? (
            <p className="mt-2 text-[10px] text-slate-400">Địa chỉ: {enrollment.student.address}</p>
          ) : null}
        </div>
      </article>
    </>
  );
}
