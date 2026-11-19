import { activityEngineTypes, portalBlocks, type ActivityConfig, type ActivityEngineType, type ActivityItem, type GameActivity } from "./activity-types";

export interface ActivityEngineDefinition {
  id: ActivityEngineType;
  label: string;
  description: string;
  modes: { id: string; label: string }[];
}

export const activityRegistry: ActivityEngineDefinition[] = [
  { id: "flashcard", label: "Flashcard", description: "Lật thẻ để học từ và nghĩa.", modes: [{ id: "flip", label: "Lật thẻ" }, { id: "self_check", label: "Tự kiểm tra" }] },
  { id: "audio_choice", label: "Audio Choice", description: "Nghe và chọn đáp án đúng.", modes: [{ id: "single", label: "Chọn một" }] },
  { id: "matching", label: "Matching", description: "Ghép hai vế tương ứng.", modes: [{ id: "pairs", label: "Ghép cặp" }] },
  { id: "drag_drop", label: "Drag & Drop", description: "Đưa đáp án vào đúng vị trí.", modes: [{ id: "answer_bank", label: "Ngân hàng đáp án" }] },
  { id: "sentence_builder", label: "Sentence Builder", description: "Sắp xếp từ thành câu hoàn chỉnh.", modes: [{ id: "tokens", label: "Xếp từ" }] },
  { id: "reveal", label: "Reveal", description: "Mở dần gợi ý và đáp án.", modes: [{ id: "cards", label: "Thẻ gợi ý" }] },
  { id: "phonics", label: "Phonics", description: "Luyện âm và nhận diện từ.", modes: [{ id: "sound_choice", label: "Chọn âm/từ" }] },
  { id: "interactive_video", label: "Interactive Video", description: "Xem video và trả lời câu hỏi.", modes: [{ id: "checkpoint", label: "Câu hỏi video" }] },
  { id: "song", label: "Song / Chant", description: "Nghe bài hát, đọc lời và luyện theo.", modes: [{ id: "listen_read", label: "Nghe và đọc" }] },
  { id: "speaking", label: "Speaking", description: "Ghi âm và tự đánh giá phần nói.", modes: [{ id: "record", label: "Ghi âm" }] },
  { id: "reader", label: "Reader", description: "Đọc nội dung theo từng trang/thẻ.", modes: [{ id: "pages", label: "Đọc theo trang" }] },
  { id: "quiz", label: "Quiz", description: "Bài trắc nghiệm tính điểm.", modes: [{ id: "single_choice", label: "Chọn một đáp án" }] },
];

const MEDIA_ENGINES = new Set<ActivityEngineType>(["interactive_video", "song"]);
const OPTIONAL_ANSWER_ENGINES = new Set<ActivityEngineType>(["flashcard", "reader", "interactive_video", "song", "reveal"]);

export function engineDefinition(type: ActivityEngineType) {
  return activityRegistry.find((engine) => engine.id === type) ?? activityRegistry[0]!;
}

export function activityItem(index = 0): ActivityItem {
  return { id: crypto.randomUUID(), prompt: `Câu ${index + 1}`, answer: "Đáp án đúng", options: ["Đáp án sai 1", "Đáp án sai 2"] };
}

