"use client";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Textarea } from "@/components/ui/input";
import { saveReport } from "./actions";

function ReportValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      {value?.trim() ? (
        <p className="whitespace-pre-wrap text-sm text-slate-800">{value}</p>
      ) : (
        <p className="text-sm text-slate-400">Chưa có nội dung.</p>
      )}
    </div>
  );
}

function ReportFields({
  report,
}: {
  report?: {
    classSituation: string | null;
    studentsToNote: string | null;
    homework: string | null;
    note: string | null;
  } | null;
}) {
  return (
    <div className="space-y-4">
      <Field label="Tình hình lớp">
        <Textarea name="classSituation" defaultValue={report?.classSituation ?? ""} />
      </Field>
      <Field label="Học viên cần lưu ý">
        <Textarea name="studentsToNote" defaultValue={report?.studentsToNote ?? ""} />
      </Field>
      <Field label="Bài tập về nhà">
        <Textarea name="homework" defaultValue={report?.homework ?? ""} />
      </Field>
      <Field label="Ghi chú khác">
        <Textarea name="note" defaultValue={report?.note ?? ""} />
      </Field>
    </div>
  );
}

export function LessonReportForm({
  sessionId,
  report,
  readOnly = false,
  embedded = false,
}: {
  sessionId: string;
  report?: {
    classSituation: string | null;
    studentsToNote: string | null;
    homework: string | null;
    note: string | null;
  } | null;
  readOnly?: boolean;
  /** Nằm trong form cha — chỉ render ô nhập, không có nút lưu riêng. */
  embedded?: boolean;
}) {
  if (readOnly) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <ReportValue label="Tình hình lớp" value={report?.classSituation} />
        <ReportValue label="Học viên cần lưu ý" value={report?.studentsToNote} />
        <ReportValue label="Bài tập về nhà" value={report?.homework} />
        <ReportValue label="Ghi chú khác" value={report?.note} />
      </div>
    );
  }

  if (embedded) {
    return <ReportFields report={report} />;
  }

  return (
    <ActionForm action={saveReport} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <ReportFields report={report} />
      <SubmitButton>Lưu báo cáo</SubmitButton>
    </ActionForm>
  );
}
