"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, BookOpen, Calendar, ClipboardList, House, LayoutGrid, LogOut, Menu, X } from "lucide-react";
import { signOut } from "next-auth/react";

import { cn } from "@/lib/utils";
import { RoleSwitcher } from "@/components/layout/role-switcher";

const PRIMARY = [
  { href: "/portal", label: "Trang chủ", icon: House },
  { href: "/portal/courses", label: "Khóa học", icon: LayoutGrid },
  { href: "/portal/syllabus", label: "Chương trình", icon: BookOpen },
  { href: "/portal/schedule", label: "Lịch & phòng", icon: Calendar },
];

const SECONDARY = [{ href: "/portal/test-history", label: "Lịch sử bài test", icon: ClipboardList }];

export function PortalShell({
  name,
  showAdmin,
  children,
}: {
  name: string;
  showAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId");
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  function href(path: string) {
    if (!studentId) return path;
    return `${path}?studentId=${encodeURIComponent(studentId)}`;
  }

  function isActive(path: string) {
    if (path === "/portal") return pathname === "/portal";
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const initial = name.trim().charAt(0).toUpperCase() || "N";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg text-slate-800 lg:hidden"
            aria-label="Mở menu portal"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-6" />
          </button>
          <Link href={href("/portal")} className="text-sm font-bold tracking-tight text-slate-900">
            STEPS Education
          </Link>
          <p className="hidden truncate text-sm font-semibold text-slate-800 md:block">Cổng học viên</p>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {showAdmin ? <RoleSwitcher className="hidden sm:block" /> : null}
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-lg text-slate-800"
              aria-label="Thông báo"
            >
              <Bell className="size-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center rounded-lg p-1"
                aria-expanded={avatarOpen}
                onClick={() => setAvatarOpen((open) => !open)}
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {initial}
                </span>
                <span className="sr-only">{name}</span>
              </button>
              {avatarOpen ? (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                  <p className="px-3 py-2 text-sm font-semibold text-slate-900">{name}</p>
                  <Link
                    href="/doi-mat-khau"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Đổi mật khẩu
                  </Link>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={() => signOut({ callbackUrl: "/dang-nhap" })}
                  >
                    <LogOut className="size-4" />
                    Đăng xuất
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {menuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
            aria-label="Đóng menu portal"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <aside
          className={cn(
            "z-30 flex w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0",
            menuOpen ? "fixed inset-y-0 left-0 translate-x-0" : "fixed inset-y-0 left-0 -translate-x-full lg:relative",
          )}
        >
          <div className="flex h-16 items-center justify-end px-3 lg:hidden">
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-lg text-slate-800"
              aria-label="Đóng menu"
              onClick={() => setMenuOpen(false)}
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu học viên">
            <ul className="flex flex-col gap-1">
              {PRIMARY.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={href(item.href)}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="my-4 border-t border-slate-200" />
            <ul className="flex flex-col gap-1">
              {SECONDARY.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={href(item.href)}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
