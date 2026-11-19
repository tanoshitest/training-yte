"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  createCourseDay,
  createSection,
  deleteCourseDay,
  deleteSection,
  moveCourseDay,
  moveSection,
  updateCurriculumLesson,
  updateSection,
} from "../curriculum-actions";
import { ExerciseBuilder } from "../exercises/builder";
import { parseMaterials } from "../materials";
import { MaterialsInput } from "../materials-input";
import { RepeatableList } from "../repeatable-list";
import { stringList, type VocabCard } from "../vocab";
import { VocabInput } from "../vocab-input";

type LessonForm = {
  id: string;
  name: string;
  lessonType: string;
  pupilBookPage: string | null;
  activityBookPage: string | null;
  hasListening: boolean;
  hasSpeaking: boolean;
  hasReading: boolean;
  hasWriting: boolean;
  tasks: unknown;
  languageTargets: unknown;
  lessonOutcomes: unknown;
  lessonPlan: string | null;
  homework: string | null;
  materials: unknown;
};

const formCache = new Map<string, LessonForm>();
const vocabCache = new Map<string, VocabCard[]>();

function LessonVocab({ lessonId }: { lessonId: string }) {
  const [cards, setCards] = useState<VocabCard[] | undefined>(vocabCache.get(lessonId));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (vocabCache.has(lessonId)) {
      setCards(vocabCache.get(lessonId));
      return;
    }
    let live = true;
    fetch(`/api/syllabus/lessons/${lessonId}?part=vocab`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((payload) => {
        const data = payload as VocabCard[];
        if (!live) return;
        vocabCache.set(lessonId, data);
        setCards(data);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [lessonId]);

  if (error) return <p className="text-sm text-red-600">Không tải được từ vựng.</p>;
  if (!cards) return <p className="text-sm text-slate-400">Đang tải từ vựng...</p>;
  return (
    <>
      <input type="hidden" name="vocabReady" value="1" />
      <VocabInput defaultValue={cards} />
    </>
  );
}

type LessonStub = {
  id: string;
  name: string;
  order: number;
  lessonNumber: number | null;
  _count: { sessions: number };
};

export type CurriculumDay = {
  id: string;
  courseDayNumber: number;
  unitDayNumber: number | null;
  title: string | null;
  lessons: LessonStub[];
};

export type CurriculumSection = {
  id: string;
  type: string;
  title: string;
  sortOrder: number;
  unit: { id: string; unitNumber: number | null; topic: string | null; overview: string | null; learningObjectives: unknown } | null;
  courseDays: CurriculumDay[];
};

function textLines(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

function lessonName(title: string) {
  return title
    .replace(/^(Day|CLASS|HOME)\s+\d+\s*[·:]\s*/i, "")
    .replace(/^(MID[\s-]?TEST|FINAL[\s-]?TEST|MINI[\s-]?TEST|MINI\s*ĐỀ|COURSE\s+FINAL|COURSE\s+REVIEW)\s*[·:\-–]\s*/i, "")
    .replace(/\s*[+·]\s*(Test|Mini đề)\b.*$/i, "")
    .trim();
}

export function dayHeading(day: CurriculumDay, index: number) {
  const number = day.courseDayNumber || day.unitDayNumber || index + 1;
  const title = lessonName(day.title || day.lessons[0]?.name || "");
  return title ? `Day ${number} : ${title}` : `Day ${number}`;
}

function MoveButtons({ action, fields, onSuccess }: { action: typeof moveSection; fields: Record<string, string>; onSuccess?: () => void }) {
  return (
    <div className="flex gap-1">
      <ActionForm action={action} onSuccess={onSuccess}><input type="hidden" name="syllabusId" value={fields.syllabusId} /><input type="hidden" name="id" value={fields.id} /><input type="hidden" name="direction" value="up" /><SubmitButton variant="ghost" size="icon" title="Move up"><ChevronUp className="h-4 w-4" /></SubmitButton></ActionForm>
      <ActionForm action={action} onSuccess={onSuccess}><input type="hidden" name="syllabusId" value={fields.syllabusId} /><input type="hidden" name="id" value={fields.id} /><input type="hidden" name="direction" value="down" /><SubmitButton variant="ghost" size="icon" title="Move down"><ChevronDown className="h-4 w-4" /></SubmitButton></ActionForm>
    </div>
  );
}

function LessonEditor({
  syllabusId,
  lessonId,
  day,
  dayIndex,
  onChanged,
}: {
  syllabusId: string;
  lessonId: string;
  day: CurriculumDay;
  dayIndex: number;
  onChanged: () => void;
}) {
  const [lesson, setLesson] = useState<LessonForm | null>(formCache.get(lessonId) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (formCache.has(lessonId)) {
      setLesson(formCache.get(lessonId) ?? null);
      return;
    }
    let live = true;
    fetch(`/api/syllabus/lessons/${lessonId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((payload) => {
        const row = payload as LessonForm;
        if (!live) return;
        formCache.set(lessonId, row);
        setLesson(row);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [lessonId]);

  if (error) return <p className="px-3 py-4 text-sm text-red-600">Không tải được buổi.</p>;
  if (!lesson) return <p className="px-3 py-4 text-sm text-slate-400">Đang tải buổi...</p>;

  return (
    <div>
      <ActionForm
        action={updateCurriculumLesson}
        onSuccess={() => {
          formCache.delete(lessonId);
          vocabCache.delete(lessonId);
          onChanged();
        }}
        className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
      <input type="hidden" name="syllabusId" value={syllabusId} />
      <input type="hidden" name="id" value={lesson.id} />
      <input type="hidden" name="unitDayNumber" value={day.unitDayNumber ?? dayIndex + 1} />
      <input type="hidden" name="lessonType" value={lesson.lessonType} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
        <Field label="Tên bài học" className="w-52 max-w-full shrink-0">
          <Input name="dayTitle" required defaultValue={day.title || lesson.name} placeholder="Vocabulary" />
        </Field>
        <div className="flex h-9 flex-nowrap items-center gap-4">
          {([["hasListening", "Listening", lesson.hasListening], ["hasSpeaking", "Speaking", lesson.hasSpeaking], ["hasReading", "Reading", lesson.hasReading], ["hasWriting", "Writing", lesson.hasWriting]] as const).map(([name, label, checked]) => (
            <label key={name} className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700">
              <input type="checkbox" name={name} defaultChecked={checked} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Field label="Pupil book">
        <Input name="pupilBookPage" defaultValue={lesson.pupilBookPage ?? ""} />
      </Field>
      <Field label="Activity book">
        <Input name="activityBookPage" defaultValue={lesson.activityBookPage ?? ""} />
      </Field>
      <Field label="Detail" className="sm:col-span-2 lg:col-span-4">
        <Input name="tasks" defaultValue={textLines(lesson.tasks)} placeholder="Teach vocabulary, do exercise..." />
      </Field>
      <Field label="Outcomes" className="sm:col-span-2 lg:col-span-4">
        <Textarea name="lessonOutcomes" rows={3} defaultValue={textLines(lesson.lessonOutcomes)} />
      </Field>
      <Field label="Từ vựng" className="sm:col-span-2 lg:col-span-4">
        <LessonVocab lessonId={lessonId} />
      </Field>
      <Field label="Ngữ pháp" className="sm:col-span-2 lg:col-span-4">
        <RepeatableList name="languageTargets" defaultValue={stringList(lesson.languageTargets)} addLabel="Thêm chủ điểm" placeholder="This / These, Where questions" />
      </Field>
      <Field label="Lesson plan" className="sm:col-span-2 lg:col-span-4">
        <RepeatableList name="lessonPlanStep" defaultValue={stringList(lesson.lessonPlan)} addLabel="Thêm step" placeholder="Warm-up: greet and review" numbered />
      </Field>
      <Field label="Homework" className="sm:col-span-2 lg:col-span-4">
        <Textarea name="homework" rows={2} defaultValue={lesson.homework ?? ""} />
      </Field>
      <Field label="Teaching material" className="sm:col-span-2 lg:col-span-4">
        <MaterialsInput defaultValue={parseMaterials(lesson.materials)} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton size="sm">Lưu</SubmitButton>
      </div>
    </ActionForm>
      <div className="border-t border-slate-100 p-3">
        <ExerciseBuilder lessonId={lessonId} />
      </div>
    </div>
  );
}

function DayPane({
  syllabusId,
  day,
  dayIndex,
  onChanged,
}: {
  syllabusId: string;
  day: CurriculumDay;
  dayIndex: number;
  onChanged: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-3">
        <h2 className="min-w-0 flex-1 font-semibold">{dayHeading(day, dayIndex)}</h2>
        <MoveButtons action={moveCourseDay} fields={{ syllabusId, id: day.id }} onSuccess={onChanged} />
        <ActionForm action={deleteCourseDay} onSuccess={onChanged}>
          <input type="hidden" name="syllabusId" value={syllabusId} />
          <input type="hidden" name="id" value={day.id} />
          <SubmitButton variant="ghost" size="icon" confirm="Xóa ngày này?">
            <Trash2 className="h-4 w-4 text-red-600" />
          </SubmitButton>
        </ActionForm>
      </div>
      {day.lessons.map((lesson) => (
        <LessonEditor
          key={lesson.id}
          syllabusId={syllabusId}
          lessonId={lesson.id}
          day={day}
          dayIndex={dayIndex}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}

function UnitPane({
  syllabusId,
  section,
  onChanged,
}: {
  syllabusId: string;
  section: CurriculumSection;
  onChanged: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">
            {section.title} <span className="ml-2 text-xs font-medium text-slate-400">{section.type} · {section.courseDays.length} days</span>
          </h2>
          <ActionForm action={updateSection} onSuccess={onChanged} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="syllabusId" value={syllabusId} /><input type="hidden" name="id" value={section.id} />
            <Field label="Type">
              <Select name="type" defaultValue={section.type}>
                <option>UNIT</option><option>REVIEW</option><option>PROJECT</option><option>MIDTERM_TEST</option><option>FINAL_TEST</option><option>OTHER</option>
              </Select>
            </Field>
            <Field label="Title">
              <Input name="title" defaultValue={section.title} required />
            </Field>
            {section.type === "UNIT" ? (
              <>
                <Field label="Unit number">
                  <Input name="unitNumber" type="number" min={1} defaultValue={section.unit?.unitNumber ?? ""} />
                </Field>
                <Field label="Topic">
                  <Input name="topic" defaultValue={section.unit?.topic ?? ""} />
                </Field>
                <Field label="Overview" className="sm:col-span-2">
                  <Textarea name="overview" rows={3} defaultValue={section.unit?.overview ?? ""} />
                </Field>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <SubmitButton size="sm">Save section</SubmitButton>
            </div>
          </ActionForm>
        </div>
        <MoveButtons action={moveSection} fields={{ syllabusId, id: section.id }} onSuccess={onChanged} />
        <ActionForm action={deleteSection} onSuccess={onChanged}>
          <input type="hidden" name="syllabusId" value={syllabusId} />
          <input type="hidden" name="id" value={section.id} />
          <SubmitButton variant="danger" size="icon" confirm="Delete this section and unused child content?"><Trash2 className="h-4 w-4" /></SubmitButton>
        </ActionForm>
      </div>
      <div className="p-4">
        <ActionForm action={createCourseDay} resetOnSuccess onSuccess={onChanged} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <input type="hidden" name="syllabusId" value={syllabusId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <Field label="Day" className="max-w-24">
            <Input name="unitDayNumber" type="number" min={1} placeholder={String(section.courseDays.length + 1)} />
          </Field>
          <Field label="Tiêu đề" className="max-w-sm">
            <Input name="title" placeholder="Vocabulary 1" />
          </Field>
          <SubmitButton size="sm"><Plus className="h-4 w-4" /> Thêm Day</SubmitButton>
        </ActionForm>
      </div>
    </section>
  );
}

function AddSectionForm({ syllabusId, onChanged }: { syllabusId: string; onChanged: () => void }) {
  return (
    <ActionForm action={createSection} resetOnSuccess onSuccess={onChanged} className="grid gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4 sm:grid-cols-[11rem_1fr_auto]">
      <input type="hidden" name="syllabusId" value={syllabusId} />
      <Field label="Section type"><Select name="type" defaultValue="UNIT"><option>UNIT</option><option>REVIEW</option><option>PROJECT</option><option>MIDTERM_TEST</option><option>FINAL_TEST</option><option>OTHER</option></Select></Field>
      <Field label="Section title"><Input name="title" required placeholder="Unit 1 - Topic" /></Field>
      <div className="flex items-end"><SubmitButton><Plus className="h-4 w-4" /> Add section</SubmitButton></div>
    </ActionForm>
  );
}

export function CurriculumBuilder({
  syllabusId,
  sections,
  onChanged,
  view,
}: {
  syllabusId: string;
  sections: CurriculumSection[];
  onChanged: () => void;
  view: "overview" | `unit-${string}` | `day-${string}`;
}) {
  if (view === "overview") {
    return (
      <div className="space-y-4">
        <AddSectionForm syllabusId={syllabusId} onChanged={onChanged} />
        {sections.length === 0 ? <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">No curriculum sections yet.</p> : null}
      </div>
    );
  }

  if (view.startsWith("unit-")) {
    const section = sections.find((item) => item.id === view.slice(5));
    if (!section) return <p className="rounded-xl border bg-white p-8 text-sm text-slate-500">Không tìm thấy unit.</p>;
    return <UnitPane syllabusId={syllabusId} section={section} onChanged={onChanged} />;
  }

  const dayId = view.slice(4);
  for (const section of sections) {
    const dayIndex = section.courseDays.findIndex((day) => day.id === dayId);
    if (dayIndex === -1) continue;
    return (
      <DayPane
        syllabusId={syllabusId}
        day={section.courseDays[dayIndex]!}
        dayIndex={dayIndex}
        onChanged={onChanged}
      />
    );
  }
  return <p className="rounded-xl border bg-white p-8 text-sm text-slate-500">Không tìm thấy day.</p>;
}
