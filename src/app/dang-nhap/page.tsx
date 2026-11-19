import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

function safeCallbackUrl(raw: string) {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl ?? "/sau-dang-nhap");
  const error = params.error ? "Email hoặc mật khẩu không đúng." : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-brand-50 via-slate-50 to-white p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
            <GraduationCap className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">STEPS LMS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý vận hành trung tâm trên 1 nền tảng
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm callbackUrl={callbackUrl} error={error} />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Quên mật khẩu? Liên hệ quản trị viên của trung tâm để được đặt lại, sau đó tự đổi lại
          trong mục <span className="font-medium text-slate-600">Đổi mật khẩu</span>.
        </p>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} STEPS Education
        </p>
      </div>
    </div>
  );
}
