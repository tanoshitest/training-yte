"use client";

import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

import { createDndGaps, emptyMcqItem, emptyMcqOptions } from "./samples";
import { nextId, type McqSubtype, type ReadingExercise } from "./types";

export function ExerciseEditor({
  value,
  onChange,
}: {
  value: ReadingExercise;
  onChange: (next: ReadingExercise) => void;
}) {
  function patch(partial: Partial<ReadingExercise>) {
    onChange({ ...value, ...partial } as ReadingExercise);
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

      <Field label="Tiêu đề đoạn văn">
        <Input value={value.passageTitle} onChange={(e) => patch({ passageTitle: e.target.value })} />
      </Field>

      <Field
        label="Đoạn văn (bên trái)"
        hint={
          value.kind === "DND" && value.layout === "GAPS"
            ? "Chèn chỗ trống bằng [[16]], [[17]], ..."
            : "Học sinh đọc phần này ở cột trái."
        }
      >
        <Textarea
          rows={8}
          value={value.passage}
          onChange={(e) => patch({ passage: e.target.value })}
        />
      </Field>

      <Field label="Hướng dẫn làm bài">
        <Textarea
          rows={3}
          value={value.instruction}
          onChange={(e) => patch({ instruction: e.target.value })}
        />
      </Field>

      {value.kind === "MCQ" ? <McqFields value={value} onChange={onChange} /> : null}
      {value.kind === "FILL" ? <FillFields value={value} onChange={onChange} /> : null}
      {value.kind === "TICK" ? <TickFields value={value} onChange={onChange} /> : null}
      {value.kind === "DND" ? <DndFields value={value} onChange={onChange} /> : null}
      {value.kind === "CLOZE" ? <ClozeFields value={value} onChange={onChange} /> : null}
    </div>
  );
}

