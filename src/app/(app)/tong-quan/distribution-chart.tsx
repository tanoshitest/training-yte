import { cn } from "@/lib/utils";

type DistributionTone = "brand" | "green" | "amber" | "red" | "slate";

export type DistributionSlice = {
  key: string;
  label: string;
  value: number;
  tone: DistributionTone;
};

const TONE_CLASS: Record<DistributionTone, { stroke: string; dot: string }> = {
  brand: { stroke: "stroke-brand-600", dot: "bg-brand-600" },
  green: { stroke: "stroke-emerald-500", dot: "bg-emerald-500" },
  amber: { stroke: "stroke-amber-500", dot: "bg-amber-500" },
  red: { stroke: "stroke-red-500", dot: "bg-red-500" },
  slate: { stroke: "stroke-slate-400", dot: "bg-slate-400" },
};

export function DistributionChart({
  slices,
  centerLabel,
}: {
  slices: DistributionSlice[];
  centerLabel: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 sm:flex-row sm:gap-8">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`${centerLabel}: ${total}`}>
        <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="18"
            className="stroke-slate-100"
          />
          {slices.map((slice) => {
            const length = total > 0 ? (slice.value / total) * circumference : 0;
            const dashOffset = -offset;
            offset += length;

            return (
              <circle
                key={slice.key}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                strokeWidth="18"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 60 60)"
                className={TONE_CLASS[slice.tone].stroke}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
          <span className="mt-0.5 text-[11px] leading-tight text-slate-500">{centerLabel}</span>
        </div>
      </div>

      <div className="grid w-full min-w-0 max-w-sm gap-2.5">
        {slices.map((slice) => {
          const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <div key={slice.key} className="flex min-w-0 items-center gap-2.5">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", TONE_CLASS[slice.tone].dot)} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{slice.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{slice.value}</span>
              <span className="w-9 text-right text-xs tabular-nums text-slate-400">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
