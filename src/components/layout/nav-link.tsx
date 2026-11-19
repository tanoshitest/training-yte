"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function NavLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  return (
    <Link
      href={href}
      onClick={() => {
        if (pathname !== href) setPending(true);
        onClick?.();
      }}
      className={cn(className, pending && "opacity-70")}
    >
      {children}
      {pending ? (
        <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-600" />
      ) : null}
    </Link>
  );
}
