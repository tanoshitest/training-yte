import { formatCurrency } from "@/lib/utils";
import type { MonthRevenue } from "./revenue";

function compactMoney(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${value}`;
}

export function RevenueLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
        Đóng mới
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
        Gia hạn
      </span>
    </div>
  );
}

export function TuitionRevenueChart({ months }: { months: MonthRevenue[] }) {
  const max = Math.max(1, ...months.map((row) => row.newTuition + row.renewal));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-1">
        {months.map((row) => {
          const total = row.newTuition + row.renewal;
          const height = `${Math.max(total > 0 ? 10 : 0, (total / max) * 100)}%`;
          const newShare = total > 0 ? (row.newTuition / total) * 100 : 0;
          const renewalShare = total > 0 ? (row.renewal / total) * 100 : 0;

          return (
            <div key={row.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex min-h-0 w-full flex-1 items-end justify-center"
                title={`${row.label}: đóng mới ${formatCurrency(row.newTuition)} · gia hạn ${formatCurrency(row.renewal)} · tổng ${formatCurrency(total)}`}
              >
                {total > 0 ? (
                  <div
                    className="flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-t-sm"
                    style={{ height }}
                  >
                    <div className="bg-brand-600" style={{ height: `${newShare}%` }} />
                    <div className="bg-amber-500" style={{ height: `${renewalShare}%` }} />
                  </div>
                ) : (
                  <div className="h-1 w-full max-w-7 rounded-sm bg-slate-200" />
                )}
              </div>
              <span className="text-[10px] font-medium text-slate-500">{row.label}</span>
              <span className="text-[10px] tabular-nums text-slate-400">
                {total > 0 ? compactMoney(total) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
