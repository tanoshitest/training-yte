import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { moneyInWords } from "@/lib/money-words";
import { requirePermission } from "@/lib/permissions";
import {
  normalPackageDiscount,
  normalPackageDiscountLabel,
} from "@/lib/normal-tuition";
import { coverageStartDate } from "@/lib/tuition";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaymentMethod } from "@/generated/prisma/enums";

import { PrintReceiptButton } from "../print-button";

export const metadata: Metadata = { title: "Biên lai thu học phí" };

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  OTHER: "Khác",
};

function receiptNumber(id: string, paidAt: Date) {
  const y = paidAt.getFullYear();
  const m = String(paidAt.getMonth() + 1).padStart(2, "0");
  const d = String(paidAt.getDate()).padStart(2, "0");
  const tail = id.slice(-6).toUpperCase();
  return `BL/${y}${m}${d}/${tail}`;
}

function sessionsFromNote(note: string | null) {
  const match = note?.match(/(\d+)\s*buổi/i);
  return match ? Number(match[1]) : null;
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("tuition.manage");
  const { id } = await params;

  const [payment, center, audit] = await Promise.all([
    prisma.tuitionPayment.findUnique({
      where: { id },
      select: {
        id: true,
        tuitionId: true,
        amount: true,
        method: true,
        paidAt: true,
        coverageFrom: true,
        reference: true,
        note: true,
        createdAt: true,
        textbookAmount: true,
        discountReason: true,
        tuition: {
          select: {
            type: true,
            student: {
              select: {
                code: true,
                fullName: true,
                parentName: true,
                parentPhone: true,
                address: true,
              },
            },
            enrollment: {
              select: {
                joinedAt: true,
                studentId: true,
                classId: true,
                class: {
                  select: {
                    name: true,
                    code: true,
                    subLevel: {
                      select: {
                        name: true,
                        basePrice: true,
                        discount24Weeks: true,
                        discount12Weeks: true,
                      },
                    },
                    ieltsCourse: { select: { name: true, price: true, basePrice: true } },
                  },
                },
              },
            },
            package: { select: { name: true, totalSessions: true, price: true } },
            ieltsCourse: { select: { name: true, price: true, basePrice: true } },
            entries: {
              where: { type: { in: ["BASE", "DISCOUNT"] } },
              orderBy: { createdAt: "desc" },
              select: { type: true, amount: true, note: true, createdAt: true, quantity: true },
            },
          },
        },
      },
    }),
    prisma.center.findFirst({
      orderBy: { createdAt: "asc" },
      select: { name: true, logoUrl: true, address: true, phone: true, email: true },
    }),
    prisma.auditLog.findFirst({
      where: { entity: "TuitionPayment", entityId: id, action: "CREATE" },
      orderBy: { createdAt: "desc" },
      select: { user: { select: { fullName: true } } },
    }),
  ]);

  if (!payment) notFound();

  const student = payment.tuition.student;
  const enrollment = payment.tuition.enrollment;
  const cls = enrollment.class;
  const collected = Number(payment.amount);
  const sessions =
    sessionsFromNote(payment.note) ??
    payment.tuition.package?.totalSessions ??
    null;
  const originalAmount =
    payment.tuition.type === "IELTS"
      ? Number(cls.ieltsCourse?.basePrice ?? payment.tuition.ieltsCourse?.basePrice ?? 0)
      : Number(cls.subLevel?.basePrice ?? 0);
  const matchingBase =
    payment.tuition.entries.find((entry) => {
      if (entry.type !== "BASE") return false;
      const entrySessions = sessionsFromNote(entry.note);
      return sessions != null && entrySessions === sessions;
    }) ?? payment.tuition.entries.find((entry) => entry.type === "BASE");
  const packageAmount = matchingBase
    ? Number(matchingBase.amount) * matchingBase.quantity
    : Number(payment.tuition.package?.price ?? payment.tuition.ieltsCourse?.price ?? 0) || collected;
  const discountEntry = payment.tuition.entries.find((entry) => entry.type === "DISCOUNT");
  const extraDiscount = discountEntry ? Number(discountEntry.amount) * discountEntry.quantity : 0;
  const packageDiscount =
    payment.tuition.type === "NORMAL" && sessions != null
      ? normalPackageDiscount(
          sessions,
          cls.subLevel?.discount24Weeks,
          cls.subLevel?.discount12Weeks,
        )
      : 0;
  const discountAmount = packageDiscount + extraDiscount;
  const extraReason =
    payment.discountReason ||
    discountEntry?.note?.replace(/^Miễn giảm học phí\.?\s*/i, "").trim() ||
    null;
  const discountReason = [
    packageDiscount > 0 && sessions != null ? normalPackageDiscountLabel(sessions) : null,
    extraReason,
  ]
    .filter(Boolean)
    .join(" · ");
  const textbookAmount = Number(payment.textbookAmount ?? 0);
  const advanceApplied = Math.max(
    0,
    Math.round(packageAmount - extraDiscount + textbookAmount - collected),
  );
  const coverageFrom =
    payment.coverageFrom ??
    (payment.tuition.type === "NORMAL"
      ? await coverageStartDate({
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          joinedAt: enrollment.joinedAt,
          totalSessions: 0,
          remainingBefore: 0,
          paidAt: payment.paidAt,
        })
      : payment.paidAt);

  const centerName = center?.name || "STEPS Education";
  const collector = audit?.user?.fullName ?? "";
  const number = receiptNumber(payment.id, payment.paidAt);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/hoc-phi/bao-cao"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Nhật ký thu hp
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/hoc-phi/${payment.tuitionId}`} className={buttonClass("outline", "sm")}>
            Hồ sơ học phí
          </Link>
          <PrintReceiptButton paymentId={payment.id} />
        </div>
      </div>

      <article className="mx-auto w-full max-w-[148mm] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [zoom:0.8] print:max-w-none print:rounded-none print:border-0 print:shadow-none print:[zoom:1]">
        <div className="h-1.5 bg-brand-600" />

        <div className="px-6 py-5 sm:px-7">
          <header className="flex items-start gap-4 border-b border-slate-100 pb-4">
            {center?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={center.logoUrl}
                alt={centerName}
                className="h-14 w-14 shrink-0 rounded-lg object-contain"
              />
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
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-600 uppercase">
              Phiếu thu
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">BIÊN LAI THU HỌC PHÍ</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">Số {number}</p>
            <p className="text-xs text-slate-500">Ngày thu: {formatDate(payment.paidAt)}</p>
          </div>

          <section className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3.5 py-3 text-sm">
            <Info label="Học viên" value={student.fullName} />
            <Info label="Mã học viên" value={student.code} mono />
            <Info label="Lớp" value={`${cls.name} (${cls.code})`} />
            <Info label="Phụ huynh" value={student.parentName || "—"} />
            <Info label="SĐT phụ huynh" value={student.parentPhone || "—"} />
          </section>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                <th className="w-12 pb-2 font-semibold">STT</th>
                <th className="pb-2 font-semibold">Nội dung</th>
                <th className="pb-2 text-right font-semibold">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-500 tabular-nums">1</td>
                <td className="py-2 text-slate-600">Học phí gốc</td>
                <td className="py-2 text-right tabular-nums text-slate-700">
                  {originalAmount > 0 ? formatCurrency(originalAmount) : "—"}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-500 tabular-nums">2</td>
                <td className="py-2 text-slate-800">Học phí áp dụng</td>
                <td className="py-2 text-right tabular-nums text-slate-800">
                  {formatCurrency(packageAmount)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-500 tabular-nums">3</td>
                <td className="py-2 text-slate-600">
                  Miễn giảm
                  {discountAmount > 0 && discountReason ? (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{discountReason}</span>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {discountAmount > 0 ? `− ${formatCurrency(discountAmount)}` : "—"}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-500 tabular-nums">4</td>
                <td className="py-2 text-slate-600">Giáo trình</td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {textbookAmount > 0 ? formatCurrency(textbookAmount) : "—"}
                </td>
              </tr>
              {advanceApplied > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-2 text-slate-500 tabular-nums">5</td>
                  <td className="py-2 text-slate-600">Trừ tiền tạm ứng</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    − {formatCurrency(advanceApplied)}
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3" />
                <td className="pt-3 text-sm font-semibold text-slate-900">Số tiền thực thu</td>
                <td className="pt-3 text-right text-base font-bold tabular-nums text-brand-700">
                  {formatCurrency(collected)}
                </td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-800">
            <span className="font-medium text-slate-500">Bằng chữ: </span>
            {moneyInWords(collected)}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div>
              <dt className="text-slate-400">Ngày thu tiền</dt>
              <dd className="font-medium text-slate-800">{formatDate(payment.paidAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Học phí bắt đầu từ</dt>
              <dd className="font-medium text-slate-800">
                {coverageFrom ? formatDate(coverageFrom) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Hình thức</dt>
              <dd className="font-medium text-slate-800">{METHOD_LABEL[payment.method]}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Số hoá đơn</dt>
              <dd className="font-mono font-medium text-slate-800">{payment.reference || "—"}</dd>
            </div>
          </dl>

          <div className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-800">Người nộp tiền</p>
              <p className="mt-0.5 text-slate-400">Ký, ghi rõ họ tên</p>
              <div className="h-16" />
              <p className="font-medium text-slate-800">{student.parentName || student.fullName}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Người thu tiền</p>
              <p className="mt-0.5 text-slate-400">Ký, ghi rõ họ tên</p>
              <div className="h-16" />
              <p className="font-medium text-slate-800">{collector || "………………"}</p>
            </div>
          </div>

          <p className="mt-6 border-t border-slate-100 pt-3 text-center text-[10px] leading-relaxed text-slate-400">
            Biên lai dùng để đối chiếu với phụ huynh. Giữ lại bản này hoặc gửi file PDF.
            {!student.address ? null : ` Địa chỉ: ${student.address}`}
          </p>
        </div>
      </article>
    </>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={mono ? "truncate font-mono text-xs text-slate-800" : "truncate font-medium text-slate-800"}>
        {value}
      </p>
    </div>
  );
}
