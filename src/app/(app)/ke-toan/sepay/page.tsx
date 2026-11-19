import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Giao dịch SePay" };

export default async function Page() {
  await requirePermission("tuition.manage");
  const rows = await prisma.financeBankTransaction.findMany({ orderBy: { receivedAt: "desc" }, take: 100 }).catch(() => []);
  return (
    <div className="space-y-4">
      <PageHeader title="Giao dịch SePay" description="Webhook POST /api/webhooks/sepay. Trùng provider_transaction_id bị bỏ qua." />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <THIndex />
              <TH>Mã SePay</TH>
              <TH>Số tiền</TH>
              <TH>Nội dung</TH>
              <TH>Trạng thái</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? <EmptyRow colSpan={5}>Chưa có giao dịch.</EmptyRow> : rows.map((row, index) => (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD className="font-mono">{row.providerTransactionId}</TD>
                <TD>{Number(row.transferAmount).toLocaleString("vi-VN")} ₫</TD>
                <TD>{row.content}</TD>
                <TD>{row.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
