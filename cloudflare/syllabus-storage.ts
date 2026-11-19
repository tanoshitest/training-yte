import { DurableObject } from "./durable-object-base";

import { isRetiredCatalogItem, seedDocuments } from "./syllabus-seed";
import { activityEngineTypes, type GameActivity } from "./activity-types";
import { demoActivity, validateActivity } from "./activity-registry";
import { buildFlyersSeventyTwoCurriculum } from "./flyers-curriculum";
import { buildMoversSeventyTwoCurriculum } from "./movers-curriculum";
import { buildStarterFortyEightCurriculum } from "./starter-curriculum";
import type { CourseDay, CurriculumSection, LessonResource, MutationInput, MutationResult, SyllabusDocument, SyllabusLesson, SyllabusMeta, SyllabusUnit } from "./syllabus-types";

const STARTER_CODES = new Set(["STARTER", "STEPS", "STEPS-STARTERS"]);
const MOVERS_CODES = new Set(["STEPS-MOVERS", "MOVERS"]);
const FLYERS_CODES = new Set(["STEPS-FLYERS", "FLYERS"]);

type StorageEnv = Record<string, unknown>;

function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function bool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function list<T>(value: unknown, fallback: T[] = []) { return Array.isArray(value) ? value as T[] : fallback; }

function swap<T extends { id: string }>(items: T[], id: string, direction: unknown) {
  const index = items.findIndex((item) => item.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= items.length) return false;
  [items[index], items[target]] = [items[target]!, items[index]!];
  items.forEach((item, position) => {
    if ("sortOrder" in item) (item as T & { sortOrder: number }).sortOrder = position + 1;
    if ("order" in item) (item as T & { order: number }).order = position + 1;
  });
  return true;
}

function normalize(doc: SyllabusDocument) {
  doc.activities ??= [];
  doc.sections.sort((a, b) => a.sortOrder - b.sortOrder).forEach((item, index) => { item.sortOrder = index + 1; });
  const orderedDays: CourseDay[] = [];
  for (const section of doc.sections) {
    const days = doc.days.filter((day) => day.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder);
    section.courseDayStart = days.length ? orderedDays.length + 1 : null;
    orderedDays.push(...days);
    section.courseDayEnd = days.length ? orderedDays.length : null;
  }
  orderedDays.forEach((day, index) => { day.sortOrder = index + 1; day.courseDayNumber = index + 1; });
  doc.days = orderedDays;
  for (const day of doc.days) doc.lessons.filter((lesson) => lesson.courseDayId === day.id).sort((a, b) => a.order - b.order).forEach((lesson, index) => { lesson.order = index + 1; lesson.lessonNumber = index + 1; });
  doc.resources.sort((a, b) => a.sortOrder - b.sortOrder).forEach((resource, index) => { resource.sortOrder = index + 1; });
  doc.activities.sort((a, b) => a.sortOrder - b.sortOrder);
  doc.meta.totalCourseDays = doc.days.length;
  doc.meta.updatedAt = new Date().toISOString();
}

function cascadeLessons(doc: SyllabusDocument, lessonIds: Set<string>) {
  doc.lessons = doc.lessons.filter((lesson) => !lessonIds.has(lesson.id));
  doc.resources = doc.resources.filter((resource) => !resource.lessonId || !lessonIds.has(resource.lessonId));
  doc.exercises = doc.exercises.filter((exercise) => !lessonIds.has(exercise.lessonId));
  doc.activities = (doc.activities ?? []).filter((activity) => !lessonIds.has(activity.lessonId));
}

export class SyllabusCatalog extends DurableObject<StorageEnv> {
  async list(): Promise<SyllabusMeta[]> {
    let items = await this.ctx.storage.get<SyllabusMeta[]>("items");
    const seeds = seedDocuments().map((document) => document.meta);
    if (!items) {
      items = seeds;
      await this.ctx.storage.put("items", items);
    } else {
      let changed = false;
      const kept = items.filter((item: SyllabusMeta) => !isRetiredCatalogItem(item));
      if (kept.length !== items.length) changed = true;
      items = kept;
      const have = new Set(items.map((item: SyllabusMeta) => item.id));
      for (const seed of seeds) {
        if (!have.has(seed.id)) {
          items.push(seed);
          changed = true;
        }
      }
      if (changed) await this.ctx.storage.put("items", items);
    }
    return items.sort((a: SyllabusMeta, b: SyllabusMeta) => a.sortOrder - b.sortOrder);
  }

