"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

import { FileField } from "./file-field";
import { emptyCambridgeItem } from "./writing-samples";
import type { WritingExercise } from "./types";

export function WritingEditor({
  value,
  onChange,
}: {
  value: WritingExercise;
  onChange: (next: WritingExercise) => void;
}) {
  function patch(partial: Partial<WritingExercise>) {
    onChange({ ...value, ...partial } as WritingExercise);
  }

  return (
    <div className="space-y-4">
      <Field label="Tên đề">
        <Input value={value.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label="Hướng dẫn chung">
        <Textarea rows={2} value={value.instruction} onChange={(e) => patch({ instruction: e.target.value })} />
      </Field>

      {value.kind === "CAMBRIDGE" ? <CambridgeFields value={value} onChange={onChange} /> : null}
      {value.kind === "TASK1" ? <Task1Fields value={value} onChange={onChange} /> : null}
      {value.kind === "TASK2" ? <Task2Fields value={value} onChange={onChange} /> : null}
    </div>
  );
}

function CambridgeFields({
  value,
  onChange,
}: {
  value: Extract<WritingExercise, { kind: "CAMBRIDGE" }>;
  onChange: (next: WritingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      {value.items.map((item, index) => (
        <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nhãn câu">
              <Input
                value={item.label}
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: value.items.map((row) =>
                      row.id === item.id ? { ...row, label: e.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Số từ gợi ý">
              <Input
                type="number"
                min={1}
                value={item.wordTarget}
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: value.items.map((row) =>
                      row.id === item.id ? { ...row, wordTarget: Number(e.target.value) || 1 } : row,
                    ),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Yêu cầu (dòng in đậm trên đề)">
            <Textarea
              rows={2}
              value={item.requirement}
              onChange={(e) =>
                onChange({
                  ...value,
                  items: value.items.map((row) =>
                    row.id === item.id ? { ...row, requirement: e.target.value } : row,
                  ),
                })
              }
            />
          </Field>
          <Field label="Lời dẫn (Read this email...)">
            <Input
              value={item.promptIntro}
              onChange={(e) =>
                onChange({
                  ...value,
                  items: value.items.map((row) =>
                    row.id === item.id ? { ...row, promptIntro: e.target.value } : row,
                  ),
                })
              }
            />
          </Field>
          <Field label="Nội dung đề (chữ)" hint="Nếu không tải hình, học sinh chỉ thấy phần này.">
            <Textarea
              rows={5}
              value={item.promptText}
              onChange={(e) =>
                onChange({
                  ...value,
                  items: value.items.map((row) =>
                    row.id === item.id ? { ...row, promptText: e.target.value } : row,
                  ),
                })
              }
            />
          </Field>
          <FileField
            label="Hình đề (không bắt buộc)"
            accept="image/*"
            fileName={item.imageName}
            onPick={(imageName, imageUrl) =>
              onChange({
                ...value,
                items: value.items.map((row) =>
                  row.id === item.id ? { ...row, imageName, imageUrl } : row,
                ),
              })
            }
            onClear={() =>
              onChange({
                ...value,
                items: value.items.map((row) =>
                  row.id === item.id ? { ...row, imageName: "", imageUrl: "" } : row,
                ),
              })
            }
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            items: [...value.items, emptyCambridgeItem(value.startNo + value.items.length)],
          })
        }
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm câu
      </button>
    </div>
  );
}

function Task1Fields({
  value,
  onChange,
}: {
  value: Extract<WritingExercise, { kind: "TASK1" }>;
  onChange: (next: WritingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Đề bài">
        <Textarea
          rows={4}
          value={value.prompt}
          placeholder="The table below shows..."
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
        />
      </Field>
      <FileField
        label="Hình biểu đồ / bảng"
        hint="Không tải hình thì Preview chỉ hiện chữ."
        accept="image/*"
        fileName={value.imageName}
        onPick={(imageName, imageUrl) => onChange({ ...value, imageName, imageUrl })}
        onClear={() => onChange({ ...value, imageName: "", imageUrl: "" })}
      />
      {value.imageUrl ? (
        <img src={value.imageUrl} alt={value.imageName || "Biểu đồ"} className="max-h-56 rounded-lg border border-slate-200" />
      ) : null}
      <Field label="Hướng dẫn viết (không bắt buộc)">
        <Textarea
          rows={4}
          value={value.writingGuide}
          placeholder="Overview trước, rồi so sánh số liệu chính..."
          onChange={(e) => onChange({ ...value, writingGuide: e.target.value })}
        />
      </Field>
      <Field label="Bài mẫu (không bắt buộc)" hint="Học sinh bật/tắt trên Preview.">
        <Textarea
          rows={6}
          value={value.sampleAnswer}
          onChange={(e) => onChange({ ...value, sampleAnswer: e.target.value })}
        />
      </Field>
      <Field label="Số từ gợi ý">
        <Input
          type="number"
          min={1}
          className="max-w-xs"
          value={value.wordTarget}
          onChange={(e) => onChange({ ...value, wordTarget: Number(e.target.value) || 1 })}
        />
      </Field>
    </div>
  );
}

function Task2Fields({
  value,
  onChange,
}: {
  value: Extract<WritingExercise, { kind: "TASK2" }>;
  onChange: (next: WritingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Đề bài">
        <Textarea
          rows={5}
          value={value.prompt}
          placeholder="Some people think that..."
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
        />
      </Field>
      <FileField
        label="Hình (không bắt buộc)"
        hint="Không tải hình thì chỉ hiện đề chữ, xếp dọc."
        accept="image/*"
        fileName={value.imageName}
        onPick={(imageName, imageUrl) => onChange({ ...value, imageName, imageUrl })}
        onClear={() => onChange({ ...value, imageName: "", imageUrl: "" })}
      />
      {value.imageUrl ? (
        <img src={value.imageUrl} alt={value.imageName || "Hình đề"} className="max-h-56 rounded-lg border border-slate-200" />
      ) : null}
      <Field label="Bài mẫu (không bắt buộc)">
        <Textarea
          rows={6}
          value={value.sampleAnswer}
          onChange={(e) => onChange({ ...value, sampleAnswer: e.target.value })}
        />
      </Field>
      <Field label="Số từ gợi ý">
        <Input
          type="number"
          min={1}
          className="max-w-xs"
          value={value.wordTarget}
          onChange={(e) => onChange({ ...value, wordTarget: Number(e.target.value) || 1 })}
        />
      </Field>
    </div>
  );
}
