"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, GraduationCap, PanelsTopLeft, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const PORTAL_HREF = process.env.NEXT_PUBLIC_PORTAL_URL ?? "/portal";

const MODES = [
  { label: "Admin", href: "/tong-quan", icon: ShieldCheck },
  { label: "Giáo viên", href: "/gv", icon: GraduationCap },
  { label: "Portal", href: PORTAL_HREF, icon: PanelsTopLeft },
] as const;

export function RoleSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeIndex = pathname.startsWith("/portal") ? 2 : pathname.startsWith("/gv") ? 1 : 0;
  const active = MODES[activeIndex];
  const ActiveIcon = active.icon;

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-9 min-w-32 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chuyển khu vực làm việc"
      >
        <span className="flex items-center gap-2">
          <ActiveIcon className="h-4 w-4 text-brand-600" />
          {active.label}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {MODES.map((mode, index) => {
            const Icon = mode.icon;
            const selected = index === activeIndex;
            return (
              <a
                key={mode.label}
                href={mode.href}
                role="menuitem"
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors",
                  selected
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{mode.label}</span>
                {selected ? <Check className="h-4 w-4" /> : null}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
