"use client";

import { useRef } from "react";

/**
 * Form lọc GET: chọn select / ngày là gửi ngay. Ô chữ gõ xong bấm Enter.
 * Không có nút Lọc.
 */
export function FilterForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      method="get"
      className={className}
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement && target.type === "date")
        ) {
          ref.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
