import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { SyllabusStatus } from "@/generated/prisma/enums";
import { updateSyllabus } from "../actions";
import { LevelSelect, StatusSelect, SyllabusBadge } from "../ui";

type LevelOption = { id: string; name: string; isActive: boolean };

export function SyllabusInfoForm({
  syllabus,
  levels,
  title = "Thông tin syllabus",
}: {
  syllabus: {
    id: string;
    code: string | null;
    name: string;
    description: string | null;
    levelId: string | null;
    levelLabel: string | null;
    status: SyllabusStatus;
  };
  levels: LevelOption[];
  title?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        <SyllabusBadge value={syllabus.status} />
      </div>
      <ActionForm action={updateSyllabus} className="mt-5 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={syllabus.id} />
        <Field label="Mã syllabus">
          <Input name="code" defaultValue={syllabus.code ?? ""} required />
        </Field>
        <Field label="Trình độ hệ thống">
          <LevelSelect levels={levels} defaultValue={syllabus.levelId} />
        </Field>
        <Field label="Tên syllabus" className="sm:col-span-2">
          <Input name="name" defaultValue={syllabus.name} required />
        </Field>
        <Field label="Nhãn trình độ" hint="Hiện trên trang khi chưa gắn cấp học hệ thống">
          <Input name="levelLabel" defaultValue={syllabus.levelLabel ?? ""} placeholder="Flyers, Starters..." />
        </Field>
        <Field label="Trạng thái">
          <StatusSelect defaultValue={syllabus.status} />
        </Field>
        <Field label="Mô tả" className="sm:col-span-2">
          <Textarea name="description" defaultValue={syllabus.description ?? ""} placeholder="Phạm vi nội dung, đối tượng học viên..." />
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton>Lưu thông tin</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
