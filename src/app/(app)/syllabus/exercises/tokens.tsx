import type { ReactNode } from "react";

import type { Exercise } from "./types";

const TOKEN = /\[\[(\d+)\]\]/g;

export type Piece = { type: "text"; value: string } | { type: "blank"; n: number };

export function splitTokens(text: string): Piece[] {
  const parts: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) });
    parts.push({ type: "blank", n: Number(match[1]) });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export function blankNumbers(text: string): number[] {
  return [...text.matchAll(TOKEN)].map((match) => Number(match[1]));
}

export function renderTokens(text: string, renderBlank: (n: number) => ReactNode) {
  return splitTokens(text).map((piece, index) =>
    piece.type === "text" ? (
      <span key={index}>{piece.value}</span>
    ) : (
      <span key={index}>{renderBlank(piece.n)}</span>
    ),
  );
}

export function questionNumbers(exercise: Exercise): number[] {
  if (exercise.kind === "MCQ") {
    return exercise.items.map((_, index) => exercise.startNo + index);
  }
  if (exercise.kind === "FILL") {
    const source =
      exercise.layout === "TABLE"
        ? exercise.tableRows.flat().join("\n")
        : exercise.body;
    const nums = blankNumbers(source);
    return [...new Set(nums)].sort((a, b) => a - b);
  }
  if (exercise.kind === "TICK") {
    return exercise.items.map((item) => item.number);
  }
  if (exercise.kind === "DND") {
    if (exercise.skill === "READING" && exercise.layout === "GAPS") {
      return blankNumbers(exercise.passage);
    }
    return exercise.stems.map((stem) => stem.number);
  }
  if (exercise.skill === "READING" && exercise.kind === "CLOZE") {
    return exercise.blanks.map((blank) => blank.number);
  }
  if (exercise.skill === "SPEAKING" && exercise.kind === "QUICK") {
    return exercise.items.map((_, index) => exercise.startNo + index);
  }
  if (exercise.skill === "SPEAKING") {
    return [exercise.startNo];
  }
  if (exercise.skill === "WRITING" && exercise.kind === "CAMBRIDGE") {
    return exercise.items.map((_, index) => exercise.startNo + index);
  }
  if (exercise.skill === "WRITING") {
    return [exercise.startNo];
  }
  if (exercise.skill === "OTHER") {
    return exercise.items.map((_, index) => exercise.startNo + index);
  }
  return [];
}

export function passageParagraphs(passage: string) {
  return passage.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}
