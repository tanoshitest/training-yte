export const SKILLS = [
  { id: "READING", label: "Reading", ready: true },
  { id: "LISTENING", label: "Listening", ready: true },
  { id: "WRITING", label: "Writing", ready: true },
  { id: "SPEAKING", label: "Speaking", ready: true },
  { id: "OTHER", label: "Dạng khác", ready: true },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];

export type ExerciseStub = {
  id: string;
  skill: SkillId;
  kind: string;
  title: string;
  sortOrder: number;
};

export const READING_KINDS = [
  {
    id: "MCQ",
    label: "Trắc nghiệm",
    hint: "True/False/Not Given, Yes/No/Not Given, hoặc chọn đáp án.",
  },
  {
    id: "FILL",
    label: "Điền từ",
    hint: "Điền trực tiếp vào chỗ trống — dạng ghi chú hoặc bảng.",
  },
  {
    id: "TICK",
    label: "Bảng tick đáp án",
    hint: "Mỗi câu tích một cột A–G.",
  },
  {
    id: "DND",
    label: "Kéo thả",
    hint: "Kéo đáp án vào chỗ trống hoặc vào câu.",
  },
  {
    id: "CLOZE",
    label: "Chọn từ (dropdown)",
    hint: "Bấm chỗ trống, chọn 1 trong 3–4 từ.",
  },
] as const;

export type ReadingKind = (typeof READING_KINDS)[number]["id"];

export const LISTENING_KINDS = [
  {
    id: "FILL",
    label: "Điền vào chỗ trống",
    hint: "Điền từ vào ghi chú hoặc bảng — giống Reading.",
  },
  {
    id: "MCQ",
    label: "Trắc nghiệm",
    hint: "Đáp án chữ hoặc hình. Một dòng một đáp án, tick đáp án đúng.",
  },
  {
    id: "TICK",
    label: "Bảng tick đáp án",
    hint: "Mỗi câu tích một cột A–I. Có thể kèm hình sơ đồ.",
  },
  {
    id: "DND",
    label: "Kéo thả",
    hint: "Kéo đáp án vào từng mục (tên người, việc cần làm...).",
  },
] as const;

export type ListeningKind = (typeof LISTENING_KINDS)[number]["id"];

export const SPEAKING_KINDS = [
  {
    id: "QUICK",
    label: "Câu hỏi nhanh",
    hint: "Danh sách câu hỏi. Học sinh chọn từng câu và ghi âm trả lời.",
  },
  {
    id: "PICTURE",
    label: "Tả hình",
    hint: "Tải hình + câu hỏi. Học sinh xem hình và ghi âm.",
  },
  {
    id: "SAMPLE",
    label: "Đọc theo mẫu",
    hint: "Giáo viên nhập đoạn mẫu. Học sinh đọc và ghi âm theo.",
  },
  {
    id: "VIDEO",
    label: "Nói qua video",
    hint: "Học sinh nộp file video (tiến bộ hoặc tư liệu trung tâm).",
  },
] as const;

export type SpeakingKind = (typeof SPEAKING_KINDS)[number]["id"];

export const WRITING_KINDS = [
  {
    id: "CAMBRIDGE",
    label: "Cambridge",
    hint: "Chia đôi: đề bên trái, viết bên phải. Có hình hoặc chỉ chữ. Đếm từ.",
  },
  {
    id: "TASK1",
    label: "IELTS Task 1",
    hint: "Mô tả biểu đồ/bảng. Chia đôi, đếm từ, đồng hồ, bài mẫu.",
  },
  {
    id: "TASK2",
    label: "IELTS Task 2",
    hint: "Xếp dọc: đề trên, khung viết dưới. Không chia đôi màn hình.",
  },
] as const;

export type WritingKind = (typeof WRITING_KINDS)[number]["id"];

export const OTHER_KINDS = [
  { id: "SHORT_MCQ", label: "Trắc nghiệm ngắn", hint: "Câu hỏi ngắn, 4 đáp án A B C D. Tick đáp án đúng." },
  { id: "TENSE", label: "Chia thì", hint: "Câu ngắn, chỗ trống ___ để điền dạng đúng của động từ." },
  { id: "GAP", label: "Điền từ", hint: "Một câu, một chỗ trống. Điền một từ." },
  { id: "CHOOSE", label: "Chọn từ đúng", hint: "Câu ngắn, chọn 1 trong 2–3 từ." },
  { id: "TRUE_FALSE", label: "Đúng / Sai", hint: "Câu khẳng định ngắn. Chọn True hoặc False." },
  { id: "MATCH", label: "Nối cặp", hint: "Nối từ với nghĩa, hoặc hai vế câu." },
  { id: "ORDER", label: "Sắp xếp câu", hint: "Các từ xáo trộn. Bấm theo thứ tự để thành câu." },
  { id: "ERROR", label: "Sửa lỗi", hint: "Câu có lỗi. Học sinh viết lại câu đúng." },
  { id: "REWRITE", label: "Viết lại câu", hint: "Viết lại câu theo gợi ý (cùng nghĩa, dạng khác)." },
  { id: "DIALOGUE", label: "Hội thoại ngắn", hint: "2–3 câu thoại, điền một chỗ trống." },
] as const;

export type OtherKind = (typeof OTHER_KINDS)[number]["id"];

export type McqSubtype = "TFNG" | "YNNG" | "NORMAL";

export type McqOption = {
  id: string;
  text: string;
  correct: boolean;
};

export type McqItem = {
  id: string;
  text: string;
  options: McqOption[];
};

export type TickItem = {
  id: string;
  number: number;
  text: string;
};

export type DndOption = { id: string; text: string };

