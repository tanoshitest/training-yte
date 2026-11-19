import type { ActivityEngineType, ActivityItem, GameActivity } from "./activity-types";
import { flashcardImageUrl } from "./flashcard-images";
import { encodeLanguageMap, type LanguageProgression } from "./language-map";
import type { CourseDay, CurriculumSection, LearningPhase, LessonResource, SyllabusDocument, SyllabusLesson, SyllabusMeta, SyllabusUnit, VocabularyTier, VocabCard } from "./syllabus-types";

export type Pair = [string, string];

export type YleUnitSource = {
  title: string;
  topic: string;
  overview: string;
  objectives: string[];
  communicationGoal: string;
  lessonCount: number;
  courseNumber: 1 | 2;
  core: Pair[];
  supporting: Pair[];
  exposure: string[];
  language: LanguageProgression;
  coreProduction: string[];
  expandedProduction: string[];
  grammar: string[];
  skills: string[];
  recycle: string[];
  story: string;
  songs: string[];
  tpr: string[];
  classroomEnglish: string[];
  phonics: string[];
  sources: Array<[string, string]>;
  sourceNotes?: string[];
};

export type YleProgramSpec = {
  idPrefix: string;
  version: string;
  defaultCode: string;
  defaultName: string;
  defaultLevel: string;
  defaultDescription: string;
  pupilBookPage: string;
  activityBookPage: string;
  phonicsVideoUrl: string;
  grammarBank: string[];
  requiredVocabularyGroups: string[];
  cambridgeSkills: string[];
  commonErrors: string[];
  sourceScope: string[];
  coreStatement: string;
  course1Focus: string;
  course2Focus: string;
};

function cards(prefix: string, unitNo: number, items: Pair[], tier: VocabularyTier): VocabCard[] {
  return items.map(([front, back], index) => ({
    id: `${prefix}-u${String(unitNo).padStart(2, "0")}-${tier.toLowerCase()}-${index + 1}`,
    front, back, tier, image: flashcardImageUrl(front) || undefined,
  }));
}

function activityItems(unitNo: number, source: Pair[], count?: number): ActivityItem[] {
  const pool = source.length >= 3 ? source : [["listen", "nghe"], ["speak", "nói"], ["read", "đọc"]] as Pair[];
  const take = count ?? pool.length;
  return pool.slice(0, Math.min(take, pool.length)).map(([prompt, answer], index) => ({
    id: `u${unitNo}-item-${index + 1}`, prompt, answer, image: flashcardImageUrl(prompt) || undefined,
    options: [answer, pool[(index + 1) % pool.length]![1], pool[(index + 2) % pool.length]![1]].filter((value, optionIndex, values) => values.indexOf(value) === optionIndex),
  }));
}

function makeActivity(id: string, lessonId: string, order: number, engineType: ActivityEngineType, title: string, instruction: string, items: ActivityItem[], reward: number, passingScore: number): GameActivity {
  const stamp = "2026-09-05T00:00:00.000Z";
  const modes: Record<ActivityEngineType, string> = { flashcard: "flip", audio_choice: "single", matching: "pairs", drag_drop: "answer_bank", sentence_builder: "tokens", reveal: "cards", phonics: "sound_choice", interactive_video: "checkpoint", song: "listen_read", speaking: "record", reader: "pages", quiz: "single_choice" };
  return { id, lessonId, engineType, mode: modes[engineType], title, instruction, status: "PUBLISHED", passingScore, starsReward: reward, sortOrder: order, config: { prompt: instruction, content: "", mediaUrl: "", items }, createdAt: stamp, updatedAt: stamp };
}

function arcFor(unitLesson: number): { phase: LearningPhase; response: number; label: string } {
  return unitLesson === 1
    ? { phase: "INPUT_RESPONSE", response: 3, label: "Input & Guided Speaking" }
    : { phase: "REUSE_TRANSFER", response: 5, label: "Reuse & Check" };
}

function wordList(items: Pair[], count?: number) {
  return (count ? items.slice(0, count) : items).map(([front]) => front).join(", ");
}

function youtubeOf(unit: YleUnitSource, index = 0) {
  const videos = unit.sources.filter(([, url]) => /youtube\.com|youtu\.be/i.test(url)).map(([, url]) => url);
  return videos[index] || videos[0] || "";
}

