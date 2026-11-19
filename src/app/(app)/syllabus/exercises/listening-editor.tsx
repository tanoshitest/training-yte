"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

import { FileField } from "./file-field";
import { emptyListeningMcqItem, emptyListeningOption } from "./listening-samples";
import { nextId, type ListeningExercise } from "./types";

export function ListeningEditor({
  value,
  onChange,
}: {
  value: ListeningExercise;
  onChange: (next: ListeningExercise) => void;
}) {
  function patch(partial: Partial<ListeningExercise>) {
    onChange({ ...value, ...partial } as ListeningExercise);
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
        label="File nghe"
        accept="audio/*"
        fileName={value.audioName}
        onPick={(audioName, audioUrl) => patch({ audioName, audioUrl })}
        onClear={() => patch({ audioName: "", audioUrl: "" })}
      />

      <Field label="Hướng dẫn làm bài">
        <Textarea rows={3} value={value.instruction} onChange={(e) => patch({ instruction: e.target.value })} />
      </Field>

      {value.kind === "FILL" ? <FillFields value={value} onChange={onChange} /> : null}
      {value.kind === "MCQ" ? <McqFields value={value} onChange={onChange} /> : null}
      {value.kind === "TICK" ? <TickFields value={value} onChange={onChange} /> : null}
      {value.kind === "DND" ? <DndFields value={value} onChange={onChange} /> : null}
    </div>
  );
}