  async create(input: Partial<SyllabusMeta>): Promise<SyllabusMeta> {
    const items = await this.list();
    const code = text(input.code, `SYL${String(items.length + 1).padStart(4, "0")}`).toUpperCase();
    if (items.some((item) => item.code.toUpperCase() === code)) throw new Error("Mã syllabus đã tồn tại.");
    const stamp = new Date().toISOString();
    const meta: SyllabusMeta = { id: uid("syllabus"), code, name: text(input.name, "Syllabus mới"), levelId: input.levelId ?? null, level: text(input.level), description: text(input.description), status: input.status ?? "DRAFT", totalCourseDays: 0, sortOrder: items.length + 1, createdAt: stamp, updatedAt: stamp };
    await this.ctx.storage.put("items", [...items, meta]);
    return meta;
  }

  async upsert(meta: SyllabusMeta) {
    if (isRetiredCatalogItem(meta)) return;
    const items = await this.list();
    const next = items.some((item) => item.id === meta.id) ? items.map((item) => item.id === meta.id ? meta : item) : [...items, meta];
    await this.ctx.storage.put("items", next);
  }

  async remove(id: string) {
    const items = await this.list();
    await this.ctx.storage.put("items", items.filter((item) => item.id !== id).map((item, index) => ({ ...item, sortOrder: index + 1 })));
  }
}

export class SyllabusDocumentObject extends DurableObject<StorageEnv> {
  async getOrInit(seed?: SyllabusDocument): Promise<SyllabusDocument | null> {
    let document = await this.ctx.storage.get<SyllabusDocument>("document");
    const testLabeled = Boolean(document?.days.some((day: CourseDay) =>
      /mid[\s-]?test|final[\s-]?test|mini[\s-]?test|mini đề|luyện đề/i.test(`${day.title || ""} ${day.assessmentType || ""}`)
    ));
    const code = (document?.meta.code || "").toUpperCase();
    const starterCode = STARTER_CODES.has(code);
    const moversCode = MOVERS_CODES.has(code);
    const flyersCode = FLYERS_CODES.has(code);
    const stale = Boolean(document && (
      (starterCode && document.program?.version !== "STARTER-144-V9")
      || (moversCode && document.program?.version !== "MOVERS-72-V1")
      || (flyersCode && document.program?.version !== "FLYERS-72-V1")
      || document.days.length === 576
      || testLabeled
    ));
    if (document && stale && (seed || starterCode || moversCode || flyersCode)) {
      const previous = document.meta;
      const rebuilt = seed
        ?? (moversCode ? buildMoversSeventyTwoCurriculum(document.meta)
          : flyersCode ? buildFlyersSeventyTwoCurriculum(document.meta)
            : buildStarterFortyEightCurriculum(document.meta));
      document = structuredClone(rebuilt);
      document.meta = {
        ...document.meta,
        name: previous.name || document.meta.name,
        description: previous.description || document.meta.description,
        level: previous.level || document.meta.level,
        status: previous.status || document.meta.status,
        levelId: previous.levelId ?? document.meta.levelId,
      };
      await this.ctx.storage.put("document", document);
    } else if (!document && seed) {
      document = structuredClone(seed);
      await this.ctx.storage.put("document", document);
    }
    if (document && !Array.isArray(document.activities)) { document.activities = []; await this.ctx.storage.put("document", document); }
    return document ?? null;
  }

  async replace(document: SyllabusDocument) { normalize(document); await this.ctx.storage.put("document", document); return document; }
  async clear() { await this.ctx.storage.deleteAll(); }

