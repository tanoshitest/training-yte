import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

import type { PaymentMethod } from "@/generated/prisma/enums";
import { moneyInWords } from "@/lib/money-words";
import {
  normalPackageDiscount,
  normalPackageDiscountLabel,
} from "@/lib/normal-tuition";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { coverageStartDate } from "@/lib/tuition";
import { formatCurrency, formatDate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

pdfMake.vfs = pdfFonts as unknown as Record<string, string>;

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
  return `BL/${y}${m}${d}/${id.slice(-6).toUpperCase()}`;
}

function sessionsFromNote(note: string | null) {
  const match = note?.match(/(\d+)\s*buổi/i);
  return match ? Number(match[1]) : null;
}

function renderPdf(definition: TDocumentDefinitions) {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tuition.manage");
  const { id } = await params;

  const [payment, center, audit] = await Promise.all([
    prisma.tuitionPayment.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        coverageFrom: true,
        reference: true,
        note: true,
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
                        basePrice: true,
                        discount24Weeks: true,
                        discount12Weeks: true,
                      },
                    },
                    ieltsCourse: { select: { price: true, basePrice: true } },
                  },
                },
              },
            },
            package: { select: { totalSessions: true, price: true } },
            ieltsCourse: { select: { price: true, basePrice: true } },
            entries: {
              where: { type: { in: ["BASE", "DISCOUNT"] } },
              orderBy: { createdAt: "desc" },
              select: { type: true, amount: true, note: true, quantity: true },
            },
          },
        },
      },
    }),
    prisma.center.findFirst({
      orderBy: { createdAt: "asc" },
      select: { name: true, address: true, phone: true, email: true },
    }),
    prisma.auditLog.findFirst({
      where: { entity: "TuitionPayment", entityId: id, action: "CREATE" },
      orderBy: { createdAt: "desc" },
      select: { user: { select: { fullName: true } } },
    }),
  ]);

  if (!payment) {
    return Response.json({ message: "Không tìm thấy biên lai." }, { status: 404 });
  }

  const tuition = payment.tuition;
  const student = tuition.student;
  const enrollment = tuition.enrollment;
  const cls = enrollment.class;
  const collected = Number(payment.amount);
  const sessions = sessionsFromNote(payment.note) ?? tuition.package?.totalSessions ?? null;
  const originalAmount =
    tuition.type === "IELTS"
      ? Number(cls.ieltsCourse?.basePrice ?? tuition.ieltsCourse?.basePrice ?? 0)
      : Number(cls.subLevel?.basePrice ?? 0);
  const matchingBase =
    tuition.entries.find((entry) => {
      if (entry.type !== "BASE") return false;
      return sessions != null && sessionsFromNote(entry.note) === sessions;
    }) ?? tuition.entries.find((entry) => entry.type === "BASE");
  const packageAmount = matchingBase
    ? Number(matchingBase.amount) * matchingBase.quantity
    : Number(tuition.package?.price ?? tuition.ieltsCourse?.price ?? 0) || collected;
  const discountEntry = tuition.entries.find((entry) => entry.type === "DISCOUNT");
  const extraDiscount = discountEntry
    ? Number(discountEntry.amount) * discountEntry.quantity
    : 0;
  const packageDiscount =
    tuition.type === "NORMAL" && sessions != null
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
    (tuition.type === "NORMAL"
      ? await coverageStartDate({
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          joinedAt: enrollment.joinedAt,
          totalSessions: 0,
          remainingBefore: 0,
          paidAt: payment.paidAt,
        })
      : payment.paidAt);

  const number = receiptNumber(payment.id, payment.paidAt);
  const centerName = center?.name || "STEPS Education";
  const contact = [center?.address, center?.phone ? `ĐT: ${center.phone}` : null, center?.email]
    .filter(Boolean)
    .join(" · ");
  const moneyRows: Array<[string, string]> = [
    ["Học phí gốc", originalAmount > 0 ? formatCurrency(originalAmount) : "—"],
    ["Học phí áp dụng", formatCurrency(packageAmount)],
    [
      discountReason ? `Miễn giảm\n${discountReason}` : "Miễn giảm",
      discountAmount > 0 ? `− ${formatCurrency(discountAmount)}` : "—",
    ],
    ["Giáo trình", textbookAmount > 0 ? formatCurrency(textbookAmount) : "—"],
  ];
  if (advanceApplied > 0) {
    moneyRows.push(["Trừ tiền tạm ứng", `− ${formatCurrency(advanceApplied)}`]);
  }
  const moneyTable = {
    table: {
      headerRows: 1,
      widths: ["*", 105],
      body: [
        [
          { text: "NỘI DUNG", style: "tableHeader" },
          { text: "SỐ TIỀN", style: "tableHeader", alignment: "right" },
        ],
        ...moneyRows.map(([label, value]) => [
          { text: label, margin: [0, 3, 0, 3] },
          { text: value, alignment: "right", margin: [0, 3, 0, 3] },
        ]),
        [
          { text: "Số tiền thực thu", bold: true, color: "#0f172a", margin: [0, 5, 0, 2] },
          {
            text: formatCurrency(collected),
            bold: true,
            color: "#1d4ed8",
            fontSize: 11,
            alignment: "right",
            margin: [0, 5, 0, 2],
          },
        ],
      ],
    },
    layout: "lightHorizontalLines",
  } as unknown as Content;

  const definition: TDocumentDefinitions = {
    pageSize: "A5",
    pageOrientation: "portrait",
    pageMargins: [28, 24, 28, 20],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#334155" },
    content: [
      {
        columns: [
          {
            width: 42,
            table: { widths: [42], body: [[{ text: "ST", alignment: "center", bold: true, color: "white", fontSize: 15, margin: [0, 10, 0, 10], fillColor: "#2563eb" }]] },
            layout: "noBorders",
          },
          {
            width: "*",
            margin: [10, 0, 0, 0],
            stack: [
              { text: centerName.toUpperCase(), bold: true, fontSize: 12, color: "#0f172a" },
              { text: contact || " ", fontSize: 7.5, color: "#64748b", margin: [0, 3, 0, 0] },
            ],
          },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 364, y2: 0, lineWidth: 0.7, lineColor: "#e2e8f0" }], margin: [0, 10, 0, 10] },
      { text: "PHIẾU THU", alignment: "center", color: "#2563eb", bold: true, characterSpacing: 2, fontSize: 8 },
      { text: "BIÊN LAI THU HỌC PHÍ", alignment: "center", color: "#0f172a", bold: true, fontSize: 16, margin: [0, 3, 0, 2] },
      { text: `Số ${number}`, alignment: "center", color: "#64748b", fontSize: 8 },
      { text: `Ngày thu: ${formatDate(payment.paidAt)}`, alignment: "center", color: "#64748b", fontSize: 8, margin: [0, 1, 0, 10] },
      {
        table: {
          widths: ["*", "*"],
          body: [
            [
              { stack: [{ text: "Học viên", style: "label" }, { text: student.fullName, bold: true, color: "#0f172a" }] },
              { stack: [{ text: "Mã học viên", style: "label" }, { text: student.code, bold: true, color: "#0f172a" }] },
            ],
            [
              { stack: [{ text: "Lớp", style: "label" }, { text: `${cls.name} (${cls.code})`, bold: true, color: "#0f172a" }] },
              { stack: [{ text: "Phụ huynh", style: "label" }, { text: student.parentName || "—", bold: true, color: "#0f172a" }] },
            ],
            [
              { stack: [{ text: "SĐT phụ huynh", style: "label" }, { text: student.parentPhone || "—", bold: true, color: "#0f172a" }] },
              { text: "" },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
          fillColor: () => "#f8fafc",
        },
        margin: [0, 0, 0, 9],
      },
      moneyTable,
      {
        text: [{ text: "Bằng chữ: ", bold: true, color: "#64748b" }, moneyInWords(collected)],
        fillColor: "#eff6ff",
        color: "#0f172a",
        margin: [7, 6, 7, 6],
      },
      {
        columns: [
          { stack: [{ text: "Ngày thu tiền", style: "label" }, { text: formatDate(payment.paidAt), bold: true }] },
          { stack: [{ text: "Học phí bắt đầu từ", style: "label" }, { text: coverageFrom ? formatDate(coverageFrom) : "—", bold: true }] },
          { stack: [{ text: "Hình thức", style: "label" }, { text: METHOD_LABEL[payment.method], bold: true }] },
          { stack: [{ text: "Số hoá đơn", style: "label" }, { text: payment.reference || "—", bold: true }] },
        ],
        columnGap: 8,
        margin: [0, 8, 0, 12],
      },
      {
        columns: [
          { width: "*", alignment: "center", stack: [{ text: "Người nộp tiền", bold: true }, { text: "Ký, ghi rõ họ tên", style: "label" }, { text: student.parentName || student.fullName, bold: true, margin: [0, 34, 0, 0] }] },
          { width: "*", alignment: "center", stack: [{ text: "Người thu tiền", bold: true }, { text: "Ký, ghi rõ họ tên", style: "label" }, { text: audit?.user?.fullName || "………………", bold: true, margin: [0, 34, 0, 0] }] },
        ],
      },
      {
        text: `Biên lai dùng để đối chiếu với phụ huynh.${student.address ? ` Địa chỉ: ${student.address}` : ""}`,
        alignment: "center",
        color: "#94a3b8",
        fontSize: 6.5,
        margin: [0, 14, 0, 0],
      },
    ],
    styles: {
      label: { fontSize: 7, color: "#94a3b8", margin: [0, 0, 0, 1] },
      tableHeader: { fontSize: 7, color: "#64748b", bold: true, margin: [0, 0, 0, 3] },
    },
  };

  const pdf = await renderPdf(definition);
  const date = payment.paidAt.toISOString().slice(0, 10);
  const filename = `bien-lai-${date}-${student.code.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;

  const body = Uint8Array.from(pdf).buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
