"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { flashcardImageUrl } from "../../../../cloudflare/flashcard-images";
import type { VocabCard } from "./vocab";
import { VocabFlipCard } from "./vocab-flip";

export function VocabInput({ defaultValue }: { defaultValue: VocabCard[] }) {
  const [rows, setRows] = useState<VocabCard[]>(
    defaultValue.length > 0
      ? defaultValue.map((row) => ({
          ...row,
          imageUrl: flashcardImageUrl(row.front, row.imageUrl || row.image),
        }))
      : [{ front: "", back: "" }],
  );

  function update(index: number, patch: Partial<VocabCard>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">Từ {index + 1}</p>
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => (prev.length === 1 ? [{ front: "", back: "" }] : prev.filter((_, i) => i !== index)))
                }
                className={`${buttonClass("ghost", "icon")} sy-edit-only`}
                title="Xóa từ này"
                aria-label="Xóa từ này"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Từ</Label>
                <Input
                  name="vocabFront"
                  value={row.front}
                  onChange={(event) => {
                    const front = event.target.value;
                    update(index, { front, imageUrl: flashcardImageUrl(front, row.imageUrl || row.image) });
                  }}
                  placeholder="school"
                />
              </div>
              <div>
                <Label>Nghĩa</Label>
                <Input
                  name="vocabBack"
                  value={row.back}
                  onChange={(event) => update(index, { back: event.target.value })}
                  placeholder="trường học"
                />
              </div>
            </div>

            <input type="hidden" name="vocabImage" value={row.imageUrl ?? ""} />
            <input type="hidden" name="vocabBackImage" value={row.backImageUrl ?? ""} />

            <div className="mt-3">
              <VocabFlipCard card={row} />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { front: "", back: "" }])}
        className={`${buttonClass("secondary", "sm")} sy-edit-only`}
      >
        <Plus className="h-4 w-4" />
        Thêm từ
      </button>
    </div>
  );
}