function McqFields({
  value,
  onChange,
}: {
  value: Extract<ReadingExercise, { kind: "MCQ" }>;
  onChange: (next: ReadingExercise) => void;
}) {
  const fixed = value.subtype !== "NORMAL";
  const maxCorrect = value.subtype === "NORMAL" && value.allowTwo ? 2 : 1;

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
        <Field label="Kiểu trắc nghiệm">
          <Select
            value={value.subtype}
            onChange={(e) => {
              const subtype = e.target.value as McqSubtype;
              onChange({
                ...value,
                subtype,
                allowTwo: subtype === "NORMAL" ? value.allowTwo : false,
                items: value.items.map((item) => ({
                  ...item,
                  options: emptyMcqOptions(subtype),
                })),
              });
            }}
          >
            <option value="TFNG">True / False / Not Given</option>
            <option value="YNNG">Yes / No / Not Given</option>
            <option value="NORMAL">Trắc nghiệm thường</option>
          </Select>
        </Field>
        {value.subtype === "NORMAL" ? (
          <Field label="Số đáp án đúng">
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={value.allowTwo}
                onChange={(e) =>
                  onChange({
                    ...value,
                    allowTwo: e.target.checked,
                    items: e.target.checked
                      ? value.items
                      : value.items.map((item) => ({
                          ...item,
                          options: item.options.map((option, index) => ({
                            ...option,
                            correct: option.correct && item.options.findIndex((row) => row.correct) === index,
                          })),
                        })),
                  })
                }
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Cho phép chọn tối đa 2 đáp án
            </label>
          </Field>
        ) : (
          <p className="self-end text-xs text-slate-500">Tick một đáp án đúng. Ba lựa chọn cố định.</p>
        )}
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
          <p className="mt-3 mb-1.5 text-xs font-medium text-slate-500">
            Đáp án — tick vào đáp án đúng
          </p>
          <div className="space-y-2">
            {item.options.map((option, optIndex) => (
              <div key={option.id} className="flex items-center gap-2">
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type={maxCorrect === 1 ? "radio" : "checkbox"}
                    checked={option.correct}
                    onChange={() => toggleCorrect(item.id, option.id)}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Đúng
                </label>
                <Input
                  value={option.text}
                  readOnly={fixed}
                  placeholder={`Đáp án ${optIndex + 1}`}
                  onChange={(e) =>
                    updateItem(item.id, {
                      options: item.options.map((row) =>
                        row.id === option.id ? { ...row, text: e.target.value } : row,
                      ),
                    })
                  }
                />
                {!fixed && item.options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateItem(item.id, {
                        options: item.options.filter((row) => row.id !== option.id),
                      })
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
          {!fixed && item.options.length < 4 ? (
            <button
              type="button"
              onClick={() =>
                updateItem(item.id, {
                  options: [...item.options, { id: nextId("opt"), text: "", correct: false }],
                })
              }
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
        onClick={() => onChange({ ...value, items: [...value.items, emptyMcqItem(value.subtype)] })}
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm câu
      </button>
    </div>
  );
}

function FillFields({
  value,
  onChange,
}: {
  value: Extract<ReadingExercise, { kind: "FILL" }>;
  onChange: (next: ReadingExercise) => void;
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
          <Field label="Nội dung" hint="Chỗ trống viết [[7]], [[8]], ...">
            <Textarea
              rows={10}
              value={value.body}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
            />
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
                  onClick={() =>
                    onChange({ ...value, tableRows: value.tableRows.filter((_, i) => i !== r) })
                  }
                  className={buttonClass("ghost", "icon")}
                  aria-label="Xóa hàng"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {row.map((cell, c) => (
                <Field key={c} label={value.tableHeaders[c] || `Ô ${c + 1}`} className="mb-2">
                  <Textarea
                    rows={3}
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
              onChange({
                ...value,
                tableRows: [...value.tableRows, value.tableHeaders.map(() => "")],
              })
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

function TickFields({
  value,
  onChange,
}: {
  value: Extract<ReadingExercise, { kind: "TICK" }>;
  onChange: (next: ReadingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Cột đáp án (A, B, C, ...)" hint="Phân tách bằng dấu phẩy.">
        <Input
          value={value.columns.join(", ")}
          onChange={(e) =>
            onChange({
              ...value,
              columns: e.target.value.split(",").map((col) => col.trim()).filter(Boolean),
            })
          }
        />
      </Field>
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
            onChange={(e) =>
              onChange({
                ...value,
                items: value.items.map((row) => (row.id === item.id ? { ...row, text: e.target.value } : row)),
              })
            }
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, items: value.items.filter((row) => row.id !== item.id) })}
            className={buttonClass("outline", "icon")}
            aria-label="Xóa câu"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              {
                id: nextId("t"),
                number: (value.items.at(-1)?.number ?? value.startNo - 1) + 1,
                text: "",
              },
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
  value: Extract<ReadingExercise, { kind: "DND" }>;
  onChange: (next: ReadingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Kiểu kéo thả">
        <Select
          value={value.layout}
          onChange={(e) => {
            const layout = e.target.value as "SENTENCES" | "GAPS";
            if (layout === "GAPS" && value.layout !== "GAPS") {
              const sample = createDndGaps();
              onChange({ ...sample, id: value.id, title: value.title || sample.title });
              return;
            }
            onChange({ ...value, layout });
          }}
        >
          <option value="SENTENCES">Kéo đáp án vào cuối câu</option>
          <option value="GAPS">Kéo câu vào chỗ trống trong đoạn văn</option>
        </Select>
      </Field>

      {value.layout === "SENTENCES"
        ? value.stems.map((stem) => (
            <div key={stem.number} className="grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
              <Input
                type="number"
                value={stem.number}
                onChange={(e) =>
                  onChange({
                    ...value,
                    stems: value.stems.map((row) =>
                      row.number === stem.number
                        ? { ...row, number: Number(e.target.value) || row.number }
                        : row,
                    ),
                  })
                }
              />
              <Input
                value={stem.text}
                onChange={(e) =>
                  onChange({
                    ...value,
                    stems: value.stems.map((row) =>
                      row.number === stem.number ? { ...row, text: e.target.value } : row,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, stems: value.stems.filter((row) => row.number !== stem.number) })
                }
                className={buttonClass("outline", "icon")}
                aria-label="Xóa câu"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        : null}

      {value.layout === "SENTENCES" ? (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              stems: [
                ...value.stems,
                { number: (value.stems.at(-1)?.number ?? value.startNo - 1) + 1, text: "" },
              ],
            })
          }
          className={buttonClass("secondary", "sm")}
        >
          <Plus className="h-4 w-4" />
          Thêm câu
        </button>
      ) : null}

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

function ClozeFields({
  value,
  onChange,
}: {
  value: Extract<ReadingExercise, { kind: "CLOZE" }>;
  onChange: (next: ReadingExercise) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Đoạn văn có chỗ trống" hint="Chỗ trống viết [[19]], [[20]], ...">
        <Textarea rows={8} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
      </Field>
      {value.blanks.map((blank) => (
        <div key={blank.number} className="grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
          <Input
            type="number"
            value={blank.number}
            onChange={(e) =>
              onChange({
                ...value,
                blanks: value.blanks.map((row) =>
                  row.number === blank.number
                    ? { ...row, number: Number(e.target.value) || row.number }
                    : row,
                ),
              })
            }
          />
          <Input
            value={blank.options.join(", ")}
            onChange={(e) =>
              onChange({
                ...value,
                blanks: value.blanks.map((row) =>
                  row.number === blank.number
                    ? {
                        ...row,
                        options: e.target.value.split(",").map((word) => word.trim()).filter(Boolean),
                      }
                    : row,
                ),
              })
            }
            placeholder="change, variety, difference"
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, blanks: value.blanks.filter((row) => row.number !== blank.number) })
            }
            className={buttonClass("outline", "icon")}
            aria-label="Xóa chỗ trống"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            blanks: [
              ...value.blanks,
              {
                number: (value.blanks.at(-1)?.number ?? value.startNo - 1) + 1,
                options: ["", "", ""],
              },
            ],
          })
        }
        className={buttonClass("secondary", "sm")}
      >
        <Plus className="h-4 w-4" />
        Thêm chỗ trống
      </button>
    </div>
  );
}