function FillFields({
  value,
  onChange,
}: {
  value: Extract<ListeningExercise, { kind: "FILL" }>;
  onChange: (next: ListeningExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Cách trình bày">
        <Select
          value={value.layout}
          onChange={(e) => onChange({ ...value, layout: e.target.value as "NOTES" | "TABLE" })}
        >
          <option value="NOTES">Ghi chú / đoạn văn</option>
          <option value="TABLE">Bảng</option>
        </Select>
      </Field>
      {value.layout === "NOTES" ? (
        <>
          <Field label="Tiêu đề ghi chú">
            <Input value={value.notesTitle} onChange={(e) => onChange({ ...value, notesTitle: e.target.value })} />
          </Field>
          <Field label="Nội dung" hint="Chỗ trống viết [[1]], [[2]], ...">
            <Textarea rows={10} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Tiêu đề bảng">
            <Input value={value.tableTitle} onChange={(e) => onChange({ ...value, tableTitle: e.target.value })} />
          </Field>
          <Field label="Cột (phân tách bằng | )">
            <Input
              value={value.tableHeaders.join(" | ")}
              onChange={(e) =>
                onChange({
                  ...value,
                  tableHeaders: e.target.value.split("|").map((cell) => cell.trim()),
                })
              }
            />
          </Field>
          {value.tableRows.map((row, r) => (
            <div key={r} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Hàng {r + 1}</p>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, tableRows: value.tableRows.filter((_, i) => i !== r) })}
                  className={buttonClass("ghost", "icon")}
                  aria-label="Xóa hàng"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {row.map((cell, c) => (
                <Field key={c} label={value.tableHeaders[c] || `Ô ${c + 1}`} className="mb-2">
                  <Textarea
                    rows={2}
                    value={cell}
                    onChange={(e) => {
                      const next = value.tableRows.map((line) => [...line]);
                      next[r][c] = e.target.value;
                      onChange({ ...value, tableRows: next });
                    }}
                  />
                </Field>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, tableRows: [...value.tableRows, value.tableHeaders.map(() => "")] })
            }
            className={buttonClass("secondary", "sm")}
          >
            <Plus className="h-4 w-4" />
            Thêm hàng
          </button>
        </>
      )}
    </div>
  );
}

function McqFields({
  value,
  onChange,
}: {
  value: Extract<ListeningExercise, { kind: "MCQ" }>;
  onChange: (next: ListeningExercise) => void;
}) {
  const maxCorrect = value.allowTwo ? 2 : 1;

  function updateItem(id: string, patch: Partial<(typeof value.items)[number]>) {
    onChange({
      ...value,
      items: value.items.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  }

  function toggleCorrect(itemId: string, optionId: string) {
    onChange({
      ...value,
      items: value.items.map((item) => {
        if (item.id !== itemId) return item;
        const target = item.options.find((option) => option.id === optionId);
        if (!target) return item;
        if (target.correct) {
          return {
            ...item,
            options: item.options.map((option) =>
              option.id === optionId ? { ...option, correct: false } : option,
            ),
          };
        }
        if (maxCorrect === 1) {
          return {
            ...item,
            options: item.options.map((option) => ({ ...option, correct: option.id === optionId })),
          };
        }
        if (item.options.filter((option) => option.correct).length >= 2) return item;
        return {
          ...item,
          options: item.options.map((option) =>
            option.id === optionId ? { ...option, correct: true } : option,
          ),
        };
      }),
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kiểu đáp án">
          <Select
            value={value.optionMode}
            onChange={(e) => onChange({ ...value, optionMode: e.target.value as "TEXT" | "IMAGE" })}
          >
            <option value="TEXT">Đáp án chữ</option>
            <option value="IMAGE">Đáp án hình</option>
          </Select>
        </Field>
        <Field label="Số đáp án đúng">
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.allowTwo}
              onChange={(e) => onChange({ ...value, allowTwo: e.target.checked })}
              className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Cho phép chọn tối đa 2 đáp án
          </label>
        </Field>
      </div>

      {value.items.map((item, index) => (
        <div key={item.id} className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
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
          <Textarea
            rows={2}
            value={item.text}
            placeholder="Nhập câu hỏi"
            onChange={(e) => updateItem(item.id, { text: e.target.value })}
          />
          <p className="mt-3 mb-1.5 text-xs font-medium text-slate-500">Đáp án — tick vào đáp án đúng</p>
          <div className="space-y-2">
            {item.options.map((option, optIndex) => (
              <div key={option.id} className="flex flex-wrap items-center gap-2">
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type={maxCorrect === 1 ? "radio" : "checkbox"}
                    checked={option.correct}
                    onChange={() => toggleCorrect(item.id, option.id)}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Đúng
                </label>
                {value.optionMode === "IMAGE" ? (
                  <>
                    {option.imageUrl ? (
                      <img
                        src={option.imageUrl}
                        alt={option.text || `Đáp án ${optIndex + 1}`}
                        className="h-14 w-20 rounded-md border border-slate-200 object-cover"
                      />
                    ) : null}
                    <input
                      type="file"
                      accept="image/*"
                      className="max-w-[14rem] text-xs text-slate-600"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        updateItem(item.id, {
                          options: item.options.map((row) =>
                            row.id === option.id
                              ? { ...row, imageName: file.name, imageUrl: URL.createObjectURL(file) }
                              : row,
                          ),
                        });
                      }}
                    />
                    <Input
                      className="min-w-[8rem] flex-1"
                      value={option.text}
                      placeholder="Nhãn (không bắt buộc)"
                      onChange={(e) =>
                        updateItem(item.id, {
                          options: item.options.map((row) =>
                            row.id === option.id ? { ...row, text: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </>
                ) : (
                  <Input
                    value={option.text}
                    placeholder={`Đáp án ${optIndex + 1}`}
                    onChange={(e) =>
                      updateItem(item.id, {
                        options: item.options.map((row) =>
                          row.id === option.id ? { ...row, text: e.target.value } : row,
                        ),
                      })
                    }
                  />
                )}
                {item.options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateItem(item.id, { options: item.options.filter((row) => row.id !== option.id) })
                    }
                    className={buttonClass("ghost", "icon")}
                    aria-label="Xóa đáp án"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {item.options.length < 4 ? (
            <button
              type="button"
              onClick={() => updateItem(item.id, { options: [...item.options, emptyListeningOption()] })}
              className={buttonClass("ghost", "sm", "mt-2")}
            >
              <Plus className="h-4 w-4" />
              Thêm đáp án
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...value, items: [...value.items, emptyListeningMcqItem()] })}
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm câu
      </button>
    </div>
  );
}

function TickFields({
  value,
  onChange,
}: {
  value: Extract<ListeningExercise, { kind: "TICK" }>;
  onChange: (next: ListeningExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <FileField
        label="Hình sơ đồ (không bắt buộc)"
        hint="Nếu có hình, Preview hiện hình bên trái, bảng tick bên phải."
        accept="image/*"
        fileName={value.promptImageName}
        onPick={(promptImageName, promptImageUrl) => onChange({ ...value, promptImageName, promptImageUrl })}
        onClear={() => onChange({ ...value, promptImageName: "", promptImageUrl: "" })}
      />
      <Field label="Cột đáp án (A, B, C, ...)" hint="Phân tách bằng dấu phẩy.">
        <Input
          value={value.columns.join(", ")}
          onChange={(e) => {
            const columns = e.target.value.split(",").map((col) => col.trim()).filter(Boolean);
            const optionLabels = columns.map((key) => ({
              key,
              text: value.optionLabels.find((row) => row.key === key)?.text ?? "",
            }));
            onChange({ ...value, columns, optionLabels });
          }}
        />
      </Field>
      <p className="text-sm font-medium text-slate-700">LIST OF OPTIONS</p>
      {value.optionLabels.map((label) => (
        <div key={label.key} className="grid gap-2 sm:grid-cols-[3rem_1fr]">
          <Input value={label.key} readOnly />
          <Input
            value={label.text}
            placeholder="Mô tả đáp án"
            onChange={(e) =>
              onChange({
                ...value,
                optionLabels: value.optionLabels.map((row) =>
                  row.key === label.key ? { ...row, text: e.target.value } : row,
                ),
              })
            }
          />
        </div>
      ))}
      {value.items.map((item) => (
        <div key={item.id} className="grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
          <Input
            type="number"
            value={item.number}
            onChange={(e) =>
              onChange({
                ...value,
                items: value.items.map((row) =>
                  row.id === item.id ? { ...row, number: Number(e.target.value) || row.number } : row,
                ),
              })
            }
          />
          <Input
            value={item.text}
            placeholder="Nội dung câu"
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
              className={buttonClass("outline", "icon")}
              aria-label="Xóa câu"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              { id: nextId("t"), number: (value.items.at(-1)?.number ?? value.startNo - 1) + 1, text: "" },
            ],
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

function DndFields({
  value,
  onChange,
}: {
  value: Extract<ListeningExercise, { kind: "DND" }>;
  onChange: (next: ListeningExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tiêu đề cột trái">
          <Input value={value.leftTitle} onChange={(e) => onChange({ ...value, leftTitle: e.target.value })} />
        </Field>
        <Field label="Tiêu đề ngân đáp án">
          <Input value={value.rightTitle} onChange={(e) => onChange({ ...value, rightTitle: e.target.value })} />
        </Field>
      </div>
      <p className="text-sm font-medium text-slate-700">Các mục (kéo đáp án vào)</p>
      {value.stems.map((stem) => (
        <div key={stem.number} className="grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
          <Input
            type="number"
            value={stem.number}
            onChange={(e) =>
              onChange({
                ...value,
                stems: value.stems.map((row) =>
                  row.number === stem.number ? { ...row, number: Number(e.target.value) || row.number } : row,
                ),
              })
            }
          />
          <Input
            value={stem.text}
            placeholder="Tên / nhãn"
            onChange={(e) =>
              onChange({
                ...value,
                stems: value.stems.map((row) =>
                  row.number === stem.number ? { ...row, text: e.target.value } : row,
                ),
              })
            }
          />
          {value.stems.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, stems: value.stems.filter((row) => row.number !== stem.number) })
              }
              className={buttonClass("outline", "icon")}
              aria-label="Xóa mục"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            stems: [...value.stems, { number: (value.stems.at(-1)?.number ?? value.startNo - 1) + 1, text: "" }],
          })
        }
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm mục
      </button>
      <p className="text-sm font-medium text-slate-700">Ngân đáp án</p>
      {value.options.map((option) => (
        <div key={option.id} className="flex gap-2">
          <Input
            value={option.text}
            onChange={(e) =>
              onChange({
                ...value,
                options: value.options.map((row) =>
                  row.id === option.id ? { ...row, text: e.target.value } : row,
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, options: value.options.filter((row) => row.id !== option.id) })
            }
            className={buttonClass("outline", "icon")}
            aria-label="Xóa đáp án"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, options: [...value.options, { id: nextId("o"), text: "" }] })}
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm đáp án
      </button>
    </div>
  );
}
