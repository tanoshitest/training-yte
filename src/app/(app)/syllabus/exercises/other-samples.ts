import { nextId, type OtherExercise, type OtherItem, type OtherKind } from "./types";

export function emptyOtherItem(kind: OtherKind): OtherItem {
  const base = { id: nextId("q"), text: "", options: [], words: [], pair: "" };
  if (kind === "SHORT_MCQ") {
    return {
      ...base,
      options: ["A", "B", "C", "D"].map(() => ({
        id: nextId("opt"),
        text: "",
        correct: false,
      })),
    };
  }
  if (kind === "CHOOSE") {
    return {
      ...base,
      options: [
        { id: nextId("opt"), text: "", correct: false },
        { id: nextId("opt"), text: "", correct: false },
      ],
    };
  }
  if (kind === "TRUE_FALSE") {
    return {
      ...base,
      options: [
        { id: nextId("opt"), text: "True", correct: false },
        { id: nextId("opt"), text: "False", correct: false },
      ],
    };
  }
  return base;
}

const TITLES: Record<OtherKind, string> = {
  SHORT_MCQ: "Trắc nghiệm ngắn",
  TENSE: "Chia thì",
  GAP: "Điền từ",
  CHOOSE: "Chọn từ đúng",
  TRUE_FALSE: "Đúng / Sai",
  MATCH: "Nối cặp",
  ORDER: "Sắp xếp câu",
  ERROR: "Sửa lỗi",
  REWRITE: "Viết lại câu",
  DIALOGUE: "Hội thoại ngắn",
};

const HINTS: Record<OtherKind, string> = {
  SHORT_MCQ: "Chọn một đáp án đúng.",
  TENSE: "Điền dạng đúng của động từ vào chỗ trống ___.",
  GAP: "Điền một từ vào chỗ trống ___.",
  CHOOSE: "Chọn từ đúng cho câu.",
  TRUE_FALSE: "Câu này đúng hay sai?",
  MATCH: "Nối cột trái với cột phải.",
  ORDER: "Bấm các từ theo đúng thứ tự.",
  ERROR: "Viết lại câu cho đúng.",
  REWRITE: "Viết lại câu theo yêu cầu.",
  DIALOGUE: "Điền từ còn thiếu trong hội thoại.",
};

export function createOther(kind: OtherKind): OtherExercise {
  return {
    id: nextId("ex"),
    skill: "OTHER",
    kind,
    title: `Bổ trợ — ${TITLES[kind]}`,
    instruction: HINTS[kind],
    startNo: 1,
    items: [emptyOtherItem(kind)],
  };
}
