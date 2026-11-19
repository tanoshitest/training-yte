import { Construction } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Placeholder cho các màn hình sẽ được xây ở giai đoạn sau.
 * Xem lộ trình chi tiết trong PLAN.md.
 */
export function ComingSoon({
  phase,
  items,
}: {
  phase: string;
  items: string[];
}) {
  return (
    <Card className="p-8">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Construction className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-slate-900">Màn hình đang được xây dựng</h2>
        <p className="mt-1 text-sm text-slate-500">
          Thuộc <span className="font-medium text-brand-700">{phase}</span> trong lộ trình
          (xem <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">PLAN.md</code>).
        </p>
        <ul className="mt-5 space-y-1.5 text-left text-sm text-slate-600">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
