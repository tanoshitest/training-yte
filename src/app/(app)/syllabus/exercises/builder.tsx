"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

import { deleteLessonExercise, upsertLessonExercise } from "../exercise-actions";
import { ExerciseEditor } from "./editor";
import { ListeningEditor } from "./listening-editor";
import { createListening } from "./listening-samples";
import { createReading } from "./samples";
import { SpeakingEditor } from "./speaking-editor";
import { createSpeaking } from "./speaking-samples";
import { OtherEditor } from "./other-editor";
import { createOther } from "./other-samples";
import { WritingEditor } from "./writing-editor";
import { createWriting } from "./writing-samples";
import { openExercisePreview } from "./preview-store";
import {
  kindLabel,
  kindLabelFor,
  LISTENING_KINDS,
  OTHER_KINDS,
  READING_KINDS,
  SKILLS,
  SPEAKING_KINDS,
  WRITING_KINDS,
  skillLabel,
  type Exercise,
  type ExerciseStub,
  type ListeningKind,
  type OtherKind,
  type ReadingKind,
  type SkillId,
  type SpeakingKind,
  type WritingKind,
} from "./types";

type ReadySkill = "READING" | "LISTENING" | "WRITING" | "SPEAKING" | "OTHER";

type Step =
  | { name: "list" }
  | { name: "kind"; skill: ReadySkill }
  | { name: "edit"; draft: Exercise; isNew: boolean; exerciseId?: string };

const listCache = new Map<string, ExerciseStub[]>();

function kindsFor(skill: ReadySkill) {
  if (skill === "LISTENING") return LISTENING_KINDS;
  if (skill === "SPEAKING") return SPEAKING_KINDS;
  if (skill === "WRITING") return WRITING_KINDS;
  if (skill === "OTHER") return OTHER_KINDS;
  return READING_KINDS;
}

function createDraft(skill: ReadySkill, kind: string): Exercise {
  if (skill === "LISTENING") return createListening(kind as ListeningKind);
  if (skill === "SPEAKING") return createSpeaking(kind as SpeakingKind);
  if (skill === "WRITING") return createWriting(kind as WritingKind);
  if (skill === "OTHER") return createOther(kind as OtherKind);
  return createReading(kind as ReadingKind);
}

function SkillEditor({
  draft,
  isNew,
  onChange,
}: {
  draft: Exercise;
  isNew: boolean;
  onChange: (draft: Exercise, isNew: boolean) => void;
}) {
  if (draft.skill === "LISTENING") {
    return <ListeningEditor value={draft} onChange={(next) => onChange(next, isNew)} />;
  }
  if (draft.skill === "SPEAKING") {
    return <SpeakingEditor value={draft} onChange={(next) => onChange(next, isNew)} />;
  }
  if (draft.skill === "WRITING") {
    return <WritingEditor value={draft} onChange={(next) => onChange(next, isNew)} />;
  }
  if (draft.skill === "OTHER") {
    return <OtherEditor value={draft} onChange={(next) => onChange(next, isNew)} />;
  }
  return <ExerciseEditor value={draft} onChange={(next) => onChange(next, isNew)} />;
}

function stopEnterSubmit(event: KeyboardEvent) {
  if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
    event.preventDefault();
  }
}

async function fetchList(lessonId: string) {
  const res = await fetch(`/api/syllabus/lessons/${lessonId}/exercises`);
  if (!res.ok) throw new Error("list");
  return (await res.json()) as ExerciseStub[];
}

async function fetchDetail(lessonId: string, exerciseId: string) {
  const res = await fetch(`/api/syllabus/lessons/${lessonId}/exercises/${exerciseId}`);
  if (!res.ok) throw new Error("detail");
  return (await res.json()) as Exercise;
}

