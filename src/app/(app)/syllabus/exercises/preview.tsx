"use client";

import { useMemo, useState } from "react";
import { Check, GripVertical, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { FIXED_OPTIONS } from "./samples";
import { passageParagraphs, questionNumbers, renderTokens } from "./tokens";
import { kindLabel, type ReadingExercise } from "./types";

export function StudentPreview({ exercise }: { exercise: ReadingExercise }) {
  const numbers = questionNumbers(exercise);
  const [active, setActive] = useState(numbers[0] ?? 1);
  const dnd = usePlacement();

  function jump(n: number) {
    setActive(n);
    document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-brand-700">BÀI TẬP READING</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Đọc văn bản và làm các dạng bài tập</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kindLabel(exercise)}</p>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-2">
        <div className="max-h-[640px] overflow-y-auto border-b border-slate-200 px-5 py-5 lg:border-b-0 lg:border-r">
          {exercise.kind === "DND" && exercise.layout === "GAPS" ? (
            <GapsPassage exercise={exercise} place={dnd} />
          ) : (
            <PassagePane title={exercise.passageTitle} passage={exercise.passage} />
          )}
        </div>
        <div className="max-h-[640px] overflow-y-auto bg-slate-50/60 px-5 py-5">
          <QuestionPane exercise={exercise} place={dnd} />
        </div>
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

function PassagePane({ title, passage }: { title: string; passage: string }) {
  return (
    <article className="max-w-[65ch] text-sm leading-7 text-slate-800">
      {title ? <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3> : null}
      {passageParagraphs(passage).map((block, index) => (
        <p key={index} className="mb-3 whitespace-pre-wrap last:mb-0">
          {block}
        </p>
      ))}
    </article>
  );
}

function Instruction({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-brand-600 px-4 py-3 text-sm leading-6 text-white">{text}</div>
  );
}

function QuestionPane({
  exercise,
  place,
}: {
  exercise: ReadingExercise;
  place: ReturnType<typeof usePlacement>;
}) {
  if (exercise.kind === "MCQ") return <McqView exercise={exercise} />;
  if (exercise.kind === "FILL") return <FillView exercise={exercise} />;
  if (exercise.kind === "TICK") return <TickView exercise={exercise} />;
  if (exercise.kind === "DND") return <DndView exercise={exercise} place={place} />;
  return <ClozeView exercise={exercise} />;
}

function McqView({ exercise }: { exercise: Extract<ReadingExercise, { kind: "MCQ" }> }) {
  const options =
    exercise.subtype === "NORMAL"
      ? null
      : [...FIXED_OPTIONS[exercise.subtype]];
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
        const choices = options ?? item.options.map((option) => option.text).filter(Boolean);
        const useMulti = exercise.subtype === "NORMAL" && exercise.allowTwo;
        return (
          <div
            key={item.id}
            id={`q-${number}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <p className="text-sm font-medium text-slate-900">
              <span className="mr-1.5 text-brand-700">{number}.</span>
              {item.text}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {choices.map((choice) => {
                const selected = useMulti
                  ? (multi[item.id] ?? []).includes(choice)
                  : single[item.id] === choice;
                return (
                  <label key={choice} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type={useMulti ? "checkbox" : "radio"}
                      checked={selected}
                      onChange={() =>
                        useMulti ? toggleMulti(item.id, choice) : setSingle((prev) => ({ ...prev, [item.id]: choice }))
                      }
                      className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {choice}
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

function BlankInput({ n }: { n: number }) {
  return (
    <span id={`q-${n}`} className="mx-0.5 inline-flex items-center gap-1 align-baseline">
      <span className="text-xs font-semibold text-brand-700">{n}.</span>
      <input className="h-8 w-28 rounded-md border border-slate-300 bg-slate-50 px-2 text-sm text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100" />
    </span>
  );
}

function FillView({ exercise }: { exercise: Extract<ReadingExercise, { kind: "FILL" }> }) {
  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        {exercise.layout === "TABLE" ? (
          <>
            {exercise.tableTitle ? (
              <h4 className="mb-3 text-center text-sm font-semibold text-slate-900">
                {exercise.tableTitle}
              </h4>
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

function TickView({ exercise }: { exercise: Extract<ReadingExercise, { kind: "TICK" }> }) {
  const [picked, setPicked] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
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
                <td className="px-2 py-2 text-center text-xs font-semibold text-slate-500">
                  {item.number}.
                </td>
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
    </div>
  );
}

function usePlacement() {
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

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

  function clear(n: number) {
    setPlaced((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });
  }

  return {
    placed,
    dragging,
    setDragging,
    picked,
    setPicked,
    place,
    clear,
    used: new Set(Object.values(placed)),
  };
}

function DropPill({
  n,
  label,
  active,
  onDrop,
  onClear,
}: {
  n: number;
  label?: string;
  active?: boolean;
  onDrop: () => void;
  onClear: () => void;
}) {
  return (
    <span id={`q-${n}`} className="inline-flex align-middle">
      <button
        type="button"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onClick={() => (label ? onClear() : onDrop())}
        className={cn(
          "mx-1 inline-flex min-h-8 min-w-[7.5rem] items-center justify-center rounded-full border px-3 text-xs font-medium transition-colors",
          label
            ? "border-brand-200 bg-brand-50 text-brand-800"
            : active
              ? "border-brand-400 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-slate-100 text-brand-700",
        )}
      >
        {label ?? "Thả hoặc chọn"}
      </button>
    </span>
  );
}

function OptionBank({
  options,
  used,
  picked,
  onPick,
  onDragStart,
}: {
  options: { id: string; text: string }[];
  used: Set<string>;
  picked: string | null;
  onPick: (id: string) => void;
  onDragStart: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">LIST OF OPTIONS</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const taken = used.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              draggable={!taken}
              disabled={taken}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", option.id);
                onDragStart(option.id);
              }}
              onClick={() => !taken && onPick(option.id)}
              className={cn(
                "flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm text-slate-800",
                taken
                  ? "border-slate-100 text-slate-300"
                  : picked === option.id
                    ? "border-brand-400 ring-2 ring-brand-100"
                    : "border-slate-200 hover:border-brand-300",
              )}
            >
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DndView({
  exercise,
  place,
}: {
  exercise: Extract<ReadingExercise, { kind: "DND" }>;
  place: ReturnType<typeof usePlacement>;
}) {
  const byId = useMemo(
    () => Object.fromEntries(exercise.options.map((option) => [option.id, option.text])),
    [exercise.options],
  );

  function dropOn(n: number) {
    const id = place.dragging ?? place.picked;
    if (id) place.place(n, id);
  }

  if (exercise.layout === "GAPS") {
    return (
      <div className="space-y-4">
        <Instruction text={exercise.instruction} />
        <OptionBank
          options={exercise.options}
          used={place.used}
          picked={place.picked}
          onPick={(id) => place.setPicked((prev) => (prev === id ? null : id))}
          onDragStart={place.setDragging}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Instruction text={exercise.instruction} />
      <div className="space-y-2">
        {exercise.stems.map((stem) => (
          <div key={stem.number} className="flex flex-wrap items-center gap-1 text-sm text-slate-800">
            <span className="font-semibold text-brand-700">{stem.number}.</span>
            <span>{stem.text}</span>
            <DropPill
              n={stem.number}
              label={stem.number in place.placed ? byId[place.placed[stem.number]] : undefined}
              active={Boolean(place.picked || place.dragging)}
              onDrop={() => dropOn(stem.number)}
              onClear={() => place.clear(stem.number)}
            />
          </div>
        ))}
      </div>
      <OptionBank
        options={exercise.options}
        used={place.used}
        picked={place.picked}
        onPick={(id) => place.setPicked((prev) => (prev === id ? null : id))}
        onDragStart={place.setDragging}
      />
    </div>
  );
}

function GapsPassage({
  exercise,
  place,
}: {
  exercise: Extract<ReadingExercise, { kind: "DND" }>;
  place: ReturnType<typeof usePlacement>;
}) {
  const byId = useMemo(
    () => Object.fromEntries(exercise.options.map((option) => [option.id, option.text])),
    [exercise.options],
  );

  function dropOn(n: number) {
    const id = place.dragging ?? place.picked;
    if (id) place.place(n, id);
  }

  return (
    <article className="text-sm leading-8 text-slate-800">
      <div className="whitespace-pre-wrap">
        {renderTokens(exercise.passage, (n) => (
          <span className="my-1 inline-flex w-full">
            <button
              type="button"
              id={`q-${n}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(n);
              }}
              onClick={() => (place.placed[n] ? place.clear(n) : dropOn(n))}
              className={cn(
                "flex min-h-12 w-full items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm",
                place.placed[n]
                  ? "border-brand-300 bg-brand-50 text-slate-800"
                  : "border-brand-300 bg-brand-50/40 font-semibold text-brand-700",
              )}
            >
              {place.placed[n] ? byId[place.placed[n]] : n}
            </button>
          </span>
        ))}
      </div>
    </article>
  );
}