function speakingPlan(unit: YleUnitSource) {
  const word = unit.language.WORD;
  const chunk = unit.language.CHUNK;
  const sentence = unit.language.SENTENCE;
  const qa = unit.language.QA.replace(/\s*\n\s*/g, " ");
  return [
    `L1: Point to ${word}.`,
    `L2: Show me ${word}. / Touch the ${chunk}.`,
    `L3: ${word} → ${chunk} → ${sentence}`,
    `L4: ${qa}`,
    `L5: ${unit.language.PERSONAL} / ${unit.language.EXPANDED_SENTENCE}`,
  ].join("\n");
}

function langLines(vocab: string, grammar: string) {
  return `Từ vựng: ${vocab || "—"}\nNgữ pháp: ${grammar || "—"}`;
}

function recycleLang(item: string) {
  const key = item.toLowerCase();
  if (key.includes("colour") || key.includes("color")) return { vocab: "red, blue, green, yellow", grammar: "What colour is it?" };
  if (key.includes("number")) return { vocab: "one–twenty", grammar: "How many …?" };
  if (key.includes("family")) return { vocab: "mum, dad, brother, sister", grammar: "This is my ____." };
  if (key.includes("food") || key.includes("lunch")) return { vocab: "sandwich, juice, salad, cake", grammar: "I'd like some ____." };
  if (key.includes("animal")) return { vocab: "kangaroo, parrot, penguin, panda", grammar: "It's a ____." };
  if (key.includes("weather")) return { vocab: "sunny, rainy, windy, cloudy", grammar: "What's the weather like?" };
  if (key.includes("home") || key.includes("house")) return { vocab: "kitchen, bedroom, table, window", grammar: "It's in / on / under the ____." };
  if (key.includes("town") || key.includes("place")) return { vocab: "park, shop, station, hospital", grammar: "I went to the ____." };
  if (key.includes("body") || key.includes("health")) return { vocab: "head, stomach, arm, leg", grammar: "What's the matter?" };
  if (key.includes("past") || key.includes("did")) return { vocab: "", grammar: "Where did you go? I went …" };
  if (key.includes("good at")) return { vocab: "hopping, climbing, drawing", grammar: "I'm good at ____." };
  if (key.includes("job")) return { vocab: "doctor, teacher, farmer", grammar: "He/She is a ____." };
  if (key.includes("school") || key.includes("subject")) return { vocab: "maths, art, science", grammar: "I like ____." };
  if (key.includes("sport")) return { vocab: "race, match, team, winner", grammar: "Have you ever …?" };
  if (key.includes("holiday") || key.includes("summer")) return { vocab: "suitcase, sunglasses, desert", grammar: "I'm going to ____." };
  return { vocab: item, grammar: "" };
}

function planNew(unit: YleUnitSource, unitLesson: number) {
  if (unitLesson === 1) return langLines(wordList(unit.core), [...unit.grammar.slice(0, 2), ...unit.coreProduction.slice(0, 2)].join(" · "));
  return langLines(wordList(unit.supporting), [...unit.grammar, unit.language.SENTENCE, unit.language.EXPANDED_SENTENCE].join(" · "));
}

function planRecycle(unit: YleUnitSource) {
  const parts = unit.recycle.map(recycleLang);
  return langLines(
    parts.map((item) => item.vocab).filter(Boolean).join("; ") || unit.recycle.join(", "),
    [...new Set(parts.map((item) => item.grammar).filter(Boolean))].join(" · "),
  );
}

function planReuse(unit: YleUnitSource, unitLesson: number, classTitle?: string) {
  if (classTitle) {
    const recognize = /recognize/i.test(classTitle);
    return recognize
      ? langLines(wordList(unit.core, 6), unit.coreProduction.slice(0, 2).join(" · "))
      : langLines(wordList(unit.core), [...unit.coreProduction, unit.language.PERSONAL].join(" · "));
  }
  if (unitLesson === 1) return langLines(wordList(unit.core), unit.coreProduction.slice(0, 2).join(" · "));
  return langLines(`${wordList(unit.core, 6)}; ${wordList(unit.supporting)}`, [...unit.coreProduction, ...unit.expandedProduction].join(" · "));
}

function shortUnitName(unit: YleUnitSource) {
  return unit.title.replace(/^UNIT \d+\s+/, "");
}

