"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, KeyRound, Lock, LogOut, Menu, X } from "lucide-react";
import { signOut } from "next-auth/react";

import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/roles";
import { navForRole } from "@/components/layout/nav-config";
import { NavLink } from "@/components/layout/nav-link";
import { RoleSwitcher } from "@/components/layout/role-switcher";
import type { Role } from "@/generated/prisma/enums";

type Props = {
  user: { fullName: string; email: string; role: Role };
  children: React.ReactNode;
};

const DESKTOP_MQ = "(min-width: 1024px)";
function isFullViewport(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2;
}

function clearStuckOverlays() {
  document.documentElement.removeAttribute("inert");
  document.body.removeAttribute("inert");
  document.documentElement.style.pointerEvents = "";
  document.body.style.pointerEvents = "";
  document.body.style.overflow = "";
  document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  document.querySelectorAll("[data-app-modal]").forEach((node) => node.remove());
  document.querySelectorAll("dialog[open]").forEach((node) => {
    if (node instanceof HTMLDialogElement) node.close();
    else node.removeAttribute("open");
  });
  for (const node of Array.from(document.querySelectorAll("div,button"))) {
    if (!(node instanceof HTMLElement)) continue;
    const cls = node.className;
    if (typeof cls !== "string") continue;
    if (!cls.includes("fixed") || !cls.includes("inset-0")) continue;
    if (cls.includes("bg-slate-900/40") || cls.includes("z-50") || cls.includes("z-30")) {
      node.remove();
    }
  }
  // Overlay của Next (pending RSC) thường là con trực tiếp của body, dùng style inline, không có class Tailwind.
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.querySelector("#app-scroll")) continue;
    const style = getComputedStyle(node);
    if (style.position !== "fixed" || !isFullViewport(node)) continue;
    const z = Number.parseInt(style.zIndex, 10);
    const bg = style.backgroundColor;
    const dimmed = Boolean(bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)");
    if (dimmed || (Number.isFinite(z) && z >= 30)) node.remove();
  }
  const scroller = document.getElementById("app-scroll");
  if (scroller) {
    scroller.style.overflow = "";
    scroller.style.pointerEvents = "";
  }
}

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Mặc định desktop để không vẽ overlay lúc hydrate — cửa sổ ~1024px dễ lệch breakpoint CSS.
  const [desktop, setDesktop] = useState(true);
  const canSwitchRole = user.role === "ADMIN" || user.role === "ACADEMIC";
  const groups = navForRole(canSwitchRole && pathname.startsWith("/gv") ? "TEACHER" : user.role);

  useEffect(() => {
    setOpen(false);
    clearStuckOverlays();
    const timers = [50, 400].map((ms) => window.setTimeout(clearStuckOverlays, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [pathname]);

  useEffect(() => {
    function onPageShow() {
      setOpen(false);
      clearStuckOverlays();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const sync = () => {
      setDesktop(mq.matches);
      if (mq.matches) setOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const navHrefs = groups.flatMap((group) => group.items.map((item) => item.href));
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/gv" || !pathname.startsWith(`${href}/`)) return false;
    return !navHrefs.some(
      (other) =>
        other !== href &&
        other.startsWith(`${href}/`) &&
        (pathname === other || pathname.startsWith(`${other}/`)),
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Sidebar luôn cao hết màn hình, không cuộn theo nội dung. */}
      <aside
        className={cn(
          "z-40 flex h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white print:hidden",
          desktop
            ? "relative"
            : cn(
                "fixed inset-y-0 left-0 transition-transform",
                open ? "translate-x-0" : "-translate-x-full",
              ),
        )}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white">
            <GraduationCap className="h-3.5 w-3.5" />
          </span>
          <span className="text-[13px] font-bold tracking-tight text-slate-900">STEPS LMS</span>
          {desktop ? null : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const folderActive = Boolean(
              group.title && !group.frozen && group.items.some((item) => !item.disabled && isActive(item.href)),
            );
            return (
            <div key={group.title ?? group.items[0]?.href}>
              {group.title ? (
                <div
                  className={cn(
                    "flex min-h-[26px] items-center gap-1.5 rounded-md px-2 py-1 text-[13px] leading-4",
                    group.frozen
                      ? "cursor-not-allowed text-slate-400"
                      : folderActive
                        ? "font-medium text-brand-700"
                        : "text-slate-700",
                  )}
                  title={group.frozen ? "Module đang đóng băng" : undefined}
                >
                  {GroupIcon ? (
                    <GroupIcon className={cn("h-3.5 w-3.5 shrink-0", folderActive && "text-brand-600", group.frozen && "text-slate-400")} />
                  ) : null}
                  <span className="min-w-0 flex-1">{group.title}</span>
                  {group.frozen ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
                </div>
              ) : null}
              {group.frozen ? null : (
              <ul className={group.title ? "relative ml-3.5 border-l border-slate-200 pl-2" : undefined}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = !item.disabled && isActive(item.href);
                  const className = cn(
                    "flex min-h-[24px] items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium leading-none transition-colors",
                    item.disabled
                      ? "cursor-default text-slate-400"
                      : active
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  );
                  return (
                    <li key={item.href}>
                      {item.disabled ? (
                        <span className={className}>
                          <Icon className="h-3.5 w-3.5" />
                          {item.label}
                        </span>
                      ) : (
                        <NavLink href={item.href} onClick={() => setOpen(false)} className={className}>
                          <Icon className={cn("h-3.5 w-3.5", active && "text-brand-600")} />
                          {item.label}
                        </NavLink>
                      )}
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-1.5">
          <div className="flex items-center gap-1.5 rounded-md px-1 py-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-tight text-slate-900">{user.fullName}</p>
              <p className="truncate text-[10px] leading-tight text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <Link
              href="/doi-mat-khau"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
              title="Đổi mật khẩu"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/dang-nhap" })}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              title="Đăng xuất"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Nội dung — chỉ cột này cuộn, sidebar đứng yên. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible" onClick={() => setOpen(false)}>
        {desktop && canSwitchRole ? (
          <header className="flex h-12 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 print:hidden">
            <RoleSwitcher />
          </header>
        ) : null}
        {desktop ? null : (
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 print:hidden">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(true);
              }}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-bold text-slate-900">STEPS LMS</span>
            {canSwitchRole ? <RoleSwitcher className="ml-auto" /> : null}
          </header>
        )}

        <main
          id="app-scroll"
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-y-auto print:block print:h-auto print:overflow-visible print:p-0",
            /^\/syllabus\/[^/]+/.test(pathname) ? "p-0" : "p-4 lg:p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
