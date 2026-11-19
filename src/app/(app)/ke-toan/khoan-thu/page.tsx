import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Khoản phải thu" };

export default async function Page() {
  await requirePermission("tuition.manage");
  const rows = await prisma.financeReceivable.findMany({
    include: { paymentOrders: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  return (
    <div className="space-y-4">
      <PageHeader title="Khoản phải thu" description="Mỗi khoản có payment code riêng. Webhook SePay đối chiếu mã, không dùng họ tên." />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <THIndex />
              <TH>Mã TT</TH>
              <TH>Kỳ</TH>
              <TH>Phải thu</TH>
              <TH>Đã thu</TH>
              <TH>Còn nợ</TH>
              <TH>Trạng thái</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? <EmptyRow colSpan={7}>Chưa có khoản thu. Chạy migrate rồi tạo receivable từ học phí.</EmptyRow> : rows.map((row, index) => (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD className="font-mono">{row.paymentOrders[0]?.paymentCode || row.receivableCode}</TD>
                <TD>{row.billingPeriod}</TD>
                <TD>{Number(row.amountDue).toLocaleString("vi-VN")} ₫</TD>
                <TD>{Number(row.amountPaid).toLocaleString("vi-VN")} ₫</TD>
                <TD>{Number(row.balanceDue).toLocaleString("vi-VN")} ₫</TD>
                <TD>{row.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