function ClozeView({ exercise }: { exercise: Extract<ReadingExercise, { kind: "CLOZE" }> }) {
  const [open, setOpen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const map = useMemo(
    () => Object.fromEntries(exercise.blanks.map((blank) => [blank.number, blank.options])),
    [exercise.blanks],
  );

  return (
    <div className="space-y-3">
      <Instruction text={exercise.instruction} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-8 text-slate-800">
        {exercise.passageTitle ? (
          <h4 className="mb-3 text-sm font-semibold text-slate-900">{exercise.passageTitle}</h4>
        ) : null}
        <div className="whitespace-pre-wrap">
          {renderTokens(exercise.body, (n) => {
            const word = answers[n];
            const options = map[n] ?? [];
            return (
              <span id={`q-${n}`} className="relative mx-0.5 inline-block align-baseline">
                <button
                  type="button"
                  onClick={() => setOpen((prev) => (prev === n ? null : n))}
                  className={cn(
                    "inline-flex min-w-[3.25rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                    word
                      ? "border-brand-200 bg-brand-50 text-brand-800"
                      : open === n
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-300 bg-white text-slate-600",
                  )}
                >
                  {word ?? n}
                </button>
                {open === n ? (
                  <span className="absolute bottom-full left-0 z-10 mb-1 min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAnswers((prev) => {
                          const next = { ...prev };
                          delete next[n];
                          return next;
                        });
                        setOpen(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                    >
                      <X className="h-3 w-3" />
                      Bỏ chọn
                    </button>
                    {options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [n]: option }));
                          setOpen(null);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-brand-50"
                      >
                        {option}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
