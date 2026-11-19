"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { kindLabel, type WritingExercise } from "./types";

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatClock(total: number) {
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, mins, secs].map((part) => part.toString().padStart(2, "0")).join(":");
}

function WritingPad({
  value,
  onChange,
  wordTarget,
  sample,
  showTimer,
}: {
  value: string;
  onChange: (next: string) => void;
  wordTarget: number;
  sample?: string;
  showTimer?: boolean;
}) {
  const [showSample, setShowSample] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const words = countWords(value);

  useEffect(() => {
    if (!showTimer) return;
    const id = window.setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [showTimer]);

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Word count:{" "}
          <span className={cn("font-semibold", words >= wordTarget ? "text-emerald-700" : "text-slate-800")}>
            {words}
          </span>
          <span className="text-slate-400"> / {wordTarget}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {showTimer ? (
            <span className="text-xs tabular-nums text-slate-500">Thời gian: {formatClock(elapsed)}</span>
          ) : null}
          {sample ? (
            <button
              type="button"
              onClick={() => setShowSample((open) => !open)}
              className={buttonClass(showSample ? "secondary" : "outline", "sm")}
            >
              {showSample ? "Ẩn bài mẫu" : "Xem bài mẫu"}
            </button>
          ) : null}
        </div>
      </div>
      {showSample && sample ? (
        <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
          {sample}
        </div>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Viết câu trả lời tại đây..."
        className="min-h-[280px] flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-7 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

function SplitWorkspace({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(48);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap;

    function move(ev: globalThis.PointerEvent) {
      const rect = box.getBoundingClientRect();
      const next = ((ev.clientX - rect.left) / rect.width) * 100;
      setRatio(Math.min(68, Math.max(32, next)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div ref={wrapRef} className="flex min-h-[480px]">
      <div className="min-w-0 overflow-y-auto px-5 py-5" style={{ width: `${ratio}%` }}>
        {left}
      </div>
      <button
        type="button"
        aria-label="Kéo để đổi độ rộng"
        onPointerDown={onPointerDown}
        className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-brand-400"
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60 px-5 py-5">{right}</div>
    </div>
  );
}

function PromptBlock({
  text,
  imageUrl,
  imageName,
  guide,
}: {
  text: string;
  imageUrl?: string;
  imageName?: string;
  guide?: string;
}) {
  return (
    <div className="space-y-3 text-sm leading-7 text-slate-800">
      {text ? <p className="whitespace-pre-wrap">{text}</p> : null}
      {imageUrl ? (
        <img src={imageUrl} alt={imageName || "Hình đề"} className="w-full rounded-lg border border-slate-200" />
      ) : null}
      {guide ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500">HƯỚNG DẪN VIẾT BÀI</p>
          <p className="whitespace-pre-wrap text-slate-700">{guide}</p>
        </div>
      ) : null}
    </div>
  );
}

export function WritingPreview({ exercise }: { exercise: WritingExercise }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-brand-700">BÀI TẬP WRITING</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{exercise.title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kindLabel(exercise)}</p>
      </div>
      {exercise.kind === "CAMBRIDGE" ? <CambridgeView exercise={exercise} /> : null}
      {exercise.kind === "TASK1" ? <Task1View exercise={exercise} /> : null}
      {exercise.kind === "TASK2" ? <Task2View exercise={exercise} /> : null}
    </div>
  );
}

function CambridgeView({ exercise }: { exercise: Extract<WritingExercise, { kind: "CAMBRIDGE" }> }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const item = exercise.items[index];
  if (!item) return <p className="px-5 py-6 text-sm text-slate-500">Chưa có câu.</p>;

  return (
    <>
      <div className="border-b border-slate-200 px-5 py-3">
        <p className="text-sm font-semibold text-slate-900">{item.label || `Question ${exercise.startNo + index}`}</p>
        {item.requirement ? (
          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{item.requirement}</p>
        ) : null}
      </div>
      <SplitWorkspace
        left={
          <div className="space-y-3">
            {item.promptIntro ? <p className="text-sm font-medium text-slate-700">{item.promptIntro}</p> : null}
            <PromptBlock text={item.promptText} imageUrl={item.imageUrl} imageName={item.imageName} />
          </div>
        }
        right={
          <WritingPad
            value={answers[item.id] ?? ""}
            onChange={(next) => setAnswers((prev) => ({ ...prev, [item.id]: next }))}
            wordTarget={item.wordTarget}
          />
        }
      />
      {exercise.items.length > 1 ? (
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((prev) => prev - 1)}
            className={buttonClass("outline", "sm")}
          >
            <ChevronLeft className="h-4 w-4" />
            Câu trước
          </button>
          <button
            type="button"
            disabled={index === exercise.items.length - 1}
            onClick={() => setIndex((prev) => prev + 1)}
            className={buttonClass("outline", "sm")}
          >
            Câu sau
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function Task1View({ exercise }: { exercise: Extract<WritingExercise, { kind: "TASK1" }> }) {
  const [answer, setAnswer] = useState("");
  return (
    <>
      {exercise.instruction ? (
        <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">{exercise.instruction}</div>
      ) : null}
      <SplitWorkspace
        left={
          <PromptBlock
            text={exercise.prompt}
            imageUrl={exercise.imageUrl}
            imageName={exercise.imageName}
            guide={exercise.writingGuide}
          />
        }
        right={
          <WritingPad
            value={answer}
            onChange={setAnswer}
            wordTarget={exercise.wordTarget}
            sample={exercise.sampleAnswer}
            showTimer
          />
        }
      />
    </>
  );
}

function Task2View({ exercise }: { exercise: Extract<WritingExercise, { kind: "TASK2" }> }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="space-y-4 px-5 py-5">
      {exercise.instruction ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{exercise.instruction}</p>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        <PromptBlock text={exercise.prompt} imageUrl={exercise.imageUrl} imageName={exercise.imageName} />
      </div>
      <WritingPad
        value={answer}
        onChange={setAnswer}
        wordTarget={exercise.wordTarget}
        sample={exercise.sampleAnswer}
        showTimer
      />
    </div>
  );
}
