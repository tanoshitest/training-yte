"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

import { FileField } from "./file-field";
import { nextId, type SpeakingExercise } from "./types";

export function SpeakingEditor({
  value,
  onChange,
}: {
  value: SpeakingExercise;
  onChange: (next: SpeakingExercise) => void;
}) {
  function patch(partial: Partial<SpeakingExercise>) {
    onChange({ ...value, ...partial } as SpeakingExercise);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên đề">
          <Input value={value.title} onChange={(e) => patch({ title: e.target.value })} />
        </Field>
        <Field label="Số câu bắt đầu">
          <Input
            type="number"
            min={1}
            value={value.startNo}
            onChange={(e) => patch({ startNo: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>

      <FileField
        label="Audio hướng dẫn (không bắt buộc)"
        hint="Học sinh nghe đoạn này trước khi nói. Chỉ lưu trên trình duyệt."
        accept="audio/*"
        fileName={value.audioName}
        onPick={(audioName, audioUrl) => patch({ audioName, audioUrl })}
        onClear={() => patch({ audioName: "", audioUrl: "" })}
      />

      <Field label="Hướng dẫn làm bài">
        <Textarea rows={3} value={value.instruction} onChange={(e) => patch({ instruction: e.target.value })} />
      </Field>

      {value.kind === "QUICK" ? <QuickFields value={value} onChange={onChange} /> : null}
      {value.kind === "PICTURE" ? <PictureFields value={value} onChange={onChange} /> : null}
      {value.kind === "SAMPLE" ? (
        <Field label="Đoạn mẫu" hint="Học sinh đọc và ghi âm theo đoạn này.">
          <Textarea
            rows={8}
            value={value.sampleText}
            placeholder="Nhập đoạn mẫu..."
            onChange={(e) => onChange({ ...value, sampleText: e.target.value })}
          />
        </Field>
      ) : null}
      {value.kind === "VIDEO" ? (
        <Field label="Câu hỏi / yêu cầu">
          <Textarea
            rows={4}
            value={value.prompt}
            placeholder="Học sinh sẽ nói gì trong video?"
            onChange={(e) => onChange({ ...value, prompt: e.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}

function QuickFields({
  value,
  onChange,
}: {
  value: Extract<SpeakingExercise, { kind: "QUICK" }>;
  onChange: (next: SpeakingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">Câu hỏi</p>
      {value.items.map((item, index) => (
        <div key={item.id} className="flex gap-2">
          <span className="mt-2 w-8 shrink-0 text-xs font-semibold text-slate-500">
            {value.startNo + index}.
          </span>
          <Textarea
            rows={2}
            value={item.text}
            placeholder="Nhập câu hỏi"
            onChange={(e) =>
              onChange({
                ...value,
                items: value.items.map((row) => (row.id === item.id ? { ...row, text: e.target.value } : row)),
              })
            }
          />
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
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, items: [...value.items, { id: nextId("q"), text: "" }] })}
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm câu
      </button>
    </div>
  );
}

function PictureFields({
  value,
  onChange,
}: {
  value: Extract<SpeakingExercise, { kind: "PICTURE" }>;
  onChange: (next: SpeakingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <FileField
        label="Hình"
        accept="image/*"
        fileName={value.imageName}
        onPick={(imageName, imageUrl) => onChange({ ...value, imageName, imageUrl })}
        onClear={() => onChange({ ...value, imageName: "", imageUrl: "" })}
      />
      {value.imageUrl ? (
        <img src={value.imageUrl} alt={value.imageName || "Hình đề"} className="max-h-56 rounded-lg border border-slate-200" />
      ) : null}
      <Field label="Câu hỏi / yêu cầu">
        <Textarea
          rows={3}
          value={value.prompt}
          placeholder="Describe the picture. What is happening?"
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
        />
      </Field>
    </div>
  );
}