function lessonFor(spec: YleProgramSpec, unit: YleUnitSource, unitNo: number, day: CourseDay, unitLesson: number, title: string): SyllabusLesson {
  const core = cards(spec.idPrefix, unitNo, unit.core, "CORE");
  const supporting = cards(spec.idPrefix, unitNo, unit.supporting, "SUPPORTING");
  const exposure = unit.exposure.map((front, index) => ({
    id: `${spec.idPrefix}-u${String(unitNo).padStart(2, "0")}-ex-${index + 1}`,
    front, back: "Exposure — hiểu trong story / teacher talk", tier: "EXPOSURE" as const,
  }));
  const vocabulary = unitLesson === 1 ? core : [...core, ...supporting, ...exposure];
  const production = unitLesson === 1 ? unit.coreProduction.slice(0, 2) : [...unit.coreProduction, ...unit.expandedProduction];
  const phonics = unit.phonics.length ? unit.phonics.join(" · ") : "Không có phonics riêng. Ôn spelling Cambridge trên từ vừa học.";
  return {
    id: `${day.id}-lesson`, unitId: day.unitId, courseDayId: day.id, lessonNumber: 1, lessonType: day.phase || "CLASS",
    name: title, order: 1,
    pupilBookPage: spec.pupilBookPage,
    activityBookPage: spec.activityBookPage,
    hasListening: true, hasSpeaking: true, hasReading: unitLesson >= 2, hasWriting: unitLesson >= 2,
    tasks: unit.courseNumber === 2
      ? ["Meaning before explanation", title, "10–15 phút mini đề 1 kỹ năng", "Home App 10–20 phút"]
      : ["Meaning before explanation", title, "TPR / story / picture talk", "Production có trọng tâm"],
    languageTargets: production,
    lessonOutcomes: [unit.communicationGoal],
    lessonPlan: [
      `NEW: ${planNew(unit, unitLesson)}`,
      `RECYCLE: ${planRecycle(unit)}`,
      `REUSE: ${planReuse(unit, unitLesson)}`,
      `PHONICS: ${phonics}`,
      `Listening: ${unit.skills.find((item) => item.startsWith("Listening")) || "Nghe và phản hồi"}`,
      `Speaking: ${speakingPlan(unit)}`,
      `Reading: ${unit.skills.find((item) => item.startsWith("Reading")) || "Đọc từ/câu theo tranh"}`,
      `Writing: Trace/copy có chọn lọc. Một từ / câu ngắn theo dạng Cambridge.`,
      `Song / Chant: ${unit.songs[0] || "Chant Core words"} | ${youtubeOf(unit, 1) || youtubeOf(unit)}`,
      `Audio: Nguồn đã đối chiếu hoặc giọng giáo viên. | ${youtubeOf(unit)}`,
      `Interactive Video: ${unit.story} | ${youtubeOf(unit)}`,
    ],
    vocabulary, grammar: unit.grammar,
    homework: "Hai buổi Online 15–20 phút sau lớp: Recognize rồi Respond trên Portal. Không giao worksheet dài.",
    materials: unit.sources.map(([itemTitle, url]) => ({ title: itemTitle, url })),
    durationMinutes: 90,
    teacherSupport: unitLesson === 1 ? "HIGH" : "MEDIUM",
    teacherInput: unitLesson === 1 ? "HIGH" : "MEDIUM",
    studentProduction: unitLesson > 1 ? "HIGH" : "LOW",
    components: ["CLASS", day.phase || "", `Response Level ${day.responseLevel}`],
    assessmentCriteria: ["Meaning", "Response", "Language Use", "Communication"],
    homeLearningType: "LIGHT_FOLLOW_UP",
  };
}