export function ExerciseBuilder({ lessonId }: { lessonId: string }) {
  const [items, setItems] = useState<ExerciseStub[] | null>(listCache.get(lessonId) ?? null);
  const [step, setStep] = useState<Step>({ name: "list" });
  const [skillOpen, setSkillOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep({ name: "list" });
    setSkillOpen(false);
    setError(null);
    if (listCache.has(lessonId)) {
      setItems(listCache.get(lessonId) ?? null);
      return;
    }
    let live = true;
    setItems(null);
    fetchList(lessonId)
      .then((rows) => {
        if (!live) return;
        listCache.set(lessonId, rows);
        setItems(rows);
      })
      .catch(() => {
        if (live) setError("Không tải được danh sách bài tập.");
      });
    return () => {
      live = false;
    };
  }, [lessonId]);

  function remember(rows: ExerciseStub[]) {
    listCache.set(lessonId, rows);
    setItems(rows);
  }

  async function saveDraft(draft: Exercise, exerciseId?: string) {
    setBusy(true);
    setError(null);
    const result = await upsertLessonExercise({ lessonId, exerciseId, exercise: draft });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const stub: ExerciseStub = {
      id: result.id,
      skill: draft.skill,
      kind: draft.kind,
      title: draft.title?.trim() || kindLabel(draft),
      sortOrder: items?.find((item) => item.id === result.id)?.sortOrder ?? (items?.length ?? 0) + 1,
    };
    const current = items ?? [];
    remember(
      current.some((item) => item.id === result.id)
        ? current.map((item) => (item.id === result.id ? stub : item))
        : [...current, stub],
    );
    setStep({ name: "list" });
  }

  async function openEdit(exerciseId: string) {
    setBusy(true);
    setError(null);
    try {
      const draft = await fetchDetail(lessonId, exerciseId);
      setStep({ name: "edit", draft, isNew: false, exerciseId });
    } catch {
      setError("Không tải được đề bài.");
    } finally {
      setBusy(false);
    }
  }

  async function previewItem(item: ExerciseStub) {
    setBusy(true);
    setError(null);
    try {
      openExercisePreview(await fetchDetail(lessonId, item.id));
    } catch {
      setError("Không tải được đề để preview.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(exerciseId: string) {
    if (!window.confirm("Xóa bài tập này?")) return;
    setBusy(true);
    setError(null);
    const result = await deleteLessonExercise({ lessonId, exerciseId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    remember((items ?? []).filter((item) => item.id !== exerciseId));
  }

  if (step.name === "edit") {
    return (
      <div className="space-y-4" onKeyDown={stopEnterSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setStep({ name: "list" })} className={buttonClass("ghost", "sm")}>
            <ArrowLeft className="h-4 w-4" />
            Danh sách bài tập
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openExercisePreview(step.draft)}
              className={buttonClass("outline", "sm")}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => saveDraft(step.draft, step.exerciseId)}
              className={buttonClass("primary", "sm")}
            >
              {busy ? "Đang lưu..." : "Xong"}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {skillLabel(step.draft.skill)} · {kindLabel(step.draft)}
          {step.isNew ? " — đề mẫu. Soạn bên dưới, bấm Preview để xem giao diện học sinh." : null}
        </p>
        <p className="text-xs text-slate-500">Bấm Xong để lưu bài tập.</p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <SkillEditor
          draft={step.draft}
          isNew={step.isNew}
          onChange={(draft, isNew) => setStep({ name: "edit", draft, isNew, exerciseId: step.exerciseId })}
        />
      </div>
    );
  }

  if (step.name === "kind") {
    const kinds = kindsFor(step.skill);
    return (
      <div className="space-y-4" onKeyDown={stopEnterSubmit}>
        <button
          type="button"
          onClick={() => {
            setSkillOpen(true);
            setStep({ name: "list" });
          }}
          className={buttonClass("ghost", "sm")}
        >
          <ArrowLeft className="h-4 w-4" />
          Chọn kỹ năng
        </button>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Chọn dạng {skillLabel(step.skill)}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Mỗi dạng mở đề mẫu để soạn. Bấm Preview khi muốn xem giao diện học sinh.
          </p>
        </div>
        <div className="grid gap-3">
          {kinds.map((kind, index) => (
            <button
              key={kind.id}
              type="button"
              onClick={() =>
                setStep({
                  name: "edit",
                  draft: createDraft(step.skill, kind.id),
                  isNew: true,
                })
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-300"
            >
              <p className="text-sm font-semibold text-slate-900">
                Dạng {index + 1}. {kind.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">{kind.hint}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" onKeyDown={stopEnterSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Bài tập tương tác</h3>
          <p className="mt-0.5 text-xs text-slate-500">Mỗi đề lưu riêng khi bấm Xong. Nút Lưu của Day không gửi bài tập.</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSkillOpen((open) => !open)}
            className={buttonClass("secondary", "sm")}
          >
            <Plus className="h-4 w-4" />
            Thêm bài tập tương tác
          </button>
          {skillOpen ? (
            <div className="absolute right-0 z-10 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  disabled={!skill.ready}
                  onClick={() => {
                    if (!skill.ready) return;
                    setSkillOpen(false);
                    setStep({ name: "kind", skill: skill.id as ReadySkill });
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {skill.label}
                  {skill.ready ? null : <span className="text-xs text-slate-400">Sắp có</span>}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {items === null ? (
        <p className="text-sm text-slate-400">Đang tải bài tập...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Chưa có đề. Bấm Thêm bài tập tương tác, chọn kỹ năng, rồi chọn dạng.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {skillLabel(item.skill as SkillId)} · {kindLabelFor(item.skill as SkillId, item.kind)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => previewItem(item)}
                className={buttonClass("outline", "sm")}
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => openEdit(item.id)}
                className={buttonClass("ghost", "sm")}
              >
                <Pencil className="h-4 w-4" />
                Sửa
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeItem(item.id)}
                className={buttonClass("ghost", "icon")}
                aria-label="Xóa đề"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
