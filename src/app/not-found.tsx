import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-linear-to-br from-brand-50 via-background to-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <FileQuestion className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-500">
          Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.
        </p>
        <Link href="/" className={buttonClass("primary", "md", "mt-6 w-full")}>
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