export function defaultActivity(lessonId: string, engineType: ActivityEngineType, sortOrder = 1): GameActivity {
  const engine = engineDefinition(engineType);
  const stamp = new Date().toISOString();
  return {
    id: `activity-${crypto.randomUUID()}`,
    lessonId,
    engineType,
    mode: engine.modes[0]!.id,
    title: engine.label,
    instruction: engine.description,
    status: "DRAFT",
    passingScore: 70,
    starsReward: 1,
    sortOrder,
    config: { prompt: "", content: "", mediaUrl: "", items: [activityItem()] },
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const demoContent: Record<ActivityEngineType, { prompt: string; answer: string; options: string[]; content?: string; instruction: string }> = {
  flashcard: { prompt: "school", answer: "trường học", options: [], instruction: "Bấm vào thẻ để lật và ghi nhớ từ." },
  audio_choice: { prompt: "Listen and choose: school", answer: "school", options: ["teacher", "book"], instruction: "Nghe audio (nếu có) và chọn từ đúng." },
  matching: { prompt: "school", answer: "trường học", options: [], instruction: "Ghép từ tiếng Anh với nghĩa tiếng Việt." },
  drag_drop: { prompt: "teacher", answer: "giáo viên", options: [], instruction: "Chọn thẻ rồi đưa vào đáp án tương ứng." },
  sentence_builder: { prompt: "Sắp xếp thành câu giới thiệu trường học", answer: "This is my new school", options: [], instruction: "Bấm các từ theo đúng thứ tự." },
  reveal: { prompt: "A place where students learn", answer: "school", options: [], instruction: "Đọc gợi ý rồi bấm để mở đáp án." },
  phonics: { prompt: "Từ nào bắt đầu bằng âm /s/?", answer: "school", options: ["book", "teacher"], instruction: "Nhận diện âm đầu và chọn từ đúng." },
  interactive_video: { prompt: "Nhân vật đang ở đâu?", answer: "At school", options: ["At home", "On the farm"], instruction: "Xem video rồi trả lời câu hỏi." },
  song: { prompt: "Từ nào xuất hiện trong bài hát?", answer: "school", options: ["farm", "zoo"], content: "Welcome to our new school\nCome and learn with me", instruction: "Nghe, đọc lời và chọn đáp án." },
  speaking: { prompt: "Introduce your school", answer: "This is my school.", options: [], instruction: "Nghe mẫu, ghi âm và nghe lại phần nói." },
  reader: { prompt: "Page 1", answer: "Welcome to our new school.", options: [], content: "Welcome to our new school.\n---\nThis is my classroom. My teacher is Ms. Linh.", instruction: "Đọc lần lượt từng trang của câu chuyện." },
  quiz: { prompt: "What is this?", answer: "It is a school", options: ["It is a farm", "It is a zoo"], instruction: "Chọn đáp án đúng để ghi điểm." },
};

export function demoActivity(lessonId: string, engineType: ActivityEngineType, sortOrder = 1): GameActivity {
  const activity = defaultActivity(lessonId, engineType, sortOrder);
  const sample = demoContent[engineType];
  activity.title = `${engineDefinition(engineType).label} · Our New School`;
  activity.instruction = sample.instruction;
  activity.status = "PUBLISHED";
  activity.config.prompt = sample.prompt;
  activity.config.content = sample.content ?? "";
  activity.config.items = [{ id: `item-${crypto.randomUUID()}`, prompt: sample.prompt, answer: sample.answer, options: sample.options }];
  return activity;
}

export function validateActivity(activity: GameActivity) {
  const errors: string[] = [];
  if (!activityEngineTypes.includes(activity.engineType)) errors.push("Loại game không hợp lệ.");
  if (!activity.title.trim()) errors.push("Tên game là bắt buộc.");
  if (!engineDefinition(activity.engineType).modes.some((mode) => mode.id === activity.mode)) errors.push("Chế độ game không hợp lệ.");
  if (activity.passingScore < 0 || activity.passingScore > 100) errors.push("Điểm đạt phải từ 0 đến 100.");
  const items = Array.isArray(activity.config.items) ? activity.config.items : [];
  // Video / bài hát chỉ cần file media; flashcard và sách đọc không bắt buộc nghĩa/đáp án.
  const mediaOnly = MEDIA_ENGINES.has(activity.engineType) && Boolean(String(activity.config.mediaUrl || "").trim());
  // Portal: "Nhiệm vụ về nhà" chỉ có chữ (config.content); video Portal để nháp được khi chưa tải video.
  const textOnly = activity.engineType === "reader" && Boolean(String(activity.config.content || "").trim());
  const portalVideoDraft = (MEDIA_ENGINES.has(activity.engineType) || activity.portalBlock === "reader") && Boolean(activity.portalBlock) && activity.status === "DRAFT";
  if (!items.length && !mediaOnly && !textOnly && !portalVideoDraft) errors.push(MEDIA_ENGINES.has(activity.engineType) ? "Cần tải video/âm thanh hoặc thêm ít nhất một nội dung." : "Game cần ít nhất một nội dung.");
  items.forEach((item, index) => {
    if (!String(item.prompt || "").trim()) errors.push(`Nội dung ${index + 1} chưa có câu hỏi/mặt trước.`);
    if (!OPTIONAL_ANSWER_ENGINES.has(activity.engineType) && !String(item.answer || "").trim()) errors.push(`Nội dung ${index + 1} chưa có đáp án/mặt sau.`);
  });
  if (activity.portalBlock !== undefined && !(portalBlocks as readonly string[]).includes(activity.portalBlock)) errors.push("Khối Portal không hợp lệ.");
  return errors;
}

export function parseActivityItems(value: string): ActivityItem[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [prompt = "", answer = "", ...options] = line.split("|").map((part) => part.trim());
    return { id: `item-${index + 1}-${crypto.randomUUID()}`, prompt, answer, options: options.filter(Boolean) };
  });
}

export function serializeActivityItems(config: ActivityConfig) {
  return config.items.map((item) => [item.prompt, item.answer, ...item.options].join(" | ")).join("\n");
}
