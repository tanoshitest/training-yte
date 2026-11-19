"use client";

import { useEffect, useState } from "react";

import { LivePreview } from "../exercises/live-preview";
import { readExercisePreview } from "../exercises/preview-store";
import type { Exercise } from "../exercises/types";

export function ExercisePreviewClient() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setExercise(readExercisePreview());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!exercise) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        Chưa có đề để xem. Quay lại tab soạn, bấm Preview.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Giao diện học sinh. Làm thử được, không chấm điểm. Đóng tab này để tiếp tục soạn.
      </p>
      <LivePreview exercise={exercise} />
    </div>
  );
}
