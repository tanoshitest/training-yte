"use client";

import { useRouter } from "next/navigation";

export function TableRowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();

  return (
    <tr
      className="cursor-pointer hover:bg-slate-50/60"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea, form")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
