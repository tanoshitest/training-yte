"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { EMPTY_STATE } from "@/lib/form-utils";
import { setClassSyllabuses } from "./actions";

export type SyllabusOption = {
  id: string;
  name: string;
  levelName: string | null;
  /** Tổng số buổi trong syllabus — cho biết đang gán bao nhiêu buổi nội dung vào lớp. */
  lessonCount: number;
};

/**
 * Ô gán Syllabus cho lớp: chọn từng cái rồi bấm Thêm, các syllabus đã gán hiện
 * thành danh sách bên dưới theo đúng thứ tự sẽ dạy.
 *
 * Mỗi dòng gửi lên một `<input name="syllabusIds">`, nên Server Action chỉ cần
 * `fd.getAll("syllabusIds")` là có đủ danh sách và thứ tự.
 *
 * Danh sách đã chọn do form cha giữ, vì tổng số buổi ở đây được hiện ngay trên form.
 * Gán thêm syllabus lúc nào cũng được: bài nối tiếp vào buổi trống kế tiếp của lớp.
 * Trang chi tiết lớp truyền `classId` — Thêm / Xoá ghi DB ngay, không chờ Lưu.
 */
export function SyllabusPicker({
  options,
  value: ids,
  onChange: setIds,
  className,
  compact = false,
  classId,
}: {
  options: SyllabusOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /** Trang chi tiết lớp: bỏ gợi ý dài để form vừa một màn hình. */
  compact?: boolean;
  /** Có classId thì Thêm / Xoá ghi DB ngay. */
  classId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byId = new Map(options.map((option) => [option.id, option]));
  const chosen = ids.map((id) => byId.get(id)).filter((item) => item != null);
  const rest = options.filter((option) => !ids.includes(option.id));
  const totalLessons = chosen.reduce((sum, item) => sum + item.lessonCount, 0);

  function apply(next: string[]) {
    const previous = ids;
    setIds(next);
    setError(null);
    if (!classId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", classId);
      for (const id of next) fd.append("syllabusIds", id);
      const result = await setClassSyllabuses(EMPTY_STATE, fd);
      if (result.error) {
        setIds(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function add() {
    if (!draft || ids.includes(draft)) return;
    apply([...ids, draft]);
    setDraft("");
  }

  return (
    <Field
      label="Syllabus"
      hint={
        compact
          ? classId
            ? "Bấm Thêm là gán ngay vào lớp."
            : undefined
          : "Gán được nhiều syllabus, dạy nối tiếp theo thứ tự trong danh sách."
      }
      className={className}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={rest.length === 0 || pending}
          >
            <option value="">
              {rest.length === 0 ? "— Đã gán hết syllabus —" : "— Chọn syllabus để thêm —"}
            </option>
            {rest.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.levelName ? ` (${option.levelName})` : ""} — {option.lessonCount} buổi
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={add}
            disabled={!draft || pending}
            className={buttonClass("secondary", "md", "shrink-0")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm
          </button>
        </div>

        {chosen.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500">
            {compact
              ? "Chưa gán syllabus — lớp vẫn chạy bình thường."
              : "Chưa gán syllabus nào. Lớp vẫn chạy và điểm danh bình thường, buổi học ghi \"Chưa gán syllabus\" cho tới khi gán."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {chosen.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-xs text-slate-400">{index + 1}.</span>
                <span className="flex-1 text-slate-800">
                  {item.name}
                  {item.levelName ? (
                    <span className="text-slate-400"> ({item.levelName})</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{item.lessonCount} buổi</span>
                <button
                  type="button"
                  onClick={() => apply(ids.filter((id) => id !== item.id))}
                  title="Bỏ syllabus này"
                  aria-label="Bỏ syllabus này"
                  disabled={pending}
                  className={buttonClass("ghost", "icon", "shrink-0")}
                >
                  <X className="h-4 w-4" />
                </button>
                <input type="hidden" name="syllabusIds" value={item.id} />
              </li>
            ))}
            <li className="px-3 py-1.5 text-xs font-medium text-slate-600">
              Tổng {totalLessons} buổi
            </li>
          </ul>
        )}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Field>
  );
}
