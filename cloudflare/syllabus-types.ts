import type { GameActivity } from "./activity-types";

export type SyllabusStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CurriculumSectionType = "UNIT" | "REVIEW" | "PROJECT" | "MIDTERM_TEST" | "FINAL_TEST" | "COURSE" | "OTHER";
export type ResourceType = "LESSON_PLAN" | "VIDEO" | "AUDIO" | "WORKSHEET" | "PDF" | "SLIDE" | "GAME" | "QUIZ" | "HOMEWORK" | "TEACHER_RESOURCE" | "STUDENT_RESOURCE" | "EXTERNAL_LINK" | "OTHER";
export type DeliveryMode = "OFFLINE" | "ONLINE";
export type LessonTrack = "CLASS" | "HOME";
export type LearningPhase = "INPUT_RESPONSE" | "GUIDED_SPEAKING" | "REUSE_TRANSFER" | "EXAM_PRACTICE" | "ASSESSMENT" | "COURSE_WRAP";
export type AssessmentType = "MID_TEST" | "FINAL_TEST" | "COURSE_REVIEW" | "COURSE_FINAL" | null;
export type VocabularyTier = "CORE" | "SUPPORTING" | "EXPOSURE";
export type TestSkill = "LISTENING" | "READING_WRITING" | "SPEAKING";

export interface ProgramCourse {
  number: number;
  title: string;
  dayStart: number;
  dayEnd: number;
  units: string[];
  focus: string;
}

export interface StarterProgramDesign {
  version: string;
  durationMonths: number;
  totalWeeks: number;
  sessionsPerWeek: number;
  offlineSessionsPerWeek: number;
  onlineSessionsPerWeek: number;
  classDurationMinutes: number;
  coursesCount: number;
  classLessonsPerCourse: number;
  unitsCount: number;
  unitWeeks: number;
  wrapWeeks: number;
  lightHome: boolean;
  learningCycle: string[];
  responseLevels: string[];
  languageProgression: string[];
  recyclingCycle: string[];
  assessmentDimensions: string[];
  grammarBank: string[];
  requiredVocabularyGroups: string[];
  cambridgeSkills: string[];
  commonErrors: string[];
  sourceScope: string[];
  coreStatement: string;
  courses: ProgramCourse[];
}

export interface SyllabusMeta {
  id: string;
  code: string;
  name: string;
  levelId: string | null;
  level: string;
  description: string;
  status: SyllabusStatus;
  totalCourseDays: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusUnit {
  id: string;
  sectionId: string | null;
  unitNumber: number | null;
  name: string;
  topic: string;
  overview: string;
  learningObjectives: string[];
  courseNumber?: number;
  lessonCount?: number;
  communicationGoal?: string;
  coreVocabulary?: string[];
  supportingVocabulary?: string[];
  exposureVocabulary?: string[];
  languageMap?: string[];
  coreProduction?: string[];
  expandedProduction?: string[];
  storyFocus?: string;
  storyVideoUrl?: string;
  songs?: string[];
  tprActions?: string[];
  classroomEnglish?: string[];
  phonicsFocus?: string[];
  phonicsVideoUrl?: string;
  flashcardFocus?: string;
  flashcardVideoUrl?: string;
  trickyWords?: string[];
  recycledLanguage?: string[];
  skillFocus?: string[];
  teachingAids?: Material[];
  sourceNotes?: string[];
  custom?: boolean;
  order: number;
}

export interface CurriculumSection {
  id: string;
  type: CurriculumSectionType;
  title: string;
  courseDayStart: number | null;
  courseDayEnd: number | null;
  sortOrder: number;
  unitId: string | null;
  courseNumber?: number;
}

export interface CourseDay {
  id: string;
  sectionId: string;
  unitId: string | null;
  courseDayNumber: number;
  unitDayNumber: number | null;
  title: string;
  weekNumber?: number;
  courseNumber?: number;
  track?: LessonTrack;
  classLessonNumber?: number;
  deliveryMode?: DeliveryMode;
  phase?: LearningPhase;
  responseLevel?: number;
  assessmentType?: AssessmentType;
  testSkills?: TestSkill[];
  durationMinutes?: number;
  custom?: boolean;
  sortOrder: number;
}

export interface Material { title: string; url: string }
export interface VocabCard { id: string; front: string; back: string; image?: string; imageUrl?: string; backImageUrl?: string; tier?: VocabularyTier }

export interface SyllabusLesson {
  id: string;
  unitId: string | null;
  courseDayId: string;
  lessonNumber: number;
  lessonType: string;
  name: string;
  order: number;
  pupilBookPage: string;
  activityBookPage: string;
  hasListening: boolean;
  hasSpeaking: boolean;
  hasReading: boolean;
  hasWriting: boolean;
  tasks: string[];
  languageTargets: string[];
  lessonOutcomes: string[];
  lessonPlan: string[];
  vocabulary: VocabCard[];
  grammar: string[];
  homework: string;
  materials: Material[];
  durationMinutes?: number;
  teacherSupport?: string;
  teacherInput?: string;
  studentProduction?: string;
  components?: string[];
  assessmentCriteria?: string[];
  homeLearningType?: string;
}

export interface LessonResource {
  id: string;
  sectionId: string | null;
  unitId: string | null;
  courseDayId: string | null;
  lessonId: string | null;
  resourceType: ResourceType;
  title: string;
  url: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  openInNewTab: boolean;
}

export interface LessonExercise {
  id: string;
  lessonId: string;
  skill: string;
  kind: string;
  title: string;
  sortOrder: number;
  payload: Record<string, unknown>;
}

export interface SyllabusDocument {
  meta: SyllabusMeta;
  program?: StarterProgramDesign;
  sections: CurriculumSection[];
  units: SyllabusUnit[];
  days: CourseDay[];
  lessons: SyllabusLesson[];
  resources: LessonResource[];
  exercises: LessonExercise[];
  activities: GameActivity[];
}

export type MutationInput = { action: string; [key: string]: unknown };
export type MutationResult = { ok: true; message: string; document: SyllabusDocument; id?: string };
