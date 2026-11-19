"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Headphones, MessageCircle, PenLine } from "lucide-react";

import { LivePreview } from "@/app/(app)/syllabus/exercises/live-preview";
import type { Exercise } from "@/app/(app)/syllabus/exercises/types";
import { VocabCards } from "@/app/(app)/syllabus/vocab-cards";
import { cn } from "@/lib/utils";
import type { PortalSyllabusDay, PortalSyllabusDetail, PortalSyllabusSection } from "@/lib/portal-syllabus";

type Target = "overview" | `unit-${string}` | `day-${string}`;

const dayCache = new Map<string, PortalSyllabusDay>();
const exerciseCache = new Map<string, Exercise>();

function query(studentId?: string | null) {
  return studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
}

function parseHash(hash: string, sections: PortalSyllabusSection[]): Target {
  const value = hash.replace(/^#/, "");
  if (value.startsWith("unit-") && sections.some((section) => section.id === value.slice(5))) {
    return value as `unit-${string}`;
  }
  if (value.startsWith("day-") && sections.some((section) => section.days.some((day) => day.id === value.slice(4)))) {
    return value as `day-${string}`;
  }
  return "overview";
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function TextBlock({ title, value }: { title: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </section>
  );
}

export function PortalSyllabusViewer({
  syllabus,
  studentId,
}: {
  syllabus: PortalSyllabusDetail;
  studentId?: string | null;
}) {
  const [active, setActive] = useState<Target>("overview");
  const [day, setDay] = useState<PortalSyllabusDay | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [exerciseError, setExerciseError] = useState<string | null>(null);
  const [loadingExercise, setLoadingExercise] = useState(false);

  useEffect(() => {
    const apply = () => setActive(parseHash(window.location.hash, syllabus.sections));
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [syllabus.sections]);

  function select(target: Target) {
    setActive(target);
    setExercise(null);
    setExerciseError(null);
    window.history.replaceState(null, "", `#${target === "overview" ? "overview" : target}`);
  }

  const dayId = active.startsWith("day-") ? active.slice(4) : null;

  useEffect(() => {
    if (!dayId) {
      setDay(null);
      setDayError(null);
      setLoadingDay(false);
      return;
    }
    const cached = dayCache.get(`${syllabus.id}:${dayId}`);
    if (cached) {
      setDay(cached);
      setDayError(null);
      setLoadingDay(false);
      return;
    }
    let cancelled = false;
    setLoadingDay(true);
    setDayError(null);
    fetch(`/api/portal/v1/syllabus/${syllabus.id}/days/${dayId}${query(studentId)}`)
      .then(async (response) => {
        const payload = await response.json() as PortalSyllabusDay & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Không tải được buổi học.");
        return payload as PortalSyllabusDay;
      })
      .then((data) => {
        if (cancelled) return;
        dayCache.set(`${syllabus.id}:${dayId}`, data);
        setDay(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setDayError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDay(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dayId, studentId, syllabus.id]);

  const unit = useMemo(
    () => (active.startsWith("unit-") ? syllabus.sections.find((section) => section.id === active.slice(5)) ?? null : null),
    [active, syllabus.sections],
  );

  async function openExercise(exerciseId: string) {
    const key = `${syllabus.id}:${exerciseId}`;
    const cached = exerciseCache.get(key);
    if (cached) {
      setExercise(cached);
      setExerciseError(null);
      return;
    }
    setLoadingExercise(true);
    setExerciseError(null);
    try {
      const response = await fetch(`/api/portal/v1/syllabus/${syllabus.id}/exercises/${exerciseId}${query(studentId)}`);
      const payload = await response.json() as Exercise & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Không tải được bài tập.");
      exerciseCache.set(key, payload as Exercise);
      setExercise(payload as Exercise);
    } catch (error) {
      setExerciseError(error instanceof Error ? error.message : "Không tải được bài tập.");
    } finally {
      setLoadingExercise(false);
    }
  }

  return (
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-6">
        <label className="block p-3 lg:hidden">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">Mục lục</span>
          <select
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={active}
            onChange={(event) => select(event.target.value as Target)}
          >
            <option value="overview">Tổng quan</option>
            {syllabus.sections.map((section) => (
              <optgroup key={section.id} label={section.title}>
                <option value={`unit-${section.id}`}>{section.title}</option>
                {section.days.map((item) => (
                  <option key={item.id} value={`day-${item.id}`}>
                    Day {item.number} : {item.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <nav className="hidden max-h-[calc(100dvh-10rem)] overflow-y-auto p-2 lg:block" aria-label="Mục lục syllabus">
          <button
            type="button"
            onClick={() => select("overview")}
            className={cn(
              "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm",
              active === "overview" ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-50",
            )}
          >
            Tổng quan
          </button>
          {syllabus.sections.map((section) => (
            <UnitBranch key={section.id} section={section} active={active} onSelect={select} />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-4">
        {active === "overview" ? <OverviewPane syllabus={syllabus} onSelect={select} /> : null}
        {unit ? <UnitPane section={unit} onSelect={select} /> : null}
        {dayId ? (
          <DayPane
            day={day}
            loading={loadingDay}
            error={dayError}
            exercise={exercise}
            exerciseError={exerciseError}
            loadingExercise={loadingExercise}
            onOpenExercise={openExercise}
            onCloseExercise={() => {
              setExercise(null);
              setExerciseError(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function UnitBranch({
  section,
  active,
  onSelect,
}: {
  section: PortalSyllabusSection;
  active: Target;
  onSelect: (target: Target) => void;
}) {
  const [open, setOpen] = useState(true);
  const unitId = `unit-${section.id}` as const;
  const unitActive = active === unitId || section.days.some((day) => active === `day-${day.id}`);

  return (
    <div className="mt-1">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700"
          aria-label={open ? "Thu gọn" : "Mở"}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect(unitId)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm",
            active === unitId ? "bg-brand-50 font-medium text-brand-700" : unitActive ? "font-medium text-slate-800" : "text-slate-700 hover:bg-slate-50",
          )}
        >
          {section.title}
        </button>
      </div>
      {open ? (
        <ul className="ml-4 border-l border-slate-200 pl-2">
          {section.days.map((day) => {
            const id = `day-${day.id}` as const;
            return (
              <li key={day.id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={cn(
                    "flex w-full truncate rounded-lg px-2 py-1.5 text-left text-sm",
                    active === id ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  Day {day.number} : {day.title}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function OverviewPane({
  syllabus,
  onSelect,
}: {
  syllabus: PortalSyllabusDetail;
  onSelect: (target: Target) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold text-slate-500">{syllabus.code || "Syllabus"}</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{syllabus.name}</h2>
        {syllabus.levelLabel ? <p className="mt-1 text-sm text-slate-500">{syllabus.levelLabel}</p> : null}
        {syllabus.description ? <p className="mt-3 max-w-[65ch] text-sm leading-6 text-slate-600">{syllabus.description}</p> : null}
        {syllabus.classNames.length ? (
          <p className="mt-3 text-sm text-slate-500">Lớp: {syllabus.classNames.join(", ")}</p>
        ) : null}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Chương trình</h3>
        <ol className="mt-3 space-y-2">
          {syllabus.sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(`unit-${section.id}`)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{section.title}</span>
                <span className="text-xs text-slate-400">{section.days.length} buổi</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function UnitPane({
  section,
  onSelect,
}: {
  section: PortalSyllabusSection;
  onSelect: (target: Target) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{section.type}</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{section.title}</h2>
        {section.topic ? <p className="mt-1 text-sm text-slate-500">{section.topic}</p> : null}
        {section.overview ? <p className="mt-3 max-w-[65ch] text-sm leading-6 text-slate-600">{section.overview}</p> : null}
        {section.objectives.length ? (
          <div className="mt-4">
            <ListBlock title="Mục tiêu" items={section.objectives} />
          </div>
        ) : null}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Các buổi</h3>
        <ul className="mt-3 space-y-1">
          {section.days.map((day) => (
            <li key={day.id}>
              <button
                type="button"
                onClick={() => onSelect(`day-${day.id}`)}
                className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Day {day.number} : {day.title}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DayPane({
  day,
  loading,
  error,
  exercise,
  exerciseError,
  loadingExercise,
  onOpenExercise,
  onCloseExercise,
}: {
  day: PortalSyllabusDay | null;
  loading: boolean;
  error: string | null;
  exercise: Exercise | null;
  exerciseError: string | null;
  loadingExercise: boolean;
  onOpenExercise: (id: string) => void;
  onCloseExercise: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (error) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p>;
  }
  if (!day) return null;

  const skills = [
    [day.hasListening, Headphones, "Listening"],
    [day.hasSpeaking, MessageCircle, "Speaking"],
    [day.hasReading, BookOpen, "Reading"],
    [day.hasWriting, PenLine, "Writing"],
  ] as const;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold text-slate-500">{day.heading}</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{day.name}</h2>
        {(day.pupilBookPage || day.activityBookPage) ? (
          <p className="mt-2 text-sm text-slate-500">
            {day.pupilBookPage ? `Pupil Book ${day.pupilBookPage}` : ""}
            {day.pupilBookPage && day.activityBookPage ? " · " : ""}
            {day.activityBookPage ? `Activity Book ${day.activityBookPage}` : ""}
          </p>
        ) : null}
        {skills.some(([enabled]) => enabled) ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {skills
              .filter(([enabled]) => enabled)
              .map(([, Icon, label]) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <Icon className="size-4 text-brand-600" />
                  {label}
                </span>
              ))}
          </div>
        ) : null}
      </section>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <ListBlock title="Detail" items={day.tasks} />
        {day.vocabulary.length ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Từ vựng</h3>
            <div className="mt-2">
              <VocabCards value={day.vocabulary} empty="—" />
            </div>
          </section>
        ) : null}
        <ListBlock title="Ngữ pháp" items={day.grammar} />
        <ListBlock title="Outcomes" items={day.outcomes} />
        <ListBlock title="Lesson plan" items={day.lessonPlan.map((step, index) => `Step ${index + 1}: ${step}`)} />
        <TextBlock title="Homework" value={day.homework} />
        {day.materials.length ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Học liệu</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {day.materials.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:border-brand-300 hover:bg-brand-50"
                >
                  <ExternalLink className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span className="font-medium text-brand-700">{item.title || item.url}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
        {day.exercises.length ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bài tập tương tác</h3>
            <ul className="mt-2 space-y-2">
              {day.exercises.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenExercise(item.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="font-medium text-slate-800">{item.title}</span>
                    <span className="text-xs text-slate-400">
                      {item.skill} · {item.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {loadingExercise ? <p className="mt-3 text-sm text-slate-500">Đang tải bài tập...</p> : null}
            {exerciseError ? <p className="mt-3 text-sm text-red-700">{exerciseError}</p> : null}
            {exercise ? (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{exercise.title}</p>
                  <button type="button" onClick={onCloseExercise} className="text-sm font-medium text-brand-700">
                    Đóng
                  </button>
                </div>
                <LivePreview exercise={exercise} />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
