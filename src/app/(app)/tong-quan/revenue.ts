import { utcDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export type MonthRevenue = {
  label: string;
  newTuition: number;
  renewal: number;
};

export type YearTuitionRevenue = {
  normal: MonthRevenue[];
  ielts: MonthRevenue[];
};

const MONTH_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

function emptyYear(): MonthRevenue[] {
  return MONTH_LABELS.map((label) => ({ label, newTuition: 0, renewal: 0 }));
}

/**
 * Tiền thực thu theo tháng, tách lớp thường/IELTS và đóng mới/gia hạn.
 *
 * Chỉ phiếu tiền mặt/chuyển khoản đã được snapshot `revenueKind` mới lên chart.
 * Dữ liệu lịch sử, bút toán trừ tạm ứng và import kỹ thuật để revenueKind = null.
 * Giáo trình không phải doanh số học phí nên được trừ khỏi số thực thu của phiếu.
 */
export async function yearTuitionRevenue(year: number): Promise<YearTuitionRevenue> {
  const from = utcDate(year, 0, 1);
  const to = utcDate(year + 1, 0, 1);
  const result: YearTuitionRevenue = { normal: emptyYear(), ielts: emptyYear() };

  const payments = await prisma.tuitionPayment.findMany({
    where: {
      paidAt: { gte: from, lt: to },
      method: { in: ["CASH", "BANK_TRANSFER"] },
      revenueKind: { in: ["NEW", "RENEWAL"] },
    },
    select: {
      amount: true,
      textbookAmount: true,
      paidAt: true,
      revenueKind: true,
      tuition: { select: { type: true } },
    },
  });

  for (const payment of payments) {
    if (!payment.revenueKind) continue;
    const tuitionAmount = Math.max(
      0,
      Number(payment.amount) - Number(payment.textbookAmount ?? 0),
    );
    const months = payment.tuition.type === "NORMAL" ? result.normal : result.ielts;
    const month = months[payment.paidAt.getUTCMonth()];
    if (payment.revenueKind === "NEW") month.newTuition += tuitionAmount;
    else month.renewal += tuitionAmount;
  }

  return {
    normal: result.normal.map((row) => ({
      ...row,
      newTuition: Math.round(row.newTuition),
      renewal: Math.round(row.renewal),
    })),
    ielts: result.ielts.map((row) => ({
      ...row,
      newTuition: Math.round(row.newTuition),
      renewal: Math.round(row.renewal),
    })),
  };
}
