"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

import { Button, buttonClass } from "@/components/ui/button";

export type PayrollSessionLine = {
  id: string;
  date: string;
  className: string;
  time: string;
  hours: string;
};

export type PayrollDetailView = {
  name: string;
  code: string;
  period: string;
  sessions: number;
  hours: string;
  rate: string;
  commissionRate: string;
  baseSalary: string;
  commission: string;
  gross: string;
  tax: string;
  taxLabel: string;
  net: string;
  timesheetHref: string;
  lines: PayrollSessionLine[];
};

export function PayrollDetailButton({ detail }: { detail: PayrollDetailView }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        title="Chi tiết lương"
        aria-label="Chi tiết lương"
        onClick={() => setOpen(true)}
        className={buttonClass("outline", "icon")}
      >
        <Eye className="h-4 w-4" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Đóng" onClick={close} />
          <div className="relative flex min-h-full items-center justify-center overflow-y-auto p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Chi tiết lương"
              className="pointer-events-auto flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Chi tiết lương</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {detail.name} · {detail.code} · {detail.period}
                  </p>
                </div>
                <button type="button" onClick={close} className={buttonClass("ghost", "icon")} aria-label="Đóng">
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <dl className="grid grid-cols-2 gap-x-6 px-5 py-3 text-sm">
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Kỳ lương</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.period}</dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Giáo viên</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.name}</dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Buổi tính lương</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.sessions} buổi</dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Giờ công</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.hours} giờ</dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Lương</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {detail.baseSalary}
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {detail.hours} giờ × {detail.rate}
                      </span>
                    </dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Hoa hồng</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {detail.commission}
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {detail.sessions} buổi × {detail.commissionRate}
                      </span>
                    </dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Tổng trước thuế</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.gross}</dd>
                  </div>
                  <div className="border-b border-slate-100 py-3">
                    <dt className="text-xs font-semibold text-slate-500">{detail.taxLabel}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{detail.tax}</dd>
                  </div>
                  <div className="col-span-2 py-3">
                    <dt className="text-xs font-semibold text-slate-500">Thực lĩnh</dt>
                    <dd className="mt-1 text-base font-semibold text-slate-900">
                      {detail.net}
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">Lương + hoa hồng − thuế</span>
                    </dd>
                  </div>
                </dl>
                {detail.lines.length ? (
                  <div className="px-5 pb-4">
                    <h3 className="mb-2 text-xs font-semibold text-slate-700">Buổi tính lương ({detail.lines.length})</h3>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="w-12 px-3 py-2 font-semibold">STT</th>
                            <th className="px-3 py-2 font-semibold">Ngày</th>
                            <th className="px-3 py-2 font-semibold">Lớp</th>
                            <th className="px-3 py-2 font-semibold">Giờ dạy</th>
                            <th className="px-3 py-2 font-semibold">Số giờ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lines.map((line, index) => (
                            <tr key={line.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-500 tabular-nums">{index + 1}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-slate-600">{line.date}</td>
                              <td className="px-3 py-2">{line.className}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{line.time}</td>
                              <td className="px-3 py-2">{line.hours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
                <Link href={detail.timesheetHref} className={buttonClass("outline", "md")}>
                  Xem chấm công
                </Link>
                <Button onClick={close}>Đóng</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
