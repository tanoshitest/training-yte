"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { useMemo, useState } from "react";
import { Check, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

import { AudioPlayer } from "./audio-player";
import { questionNumbers, renderTokens } from "./tokens";
import { kindLabel, type ListeningExercise } from "./types";

export function ListeningPreview({ exercise }: { exercise: ListeningExercise }) {
  const numbers = questionNumbers(exercise);
  const [active, setActive] = useState(numbers[0] ?? 1);

  function jump(n: number) {
    setActive(n);
    document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-brand-700">BÀI TẬP LISTENING</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Nghe và trả lời câu hỏi</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kindLabel(exercise)}</p>
      </div>

      <div className="border-b border-slate-200 px-5 py-4">
        <AudioPlayer src={exercise.audioUrl} name={exercise.audioName} />
      </div>

      <div className="max-h-[640px] overflow-y-auto bg-slate-50/60 px-5 py-5">
        {exercise.kind === "FILL" ? <FillView exercise={exercise} /> : null}
        {exercise.kind === "MCQ" ? <McqView exercise={exercise} /> : null}
        {exercise.kind === "TICK" ? <TickView exercise={exercise} /> : null}
        {exercise.kind === "DND" ? <DndView exercise={exercise} /> : null}
      </div>

      {numbers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-5 py-3">
          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => jump(n)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                active === n
                  ? "bg-brand-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Instruction({ text }: { text: string }) {
  return <div className="rounded-lg bg-brand-600 px-4 py-3 text-sm leading-6 text-white">{text}</div>;
}

function BlankInput({ n }: { n: number }) {
  return (
    <span id={`q-${n}`} className="mx-0.5 inline-flex items-center gap-1 align-baseline">
      <span className="text-xs font-semibold text-brand-700">{n}.</span>
      <input className="h-8 w-28 rounded-md border border-slate-300 bg-slate-50 px-2 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100" />
    </span>
  );
}

function FillView({ exercise }: { exercise: Extract<ListeningExercise, { kind: "FILL" }> }) {
  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        {exercise.layout === "TABLE" ? (
          <>
            {exercise.tableTitle ? (
              <h4 className="mb-3 text-center text-sm font-semibold text-slate-900">{exercise.tableTitle}</h4>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm text-slate-800">
                <thead>
                  <tr>
                    <th className="w-12 border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">STT</th>
                    {exercise.tableHeaders.map((header, index) => (
                      <th
                        key={index}
                        className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exercise.tableRows.map((row, r) => (
                    <tr key={r}>
                      <td className="border border-slate-200 px-3 py-2 align-top text-slate-500 tabular-nums">{r + 1}</td>
                      {row.map((cell, c) => (
                        <td key={c} className="border border-slate-200 px-3 py-2 align-top leading-7">
                          <span className="whitespace-pre-wrap">
                            {renderTokens(cell, (n) => (
                              <BlankInput n={n} />
                            ))}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {exercise.notesTitle ? (
              <h4 className="mb-3 text-sm font-semibold text-slate-900">{exercise.notesTitle}</h4>
            ) : null}
            <div className="whitespace-pre-wrap text-sm leading-8 text-slate-800">
              {renderTokens(exercise.body, (n) => (
                <BlankInput n={n} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function McqView({ exercise }: { exercise: Extract<ListeningExercise, { kind: "MCQ" }> }) {
  const [single, setSingle] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, string[]>>({});

  function toggleMulti(id: string, key: string) {
    setMulti((prev) => {
      const current = prev[id] ?? [];
      if (current.includes(key)) return { ...prev, [id]: current.filter((item) => item !== key) };
      if (current.length >= 2) return prev;
      return { ...prev, [id]: [...current, key] };
    });
  }

  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      {exercise.items.map((item, index) => {
        const number = exercise.startNo + index;
        const useMulti = exercise.allowTwo;
        return (
          <div key={item.id} id={`q-${number}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-900">
              <span className="mr-1.5 text-brand-700">{number}.</span>
              {item.text || "Câu hỏi"}
            </p>
            <div
              className={cn(
                "mt-3 gap-3",
                exercise.optionMode === "IMAGE" ? "grid sm:grid-cols-3" : "flex flex-col gap-2",
              )}
            >
              {item.options.map((option) => {
                const key = option.id;
                const selected = useMulti
                  ? (multi[item.id] ?? []).includes(key)
                  : single[item.id] === key;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "cursor-pointer text-sm text-slate-700",
                      exercise.optionMode === "IMAGE"
                        ? "flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-2 hover:border-brand-300"
                        : "inline-flex items-center gap-2",
                    )}
                  >
                    {exercise.optionMode === "IMAGE" ? (
                      option.imageUrl ? (
                        <img
                          src={option.imageUrl}
                          alt={option.text || "Đáp án"}
                          className="h-28 w-full rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-28 w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                          Chưa có hình
                        </span>
                      )
                    ) : null}
                    <span className="inline-flex items-center gap-2">
                      <input
                        type={useMulti ? "checkbox" : "radio"}
                        checked={selected}
                        onChange={() =>
                          useMulti
                            ? toggleMulti(item.id, key)
                            : setSingle((prev) => ({ ...prev, [item.id]: key }))
                        }
                        className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {exercise.optionMode === "TEXT" ? option.text : option.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TickView({ exercise }: { exercise: Extract<ListeningExercise, { kind: "TICK" }> }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const grid = (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-slate-600">STT</th>
              <th className="px-2 py-2" />
              {exercise.columns.map((col) => (
                <th key={col} className="px-1 py-2 text-center text-xs font-semibold text-slate-600">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exercise.items.map((item) => (
              <tr key={item.id} id={`q-${item.number}`} className="border-t border-slate-100">
                <td className="px-2 py-2 text-center text-xs font-semibold text-slate-500">{item.number}.</td>
                <td className="px-2 py-2 text-sm font-medium text-brand-700">{item.text}</td>
                {exercise.columns.map((col) => {
                  const on = picked[item.id] === col;
                  return (
                    <td key={col} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setPicked((prev) => ({
                            ...prev,
                            [item.id]: prev[item.id] === col ? "" : col,
                          }))
                        }
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                          on
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-300 hover:border-brand-300 hover:text-brand-400",
                        )}
                        aria-label={`${item.number} ${col}`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exercise.optionLabels.some((row) => row.text) ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">LIST OF OPTIONS</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {exercise.optionLabels
              .filter((row) => row.text)
              .map((row) => (
                <li key={row.key}>
                  <span className="font-semibold text-slate-900">{row.key}</span>
                  {". "}
                  {row.text}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      {exercise.promptImageUrl ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
            <img src={exercise.promptImageUrl} alt={exercise.promptImageName || "Sơ đồ"} className="w-full" />
          </div>
          {grid}
        </div>
      ) : (
        grid
      )}
    </div>
  );
}

function DndView({ exercise }: { exercise: Extract<ListeningExercise, { kind: "DND" }> }) {
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const byId = useMemo(
    () => Object.fromEntries(exercise.options.map((option) => [option.id, option.text])),
    [exercise.options],
  );
  const used = new Set(Object.values(placed));

  function place(n: number, optionId: string) {
    setPlaced((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[Number(key)] === optionId) delete next[Number(key)];
      }
      next[n] = optionId;
      return next;
    });
    setPicked(null);
  }

  function dropOn(n: number) {
    const id = dragging ?? picked;
    if (id) place(n, id);
  }

  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      <div className="grid gap-6 lg:grid-cols-[1fr_12rem]">
        <div className="space-y-2">
          {exercise.leftTitle ? (
            <p className="text-xs font-semibold tracking-wide text-slate-500">{exercise.leftTitle}</p>
          ) : null}
          {exercise.stems.map((stem) => (
            <div key={stem.number} id={`q-${stem.number}`} className="grid grid-cols-[8rem_1fr] items-center gap-3">
              <p className="text-sm font-medium text-slate-800">{stem.text || `Mục ${stem.number}`}</p>
              <button
                type="button"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(stem.number);
                }}
                onClick={() => (placed[stem.number] ? setPlaced((prev) => {
                  const next = { ...prev };
                  delete next[stem.number];
                  return next;
                }) : dropOn(stem.number))}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-lg border border-dashed px-3 text-sm",
                  placed[stem.number]
                    ? "border-brand-300 bg-brand-50 text-slate-800"
                    : "border-brand-300 bg-brand-50/40 font-semibold text-brand-700",
                )}
              >
                {placed[stem.number] ? byId[placed[stem.number]] : stem.number}
              </button>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">
            {exercise.rightTitle || "LIST OF OPTIONS"}
          </p>
          <div className="flex flex-col gap-2">
            {exercise.options.map((option) => {
              const taken = used.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  draggable={!taken}
                  disabled={taken}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", option.id);
                    setDragging(option.id);
                  }}
                  onClick={() => !taken && setPicked((prev) => (prev === option.id ? null : option.id))}
                  className={cn(
                    "flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-left text-sm",
                    taken
                      ? "border-slate-100 text-slate-300"
                      : picked === option.id
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:border-brand-300",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {option.text}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
