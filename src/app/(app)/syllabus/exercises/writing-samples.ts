import { nextId, type CambridgeItem, type WritingExercise, type WritingKind } from "./types";

export function emptyCambridgeItem(startNo = 1): CambridgeItem {
  return {
    id: nextId("w"),
    label: `Question ${startNo}`,
    requirement: "You must answer this question. Write your answer in about 100 words.",
    promptIntro: "",
    promptText: "",
    imageUrl: "",
    imageName: "",
    wordTarget: 100,
  };
}

export function createWriting(kind: WritingKind): WritingExercise {
  const base = {
    id: nextId("ex"),
    skill: "WRITING" as const,
    startNo: 1,
  };

  if (kind === "CAMBRIDGE") {
    return {
      ...base,
      kind: "CAMBRIDGE",
      title: "Writing — Cambridge",
      instruction: "Đọc đề bên trái và viết câu trả lời bên phải.",
      items: [emptyCambridgeItem(1)],
    };
  }

  if (kind === "TASK1") {
    return {
      ...base,
      kind: "TASK1",
      title: "IELTS Writing Task 1",
      instruction: "Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
      prompt: "",
      imageUrl: "",
      imageName: "",
      writingGuide: "",
      sampleAnswer: "",
      wordTarget: 150,
    };
  }

  return {
    ...base,
    kind: "TASK2",
    title: "IELTS Writing Task 2",
    instruction: "Give reasons for your answer and include any relevant examples from your own knowledge or experience.",
    prompt: "",
    imageUrl: "",
    imageName: "",
    sampleAnswer: "",
    wordTarget: 250,
  };
}
