import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Phân trang cho các trang danh sách.
 * Giữ nguyên bộ lọc hiện tại bằng cách chép lại `params` vào query string.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const hrefFor = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
      <span>
        Hiển thị {from}–{to} trong {total} bản ghi
      </span>

      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={buttonClass(
            "outline",
            "sm",
            cn(page <= 1 && "pointer-events-none opacity-50"),
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Trước
        </Link>
        <span className="text-slate-500">
          Trang {page}/{pageCount}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= pageCount}
          className={buttonClass(
            "outline",
            "sm",
            cn(page >= pageCount && "pointer-events-none opacity-50"),
          )}
        >
          Sau
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
