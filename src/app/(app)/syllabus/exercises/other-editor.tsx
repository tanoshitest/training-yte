"use client";

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

import { emptyOtherItem } from "./other-samples";
import { nextId, type OtherExercise, type OtherItem } from "./types";

export function OtherEditor({
  value,
  onChange,
}: {
  value: OtherExercise;
  onChange: (next: OtherExercise) => void;
}) {
  function updateItem(id: string, patch: Partial<OtherItem>) {
    onChange({
      ...value,
      items: value.items.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Tên đề">
        <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </Field>
      <Field label="Hướng dẫn">
        <Textarea
          rows={2}
          value={value.instruction}
          onChange={(e) => onChange({ ...value, instruction: e.target.value })}
        />
      </Field>

      {value.items.map((item, index) => (
        <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Câu {value.startNo + index}</p>
            {value.items.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange({ ...value, items: value.items.filter((row) => row.id !== item.id) })}
                className={buttonClass("ghost", "icon")}
                aria-label="Xóa câu"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <Field
            label={promptLabel(value.kind)}
            hint={promptHint(value.kind)}
          >
            <Textarea
              rows={value.kind === "DIALOGUE" ? 4 : 2}
              value={item.text}
              onChange={(e) => updateItem(item.id, { text: e.target.value })}
            />
          </Field>

          {value.kind === "SHORT_MCQ" || value.kind === "CHOOSE" || value.kind === "TRUE_FALSE" ? (
            <OptionRows
              item={item}
              fixed={value.kind === "TRUE_FALSE"}
              min={value.kind === "SHORT_MCQ" ? 4 : 2}
              max={value.kind === "SHORT_MCQ" ? 4 : 3}
              onChange={(options) => updateItem(item.id, { options })}
            />
          ) : null}

          {value.kind === "MATCH" ? (
            <Field label="Vế phải (nghĩa / vế còn lại)">
              <Input value={item.pair} onChange={(e) => updateItem(item.id, { pair: e.target.value })} />
            </Field>
          ) : null}

          {value.kind === "ORDER" ? (
            <Field label="Các từ (phân tách bằng dấu phẩy)" hint="Thứ tự đúng. Preview sẽ xáo khi học sinh làm.">
              <Input
                value={item.words.join(", ")}
                placeholder="She, goes, to, school, every, day"
                onChange={(e) =>
                  updateItem(item.id, {
                    words: e.target.value.split(",").map((word) => word.trim()).filter(Boolean),
                  })
                }
              />
            </Field>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...value, items: [...value.items, emptyOtherItem(value.kind)] })}
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm câu
      </button>
    </div>
  );
}

function promptLabel(kind: OtherExercise["kind"]) {
  if (kind === "MATCH") return "Vế trái";
  if (kind === "ERROR") return "Câu sai";
  if (kind === "REWRITE") return "Câu gốc / yêu cầu";
  if (kind === "DIALOGUE") return "Hội thoại (chỗ trống viết ___)";
  if (kind === "TENSE" || kind === "GAP") return "Câu (chỗ trống viết ___)";
  if (kind === "ORDER") return "Câu đúng (gợi ý, không bắt buộc)";
  return "Câu hỏi";
}

function promptHint(kind: OtherExercise["kind"]) {
  if (kind === "TENSE") return "Ví dụ: She ___ (go) to school yesterday.";
  if (kind === "GAP" || kind === "DIALOGUE") return "Ví dụ: A: What ___ you doing?";
  return undefined;
}

function OptionRows({
  item,
  fixed,
  min,
  max,
  onChange,
}: {
  item: OtherItem;
  fixed: boolean;
  min: number;
  max: number;
  onChange: (options: OtherItem["options"]) => void;
}) {
  function toggle(id: string) {
    onChange(
      item.options.map((option) => ({
        ...option,
        correct: option.id === id ? !option.correct : false,
      })),
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Đáp án — tick đáp án đúng</p>
      {item.options.map((option, index) => (
        <div key={option.id} className="flex items-center gap-2">
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="radio"
              checked={option.correct}
              onChange={() => toggle(option.id)}
              className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Đúng
          </label>
          <Input
            value={option.text}
            readOnly={fixed}
            placeholder={fixed ? option.text : `Đáp án ${index + 1}`}
            onChange={(e) =>
              onChange(item.options.map((row) => (row.id === option.id ? { ...row, text: e.target.value } : row)))
            }
          />
          {!fixed && item.options.length > min ? (
            <button
              type="button"
              onClick={() => onChange(item.options.filter((row) => row.id !== option.id))}
              className={buttonClass("ghost", "icon")}
              aria-label="Xóa đáp án"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
      {!fixed && item.options.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...item.options, { id: nextId("opt"), text: "", correct: false }])}
          className={buttonClass("ghost", "sm")}
        >
          <Plus className="h-4 w-4" />
          Thêm đáp án
        </button>
      ) : null}
    </div>
  );
}
