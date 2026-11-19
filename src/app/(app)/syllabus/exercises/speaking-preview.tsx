"use client";

/* eslint-disable @next/next/no-img-element -- Uploaded exercise images have user-defined URLs and dimensions. */

import { useState } from "react";

import { cn } from "@/lib/utils";

import { AudioPlayer } from "./audio-player";
import { AudioRecorder, VideoSubmit } from "./recorder";
import { kindLabel, type SpeakingExercise } from "./types";

export function SpeakingPreview({ exercise }: { exercise: SpeakingExercise }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-brand-700">BÀI TẬP SPEAKING</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{exercise.title || "Nói và nộp bài"}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kindLabel(exercise)}</p>
      </div>

      {exercise.audioUrl ? (
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Audio hướng dẫn</p>
          <AudioPlayer src={exercise.audioUrl} name={exercise.audioName} />
        </div>
      ) : null}

      <div className="bg-slate-50/60 px-5 py-5">
        {exercise.instruction ? (
          <div className="mb-4 rounded-lg bg-brand-600 px-4 py-3 text-sm leading-6 text-white">
            {exercise.instruction}
          </div>
        ) : null}
        {exercise.kind === "QUICK" ? <QuickView exercise={exercise} /> : null}
        {exercise.kind === "PICTURE" ? <PictureView exercise={exercise} /> : null}
        {exercise.kind === "SAMPLE" ? <SampleView exercise={exercise} /> : null}
        {exercise.kind === "VIDEO" ? <VideoView exercise={exercise} /> : null}
      </div>
    </div>
  );
}

function QuickView({ exercise }: { exercise: Extract<SpeakingExercise, { kind: "QUICK" }> }) {
  const [active, setActive] = useState(0);
  const [clips, setClips] = useState<Record<string, string>>({});
  const current = exercise.items[active];

  if (!current) {
    return <p className="text-sm text-slate-500">Chưa có câu hỏi.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">Câu hỏi</p>
        <ul className="space-y-1">
          {exercise.items.map((item, index) => {
            const number = exercise.startNo + index;
            const done = Boolean(clips[item.id]);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active === index
                      ? "bg-brand-50 font-medium text-brand-800"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span className="mr-1.5 text-xs text-slate-400">{number}.</span>
                  {item.text || "Câu hỏi trống"}
                  {done ? <span className="mt-1 block text-xs text-emerald-600">Đã ghi âm</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">
            Câu {exercise.startNo + active}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {current.text || "Chưa nhập câu hỏi"}
          </p>
        </div>
        <AudioRecorder
          label="Ghi âm câu trả lời"
          value={clips[current.id] ?? ""}
          onChange={(url) => setClips((prev) => ({ ...prev, [current.id]: url }))}
        />
      </div>
    </div>
  );
}

function PictureView({ exercise }: { exercise: Extract<SpeakingExercise, { kind: "PICTURE" }> }) {
  const [clip, setClip] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {exercise.imageUrl ? (
          <img
            src={exercise.imageUrl}
            alt={exercise.imageName || "Hình đề"}
            className="w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
            Chưa tải hình
          </div>
        )}
        {exercise.prompt ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
            {exercise.prompt}
          </p>
        ) : null}
      </div>
      <AudioRecorder label="Ghi âm câu trả lời" value={clip} onChange={setClip} />
    </div>
  );
}

function SampleView({ exercise }: { exercise: Extract<SpeakingExercise, { kind: "SAMPLE" }> }) {
  const [clip, setClip] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">Đoạn mẫu</p>
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
          {exercise.sampleText || "Chưa nhập đoạn mẫu."}
        </p>
      </div>
      <AudioRecorder label="Đọc và ghi âm theo mẫu" value={clip} onChange={setClip} />
    </div>
  );
}

function VideoView({ exercise }: { exercise: Extract<SpeakingExercise, { kind: "VIDEO" }> }) {
  const [clip, setClip] = useState("");
  return (
    <div className="space-y-3">
      {exercise.prompt ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          {exercise.prompt}
        </p>
      ) : null}
      <VideoSubmit value={clip} onChange={setClip} />
    </div>
  );
}