export type ClozeBlank = { number: number; options: string[] };

type ReadingBase = {
  id: string;
  skill: "READING";
  title: string;
  passageTitle: string;
  passage: string;
  instruction: string;
  startNo: number;
};

export type McqExercise = ReadingBase & {
  kind: "MCQ";
  subtype: McqSubtype;
  allowTwo: boolean;
  items: McqItem[];
};

export type FillExercise = ReadingBase & {
  kind: "FILL";
  layout: "NOTES" | "TABLE";
  notesTitle: string;
  body: string;
  tableTitle: string;
  tableHeaders: string[];
  tableRows: string[][];
};

export type TickExercise = ReadingBase & {
  kind: "TICK";
  columns: string[];
  items: TickItem[];
};

export type DndExercise = ReadingBase & {
  kind: "DND";
  layout: "SENTENCES" | "GAPS";
  stems: { number: number; text: string }[];
  options: DndOption[];
};

export type ClozeExercise = ReadingBase & {
  kind: "CLOZE";
  body: string;
  blanks: ClozeBlank[];
};

export type ReadingExercise =
  | McqExercise
  | FillExercise
  | TickExercise
  | DndExercise
  | ClozeExercise;

type ListeningBase = {
  id: string;
  skill: "LISTENING";
  title: string;
  instruction: string;
  startNo: number;
  audioName: string;
  audioUrl: string;
};

export type ListeningMcqOption = McqOption & {
  imageUrl: string;
  imageName: string;
};

export type ListeningFillExercise = ListeningBase & {
  kind: "FILL";
  layout: "NOTES" | "TABLE";
  notesTitle: string;
  body: string;
  tableTitle: string;
  tableHeaders: string[];
  tableRows: string[][];
};

export type ListeningMcqExercise = ListeningBase & {
  kind: "MCQ";
  optionMode: "TEXT" | "IMAGE";
  allowTwo: boolean;
  items: { id: string; text: string; options: ListeningMcqOption[] }[];
};

export type ListeningTickExercise = ListeningBase & {
  kind: "TICK";
  promptImageUrl: string;
  promptImageName: string;
  columns: string[];
  optionLabels: { key: string; text: string }[];
  items: TickItem[];
};

export type ListeningDndExercise = ListeningBase & {
  kind: "DND";
  leftTitle: string;
  rightTitle: string;
  stems: { number: number; text: string }[];
  options: DndOption[];
};

export type ListeningExercise =
  | ListeningFillExercise
  | ListeningMcqExercise
  | ListeningTickExercise
  | ListeningDndExercise;

type SpeakingBase = {
  id: string;
  skill: "SPEAKING";
  title: string;
  instruction: string;
  startNo: number;
  audioName: string;
  audioUrl: string;
};

export type SpeakingQuickExercise = SpeakingBase & {
  kind: "QUICK";
  items: { id: string; text: string }[];
};

export type SpeakingPictureExercise = SpeakingBase & {
  kind: "PICTURE";
  prompt: string;
  imageUrl: string;
  imageName: string;
};

export type SpeakingSampleExercise = SpeakingBase & {
  kind: "SAMPLE";
  sampleText: string;
};

export type SpeakingVideoExercise = SpeakingBase & {
  kind: "VIDEO";
  prompt: string;
};

export type SpeakingExercise =
  | SpeakingQuickExercise
  | SpeakingPictureExercise
  | SpeakingSampleExercise
  | SpeakingVideoExercise;

type WritingBase = {
  id: string;
  skill: "WRITING";
  title: string;
  instruction: string;
  startNo: number;
};

export type CambridgeItem = {
  id: string;
  label: string;
  requirement: string;
  promptIntro: string;
  promptText: string;
  imageUrl: string;
  imageName: string;
  wordTarget: number;
};

export type WritingCambridgeExercise = WritingBase & {
  kind: "CAMBRIDGE";
  items: CambridgeItem[];
};

export type WritingTask1Exercise = WritingBase & {
  kind: "TASK1";
  prompt: string;
  imageUrl: string;
  imageName: string;
  writingGuide: string;
  sampleAnswer: string;
  wordTarget: number;
};

export type WritingTask2Exercise = WritingBase & {
  kind: "TASK2";
  prompt: string;
  imageUrl: string;
  imageName: string;
  sampleAnswer: string;
  wordTarget: number;
};

export type WritingExercise =
  | WritingCambridgeExercise
  | WritingTask1Exercise
  | WritingTask2Exercise;

export type OtherItem = {
  id: string;
  text: string;
  options: McqOption[];
  words: string[];
  pair: string;
};

export type OtherExercise = {
  id: string;
  skill: "OTHER";
  kind: OtherKind;
  title: string;
  instruction: string;
  startNo: number;
  items: OtherItem[];
};

export type Exercise =
  | ReadingExercise
  | ListeningExercise
  | SpeakingExercise
  | WritingExercise
  | OtherExercise;

export function skillLabel(skill: SkillId) {
  return SKILLS.find((item) => item.id === skill)?.label ?? skill;
}

export function kindsForSkill(skill: SkillId) {
  if (skill === "LISTENING") return LISTENING_KINDS;
  if (skill === "SPEAKING") return SPEAKING_KINDS;
  if (skill === "WRITING") return WRITING_KINDS;
  if (skill === "OTHER") return OTHER_KINDS;
  return READING_KINDS;
}

export function kindLabelFor(skill: SkillId, kind: string) {
  return kindsForSkill(skill).find((item) => item.id === kind)?.label ?? kind;
}

export function kindLabel(exercise: Exercise) {
  return kindLabelFor(exercise.skill, exercise.kind);
}

export function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
