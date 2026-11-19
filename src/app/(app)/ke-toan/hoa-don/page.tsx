import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Hóa đơn điện tử" };

export default async function Page() {
  await requirePermission("tuition.manage");
  const rows = await prisma.financeElectronicInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 100 }).catch(() => []);
  return (
    <div className="space-y-4">
      <PageHeader title="Hóa đơn điện tử" description="Payment và invoice tách nhau. Provider lỗi thì tiền vẫn PAID, hóa đơn FAILED rồi retry." />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <THIndex />
              <TH>Người mua</TH>
              <TH>Số tiền</TH>
              <TH>Số HĐ</TH>
              <TH>Trạng thái</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? <EmptyRow colSpan={5}>Chưa có hóa đơn.</EmptyRow> : rows.map((row, index) => (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD>{row.buyerName}</TD>
                <TD>{Number(row.amount).toLocaleString("vi-VN")} ₫</TD>
                <TD>{row.invoiceNumber || "—"}</TD>
                <TD>{row.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
