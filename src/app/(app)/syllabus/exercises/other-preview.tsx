"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { kindLabel, type OtherExercise, type OtherItem } from "./types";

function BlankLine({
  text,
  value,
  onChange,
  id,
}: {
  text: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  const parts = text.split("___");
  if (parts.length === 1) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-800">{text || "Câu hỏi"}</p>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
    );
  }
  return (
    <p id={id} className="text-sm leading-8 text-slate-800">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mx-1 inline-block h-8 w-28 rounded-md border border-slate-300 bg-slate-50 px-2 align-baseline text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          ) : null}
        </span>
      ))}
    </p>
  );
}

export function OtherPreview({ exercise }: { exercise: OtherExercise }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-brand-700">BÀI TẬP BỔ TRỢ</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{exercise.title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kindLabel(exercise)}</p>
      </div>
      <div className="space-y-3 bg-slate-50/60 px-5 py-5">
        {exercise.instruction ? (
          <div className="rounded-lg bg-brand-600 px-4 py-3 text-sm text-white">{exercise.instruction}</div>
        ) : null}
        {exercise.kind === "MATCH" ? (
          <MatchView items={exercise.items} startNo={exercise.startNo} />
        ) : (
          exercise.items.map((item, index) => (
            <ItemCard
              key={item.id}
              number={exercise.startNo + index}
              kind={exercise.kind}
              item={item}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemCard({
  number,
  kind,
  item,
}: {
  number: number;
  kind: OtherExercise["kind"];
  item: OtherItem;
}) {
  const [choice, setChoice] = useState("");
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <div id={`q-${number}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-brand-700">{number}.</p>
      {kind === "SHORT_MCQ" || kind === "CHOOSE" || kind === "TRUE_FALSE" ? (
        <>
          <p className="text-sm font-medium text-slate-900">{item.text || "Câu hỏi"}</p>
          <div className="mt-3 flex flex-col gap-2">
            {item.options.map((option, index) => {
              const label =
                kind === "SHORT_MCQ" ? `${String.fromCharCode(65 + index)}. ${option.text}` : option.text;
              return (
                <label key={option.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={choice === option.id}
                    onChange={() => setChoice(option.id)}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {label || `Đáp án ${index + 1}`}
                </label>
              );
            })}
          </div>
        </>
      ) : null}

      {kind === "TENSE" || kind === "GAP" || kind === "DIALOGUE" ? (
        <BlankLine text={item.text} value={typed} onChange={setTyped} id={`q-${number}`} />
      ) : null}

      {kind === "ERROR" || kind === "REWRITE" ? (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{item.text || "Câu hỏi"}</p>
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={2}
            placeholder="Viết câu trả lời..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      ) : null}

      {kind === "ORDER" ? (
        <OrderView words={item.words} picked={picked} onChange={setPicked} />
      ) : null}
    </div>
  );
}

function OrderView({
  words,
  picked,
  onChange,
}: {
  words: string[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const unused = words
    .map((word, index) => ({ key: `${index}:${word}`, word }))
    .filter((row) => !picked.includes(row.key));

  return (
    <div className="space-y-3">
      <div className="flex min-h-11 flex-wrap gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-2">
        {picked.length === 0 ? (
          <span className="text-xs text-slate-400">Bấm từ bên dưới để xếp câu</span>
        ) : (
          picked.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(picked.filter((item) => item !== key))}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-sm text-brand-800"
            >
              {key.split(":").slice(1).join(":")}
            </button>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unused.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onChange([...picked, row.key])}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 hover:border-brand-300"
          >
            {row.word}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchView({ items, startNo }: { items: OtherItem[]; startNo: number }) {
  const rights = useMemo(() => {
    const list = items.map((item) => item.pair).filter(Boolean);
    return [...list].sort(() => Math.random() - 0.5);
  }, [items]);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const used = new Set(Object.values(links));

  function chooseLeft(id: string) {
    if (links[id]) {
      setLinks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    if (!selectedRight) return;
    setLinks((prev) => ({ ...prev, [id]: selectedRight }));
    setSelectedRight(null);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            id={`q-${startNo + index}`}
            onClick={() => chooseLeft(item.id)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
              links[item.id]
                ? "border-brand-200 bg-brand-50 text-slate-800"
                : "border-slate-200 bg-white hover:border-brand-300",
            )}
          >
            <span>
              {startNo + index}. {item.text || "Vế trái"}
            </span>
            {links[item.id] ? <span className="text-xs text-brand-700">{links[item.id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rights.map((right) => (
          <button
            key={right}
            type="button"
            disabled={used.has(right)}
            onClick={() => setSelectedRight((prev) => (prev === right ? null : right))}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left text-sm",
              used.has(right)
                ? "border-slate-100 text-slate-300"
                : selectedRight === right
                  ? "border-brand-400 ring-2 ring-brand-100"
                  : "border-slate-200 bg-white hover:border-brand-300",
            )}
          >
            {right}
          </button>
        ))}
      </div>
    </div>
  );
}
