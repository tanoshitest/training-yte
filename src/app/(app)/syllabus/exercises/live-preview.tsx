"use client";

import { ListeningPreview } from "./listening-preview";
import { OtherPreview } from "./other-preview";
import { StudentPreview } from "./preview";
import { SpeakingPreview } from "./speaking-preview";
import { WritingPreview } from "./writing-preview";
import type { Exercise } from "./types";

export function LivePreview({ exercise }: { exercise: Exercise }) {
  if (exercise.skill === "LISTENING") return <ListeningPreview exercise={exercise} />;
  if (exercise.skill === "SPEAKING") return <SpeakingPreview exercise={exercise} />;
  if (exercise.skill === "WRITING") return <WritingPreview exercise={exercise} />;
  if (exercise.skill === "OTHER") return <OtherPreview exercise={exercise} />;
  return <StudentPreview exercise={exercise} />;
}
