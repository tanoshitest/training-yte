import type { Metadata } from "next";

export const metadata: Metadata = { title: "Lịch sử bài test" };

export default function PortalTestHistoryPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Lịch sử bài test</h1>
      <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Chưa có bài test nào được ghi nhận.
      </p>
    </>
  );
}
