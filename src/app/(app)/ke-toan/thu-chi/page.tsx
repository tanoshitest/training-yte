import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Quản lý thu chi" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDay(raw?: string) {
  if (!raw || !DATE_RE.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Search = { from?: string; to?: string; kind?: string };

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

type FinanceData = {
  cashbook: CashEntry[];
};

const FINANCE_KEY = "finance:steps-demo";

async function getFinanceData(): Promise<FinanceData | null> {
  const state = await prisma.vpsAppState.findUnique({
    where: { key: FINANCE_KEY },
  });
  if (!state) return null;
  return state.value as FinanceData;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("tuition.manage");
  const { from = "", to = "", kind = "" } = await searchParams;
  const start = parseLocalDay(from);
  const end = parseLocalDay(to);

  const finance = await getFinanceData();
  const cashbook = finance?.cashbook || [];

  const rows = cashbook
    .filter((entry) => {
      const entryDate = new Date(entry.date);
      if (start && entryDate < start) return false;
      if (end && entryDate > new Date(end.getTime() + 86400000 - 1)) return false;
      if (kind === "IN" && entry.kind !== "IN") return false;
      if (kind === "OUT" && entry.kind !== "OUT") return false;
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const inflow = rows.filter((row) => row.kind === "IN").reduce((sum, row) => sum + row.amount, 0);
  const outflow = rows.filter((row) => row.kind === "OUT").reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <PageHeader
          title="Quản lý thu chi"
          description="Nhật ký thu chi hàng ngày. Thu học phí lấy từ phiếu thu; chi thủ công ghi nhận khi phát sinh ngoài học phí."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Số phiếu</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Tổng thu</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(inflow)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Tổng chi</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(outflow)}</p>
          </Card>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-col items-start gap-3">
          <div>
            <CardTitle>Nhật ký thu chi ({rows.length})</CardTitle>
            <CardDescription>Mỗi dòng là một khoản thu hoặc chi đã ghi nhận.</CardDescription>
          </div>
          <FilterForm className="grid w-full gap-3 sm:grid-cols-3">
            <Field label="Từ ngày">
              <Input name="from" type="date" defaultValue={from} />
            </Field>
            <Field label="Đến ngày">
              <Input name="to" type="date" defaultValue={to} />
            </Field>
            <Field label="Loại">
              <Select name="kind" defaultValue={kind}>
                <option value="">Tất cả</option>
                <option value="IN">Thu</option>
                <option value="OUT">Chi</option>
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
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>Chưa có phiếu thu chi trong khoảng lọc.</EmptyRow>
            ) : (
              rows.map((row, index) => {
                const content = `${row.description || "—"}${row.studentName ? ` · ${row.studentName}` : ""}`;
                return (
                  <TR key={row.id}>
                    <TDIndex value={index + 1} />
                    <TD className="whitespace-nowrap">{formatDate(new Date(row.date))}</TD>
                    <TD>
                      <Badge tone={row.kind === "IN" ? "green" : "amber"}>
                        {row.kind === "IN" ? "Thu" : "Chi"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={row.source === "TUITION" ? "brand" : "slate"}>
                        {row.source === "TUITION" ? "Học phí" : "Thủ công"}
                      </Badge>
                    </TD>
                    <TD>{row.category || "—"}</TD>
                    <TD className="max-w-xs truncate" title={content}>{content}</TD>
                    <TD>{row.method || "—"}</TD>
                    <TD className={`text-right font-medium ${row.kind === "OUT" ? "text-red-600" : ""}`}>
                      {row.kind === "OUT" ? "−" : "+"}{formatCurrency(row.amount)}
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
