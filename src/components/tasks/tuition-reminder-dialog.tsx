"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Dialog } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { milestoneLabel, type TuitionReminderTask } from "@/lib/tuition-reminder-types";
import { markTuitionReminded } from "@/app/(app)/task/actions";

export function TuitionReminderActions({
  task,
  label,
}: {
  task: TuitionReminderTask;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pdfHref = `/hoc-phi/nhac-phi/${task.enrollmentId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-brand-700 hover:underline"
      >
        {label ?? (task.completed ? "Xem lại" : "Xem thông tin")}
      </button>
      <Dialog
        title={`Nhắc học phí lần ${task.round} — ${task.studentName}`}
        open={open}
        onClose={() => setOpen(false)}
        wide
        fit
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("outline", "md")}>
              Đóng
            </button>
            <Link href={`${pdfHref}?print=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
              <Download className="h-4 w-4" />
              Xuất PDF nhắc phụ huynh
            </Link>
            {task.completed ? null : (
              <ActionForm action={markTuitionReminded}>
                <input type="hidden" name="enrollmentId" value={task.enrollmentId} />
                <input type="hidden" name="milestone" value={task.milestone} />
                <input type="hidden" name="cycleKey" value={task.cycleKey} />
                <input type="hidden" name="remaining" value={task.remaining} />
                <input type="hidden" name="round" value={task.round} />
                <SubmitButton>Đã nhắc lần {task.round}</SubmitButton>
              </ActionForm>
            )}
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <Info label="Học viên" value={`${task.studentName} (${task.studentCode})`} />
          <Info label="Lớp" value={task.className} />
          <Info label="Phụ huynh" value={task.parentName || "—"} />
          <Info label="SĐT phụ huynh" value={task.parentPhone || "—"} />
          <Info label="Mốc nhắc" value={milestoneLabel(task.milestone)} />
          <Info
            label="Số buổi còn lại"
            value={
              task.remaining > 0
                ? `${task.remaining} buổi`
                : task.remaining === 0
                  ? "0 buổi"
                  : `Nợ ${-task.remaining} buổi`
            }
          />
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
          <p className="text-xs font-medium text-slate-500">Gói học phí (cấu hình lớp)</p>
          {task.packages.length === 0 ? (
            <p className="mt-1 text-slate-400">Chưa khai báo gói.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {task.packages.map((pkg) => (
                <li key={pkg.id} className="flex justify-between gap-3">
                  <span>
                    {pkg.totalSessions} buổi — {pkg.name}
                  </span>
                  <span className="tabular-nums font-medium">{formatCurrency(pkg.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Xuất PDF gửi phụ huynh. Khi phụ huynh đóng, biên lai ghi học phí bắt đầu từ ngày còn 0 buổi;
          ngày thu là ngày đóng thực tế.
        </p>
      </Dialog>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}
