import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Giao dịch lệch" };

export default async function Page() {
  await requirePermission("tuition.manage");
  const rows = await prisma.financeBankTransaction.findMany({
    where: { status: { in: ["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"] } },
    orderBy: { receivedAt: "desc" },
    take: 100,
  }).catch(() => []);
  return (
    <div className="space-y-4">
      <PageHeader title="Giao dịch lệch" description="Thiếu mã, sai số tiền, hoặc khoản đã thanh toán. Không xóa cứng giao dịch." />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <THIndex />
              <TH>Số tiền</TH>
              <TH>Nội dung</TH>
              <TH>Lý do</TH>
              <TH>Trạng thái</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? <EmptyRow colSpan={5}>Không có giao dịch cần duyệt.</EmptyRow> : rows.map((row, index) => (
              <TR key={row.id}>
                <TDIndex value={index + 1} />
                <TD>{Number(row.transferAmount).toLocaleString("vi-VN")} ₫</TD>
                <TD>{row.content}</TD>
                <TD>{row.reviewReason || "—"}</TD>
                <TD>{row.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
