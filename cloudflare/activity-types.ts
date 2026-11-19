export const activityEngineTypes = [
  "flashcard",
  "audio_choice",
  "matching",
  "drag_drop",
  "sentence_builder",
  "reveal",
  "phonics",
  "interactive_video",
  "song",
  "speaking",
  "reader",
  "quiz",
] as const;

export type ActivityEngineType = typeof activityEngineTypes[number];
export type ActivityStatus = "DRAFT" | "PUBLISHED";
/** Khối nội dung của buổi Portal (trang Portal soạn bài): mỗi buổi có tối đa một hoạt động mỗi khối. */
export const portalBlocks = ["flashcard", "phonics_video", "context_video", "reader", "review_game", "sentences", "homework"] as const;
export type PortalBlock = typeof portalBlocks[number];

export interface ActivityItem {
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  image?: string;
  /** File âm thanh tải lên (Portal). Không có thì trình phát đọc bằng giọng máy. */
  audio?: string;
}

export interface ActivityConfig {
  prompt: string;
  content: string;
  mediaUrl: string;
  items: ActivityItem[];
}

export interface GameActivity {
  id: string;
  lessonId: string;
  engineType: ActivityEngineType;
  mode: string;
  title: string;
  instruction: string;
  status: ActivityStatus;
  passingScore: number;
  starsReward: number;
  sortOrder: number;
  config: ActivityConfig;
  portalBlock?: PortalBlock;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityAttemptInput {
  syllabusId: string;
  activityId: string;
  score: number;
  accuracy: number;
  durationSeconds: number;
  answers: unknown[];
}