  async mutate(input: MutationInput): Promise<MutationResult> {
    const stored = await this.getOrInit();
    if (!stored) throw new Error("Không tìm thấy syllabus.");
    const doc = structuredClone(stored);
    let message = "Đã lưu.";
    let resultId: string | undefined;

    switch (input.action) {
      case "installStarterFortyEightCurriculum":
      case "installStarterFourMonthCurriculum":
      case "installStepsThreeYearCurriculum": {
        const allowedCodes = new Set(["STARTER", "STEPS", "STEPS-STARTERS"]);
        const confirmOk = ["INSTALL_STARTER_48_V1", "INSTALL_STEPS_3Y_V1", "INSTALL_STARTER_4M_V1"].includes(String(input.confirmCode));
        if (!confirmOk) throw new Error("Thiếu mã xác nhận cài đặt chương trình STARTERS.");
        if (!allowedCodes.has(doc.meta.code.toUpperCase())) throw new Error("Chỉ cài được curriculum này vào syllabus STEPS / STARTER.");
        if (doc.days.length > 0 && input.force !== true) throw new Error("Syllabus đã có Course Day. Dùng force=true nếu thực sự muốn thay toàn bộ nội dung.");
        const curriculum = buildStarterFortyEightCurriculum(doc.meta);
        normalize(curriculum);
        await this.ctx.storage.put("document", curriculum);
        return { ok: true, message: "Đã cài STARTERS: 48 Offline + 96 Online, game ôn mỗi ngày.", document: curriculum };
      }
      case "normalizeGlobalDayLabels": {
        if (input.confirmCode !== "GLOBAL_DAY_LABELS_V1") throw new Error("Thiếu mã xác nhận chuẩn hóa Day.");
        for (const day of doc.days) {
          day.title = day.title.replace(/^Day\s+\d+\s*[·:]\s*/i, "").trim();
          for (const lesson of doc.lessons.filter((item) => item.courseDayId === day.id)) {
            lesson.name = lesson.name.replace(/^Day\s+\d+\s*[·:]\s*/i, "").trim();
          }
        }
        message = "Đã chuẩn hóa Day liên tục từ đầu đến cuối khóa.";
        break;
      }
      case "updateMeta": {
        doc.meta = { ...doc.meta, code: text(input.code, doc.meta.code).toUpperCase(), name: text(input.name, doc.meta.name), levelId: input.levelId === null ? null : text(input.levelId, doc.meta.levelId ?? "") || null, level: text(input.level, doc.meta.level), description: text(input.description), status: ["DRAFT", "ACTIVE", "ARCHIVED"].includes(String(input.status)) ? input.status as SyllabusMeta["status"] : doc.meta.status };
        message = "Đã cập nhật syllabus."; break;
      }
      case "createSection": {
        const sectionId = uid("section"); const type = String(input.type || "UNIT") as CurriculumSection["type"]; const title = text(input.title, "Section mới");
        const section: CurriculumSection = { id: sectionId, type, title, courseDayStart: null, courseDayEnd: null, sortOrder: doc.sections.length + 1, unitId: null };
        doc.sections.push(section);
        if (type === "UNIT") { const unitId = uid("unit"); const unit: SyllabusUnit = { id: unitId, sectionId, unitNumber: doc.units.length + 1, name: title, topic: "", overview: "", learningObjectives: [], order: doc.units.length + 1 }; section.unitId = unitId; doc.units.push(unit); }
        resultId = sectionId; message = "Đã thêm section."; break;
      }
      case "createUnit": {
        const section = doc.sections.find((item) => item.id === input.sectionId); if (!section) throw new Error("Section không tồn tại.");
        const title = text(input.title, `UNIT ${doc.units.length + 1}`);
        const unitId = uid("unit");
        const siblings = doc.units.filter((item) => item.sectionId === section.id);
        const unit: SyllabusUnit = { id: unitId, sectionId: section.id, unitNumber: number(input.unitNumber, doc.units.length + 1), name: title, topic: "", overview: "", learningObjectives: [], order: siblings.length + 1, courseNumber: section.courseNumber, custom: true };
        doc.units.push(unit);
        resultId = unitId; message = "Đã thêm Unit."; break;
      }
      case "updateUnit": {
        const unit = doc.units.find((item) => item.id === input.id); if (!unit) throw new Error("Không tìm thấy unit.");
        unit.name = text(input.name, unit.name);
        unit.unitNumber = number(input.unitNumber, unit.unitNumber ?? 1);
        unit.topic = text(input.topic, unit.topic);
        unit.overview = text(input.overview, unit.overview);
        unit.learningObjectives = list<string>(input.learningObjectives, unit.learningObjectives);
        unit.communicationGoal = text(input.communicationGoal, unit.communicationGoal || "");
        unit.coreVocabulary = list<string>(input.coreVocabulary, unit.coreVocabulary || []);
        unit.supportingVocabulary = list<string>(input.supportingVocabulary, unit.supportingVocabulary || []);
        unit.exposureVocabulary = list<string>(input.exposureVocabulary, unit.exposureVocabulary || []);
        unit.languageMap = list<string>(input.languageMap, unit.languageMap || []);
        unit.coreProduction = list<string>(input.coreProduction, unit.coreProduction || []);
        unit.expandedProduction = list<string>(input.expandedProduction, unit.expandedProduction || []);
        unit.storyFocus = text(input.storyFocus, unit.storyFocus || "");
        unit.storyVideoUrl = text(input.storyVideoUrl, unit.storyVideoUrl || "");
        unit.songs = list<string>(input.songs, unit.songs || []);
        unit.tprActions = list<string>(input.tprActions, unit.tprActions || []);
        unit.classroomEnglish = list<string>(input.classroomEnglish, unit.classroomEnglish || []);
        unit.phonicsFocus = list<string>(input.phonicsFocus, unit.phonicsFocus || []);
        unit.phonicsVideoUrl = text(input.phonicsVideoUrl, unit.phonicsVideoUrl || "");
        unit.flashcardFocus = text(input.flashcardFocus, unit.flashcardFocus || "");
        unit.flashcardVideoUrl = text(input.flashcardVideoUrl, unit.flashcardVideoUrl || "");
        unit.trickyWords = list<string>(input.trickyWords, unit.trickyWords || []);
        unit.recycledLanguage = list<string>(input.recycledLanguage, unit.recycledLanguage || []);
        unit.skillFocus = list<string>(input.skillFocus, unit.skillFocus || []);
        unit.teachingAids = list(input.teachingAids, unit.teachingAids || []);
        unit.sourceNotes = list<string>(input.sourceNotes, unit.sourceNotes || []);
        if (input.lessonCount != null) unit.lessonCount = number(input.lessonCount, unit.lessonCount || 0);
        message = "Đã lưu Language System."; break;
      }
      case "updateSection": {
        const section = doc.sections.find((item) => item.id === input.id); if (!section) throw new Error("Không tìm thấy section.");
        section.type = String(input.type || section.type) as CurriculumSection["type"]; section.title = text(input.title, section.title);
        if (input.courseNumber != null) section.courseNumber = number(input.courseNumber, section.courseNumber || 1);
        if (section.type === "COURSE") { message = "Đã lưu khóa."; break; }
        let unit = doc.units.find((item) => item.id === section.unitId);
        if (section.type === "UNIT" && !unit) { const unitId = uid("unit"); unit = { id: unitId, sectionId: section.id, unitNumber: doc.units.length + 1, name: section.title, topic: "", overview: "", learningObjectives: [], order: doc.units.length + 1 }; section.unitId = unitId; doc.units.push(unit); }
        if (unit) {
          unit.name = section.title;
          unit.unitNumber = number(input.unitNumber, unit.unitNumber ?? 1);
          unit.topic = text(input.topic, unit.topic);
          unit.overview = text(input.overview, unit.overview);
          unit.learningObjectives = list<string>(input.learningObjectives, unit.learningObjectives);
          unit.communicationGoal = text(input.communicationGoal, unit.communicationGoal || "");
          unit.coreVocabulary = list<string>(input.coreVocabulary, unit.coreVocabulary || []);
          unit.supportingVocabulary = list<string>(input.supportingVocabulary, unit.supportingVocabulary || []);
          unit.exposureVocabulary = list<string>(input.exposureVocabulary, unit.exposureVocabulary || []);
          unit.languageMap = list<string>(input.languageMap, unit.languageMap || []);
          unit.coreProduction = list<string>(input.coreProduction, unit.coreProduction || []);
          unit.expandedProduction = list<string>(input.expandedProduction, unit.expandedProduction || []);
          unit.storyFocus = text(input.storyFocus, unit.storyFocus || "");
          unit.storyVideoUrl = text(input.storyVideoUrl, unit.storyVideoUrl || "");
          unit.songs = list<string>(input.songs, unit.songs || []);
          unit.tprActions = list<string>(input.tprActions, unit.tprActions || []);
          unit.classroomEnglish = list<string>(input.classroomEnglish, unit.classroomEnglish || []);
          unit.phonicsFocus = list<string>(input.phonicsFocus, unit.phonicsFocus || []);
          unit.phonicsVideoUrl = text(input.phonicsVideoUrl, unit.phonicsVideoUrl || "");
          unit.flashcardFocus = text(input.flashcardFocus, unit.flashcardFocus || "");
          unit.flashcardVideoUrl = text(input.flashcardVideoUrl, unit.flashcardVideoUrl || "");
          unit.trickyWords = list<string>(input.trickyWords, unit.trickyWords || []);
          unit.recycledLanguage = list<string>(input.recycledLanguage, unit.recycledLanguage || []);
          unit.skillFocus = list<string>(input.skillFocus, unit.skillFocus || []);
          unit.teachingAids = list(input.teachingAids, unit.teachingAids || []);
          unit.sourceNotes = list<string>(input.sourceNotes, unit.sourceNotes || []);
        }
        message = "Đã lưu section."; break;
      }
      case "moveSection": { if (swap(doc.sections.sort((a,b)=>a.sortOrder-b.sortOrder), String(input.id), input.direction)) message = "Đã đổi thứ tự section."; break; }
      case "deleteSection": {
        const id = String(input.id); const dayIds = new Set(doc.days.filter((day) => day.sectionId === id).map((day) => day.id)); const unitIds = new Set(doc.units.filter((unit) => unit.sectionId === id).map((unit) => unit.id)); const lessonIds = new Set(doc.lessons.filter((lesson) => dayIds.has(lesson.courseDayId) || (lesson.unitId ? unitIds.has(lesson.unitId) : false)).map((lesson) => lesson.id));
        cascadeLessons(doc, lessonIds); doc.days = doc.days.filter((day) => !dayIds.has(day.id)); doc.units = doc.units.filter((unit) => !unitIds.has(unit.id)); doc.resources = doc.resources.filter((resource) => resource.sectionId !== id && (!resource.courseDayId || !dayIds.has(resource.courseDayId)) && (!resource.unitId || !unitIds.has(resource.unitId))); doc.sections = doc.sections.filter((section) => section.id !== id); message = "Đã xóa section."; break;
      }
      case "createDay": {
        const section = doc.sections.find((item) => item.id === input.sectionId); if (!section) throw new Error("Section không tồn tại.");
        const requestedUnitId = text(input.unitId);
        const unit = doc.units.find((item) => item.id === requestedUnitId) ?? doc.units.find((item) => item.id === section.unitId);
        const dayId = uid("day");
        const sectionDays = doc.days.filter((day) => day.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder);
        let afterDayId = text(input.afterDayId);
        if (!afterDayId && unit) {
          const unitDays = sectionDays.filter((day) => day.unitId === unit.id);
          if (unitDays.length) afterDayId = unitDays[unitDays.length - 1]!.id;
          else {
            const courseUnits = doc.units.filter((item) => item.sectionId === section.id).sort((a, b) => a.order - b.order);
            const unitIndex = courseUnits.findIndex((item) => item.id === unit.id);
            for (let index = unitIndex - 1; index >= 0; index -= 1) {
              const previousDays = sectionDays.filter((day) => day.unitId === courseUnits[index]!.id);
              if (previousDays.length) { afterDayId = previousDays[previousDays.length - 1]!.id; break; }
            }
          }
        }
        const afterIndex = sectionDays.findIndex((day) => day.id === afterDayId);
        const insertIndex = afterIndex >= 0 ? afterIndex + 1 : sectionDays.length;
        const previous = sectionDays[insertIndex - 1];
        const following = sectionDays[insertIndex];
        const sortOrder = previous && following ? (previous.sortOrder + following.sortOrder) / 2 : previous ? previous.sortOrder + 1 : following ? following.sortOrder - 1 : doc.days.length + 1;
        const title = text(input.title, `Nội dung ngày ${insertIndex + 1}`);
        const createdDay: CourseDay = { id: dayId, sectionId: section.id, unitId: unit?.id ?? null, courseDayNumber: doc.days.length + 1, unitDayNumber: insertIndex + 1, title, sortOrder, custom: true };
        doc.days.push(createdDay);
        [...sectionDays, createdDay].filter((day) => day.unitId === createdDay.unitId).sort((a, b) => a.sortOrder - b.sortOrder).forEach((day, index) => { day.unitDayNumber = index + 1; });
        const lessonId = uid("lesson");
        doc.lessons.push({ id: lessonId, unitId: unit?.id ?? null, courseDayId: dayId, lessonNumber: 1, lessonType: "OTHER", name: title, order: 1, pupilBookPage: "", activityBookPage: "", hasListening: false, hasSpeaking: false, hasReading: false, hasWriting: false, tasks: [], languageTargets: [], lessonOutcomes: [], lessonPlan: [], vocabulary: [], grammar: [], homework: "", materials: [] });
        resultId = dayId; message = "Đã thêm Course Day."; break;
      }
      case "updateDay": { const day = doc.days.find((item)=>item.id===input.id); if(!day) throw new Error("Không tìm thấy Course Day."); day.title=text(input.title,day.title); day.unitDayNumber=number(input.unitDayNumber,day.unitDayNumber??1); message="Đã lưu Course Day."; break; }
      case "moveDay": { if (swap(doc.days.sort((a,b)=>a.sortOrder-b.sortOrder), String(input.id), input.direction)) message="Đã đổi thứ tự Course Day."; break; }
      case "deleteDay": { const id=String(input.id); const lessonIds=new Set(doc.lessons.filter((lesson)=>lesson.courseDayId===id).map((lesson)=>lesson.id)); cascadeLessons(doc,lessonIds); doc.resources=doc.resources.filter((resource)=>resource.courseDayId!==id); doc.days=doc.days.filter((day)=>day.id!==id); message="Đã xóa Course Day."; break; }
      case "createLesson": { const day=doc.days.find((item)=>item.id===input.courseDayId); if(!day) throw new Error("Course Day không tồn tại."); const count=doc.lessons.filter((lesson)=>lesson.courseDayId===day.id).length; const id=uid("lesson"); doc.lessons.push({ id, unitId:day.unitId, courseDayId:day.id, lessonNumber:count+1, lessonType:text(input.lessonType,"OTHER"), name:text(input.name,`Lesson ${count+1}`), order:count+1, pupilBookPage:"", activityBookPage:"", hasListening:false, hasSpeaking:false, hasReading:false, hasWriting:false, tasks:[], languageTargets:[], lessonOutcomes:[], lessonPlan:[], vocabulary:[], grammar:[], homework:"", materials:[] }); resultId=id; message="Đã thêm lesson."; break; }
      case "updateLesson": { const lesson=doc.lessons.find((item)=>item.id===input.id); if(!lesson) throw new Error("Không tìm thấy lesson."); const patch=input.lesson as Partial<SyllabusLesson> | undefined; Object.assign(lesson,patch??{}); lesson.id=String(input.id); const day=doc.days.find((item)=>item.id===lesson.courseDayId); if(day) day.title=lesson.name; message="Đã lưu nội dung buổi học."; break; }
      case "moveLesson": { const lesson=doc.lessons.find((item)=>item.id===input.id); if(!lesson) throw new Error("Không tìm thấy lesson."); if(swap(doc.lessons.filter((item)=>item.courseDayId===lesson.courseDayId).sort((a,b)=>a.order-b.order),lesson.id,input.direction)) message="Đã đổi thứ tự lesson."; break; }
      case "deleteLesson": { const id=String(input.id); cascadeLessons(doc,new Set([id])); message="Đã xóa lesson."; break; }
      case "createResource": { const id=uid("resource"); const resource:LessonResource={ id, sectionId:text(input.sectionId)||null, unitId:text(input.unitId)||null, courseDayId:text(input.courseDayId)||null, lessonId:text(input.lessonId)||null, resourceType:String(input.resourceType||"EXTERNAL_LINK") as LessonResource["resourceType"], title:text(input.title,"Học liệu"), url:text(input.url), description:text(input.description), sortOrder:doc.resources.length+1, isActive:bool(input.isActive,true), openInNewTab:bool(input.openInNewTab,true) }; if(!/^https?:\/\//i.test(resource.url)) throw new Error("URL phải bắt đầu bằng http:// hoặc https://."); doc.resources.push(resource); resultId=id; message="Đã thêm học liệu."; break; }
      case "updateResource": { const resource=doc.resources.find((item)=>item.id===input.id); if(!resource) throw new Error("Không tìm thấy học liệu."); Object.assign(resource,input.resource as Partial<LessonResource>||{}); if(!/^https?:\/\//i.test(resource.url)) throw new Error("URL phải bắt đầu bằng http:// hoặc https://."); message="Đã lưu học liệu."; break; }
      case "moveResource": { if(swap(doc.resources.sort((a,b)=>a.sortOrder-b.sortOrder),String(input.id),input.direction)) message="Đã đổi thứ tự học liệu."; break; }
      case "deleteResource": { doc.resources=doc.resources.filter((item)=>item.id!==input.id); message="Đã xóa học liệu."; break; }
      case "upsertExercise": { const lesson=doc.lessons.find((item)=>item.id===input.lessonId); if(!lesson) throw new Error("Không tìm thấy buổi học."); const payload=input.exercise as Record<string,unknown>; const skill=text(payload?.skill); const kind=text(payload?.kind); if(!skill||!kind) throw new Error("Đề bài không hợp lệ."); let exercise=doc.exercises.find((item)=>item.id===input.exerciseId && item.lessonId===lesson.id); if(exercise){ exercise.skill=skill; exercise.kind=kind; exercise.title=text(payload.title,kind); exercise.payload={...payload,id:exercise.id}; } else { const id=uid("exercise"); exercise={id,lessonId:lesson.id,skill,kind,title:text(payload.title,kind),sortOrder:doc.exercises.filter((item)=>item.lessonId===lesson.id).length+1,payload:{...payload,id}}; doc.exercises.push(exercise); } resultId=exercise.id; message="Đã lưu bài tập."; break; }
      case "deleteExercise": { doc.exercises=doc.exercises.filter((item)=>!(item.id===input.exerciseId&&item.lessonId===input.lessonId)); message="Đã xóa bài tập."; break; }
      case "upsertActivity": {
        const lesson = doc.lessons.find((item) => item.id === input.lessonId);
        if (!lesson) throw new Error("Không tìm thấy buổi học.");
        const incoming = structuredClone(input.activity) as GameActivity;
        if (!incoming || !activityEngineTypes.includes(incoming.engineType)) throw new Error("Loại game không hợp lệ.");
        const stamp = new Date().toISOString();
        const existing = doc.activities.find((item) => item.id === input.activityId && item.lessonId === lesson.id);
        const activity: GameActivity = {
          ...incoming,
          id: existing?.id ?? uid("activity"),
          lessonId: lesson.id,
          sortOrder: existing?.sortOrder ?? doc.activities.filter((item) => item.lessonId === lesson.id).length + 1,
          createdAt: existing?.createdAt ?? stamp,
          updatedAt: stamp,
        };
        const errors = validateActivity(activity);
        if (errors.length) throw new Error(errors[0]);
        if (existing) Object.assign(existing, activity); else doc.activities.push(activity);
        resultId = activity.id;
        message = "Đã lưu game tương tác.";
        break;
      }
      case "deleteActivity": {
        doc.activities = doc.activities.filter((item) => !(item.id === input.activityId && item.lessonId === input.lessonId));
        message = "Đã xóa game tương tác.";
        break;
      }
      case "seedActivities": {
        const lesson = doc.lessons.find((item) => item.id === input.lessonId);
        if (!lesson) throw new Error("Không tìm thấy buổi học.");
        const existingTypes = new Set(doc.activities.filter((item) => item.lessonId === lesson.id).map((item) => item.engineType));
        let order = doc.activities.filter((item) => item.lessonId === lesson.id).length + 1;
        for (const engineType of activityEngineTypes) {
          if (!existingTypes.has(engineType)) doc.activities.push(demoActivity(lesson.id, engineType, order++));
        }
        message = "Đã tạo bộ 12 game mẫu.";
        break;
      }
      default: throw new Error("Thao tác syllabus không được hỗ trợ.");
    }

    normalize(doc);
    await this.ctx.storage.put("document", doc);
    return { ok: true, message, document: doc, id: resultId };
  }
}

export function initialDocument(id: string) { return seedDocuments().find((document) => document.meta.id === id); }

export function cloneSyllabus(source: SyllabusDocument, meta: SyllabusMeta): SyllabusDocument {
  const cloned=structuredClone(source); const sectionMap=new Map<string,string>(); const unitMap=new Map<string,string>(); const dayMap=new Map<string,string>(); const lessonMap=new Map<string,string>();
  cloned.sections.forEach((row)=>sectionMap.set(row.id,uid("section"))); cloned.units.forEach((row)=>unitMap.set(row.id,uid("unit"))); cloned.days.forEach((row)=>dayMap.set(row.id,uid("day"))); cloned.lessons.forEach((row)=>lessonMap.set(row.id,uid("lesson")));
  cloned.meta=meta;
  cloned.sections=cloned.sections.map((row)=>({...row,id:sectionMap.get(row.id)!,unitId:row.unitId?unitMap.get(row.unitId)??null:null}));
  cloned.units=cloned.units.map((row)=>({...row,id:unitMap.get(row.id)!,sectionId:row.sectionId?sectionMap.get(row.sectionId)??null:null}));
  cloned.days=cloned.days.map((row)=>({...row,id:dayMap.get(row.id)!,sectionId:sectionMap.get(row.sectionId)!,unitId:row.unitId?unitMap.get(row.unitId)??null:null}));
  cloned.lessons=cloned.lessons.map((row)=>({...row,id:lessonMap.get(row.id)!,courseDayId:dayMap.get(row.courseDayId)!,unitId:row.unitId?unitMap.get(row.unitId)??null:null}));
  cloned.resources=cloned.resources.map((row)=>({...row,id:uid("resource"),sectionId:row.sectionId?sectionMap.get(row.sectionId)??null:null,unitId:row.unitId?unitMap.get(row.unitId)??null:null,courseDayId:row.courseDayId?dayMap.get(row.courseDayId)??null:null,lessonId:row.lessonId?lessonMap.get(row.lessonId)??null:null}));
  cloned.exercises=cloned.exercises.map((row)=>{const id=uid("exercise");return {...row,id,lessonId:lessonMap.get(row.lessonId)!,payload:{...row.payload,id}}});
  cloned.activities=(cloned.activities??[]).map((row)=>({...row,id:uid("activity"),lessonId:lessonMap.get(row.lessonId)!,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
  normalize(cloned); return cloned;
}