function onlineLessonFor(spec: YleProgramSpec, unit: YleUnitSource, unitNo: number, day: CourseDay, slot: 1 | 2, classTitle: string): SyllabusLesson {
  const recognize = slot === 1;
  const core = cards(spec.idPrefix, unitNo, unit.core.slice(0, 6), "CORE");
  const supporting = cards(spec.idPrefix, unitNo, unit.supporting.slice(0, 4), "SUPPORTING");
  const focus = recognize ? "Recognize" : "Respond";
  const phonics = unit.phonics.length ? unit.phonics.join(" · ") : "Nghe spelling, không giảng quy tắc.";
  return {
    id: `${day.id}-lesson`, unitId: day.unitId, courseDayId: day.id, lessonNumber: 1, lessonType: "HOME",
    name: day.title, order: 1,
    pupilBookPage: spec.pupilBookPage,
    activityBookPage: spec.activityBookPage,
    hasListening: true, hasSpeaking: !recognize, hasReading: !recognize, hasWriting: false,
    tasks: recognize
      ? ["Nghe và nhìn lại từ vừa học trên lớp", "Nhận diện tranh / từ / âm", "Lặp lại mẫu câu ngắn, chưa cần nói dài"]
      : ["Dùng lại từ vừa nhận diện", "Trả lời câu hỏi ngắn bằng câu đủ sức", "Nói một câu về bản thân từ ngôn ngữ buổi Offline"],
    languageTargets: recognize ? unit.coreProduction.slice(0, 2) : [...unit.coreProduction, ...unit.expandedProduction.slice(0, 1)],
    lessonOutcomes: recognize
      ? [`Nhận diện lại Core của ${shortUnitName(unit)}.`, "Nghe–nhìn–lặp, không thêm ngôn ngữ mới."]
      : [unit.communicationGoal, "Tái sử dụng ngôn ngữ buổi Offline trên Portal."],
    lessonPlan: [
      `NEW: Không thêm từ mới. Chỉ ôn lại buổi Offline “${classTitle}”: ${wordList(unit.core, 6)}. Nếu quên, nghe–nhìn lại, không introduce Supporting.`,
      `RECYCLE: ${planRecycle(unit)}`,
      `REUSE: ${planReuse(unit, recognize ? 1 : 2, day.title)}`,
      `PHONICS: ${phonics}`,
      `Listening: ${recognize ? "Nghe từ/câu ngắn và chọn tranh." : unit.skills.find((item) => item.startsWith("Listening")) || "Nghe và phản hồi"}`,
      `Speaking: ${speakingPlan(unit)}`,
      `Reading: ${recognize ? "Ghép từ–tranh." : unit.skills.find((item) => item.startsWith("Reading")) || "Đọc từ/câu theo tranh"}`,
      `Writing: ${recognize ? "Không viết ít. Chỉ nhìn và chọn." : "Một từ / câu ngắn nếu cần."}`,
      `Song / Chant: ${unit.songs[0] || "Chant Core words"} | ${youtubeOf(unit, 1) || youtubeOf(unit)}`,
      `Audio: Nguồn đã đối chiếu hoặc giọng trên Portal. | ${youtubeOf(unit)}`,
      `Interactive Video: ${unit.story} | ${youtubeOf(unit)}`,
    ],
    vocabulary: recognize ? core : [...core, ...supporting],
    grammar: unit.grammar,
    homework: "",
    materials: unit.sources.map(([itemTitle, url]) => ({ title: itemTitle, url })),
    durationMinutes: 20,
    teacherSupport: "LOW", teacherInput: "LOW", studentProduction: recognize ? "LOW" : "MEDIUM",
    components: ["HOME", "ONLINE", focus, day.phase || ""],
    assessmentCriteria: ["Meaning", "Response", "Language Use"],
    homeLearningType: "LIGHT_FOLLOW_UP",
  };
}

function dayGames(prefix: string, lessonId: string, dayNo: number, unitNo: number, source: Pair[], kind: "class" | "recognize" | "respond"): GameActivity[] {
  const flash = kind === "recognize" || (kind === "class" && dayNo % 2 === 1);
  const items = activityItems(unitNo, source, flash ? source.length : Math.min(4, source.length));
  if (kind === "class") {
    return [makeActivity(`${prefix}-d${dayNo}-game`, lessonId, 1, flash ? "flashcard" : "matching", "Ôn tập buổi Offline", "Chơi game nhận diện từ vừa học trên lớp. 5–10 phút.", items, 10, 60)];
  }
  if (kind === "recognize") {
    return [makeActivity(`${prefix}-d${dayNo}-game`, lessonId, 1, "flashcard", "Online · Recognize", "15–20 phút. Nghe, nhìn, lật thẻ, nhận diện. Không học từ mới.", items, 10, 60)];
  }
  return [makeActivity(`${prefix}-d${dayNo}-game`, lessonId, 1, "quiz", "Online · Respond", "15–20 phút. Chọn đáp án / nói lại câu đã học trên lớp.", items, 12, 70)];
}

