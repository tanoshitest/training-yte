import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { buttonClass } from "@/components/ui/button";
import { homeForRole } from "@/lib/permissions";

export const metadata: Metadata = { title: "Không có quyền truy cập" };

export default async function ForbiddenPage() {
  const session = await auth();
  const home = session?.user?.role ? homeForRole(session.user.role) : "/dang-nhap";

  return (
    <main className="flex min-h-svh items-center justify-center bg-linear-to-br from-brand-50 via-background to-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tài khoản của bạn không được phép mở trang này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng
          liên hệ quản trị viên của trung tâm.
        </p>
        <Link
          href={session?.user ? home : "/dang-nhap"}
          className={buttonClass("primary", "md", "mt-6 w-full")}
        >
          {session?.user ? "Về trang chủ" : "Đăng nhập"}
        </Link>
      </div>
    </main>
  );
}
