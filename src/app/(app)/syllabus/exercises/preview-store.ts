import type { Exercise } from "./types";

const KEY = "steps-exercise-preview";

/** Ghi đề đang soạn rồi mở tab Preview học sinh. */
export function openExercisePreview(exercise: Exercise) {
  localStorage.setItem(KEY, JSON.stringify(exercise));
  window.open("/syllabus/preview", "_blank", "noopener,noreferrer");
}

export function readExercisePreview(): Exercise | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Exercise;
  } catch {
    return null;
  }
}