export function buildYleSeventyTwoCurriculum(existingMeta: SyllabusMeta, units: YleUnitSource[], spec: YleProgramSpec): SyllabusDocument {
  const sections: CurriculumSection[] = [
    { id: `${spec.idPrefix}-course-1`, type: "COURSE", title: "KHOÁ 1", courseDayStart: 1, courseDayEnd: 36, sortOrder: 1, unitId: null, courseNumber: 1 },
    { id: `${spec.idPrefix}-course-2`, type: "COURSE", title: "KHOÁ 2", courseDayStart: 37, courseDayEnd: 72, sortOrder: 2, unitId: null, courseNumber: 2 },
  ];
  const syllabusUnits: SyllabusUnit[] = [];
  const days: CourseDay[] = [];
  const lessons: SyllabusLesson[] = [];
  const resources: LessonResource[] = [];
  const activities: GameActivity[] = [];
  let global = 1;
  const classCount: Record<1 | 2, number> = { 1: 0, 2: 0 };

  function pushOfflineWithOnline(input: {
    unit: YleUnitSource; unitNo: number; unitId: string | null; sectionId: string;
    unitLesson: number; unitDayNumber: number; title: string; phase: LearningPhase; response: number;
    gameSource: Pair[];
  }) {
    const { unit, unitNo, unitId, sectionId, unitLesson, title, phase, response, gameSource } = input;
    const courseNumber = unit.courseNumber;
    classCount[courseNumber] += 1;
    const classNo = classCount[courseNumber];
    const vocab = gameSource.length ? gameSource : [...unit.core, ...unit.supporting];

    const offlineId = `${spec.idPrefix}-d${String(global).padStart(3, "0")}`;
    const offline: CourseDay = {
      id: offlineId, sectionId, unitId, courseDayNumber: global, unitDayNumber: input.unitDayNumber, title,
      weekNumber: Math.ceil(classNo / 2), courseNumber, track: "CLASS", classLessonNumber: classNo,
      deliveryMode: "OFFLINE", phase, responseLevel: response, assessmentType: null, durationMinutes: 90, sortOrder: global,
    };
    days.push(offline);
    const offlineLesson = lessonFor(spec, unit, unitNo, offline, unitLesson, title);
    lessons.push(offlineLesson);
    activities.push(...dayGames(spec.idPrefix, offlineLesson.id, global, unitNo, vocab, "class"));
    global += 1;

    ([["Recognize", "recognize", "INPUT_RESPONSE", 3], ["Respond", "respond", "GUIDED_SPEAKING", 4]] as const).forEach(([label, kind, onlinePhase, onlineResponse], slot) => {
      const onlineTitle = `Online · ${label} · ${shortUnitName(unit)}`;
      const online: CourseDay = {
        id: `${spec.idPrefix}-d${String(global).padStart(3, "0")}`, sectionId, unitId, courseDayNumber: global,
        unitDayNumber: input.unitDayNumber + slot + 1, title: onlineTitle,
        weekNumber: Math.ceil(classNo / 2), courseNumber, track: "HOME", classLessonNumber: undefined,
        deliveryMode: "ONLINE", phase: onlinePhase, responseLevel: onlineResponse, assessmentType: null, durationMinutes: 20, sortOrder: global,
      };
      days.push(online);
      const onlineLesson = onlineLessonFor(spec, unit, unitNo, online, (slot + 1) as 1 | 2, title);
      lessons.push(onlineLesson);
      activities.push(...dayGames(spec.idPrefix, onlineLesson.id, global, unitNo, vocab, kind));
      global += 1;
    });
  }

  function addUnit(unit: YleUnitSource, unitNo: number) {
    const padded = String(unitNo).padStart(2, "0");
    const sectionId = `${spec.idPrefix}-course-${unit.courseNumber}`;
    const unitId = `${spec.idPrefix}-u${padded}`;
    syllabusUnits.push({
      id: unitId, sectionId, unitNumber: unitNo, name: unit.title, topic: unit.topic, overview: unit.overview, learningObjectives: unit.objectives,
      courseNumber: unit.courseNumber, lessonCount: unit.lessonCount, communicationGoal: unit.communicationGoal,
      coreVocabulary: unit.core.map(([a, b]) => `${a} — ${b}`), supportingVocabulary: unit.supporting.map(([a, b]) => `${a} — ${b}`), exposureVocabulary: unit.exposure,
      languageMap: encodeLanguageMap(unit.language), coreProduction: unit.coreProduction, expandedProduction: unit.expandedProduction,
      storyFocus: unit.story, storyVideoUrl: unit.sources.find(([, url]) => /youtube\.com|youtu\.be/i.test(url))?.[1] || "",
      songs: unit.songs, tprActions: unit.tpr, classroomEnglish: unit.classroomEnglish,
      phonicsFocus: unit.phonics, phonicsVideoUrl: spec.phonicsVideoUrl,
      flashcardFocus: "Flashcard", flashcardVideoUrl: unit.sources.find(([, url]) => /youtube\.com|youtu\.be/i.test(url))?.[1] || unit.sources[0]?.[1] || "",
      trickyWords: Object.values(unit.language).flatMap((line) => line.match(/\b(the|is|are|do|does|have|has|this|that|did|was|were)\b/gi) || []).filter((value, pos, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === pos),
      recycledLanguage: unit.recycle, skillFocus: unit.skills,
      teachingAids: [
        ...unit.core.map(([word]) => {
          const url = flashcardImageUrl(word);
          return url ? { title: `Hình · ${word.split("/")[0].trim()}`, url } : null;
        }).filter((item): item is { title: string; url: string } => Boolean(item)).slice(0, 4),
        ...unit.sources.filter(([, url]) => !/youtube\.com|youtu\.be/i.test(url)).map(([title, url]) => ({ title, url })),
      ],
      sourceNotes: unit.sourceNotes || [], order: unitNo,
    });
    for (let unitLesson = 1; unitLesson <= unit.lessonCount; unitLesson += 1) {
      const arc = arcFor(unitLesson);
      pushOfflineWithOnline({
        unit, unitNo, unitId, sectionId, unitLesson, unitDayNumber: (unitLesson - 1) * 3 + 1,
        title: `${arc.label} · ${shortUnitName(unit)}`, phase: arc.phase, response: arc.response,
        gameSource: unitLesson === 1 ? [...unit.core] : [...unit.core, ...unit.supporting],
      });
    }
    unit.sources.forEach(([title, url], sourceIndex) => resources.push({
      id: `${spec.idPrefix}-u${padded}-r${sourceIndex + 1}`, sectionId, unitId, courseDayId: null, lessonId: null,
      resourceType: url.includes("youtube.com") || url.includes("youtu.be") ? "VIDEO" : "EXTERNAL_LINK", title, url,
      description: "Resource = reinforcement. Curriculum là CORE.", sortOrder: resources.length + 1, isActive: true, openInNewTab: true,
    }));
  }

  units.filter((unit) => unit.courseNumber === 1).forEach((unit, index) => addUnit(unit, index + 1));
  units.filter((unit) => unit.courseNumber === 2).forEach((unit, index) => addUnit(unit, index + 7));

  days.sort((a, b) => a.courseDayNumber - b.courseDayNumber);
  const meta: SyllabusMeta = {
    ...existingMeta,
    code: existingMeta.code || spec.defaultCode,
    name: existingMeta.name || spec.defaultName,
    level: existingMeta.level || spec.defaultLevel,
    description: existingMeta.description || spec.defaultDescription,
    status: "ACTIVE",
    totalCourseDays: 72,
    updatedAt: new Date().toISOString(),
  };

  return {
    meta,
    program: {
      version: spec.version,
      durationMonths: 3,
      totalWeeks: 12,
      sessionsPerWeek: 6,
      offlineSessionsPerWeek: 2,
      onlineSessionsPerWeek: 4,
      classDurationMinutes: 90,
      coursesCount: 2,
      classLessonsPerCourse: 12,
      unitsCount: 12,
      unitWeeks: 0,
      wrapWeeks: 0,
      lightHome: true,
      learningCycle: ["Listen", "Understand", "Respond", "Speak", "Reuse", "Transfer"],
      responseLevels: ["Level 1 — Recognize", "Level 2 — Respond", "Level 3 — Repeat", "Level 4 — Respond with language", "Level 5 — Produce"],
      languageProgression: ["Word", "Chunk", "Sentence", "Q&A", "Personal language", "Communication"],
      recyclingCycle: ["Exposure", "Recognition", "Guided Use", "Independent Use", "Transfer"],
      assessmentDimensions: ["Listening", "Response", "Speaking", "Communication", "Literacy", "Confidence"],
      grammarBank: spec.grammarBank,
      requiredVocabularyGroups: spec.requiredVocabularyGroups,
      cambridgeSkills: spec.cambridgeSkills,
      commonErrors: spec.commonErrors,
      sourceScope: spec.sourceScope,
      coreStatement: spec.coreStatement,
      courses: [
        { number: 1, title: "KHOÁ 1", dayStart: 1, dayEnd: 36, units: units.filter((item) => item.courseNumber === 1).map((item) => item.title), focus: spec.course1Focus },
        { number: 2, title: "KHOÁ 2", dayStart: 37, dayEnd: 72, units: units.filter((item) => item.courseNumber === 2).map((item) => item.title), focus: spec.course2Focus },
      ],
    },
    sections, units: syllabusUnits, days, lessons, resources, exercises: [], activities,
  };
}
