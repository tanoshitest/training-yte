import * as React from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  wrapperClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-slate-50", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-slate-100", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-slate-50/60", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        // `whitespace-nowrap`: tên cột luôn nằm trên một hàng, bảng đã có sẵn cuộn ngang.
        "border-b border-slate-200 px-4 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-slate-700", className)} {...props} />;
}

/** Ô tiêu đề của cột số thứ tự. Đi kèm `TDIndex`. */
export function THIndex({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TH className={cn("w-10", className)} {...props}>
      STT
    </TH>
  );
}

/**
 * Ô số thứ tự. Đếm theo đúng danh sách đang hiển thị nên đổi bộ lọc là số chạy lại từ 1 —
 * đây là số dòng trên màn hình, không phải mã của bản ghi.
 */
export function TDIndex({ value, className }: { value: number; className?: string }) {
  return (
    <TD className={cn("w-10 text-xs tabular-nums whitespace-nowrap text-slate-400", className)}>
      {value}
    </TD>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-500">
        {children ?? "Chưa có dữ liệu"}
      </td>
    </tr>
  );
}
