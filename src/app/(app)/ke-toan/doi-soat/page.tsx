import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { approveReconEntry, undoReconEntry } from "../actions";
import { RotateCcw } from "lucide-react";

export const metadata: Metadata = { title: "Đối soát" };

type Search = { status?: string };

type CashEntry = {
  id: string;
  date: string;
  kind: "IN" | "OUT";
  source: "TUITION" | "MANUAL";
  category: string;
  description: string;
  amount: number;
  method: string;
  studentName?: string;
  tuitionId?: string;
  receiptId?: string;
};

type ReconEntry = {
  entryId: string;
  status: "MATCHED" | "PENDING";
  amount: number;
  date: string;
  approvedAt?: string;
  approvedBy?: string;
};

type FinanceData = {
  cashbook: CashEntry[];
  reconEntries: ReconEntry[];
};

const FINANCE_KEY = "finance:steps-demo";

async function getFinanceData(): Promise<FinanceData | null> {
  const state = await prisma.vpsAppState.findUnique({
    where: { key: FINANCE_KEY },
  });
  if (!state) return null;
  return state.value as FinanceData;
}

function reconEntryRows(cashbook: CashEntry[], reconEntries: ReconEntry[], statusFilter?: string) {
  const marks = new Map(reconEntries.map((row) => [row.entryId, row]));
  return cashbook.map((entry) => {
    const mark = marks.get(entry.id);
    const matched = mark?.status === "MATCHED"
      && Math.round(Number(mark.amount) || 0) === Math.round(Number(entry.amount) || 0)
      && mark.date === entry.date;
    return {
      entry,
      matched,
      approvedAt: matched ? mark.approvedAt || "" : "",
      approvedBy: matched ? mark.approvedBy || "" : "",
    };
  }).filter((row) => {
    if (!statusFilter) return true;
    if (statusFilter === "MATCHED") return row.matched;
    if (statusFilter === "PENDING") return !row.matched;
    return true;
  }).sort((a, b) => `${b.entry.date}${b.entry.id}`.localeCompare(`${a.entry.date}${a.entry.id}`));
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");
  const { status = "" } = await searchParams;

  const finance = await getFinanceData();
  const cashbook = finance?.cashbook || [];
  const reconEntries = finance?.reconEntries || [];

  const rows = reconEntryRows(cashbook, reconEntries, status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Đối soát thu chi"
          description="Kế toán duyệt từng nghiệp vụ thu chi. Duyệt chưa ổn thì bấm hoàn tác để phiếu về Chưa khớp."
        />
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Nghiệp vụ thu chi ({rows.length})</CardTitle>
            <CardDescription>Mỗi dòng là một khoản thu hoặc chi. Kế toán duyệt khi khớp số.</CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-3">
            <Field label="Trạng thái">
              <Select name="status" defaultValue={status}>
                <option value="">Tất cả</option>
                <option value="PENDING">Chưa khớp</option>
                <option value="MATCHED">Đã khớp</option>
              </Select>
            </Field>
          </FilterForm>
        </CardHeader>
        <Table wrapperClassName="min-h-0 flex-1 overflow-auto">
          <THead className="sticky top-0 z-[1]">
            <TR>
              <THIndex />
              <TH>Ngày</TH>
              <TH>Thu/Chi</TH>
              <TH>Nguồn</TH>
              <TH>Khoản mục</TH>
              <TH>Nội dung</TH>
              <TH>Hình thức</TH>
              <TH className="text-right">Số tiền</TH>
              <TH>Trạng thái</TH>
              <TH>Duyệt</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={10}>Chưa có nghiệp vụ thu chi nào để đối soát.</EmptyRow>
            ) : (
              rows.map((row, index) => {
                const entry = row.entry;
                const content = `${entry.description || "—"}${entry.studentName ? ` · ${entry.studentName}` : ""}`;
                return (
                  <TR key={entry.id}>
                    <TDIndex value={index + 1} />
                    <TD className="whitespace-nowrap">{formatDate(new Date(entry.date))}</TD>
                    <TD>
                      <Badge tone={entry.kind === "IN" ? "green" : "amber"}>
                        {entry.kind === "IN" ? "Thu" : "Chi"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={entry.source === "TUITION" ? "brand" : "slate"}>
                        {entry.source === "TUITION" ? "Học phí" : "Thủ công"}
                      </Badge>
                    </TD>
                    <TD>{entry.category || "—"}</TD>
                    <TD className="max-w-xs truncate" title={content}>{content}</TD>
                    <TD>{entry.method || "—"}</TD>
                    <TD className={`text-right font-medium ${entry.kind === "OUT" ? "text-red-600" : ""}`}>
                      {entry.kind === "OUT" ? "−" : "+"}{formatCurrency(entry.amount)}
                    </TD>
                    <TD>
                      {row.matched ? (
                        <Badge tone="green" title={`Đã duyệt: ${row.approvedBy}${row.approvedAt ? ` · ${formatDate(new Date(row.approvedAt))}` : ""}`}>
                          Đã khớp
                        </Badge>
                      ) : (
                        <Badge tone="amber">Chưa khớp</Badge>
                      )}
                    </TD>
                    <TD>
                      {row.matched ? (
                        <ActionForm action={undoReconEntry}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            title="Hoàn tác duyệt"
                            className="text-slate-500 hover:text-slate-700"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <ActionForm action={approveReconEntry}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <SubmitButton size="sm">
                            Duyệt
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
