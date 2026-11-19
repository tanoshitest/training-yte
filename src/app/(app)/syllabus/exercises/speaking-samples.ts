import { nextId, type SpeakingExercise, type SpeakingKind } from "./types";

export function createSpeaking(kind: SpeakingKind): SpeakingExercise {
  const base = {
    id: nextId("ex"),
    skill: "SPEAKING" as const,
    startNo: 1,
    audioName: "",
    audioUrl: "",
  };

  if (kind === "QUICK") {
    return {
      ...base,
      kind: "QUICK",
      title: "Speaking — Câu hỏi nhanh",
      instruction: "Chọn từng câu bên trái, ghi âm câu trả lời. Có thể nghe lại và ghi lại.",
      items: [{ id: nextId("q"), text: "" }],
    };
  }

  if (kind === "PICTURE") {
    return {
      ...base,
      kind: "PICTURE",
      title: "Speaking — Tả hình",
      instruction: "Nhìn hình và trả lời câu hỏi bằng cách ghi âm.",
      prompt: "",
      imageUrl: "",
      imageName: "",
    };
  }

  if (kind === "SAMPLE") {
    return {
      ...base,
      kind: "SAMPLE",
      title: "Speaking — Đọc theo mẫu",
      instruction: "Đọc đoạn mẫu bên dưới và ghi âm. Dùng cho buổi ôn lý thuyết hoặc trình độ thấp.",
      sampleText: "",
    };
  }

  return {
    ...base,
    kind: "VIDEO",
    title: "Speaking — Nói qua video",
    instruction: "Nộp một video trả lời. Có thể quay bằng camera hoặc tải file có sẵn.",
    prompt: "",
  };
}
