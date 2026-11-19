/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Download, Eye, FileText, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";

import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { RepeatableList } from "@/app/(app)/syllabus/repeatable-list";
import { VocabInput } from "@/app/(app)/syllabus/vocab-input";
import { MaterialsInput } from "@/app/(app)/syllabus/materials-input";
import { ExerciseEditor } from "@/app/(app)/syllabus/exercises/editor";
import { ListeningEditor } from "@/app/(app)/syllabus/exercises/listening-editor";
import { SpeakingEditor } from "@/app/(app)/syllabus/exercises/speaking-editor";
import { WritingEditor } from "@/app/(app)/syllabus/exercises/writing-editor";
import { OtherEditor } from "@/app/(app)/syllabus/exercises/other-editor";
import { LivePreview } from "@/app/(app)/syllabus/exercises/live-preview";
import { createReading } from "@/app/(app)/syllabus/exercises/samples";
import { createListening } from "@/app/(app)/syllabus/exercises/listening-samples";
import { createSpeaking } from "@/app/(app)/syllabus/exercises/speaking-samples";
import { createWriting } from "@/app/(app)/syllabus/exercises/writing-samples";
import { createOther } from "@/app/(app)/syllabus/exercises/other-samples";
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
  type ListeningKind,
  type OtherKind,
  type ReadingKind,
  type SkillId,
  type SpeakingKind,
  type WritingKind,
} from "@/app/(app)/syllabus/exercises/types";
import { encodeLanguageMap, LANGUAGE_STAGES, languageMapValues } from "../language-map";
import type { CurriculumSection, CourseDay, LessonResource, SyllabusDocument, SyllabusLesson, SyllabusMeta, SyllabusUnit } from "../syllabus-types";
import html2canvas from "html2canvas-pro";
import { ActivityBuilder, ActivityPreviewApp, PortalActivityEmbed } from "./activity-games";

declare const api: (path: string, options?: RequestInit) => Promise<any>;
declare const state: { data: { syllabuses: any[] }; selectedSyllabus: string | null };
declare let adminSyllabusPage: () => string;
declare let activityPreviewPage: () => string;
declare let bindApp: () => void;
declare const render: () => void;

const sectionTypes = ["COURSE", "UNIT", "REVIEW", "PROJECT", "MIDTERM_TEST", "FINAL_TEST", "OTHER"];
const statuses = { DRAFT: "Nháp", ACTIVE: "Đang dùng", ARCHIVED: "Lưu trữ" } as const;
const interactiveExercisesEnabled = false;
const lessonPlanFields = ["NEW", "RECYCLE", "REUSE", "PHONICS", "Listening", "Speaking", "Reading", "Writing", "Song / Chant", "Audio", "Interactive Video"] as const;
const lessonPlanSkills = [
  ["hasListening", "Listening"],
  ["hasSpeaking", "Speaking"],
  ["hasReading", "Reading"],
  ["hasWriting", "Writing"],
] as const;
type LessonSkillKey = (typeof lessonPlanSkills)[number][0];
type Target = "overview" | `course-${string}` | `unit-${string}` | `day-${string}`;

function lessonPlanValue(items: string[], label: string, index: number) {
  const prefix = `${label}:`;
  const labeled = items.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (labeled) return labeled.slice(prefix.length).trim();
  const hasStructuredValues = items.some((item) => lessonPlanFields.some((field) => item.toLowerCase().startsWith(`${field.toLowerCase()}:`)));
  return hasStructuredValues ? "" : items[index] || "";
}

const SPEAKING_LEVELS = [
  { id: "1", label: "1 — RECOGNIZE", child: "Nhìn • chỉ • chọn • ghép • nhận diện", fallback: "Point to red." },
  { id: "2", label: "2 — RESPOND", child: "Phản hồi bằng hành động", fallback: "Stand up. / Touch the red ball. / Show me blue." },
  { id: "3", label: "3 — REPEAT", child: "Lặp word • chunk • sentence", fallback: "red → red ball → It’s red." },
  { id: "4", label: "4 — RESPOND WITH LANGUAGE", child: "Trả lời bằng từ/chunk/câu có hỗ trợ", fallback: "What color is it? → Red. → It’s red." },
  { id: "5", label: "5 — PRODUCE", child: "Chủ động sử dụng", fallback: "I see a red ball. / I like blue." },
] as const;

function speakingLevelExamples(raw: string) {
  const lines = raw.split(/\n/).map((item) => item.trim()).filter(Boolean);
  const parsed = SPEAKING_LEVELS.map((level) => {
    const found = lines.find((line) => new RegExp(`^L${level.id}\\s*:`).test(line));
    return found ? found.replace(/^L\d+\s*:\s*/, "") : "";
  });
  return parsed.some(Boolean) ? parsed : SPEAKING_LEVELS.map((level) => raw && level.id === "5" ? raw : level.fallback);
}

function SpeakingLevelsCell({ raw, currentLevel }: { raw: string; currentLevel?: number }) {
  const examples = speakingLevelExamples(raw);
  return (
    <table className="sy-speak-table">
      <thead>
        <tr>
          <th>Level</th>
          <th>Trẻ làm gì?</th>
          <th>Ví dụ</th>
        </tr>
      </thead>
      <tbody>
        {SPEAKING_LEVELS.map((level, index) => (
          <tr key={level.id} className={currentLevel === Number(level.id) ? "active" : undefined}>
            <th>{level.label}</th>
            <td>{level.child}</td>
            <td>
              <FitTextarea name={`speakingLevel:${level.id}`} defaultValue={examples[index]} placeholder={level.fallback} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function splitPlanMedia(raw: string) {
  const pipe = raw.match(/^([\s\S]*?)\s+\|\s+(\S+)\s*$/);
  if (pipe && /^(https?:\/\/|\/)/i.test(pipe[2])) return { text: pipe[1].trim(), url: pipe[2].trim() };
  const lines = raw.split(/\n/).map((item) => item.trim()).filter(Boolean);
  const url = lines.find((line) => /youtube\.com|youtu\.be|\.(mp3|wav|m4a|ogg|aac|mp4)(\?|$)|https?:\/\//i.test(line)) || "";
  return { text: lines.filter((line) => line !== url).join("\n") || (url ? "" : raw), url };
}

function packPlanMedia(text: string, url: string) {
  const nextText = text.trim();
  const nextUrl = url.trim();
  return nextText && nextUrl ? `${nextText} | ${nextUrl}` : nextText || nextUrl;
}

const PHONICS_DEMO_URL = "https://www.youtube.com/watch?v=y1r-T5QYAc4";

function parsePhonicsPlan(raw: string, unit?: SyllabusUnit) {
  const media = splitPlanMedia(raw);
  const text = media.text || raw;
  const letters = unit?.phonicsFocus?.length
    ? unit.phonicsFocus
    : (text.split(/[.]/)[0] || "").split(/[·,]/).map((item) => item.trim()).filter(Boolean);
  return {
    letters,
    store: text || letters.join(" · "),
    url: media.url || unit?.phonicsVideoUrl || PHONICS_DEMO_URL,
  };
}

function isAudioFile(url: string) {
  return /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(url);
}

function playSpeech(text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text.split("/")[0].trim());
  speech.lang = "en-GB";
  speech.rate = 0.85;
  window.speechSynthesis.speak(speech);
}

function PlanAudioCell({ text, url, sample }: { text: string; url: string; sample: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const embed = url ? videoEmbedSrc(url) : "";
  function toggle() {
    if (url && isAudioFile(url) && audioRef.current) {
      if (playing) audioRef.current.pause();
      else void audioRef.current.play();
      setPlaying((open) => !open);
      return;
    }
    if (embed) {
      setPlaying((open) => !open);
      return;
    }
    playSpeech(sample || text);
  }
  return (
    <div className="sy-dna-story">
      <div className="sy-plan-audio">
        <button type="button" className="sy-audio-play" onClick={toggle} aria-label={playing ? "Dừng audio" : "Phát audio"}>
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          Play
        </button>
        <FitTextarea name="lessonPlan:Audio" defaultValue={text} placeholder="Ghi chú audio" />
      </div>
      <input name="planMedia:Audio" defaultValue={url} placeholder="URL file audio hoặc YouTube" className="sy-dna-url" />
      {url && isAudioFile(url) ? <audio ref={audioRef} src={url} preload="none" onEnded={() => setPlaying(false)} /> : null}
      {playing && embed && !isAudioFile(url) ? (
        <div className="sy-dna-player">
          <iframe src={embed} title="Audio" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : null}
    </div>
  );
}

function LessonPlanTable({
  lesson,
  skills,
  responseLevel,
  unit,
}: {
  lesson: SyllabusLesson;
  skills: Record<LessonSkillKey, boolean>;
  responseLevel?: number;
  unit?: SyllabusUnit;
}) {
  return (
    <div className="sy-lang-map sm:col-span-2 lg:col-span-4">
      <table className="sy-lang-table">
        <thead>
          <tr><th colSpan={2}>Lesson plan</th></tr>
          <tr><th>Stage</th><th>Nội dung</th></tr>
        </thead>
        <tbody>
          {lessonPlanFields.map((label, index) => {
            const skill = lessonPlanSkills.find(([, name]) => name === label);
            if (skill && !skills[skill[0]]) return null;
            const raw = lessonPlanValue(lesson.lessonPlan, label, index);
            const media = splitPlanMedia(raw);
            const phonics = label === "PHONICS" ? parsePhonicsPlan(raw, unit) : null;
            const youtube = unit?.storyVideoUrl || lesson.materials.find((item) => /youtube\.com|youtu\.be/i.test(item.url))?.url || "";
            return (
              <tr key={label}>
                <th>{label}</th>
                <td>
                  {label === "Speaking" ? (
                    <SpeakingLevelsCell raw={raw} currentLevel={responseLevel} />
                  ) : phonics ? (
                    <PhonicsDemoCell
                      letters={phonics.letters}
                      url={phonics.url}
                      storeName="lessonPlan:PHONICS"
                      storeValue={phonics.store}
                      urlName="planMedia:PHONICS"
                    />
                  ) : label === "Song / Chant" ? (
                    <DnaVideoCell
                      textName="lessonPlan:Song / Chant"
                      urlName="planMedia:Song / Chant"
                      textValue={media.text || unit?.songs?.[0] || raw}
                      urlValue={media.url || youtube}
                      placeholder="Tên bài hát / chant"
                      title="Song / Chant"
                    />
                  ) : label === "Audio" ? (
                    <PlanAudioCell
                      text={media.text || raw}
                      url={media.url || youtube}
                      sample={lesson.vocabulary[0]?.front || "Listen."}
                    />
                  ) : label === "Interactive Video" ? (
                    <DnaVideoCell
                      textName="lessonPlan:Interactive Video"
                      urlName="planMedia:Interactive Video"
                      textValue={media.text || unit?.storyFocus || raw}
                      urlValue={media.url || youtube}
                      placeholder="Mô tả video"
                      title="Interactive Video"
                    />
                  ) : (
                    <FitTextarea name={`lessonPlan:${label}`} defaultValue={raw} placeholder={`Nhập nội dung ${label}`} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lessonPlanFields.map((label, index) => {
        const skill = lessonPlanSkills.find(([, name]) => name === label);
        if (!skill || skills[skill[0]]) return null;
        if (label === "Speaking") {
          const examples = speakingLevelExamples(lessonPlanValue(lesson.lessonPlan, label, index));
          return SPEAKING_LEVELS.map((level, levelIndex) => (
            <textarea key={`speakingLevel:${level.id}`} name={`speakingLevel:${level.id}`} className="sy-plan-store" defaultValue={examples[levelIndex]} readOnly tabIndex={-1} aria-hidden="true" />
          ));
        }
        return <textarea key={label} name={`lessonPlan:${label}`} className="sy-plan-store" defaultValue={lessonPlanValue(lesson.lessonPlan, label, index)} readOnly tabIndex={-1} aria-hidden="true" />;
      })}
    </div>
  );
}

function fitTextarea(node: HTMLTextAreaElement | null, min = 40) {
  if (!node) return;
  node.style.height = "0px";
  node.style.height = `${Math.max(node.scrollHeight, min)}px`;
}

function FitTextarea({ className = "", defaultValue, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { fitTextarea(ref.current); }, [defaultValue]);
  return <textarea ref={ref} rows={1} defaultValue={defaultValue} {...props} className={`w-full resize-none overflow-hidden rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 ${className}`} onInput={(event) => { fitTextarea(event.currentTarget); props.onInput?.(event); }} />;
}

function EqualSplitFields({ detail, outcomes }: { detail: string; outcomes: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const refs = [useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null)];
  function sync() {
    const nodes = refs.map((item) => item.current).filter((node): node is HTMLTextAreaElement => Boolean(node));
    nodes.forEach((node) => { node.style.height = "auto"; });
    const height = Math.max(140, ...nodes.map((node) => node.scrollHeight + 4));
    nodes.forEach((node) => { node.style.height = `${height}px`; });
  }
  useEffect(() => {
    sync();
    const frame = requestAnimationFrame(sync);
    const box = boxRef.current;
    const observer = box ? new ResizeObserver(() => sync()) : null;
    if (box && observer) observer.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [detail, outcomes]);
  const fields = [
    { name: "tasks", label: "Detail", value: detail, ref: refs[0] },
    { name: "lessonOutcomes", label: "Outcomes", value: outcomes, ref: refs[1] },
  ];
  return (
    <div ref={boxRef} className="sy-day-split sm:col-span-2 lg:col-span-4">
      {fields.map((field) => (
        <Field key={field.name} label={field.label}>
          <textarea
            ref={field.ref}
            name={field.name}
            rows={4}
            defaultValue={field.value}
            onInput={sync}
            className="w-full min-w-0 resize-none overflow-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 break-words text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </Field>
      ))}
    </div>
  );
}

function EqualVocabFields({ core, supporting, exposure }: { core: string; supporting: string; exposure: string }) {
  const refs = [useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null)];
  function sync() {
    const nodes = refs.map((item) => item.current).filter((node): node is HTMLTextAreaElement => Boolean(node));
    nodes.forEach((node) => { node.style.height = "0px"; });
    const height = Math.max(120, ...nodes.map((node) => node.scrollHeight));
    nodes.forEach((node) => { node.style.height = `${height}px`; });
  }
  useEffect(() => { sync(); });
  const fields = [
    { name: "coreVocabulary", label: "CORE vocabulary", value: core, ref: refs[0] },
    { name: "supportingVocabulary", label: "SUPPORTING vocabulary", value: supporting, ref: refs[1] },
    { name: "exposureVocabulary", label: "EXPOSURE vocabulary", value: exposure, ref: refs[2] },
  ];
  return (
    <div className="sy-vocab-grid sm:col-span-2">
      {fields.map((field) => (
        <Field key={field.name} label={field.label} className="min-w-0">
          <textarea
            ref={field.ref}
            name={field.name}
            rows={1}
            defaultValue={field.value}
            onInput={sync}
            className="box-border w-full min-w-0 resize-none overflow-hidden rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 break-words text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </Field>
      ))}
    </div>
  );
}

function Badge({ status }: { status: keyof typeof statuses }) {
  const tone = status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "ARCHIVED" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{statuses[status]}</span>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
    <div className="max-h-[70vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2><button className={buttonClass("ghost", "icon")} onClick={onClose}><X className="h-4 w-4" /></button></div>
      {children}
    </div>
  </div>;
}

async function mutate(id: string, input: Record<string, unknown>) {
  const result = await api(`/api/syllabuses/${encodeURIComponent(id)}/actions`, { method: "POST", body: JSON.stringify(input) });
  return result.document as SyllabusDocument;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "buoi-hoc";
}

function dataUrlToBytes(dataUrl: string) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function buildJpegPdf(jpeg: Uint8Array, imgW: number, imgH: number) {
  const pageW = 595;
  const pageH = Math.max(1, Math.round((imgH * pageW) / imgW));
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;
  const xref = [0];
  function add(data: string | Uint8Array) {
    const bin = typeof data === "string" ? encoder.encode(data) : data;
    parts.push(bin);
    offset += bin.length;
  }
  add("%PDF-1.3\n");
  xref.push(offset);
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  xref.push(offset);
  add("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");
  xref.push(offset);
  add(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  xref.push(offset);
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  add(jpeg);
  add("\nendstream\nendobj\n");
  xref.push(offset);
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n`;
  add(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  const xrefStart = offset;
  add("xref\n0 6\n0000000000 65535 f \n");
  for (let index = 1; index <= 5; index += 1) add(`${String(xref[index]).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  const out = new Uint8Array(offset);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function inlineComputedLook(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const sources = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const clones = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll("*"))];
  sources.forEach((source, index) => {
    const clone = clones[index] as HTMLElement | undefined;
    if (!clone) return;
    const computed = getComputedStyle(source);
    for (const prop of Array.from(computed)) {
      clone.style.setProperty(prop, computed.getPropertyValue(prop), computed.getPropertyPriority(prop));
    }
  });
}

async function exportElementAsLongPdf(node: HTMLElement, filename: string) {
  await Promise.all([...node.querySelectorAll("img")].map((image) => (
    image.complete && image.naturalWidth
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })
  )));
  const options = {
    scale: Math.min(2, 16000 / Math.max(node.scrollHeight, 1)),
    useCORS: true,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
  };
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, options);
  } catch {
    canvas = await html2canvas(node, {
      ...options,
      onclone: (doc, cloned) => {
        doc.querySelectorAll("link[rel=stylesheet], style").forEach((sheet) => sheet.remove());
        inlineComputedLook(node, cloned);
      },
    });
  }
  const pdf = buildJpegPdf(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)), canvas.width, canvas.height);
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useLongPdf() {
  const exportRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  async function exportPdf(filename: string) {
    const node = exportRef.current;
    if (!node || exporting) return;
    setExporting(true);
    node.classList.add("is-exporting");
    try {
      await exportElementAsLongPdf(node, filename);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không xuất được PDF.");
    } finally {
      node.classList.remove("is-exporting");
      setExporting(false);
    }
  }
  return { exportRef, exporting, exportPdf };
}

function summary(document: SyllabusDocument) {
  const courses = document.program?.coursesCount || document.sections.filter((section) => section.type === "COURSE").length;
  const duration = document.program?.version?.startsWith("STARTER-") || document.days.length >= 48
    ? `${document.days.length} buổi · ${courses || 2} khóa`
    : `${document.days.length} buổi · ${document.units.length} Unit`;
  return { ...document.meta, duration, units: document.units.map((unit) => ({ id: unit.id, unitNumber: unit.unitNumber, title: unit.name, description: unit.overview || unit.topic, lessonCount: unit.lessonCount, days: document.days.filter((day) => day.unitId === unit.id) })) };
}

function syncShell(document: SyllabusDocument) {
  const next = summary(document);
  const index = state.data.syllabuses.findIndex((item) => item.id === document.meta.id);
  if (index < 0) state.data.syllabuses.push(next); else state.data.syllabuses[index] = next;
}

function SyllabusList({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<SyllabusMeta[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() { const data = await api("/api/syllabuses"); setItems(data.items); }
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);
  const labeled = items.map((item) => ({ ...item, name: state.data.syllabuses.find((row) => row.id === item.id)?.name || item.name }));
  const levels = [...new Set(labeled.map((item) => item.level).filter(Boolean))];
  const rows = labeled.filter((item) => {
    const haystack = `${item.code} ${item.name} ${item.level}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (!level || item.level === level) && (!status || item.status === status);
  });

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/api/syllabuses", { method: "POST", body: JSON.stringify(values) });
      syncShell(result.document); setCreateOpen(false); onOpen(result.item.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không tạo được syllabus."); }
    finally { setBusy(false); }
  }

  async function remove(event: React.MouseEvent, item: SyllabusMeta) {
    event.stopPropagation();
    if (!confirm(`Bạn có chắc muốn xóa dữ liệu này? Xoá syllabus ${item.name} sẽ mất luôn toàn bộ unit và buổi nội dung. Không khôi phục lại được.`)) return;
    try { await api(`/api/syllabuses/${encodeURIComponent(item.id)}`, { method: "DELETE" }); setItems((current) => current.filter((row) => row.id !== item.id)); state.data.syllabuses = state.data.syllabuses.filter((row) => row.id !== item.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không xóa được syllabus."); }
  }

  return <>
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-start gap-3 border-b border-slate-200 p-5">
          <div className="flex w-full items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-slate-900">Danh sách syllabus ({rows.length})</h2><p className="mt-1 text-sm text-slate-500">Mỗi syllabus gồm nhiều Unit, mỗi Unit có số buổi học riêng.</p></div><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Tạo syllabus</Button></div>
          <div className="grid w-full gap-3 sm:grid-cols-[2fr_1.2fr_1fr]">
            <Field label="Tìm kiếm"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã, tên, trình độ, gõ xong bấm Enter..." /></Field>
            <Field label="Trình độ"><Select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Tất cả trình độ</option>{levels.map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Trạng thái"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="overflow-x-auto"><table className="sy-catalog-table w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-16 px-5 py-3 font-medium">STT</th><th className="px-5 py-3 font-medium">Tên syllabus</th><th className="px-5 py-3 font-medium">Số unit</th><th className="px-5 py-3 font-medium">Số buổi</th><th className="px-5 py-3 font-medium">Lớp đang dùng</th><th className="px-5 py-3 font-medium">Trạng thái</th><th className="px-5 py-3 text-right font-medium">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((item, index) => <tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-4 text-slate-400">{index + 1}</td><td className="min-w-64 px-5 py-4"><button className="text-left font-medium text-brand-700 hover:underline">{item.name}</button></td><td className="px-5 py-4">{state.data.syllabuses.find((row) => row.id === item.id)?.units?.length || 0}</td><td className="px-5 py-4">{item.totalCourseDays}</td><td className="px-5 py-4">0</td><td className="px-5 py-4"><Badge status={item.status} /></td><td className="settings-actions-cell" onClick={(event) => event.stopPropagation()}><div className="row-actions settings-row-actions"><button type="button" className="trash-btn" title="Xóa" aria-label="Xóa" onClick={(event) => remove(event, item)}><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></svg></button></div></td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
    {createOpen ? <Modal title="Tạo syllabus" onClose={() => setCreateOpen(false)}><form onSubmit={create} className="space-y-4 p-5"><p className="text-xs text-slate-500">Thông tin nền để gán syllabus cho lớp học. Nội dung từng buổi soạn ở trang chi tiết.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Mã syllabus" hint="Bỏ trống → tự sinh SYL0001"><Input name="code" placeholder="IELTS-FDN-55" /></Field><Field label="Trình độ"><Input name="level" placeholder="Kids 1" /></Field><Field label="Tên syllabus" className="sm:col-span-2"><Input name="name" placeholder="Kids 1 — 48 buổi" required /></Field><Field label="Mô tả" className="sm:col-span-2"><Textarea name="description" placeholder="Phạm vi nội dung, đối tượng học viên..." /></Field><Field label="Số unit" hint="Tạo sẵn khung Unit rỗng, sửa được sau"><Input name="unitCount" type="number" min={0} max={50} defaultValue={0} /></Field><Field label="Trạng thái"><Select name="status"><option value="DRAFT">Nháp</option><option value="ACTIVE">Đang dùng</option></Select></Field></div>{error ? <p className="text-sm text-red-600">{error}</p> : null}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Lưu syllabus"}</Button></div></form></Modal> : null}
  </>;
}

function lessonName(title: string) {
  return title
    .replace(/^(Day|CLASS|HOME)\s+\d+\s*[·:]\s*/i, "")
    .replace(/^(MID[\s-]?TEST|FINAL[\s-]?TEST|MINI[\s-]?TEST|MINI\s*ĐỀ|COURSE\s+FINAL|COURSE\s+REVIEW)\s*[·:\-–]\s*/i, "")
    .replace(/\s*[+·]\s*(Test|Mini đề)\b.*$/i, "")
    .trim();
}
function dayHeading(day: CourseDay, index: number) {
  const title = lessonName(day.title || "").replace(/^(Offline|Online)\s*[·:]\s*/i, "");
  const number = day.courseDayNumber || day.classLessonNumber || index + 1;
  const mode = day.deliveryMode === "ONLINE" || day.track === "HOME" ? "Online" : "Offline";
  return title ? `Day ${number} : ${mode} · ${title}` : `Day ${number} : ${mode}`;
}
function lines(value: FormDataEntryValue | null) { return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }

type AddDayFn = (sectionId: string, afterDayId: string, dayNumber: number, unitId?: string) => void;

function HoverAddDay({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="sy-empty-unit-add-control"><button type="button" onClick={onClick} title={label} aria-label={label} className="inline-flex h-5 items-center justify-center gap-1 rounded-full bg-brand-600 px-2 text-[11px] font-medium text-white shadow-sm hover:bg-brand-700"><Plus className="h-3 w-3" />{label}</button></div>;
}

function DayRow({ day, index, sectionId, unitId, canEdit, active, onSelect, onAddDay }: { day: CourseDay; index: number; sectionId: string; unitId?: string; canEdit: boolean; active: Target; onSelect: (target: Target) => void; onAddDay: AddDayFn }) {
  const value = `day-${day.id}` as const;
  return <li className="sy-day-tree-item"><button onClick={() => onSelect(value)} className={`flex w-full items-center gap-1 truncate rounded-md px-2 py-1 text-left text-[12px] ${active === value ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}><span className="min-w-0 flex-1 truncate">{dayHeading(day, index)}</span>{day.custom ? <span className="sy-custom-tag">Tự soạn</span> : null}</button>{canEdit ? <div className="sy-day-add-control"><button type="button" onClick={() => onAddDay(sectionId, day.id, index + 2, unitId)} title="Thêm Day" aria-label="Thêm Day" className="inline-flex h-4 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700"><Plus className="h-3 w-3" /></button></div> : null}</li>;
}

function Tree({ document, active, canEdit, onSelect, onAdd, onAddDay }: { document: SyllabusDocument; active: Target; canEdit: boolean; onSelect: (target: Target) => void; onAdd: () => void; onAddDay: AddDayFn }) {
  return <nav className="pb-2"><div className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-100 bg-white p-2"><button onClick={() => onSelect("overview")} className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm ${active === "overview" ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}>Overview</button>{canEdit ? <button type="button" onClick={onAdd} title="Thêm Unit" aria-label="Thêm Unit" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"><Plus className="h-4 w-4" /></button> : null}</div>{document.sections.map((section) => <TreeBranch key={section.id} document={document} section={section} days={document.days.filter((day) => day.sectionId === section.id)} active={active} canEdit={canEdit} onSelect={onSelect} onAddDay={onAddDay} />)}</nav>;
}

function TreeBranch({ document, section, days, active, canEdit, onSelect, onAddDay }: { document: SyllabusDocument; section: CurriculumSection; days: CourseDay[]; active: Target; canEdit: boolean; onSelect: (target: Target) => void; onAddDay: AddDayFn }) {
  const [open, setOpen] = useState(section.type === "COURSE");
  const [openUnit, setOpenUnit] = useState("");
  const units = document.units.filter((unit) => unit.sectionId === section.id).sort((a, b) => a.order - b.order);
  const leftover = days.filter((day) => !day.unitId).sort((a, b) => a.sortOrder - b.sortOrder);
  const courseTarget = `course-${section.id}` as const;
  const fallbackTarget = (section.unitId ? `unit-${section.unitId}` : courseTarget) as Target;
  const target = section.type === "COURSE" ? courseTarget : fallbackTarget;
  const standaloneUnitId = section.unitId || undefined;
  return <div className="sy-unit-tree-item mt-1">
    <div className="flex items-center"><button onClick={() => setOpen(!open)} className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button><button onClick={() => onSelect(target)} className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${active === target ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}>{section.title}</button></div>
    {open && days.length === 0 && canEdit && (section.type !== "COURSE" || units.length === 0) ? <HoverAddDay label="Day 1" onClick={() => onAddDay(section.id, "", 1, standaloneUnitId)} /> : null}
    {open && section.type === "COURSE" ? <>
      {units.map((unit) => {
        const unitDays = days.filter((day) => day.unitId === unit.id).sort((a, b) => a.sortOrder - b.sortOrder);
        const unitTarget = `unit-${unit.id}` as const;
        const unitOpen = openUnit === unit.id;
        return <div key={unit.id} className="sy-unit-tree-item ml-3">
          <div className="flex items-center"><button onClick={() => setOpenUnit(unitOpen ? "" : unit.id)} className="inline-flex h-7 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700">{unitOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button><button onClick={() => onSelect(unitTarget)} className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[13px] ${active === unitTarget ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}>{unit.name}{unit.custom ? <span className="sy-custom-tag">Tự soạn</span> : null}</button></div>
          {unitOpen && unitDays.length === 0 && canEdit ? <HoverAddDay label="Day 1" onClick={() => onAddDay(section.id, "", 1, unit.id)} /> : null}
          {unitOpen ? <ul className="border-l border-slate-200 pl-2">{unitDays.map((day, index) => <DayRow key={day.id} day={day} index={index} sectionId={section.id} unitId={unit.id} canEdit={canEdit} active={active} onSelect={onSelect} onAddDay={onAddDay} />)}</ul> : null}
        </div>;
      })}
      {leftover.length ? <div className="ml-3"><p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ôn và tái sử dụng</p><ul className="border-l border-slate-200 pl-2">{leftover.map((day, index) => <DayRow key={day.id} day={day} index={index} sectionId={section.id} canEdit={canEdit} active={active} onSelect={onSelect} onAddDay={onAddDay} />)}</ul></div> : null}
    </> : null}
    {open && section.type !== "COURSE" ? <ul className="ml-4 border-l border-slate-200 pl-2">{days.map((day, index) => <DayRow key={day.id} day={day} index={index} sectionId={section.id} unitId={standaloneUnitId} canEdit={canEdit} active={active} onSelect={onSelect} onAddDay={onAddDay} />)}</ul> : null}
  </div>;
}

function MoveButtons({ onMove }: { onMove: (direction: "up" | "down") => void }) { return <div className="flex gap-1"><button onClick={() => onMove("up")} className={buttonClass("ghost", "icon")}><ChevronUp className="h-4 w-4" /></button><button onClick={() => onMove("down")} className={buttonClass("ghost", "icon")}><ChevronDown className="h-4 w-4" /></button></div>; }

function Overview({ document, onChange }: { document: SyllabusDocument; onChange: (document: SyllabusDocument) => void }) {
  const syllabus = document.meta;
  const [overviewTab, setOverviewTab] = useState<"info" | "spiral">("info");
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); onChange(await mutate(syllabus.id, { action: "updateMeta", name: values.name, code: syllabus.code, level: syllabus.level, description: syllabus.description, status: syllabus.status })); }
  const classCount = document.days.filter((day) => day.deliveryMode !== "ONLINE" && day.track !== "HOME").length;
  const onlineCount = document.days.filter((day) => day.deliveryMode === "ONLINE" || day.track === "HOME").length;
  const program = document.program;
  const cards = [["Khóa", program?.coursesCount || document.sections.filter((section) => section.type === "COURSE").length || 2], ["Units", document.units.length], ["Offline", classCount], ["Online", onlineCount]];
  return <div className="sy-overview"><div className="flex gap-1 border-b border-slate-200"><button type="button" onClick={()=>setOverviewTab("info")} className={`border-b-2 px-4 py-1.5 text-sm font-semibold transition ${overviewTab === "info" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Thông tin syllabus</button><button type="button" onClick={()=>setOverviewTab("spiral")} className={`border-b-2 px-4 py-1.5 text-sm font-semibold transition ${overviewTab === "spiral" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Sơ đồ xoắn ốc</button></div>
    {overviewTab === "info" ? <><div className="sy-overview-info rounded-xl border bg-white"><h1 className="font-semibold text-slate-900">Thông tin syllabus</h1><p className="text-sm text-slate-500">{syllabus.description}</p>{program ? <div className="sy-overview-tags flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">{program.coursesCount || 2} khóa · {program.unitsCount || document.units.length} Unit</span><span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">{classCount} Offline × {program.classDurationMinutes || 90} phút</span><span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">{onlineCount} Online × 15–20 phút</span><span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">Game ôn mỗi ngày</span></div> : null}{program?.coreStatement ? <p className="text-sm font-medium text-slate-800">{program.coreStatement}</p> : null}<form onSubmit={save} className="sy-edit-only max-w-3xl space-y-2"><Field label="Tên syllabus"><Input name="name" defaultValue={syllabus.name} required /></Field><Button type="submit" size="sm">Lưu thông tin</Button></form></div>{program?.courses?.length ? <div className="sy-overview-courses">{program.courses.map((course) => <article key={course.number} className="rounded-xl border border-slate-200 bg-white"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Buổi {course.dayStart}–{course.dayEnd}</p><h2 className="font-semibold text-slate-900">{course.title}</h2><p className="text-sm text-slate-600">{course.focus}</p><p className="text-xs text-slate-500">{course.units.join(" · ")}</p></article>)}</div> : null}<div className="sy-overview-stats">{cards.map(([label,value]) => <div key={label} className="rounded-xl border bg-white"><strong>{value}</strong><span>{label}</span></div>)}</div></> : document.days.length ? <SpiralLearningMap document={document} /> : <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Syllabus chưa có dữ liệu sơ đồ.</div>}
  </div>;
}

const spiralStrands = [
  { id: "meaning", label: "Từ vựng & tạo nghĩa", color: "#2563EB" },
  { id: "listening", label: "Listening & nhận diện", color: "#0891B2" },
  { id: "phonics", label: "Phonics & âm", color: "#7C3AED" },
  { id: "language", label: "Mẫu câu & ngữ pháp", color: "#D97706" },
  { id: "speaking", label: "Speaking", color: "#059669" },
  { id: "reading", label: "Reading & Writing", color: "#4F46E5" },
  { id: "communication", label: "Giao tiếp & chuyển giao", color: "#DB2777" },
  { id: "previous", label: "Ôn xoắn Unit trước", color: "#475569" },
] as const;

function hexAlpha(color: string, level: number) {
  if (!level) return "#F8FAFC";
  const alpha = [0, 0.16, 0.32, 0.5, 0.72, 1][Math.min(5, Math.max(0, level))] ?? 1;
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function spiralLevel(strandId: string, day: CourseDay, unit: SyllabusUnit | undefined) {
  const lesson = day.unitDayNumber || 1;
  const count = unit?.lessonCount || (day.unitId ? 2 : 1);
  const last = lesson >= count;
  const first = lesson === 1;
  const review = !day.unitId || day.phase === "REUSE_TRANSFER";
  if (strandId === "meaning") return review ? 2 : first ? 5 : 3;
  if (strandId === "listening") return review ? 3 : first ? 5 : 3;
  if (strandId === "phonics") return review ? 1 : first ? 3 : 2;
  if (strandId === "language") return review ? 3 : first ? 2 : last ? 4 : 3;
  if (strandId === "speaking") return review ? 4 : first ? 1 : last ? 5 : 4;
  if (strandId === "reading") return review ? 3 : first ? 0 : 3;
  if (strandId === "communication") return review ? 5 : last ? 5 : first ? 0 : 3;
  if (strandId === "previous") return (day.courseDayNumber || 0) <= 3 ? 0 : first ? 2 : 4;
  return 0;
}

function SpiralLearningMap({ document }: { document: SyllabusDocument }) {
  const days = [...document.days].sort((a, b) => a.sortOrder - b.sortOrder);
  const unitById = new Map(document.units.map((unit) => [unit.id, unit]));
  const bands: Array<{ id: string; label: string; span: number }> = [];
  days.forEach((day) => {
    const unit = day.unitId ? unitById.get(day.unitId) : undefined;
    const label = unit ? `U${unit.unitNumber}` : "Ôn";
    const last = bands[bands.length - 1];
    if (last && last.label === label) last.span += 1;
    else bands.push({ id: `${label}-${day.id}`, label, span: 1 });
  });
  const cell = 22;
  const labelW = 168;
  const tableWidth = labelW + days.length * cell;
  const square = { width: cell, minWidth: cell, maxWidth: cell, height: cell, padding: 0, boxSizing: "border-box" as const };
  return (
    <section className="sy-spiral rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="sy-spiral-head border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Sơ đồ xoắn ốc theo buổi CLASS</h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-600">Mỗi buổi: <strong>Exposure → Recognition → Guided Use → Independent Use → Transfer</strong>. Input rộng lúc mở Unit, production và ôn xoắn tăng dần. Chỉ nội dung dạy — Test thêm sau khi cần.</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{days.length} CLASS</span>
        </div>
        <div className="mt-2.5 flex flex-nowrap items-center gap-x-2 overflow-x-auto whitespace-nowrap pb-0.5 text-[9px] text-slate-500">{spiralStrands.map((strand) => <span key={strand.id} className="flex shrink-0 items-center gap-1"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: strand.color }} />{strand.label}</span>)}</div>
      </div>
      <div className="sy-spiral-scroll bg-white">
        <table className="border-separate border-spacing-0 text-[9px]" style={{ tableLayout: "fixed", width: tableWidth, minWidth: tableWidth }}>
          <colgroup><col style={{ width: labelW }} />{days.map((day) => <col key={day.id} style={{ width: cell }} />)}</colgroup>
          <thead>
            <tr><th className="sticky left-0 z-20 border border-slate-200 bg-white px-2 text-left text-[10px] font-semibold text-slate-400" style={{ width: labelW, minWidth: labelW, height: cell }}>KHÓA / UNIT</th>{bands.map((band) => <th key={band.id} colSpan={band.span} className={`border border-slate-200 text-center font-semibold ${band.label === "Ôn" ? "bg-slate-50 text-slate-500" : "bg-white text-slate-600"}`} style={{ height: cell }}>{band.label}</th>)}</tr>
            <tr><th className="sticky left-0 z-20 border border-slate-200 bg-white px-2 text-left text-[10px] font-semibold text-slate-500" style={{ width: labelW, minWidth: labelW, height: cell }}>BUỔI</th>{days.map((day) => <th key={day.id} className="border border-slate-200 bg-white text-center font-medium text-slate-500" style={square} title={`CLASS ${day.classLessonNumber || day.courseDayNumber} · ${day.title}`}>{day.classLessonNumber || day.courseDayNumber}</th>)}</tr>
          </thead>
          <tbody>{spiralStrands.map((strand) => <tr key={strand.id}><th className="sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-white px-2 text-left text-[10px] font-medium text-slate-700" style={{ width: labelW, minWidth: labelW, height: cell }}><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: strand.color }} />{strand.label}</span></th>{days.map((day) => { const level = spiralLevel(strand.id, day, day.unitId ? unitById.get(day.unitId) : undefined); return <td key={`${strand.id}-${day.id}`} className="border border-white" style={{ ...square, backgroundColor: hexAlpha(strand.color, level) }} title={`${strand.label} · CLASS ${day.classLessonNumber || day.courseDayNumber} · ${day.title}`} />; })}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function AddSectionModal({ kind, unitNumber, onClose, onCreate }: { kind: "section" | "unit"; unitNumber: number; onClose: () => void; onCreate: (type: string, title: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await onCreate(kind === "unit" ? "UNIT" : String(values.type || "OTHER"), String(values.title || "")); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thêm được nội dung."); } finally { setBusy(false); } }
  return <Modal title={kind === "unit" ? "Thêm Unit" : "Thêm Section hoặc Unit"} onClose={onClose}><form onSubmit={submit} className="space-y-4 p-5">{kind === "section" ? <Field label="Loại"><Select name="type" defaultValue="UNIT">{sectionTypes.map((value) => <option key={value}>{value}</option>)}</Select></Field> : null}<Field label={kind === "unit" ? "Tên Unit" : "Tên Section / Unit"}><Input name="title" defaultValue={kind === "unit" ? `UNIT ${unitNumber}` : ""} placeholder={kind === "unit" ? `UNIT ${unitNumber} — Topic` : `UNIT ${unitNumber} — Topic`} required autoFocus /></Field>{error ? <p className="text-sm text-red-600">{error}</p> : null}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? "Đang thêm..." : "Thêm"}</Button></div></form></Modal>;
}

function AddDayModal({ dayNumber, onClose, onCreate }: { dayNumber: number; onClose: () => void; onCreate: (title: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const title = String(new FormData(event.currentTarget).get("title") || "").trim(); try { await onCreate(title); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thêm được Day."); } finally { setBusy(false); } }
  return <Modal title={`Thêm Day ${dayNumber}`} onClose={onClose}><form onSubmit={submit} className="space-y-4 p-5"><Field label="Tên Day"><Input name="title" placeholder={`Nội dung ngày ${dayNumber}`} required autoFocus /></Field>{error ? <p className="text-sm text-red-600">{error}</p> : null}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? "Đang thêm..." : `Thêm Day ${dayNumber}`}</Button></div></form></Modal>;
}

function LanguageMapFields({ unit }: { unit: SyllabusUnit }) {
  const values = languageMapValues(unit);
  const refs = [useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null)];
  function sync() {
    const nodes = refs.map((item) => item.current).filter((node): node is HTMLTextAreaElement => Boolean(node));
    nodes.forEach((node) => { node.style.height = "0px"; });
    const height = Math.max(88, ...nodes.map((node) => node.scrollHeight));
    nodes.forEach((node) => { node.style.height = `${height}px`; });
  }
  useEffect(() => { sync(); });
  const productions = [
    { name: "coreProduction", label: "Core production", value: (unit.coreProduction || []).join("\n"), ref: refs[0] },
    { name: "expandedProduction", label: "Expanded production", value: (unit.expandedProduction || []).join("\n"), ref: refs[1] },
  ];
  return (
    <div className="sy-lang-map sm:col-span-2">
      <table className="sy-lang-table">
        <thead>
          <tr><th colSpan={2}>Language Progression</th></tr>
          <tr><th>Stage</th><th>Ví dụ</th></tr>
        </thead>
        <tbody>
          {LANGUAGE_STAGES.map((stage) => (
            <tr key={stage.id}>
              <th>{stage.label}</th>
              <td><FitTextarea name={`languageMap:${stage.id}`} defaultValue={values[stage.id]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="sy-prod-table">
        <thead>
          <tr><th colSpan={2}>Language map</th></tr>
          <tr>
            {productions.map((field) => <th key={field.name}>{field.label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            {productions.map((field) => (
              <td key={field.name}>
                <textarea
                  ref={field.ref}
                  name={field.name}
                  rows={1}
                  defaultValue={field.value}
                  onInput={sync}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const DNA_ROWS = [
  { name: "songs", label: "Songs", list: true },
  { name: "tprActions", label: "TPR / Actions", list: true },
  { name: "classroomEnglish", label: "Classroom English", list: true },
  { name: "phonicsFocus", label: "Phonics", list: true },
  { name: "trickyWords", label: "Tricky words", list: true },
  { name: "recycledLanguage", label: "Recycled language", list: true },
  { name: "skillFocus", label: "Skills", list: true },
] as const;

const FLASHCARD_DEMO_URL = "https://www.youtube.com/watch?v=a2k9wJuAsr8";

function storyVideoUrlOf(unit: SyllabusUnit, resources: LessonResource[]) {
  if (unit.storyVideoUrl) return unit.storyVideoUrl;
  const match = resources.find((item) => item.unitId === unit.id && item.isActive && (item.resourceType === "VIDEO" || /youtube\.com|youtu\.be|\.mp4(\?|$)/i.test(item.url)));
  return match?.url || "";
}

function videoEmbedSrc(url: string) {
  try {
    const parsed = new URL(url);
    let id = "";
    if (parsed.hostname.includes("youtu.be")) id = parsed.pathname.replace(/^\//, "");
    else if (parsed.pathname.includes("/embed/")) id = parsed.pathname.split("/embed/")[1] || "";
    else if (parsed.pathname.includes("/shorts/")) id = parsed.pathname.split("/shorts/")[1] || "";
    else id = parsed.searchParams.get("v") || "";
    id = id.replace(/[^A-Za-z0-9_-].*$/, "");
    if (!id) return "";
    const stamp = parsed.searchParams.get("t") || parsed.searchParams.get("start") || "";
    const start = Number(String(stamp).replace(/s$/i, ""));
    return `https://www.youtube.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ""}`;
  } catch {
    return "";
  }
}

function DnaVideoCell({
  textName, urlName, textValue, urlValue, placeholder, title,
}: {
  textName: string; urlName: string; textValue: string; urlValue: string; placeholder: string; title: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = urlValue ? videoEmbedSrc(urlValue) : "";
  function play() { if (urlValue) setPlaying((open) => !open); }
  return (
    <div className="sy-dna-story">
      <div className="sy-dna-story-row">
        <button type="button" className="sy-dna-play" onClick={play} disabled={!urlValue} aria-label={playing ? `Đóng video ${title}` : `Phát ${title}`}>
          <Play className="h-3.5 w-3.5" fill="currentColor" />
        </button>
        <FitTextarea
          name={textName}
          className="sy-dna-story-text"
          defaultValue={textValue}
          placeholder={placeholder}
          onClick={() => { if (urlValue) play(); }}
        />
      </div>
      <input name={urlName} defaultValue={urlValue} placeholder="URL video YouTube" className="sy-dna-url" />
      {playing && urlValue ? (
        <div className="sy-dna-player">
          {embed ? (
            <iframe src={embed} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video src={urlValue} controls autoPlay />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PhonicsDemoCell({
  letters,
  url,
  storeName,
  storeValue,
  urlName,
}: {
  letters: string[];
  url: string;
  storeName: string;
  storeValue: string;
  urlName: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = videoEmbedSrc(url);
  function play() { if (url) setPlaying((open) => !open); }
  return (
    <div className="sy-dna-story">
      <div className="sy-dna-phonics">
        <button type="button" className="sy-dna-play" onClick={play} disabled={!url} aria-label={playing ? "Đóng video Phonics" : "Phát Phonics"}>
          <Play className="h-3.5 w-3.5" fill="currentColor" />
        </button>
        <div className="sy-dna-letters">
          {letters.map((letter, index) => (
            <button key={`${letter}-${index}`} type="button" className="sy-dna-letter" onClick={play}>{letter}</button>
          ))}
        </div>
      </div>
      <textarea name={storeName} className="sy-dna-phonics-store" defaultValue={storeValue} readOnly tabIndex={-1} aria-hidden="true" />
      <input name={urlName} defaultValue={url} placeholder="URL video YouTube" className="sy-dna-url" />
      {playing && url ? (
        <div className="sy-dna-player">
          {embed ? (
            <iframe src={embed} title="Phonics" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video src={url} controls autoPlay />
          )}
        </div>
      ) : null}
    </div>
  );
}

function DnaPhonicsCell({ unit }: { unit: SyllabusUnit }) {
  const letters = unit.phonicsFocus || [];
  return (
    <PhonicsDemoCell
      letters={letters}
      url={unit.phonicsVideoUrl || PHONICS_DEMO_URL}
      storeName="phonicsFocus"
      storeValue={letters.join("\n")}
      urlName="phonicsVideoUrl"
    />
  );
}

function isImageAid(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);
}

function aidKind(title: string, url: string) {
  if (isImageAid(url)) return "image";
  if (/\.pdf(\?|$)/i.test(url) || /đề|de thi|test|quiz|worksheet|exam/i.test(`${title} ${url}`)) return "exam";
  return "file";
}

function TeachingAidCell({ aids }: { aids: { title: string; url: string }[] }) {
  const [rows, setRows] = useState(aids.length ? aids : [{ title: "", url: "" }]);
  function update(index: number, patch: { title?: string; url?: string }) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  return (
    <div className="sy-aids">
      {rows.some((row) => row.url) ? (
        <div className="sy-aids-grid">
          {rows.filter((row) => row.url).map((row, index) => {
            const kind = aidKind(row.title, row.url);
            return (
              <a key={`${row.url}-${index}`} href={row.url} download={row.title || undefined} target="_blank" rel="noopener noreferrer" className="sy-aid">
                {kind === "image" ? <img src={row.url} alt="" /> : (
                  <span className={`sy-aid-file ${kind}`}>
                    {kind === "exam" ? <FileText className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    {kind === "exam" ? "Đề thi" : "File"}
                  </span>
                )}
                <strong>{row.title || "Tải xuống"}</strong>
              </a>
            );
          })}
        </div>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="sy-aid-row">
          <input name="teachingAidTitle" value={row.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Tên file, đề thi..." />
          <input name="teachingAidUrl" value={row.url} onChange={(event) => update(index, { url: event.target.value })} placeholder="https://... hoặc /flashcards/frog.png" />
          <button type="button" className="sy-aid-remove sy-edit-only" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} aria-label="Xóa file">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" className="sy-aid-add sy-edit-only" onClick={() => setRows((prev) => [...prev, { title: "", url: "" }])}>
        <Plus className="h-3.5 w-3.5" />
        Thêm file
      </button>
    </div>
  );
}

function DnaFields({ unit, document }: { unit: SyllabusUnit; document: SyllabusDocument }) {
  return (
    <div className="sy-dna sm:col-span-2">
      <table className="sy-dna-table">
        <thead>
          <tr><th colSpan={2}>DNA</th></tr>
          <tr><th>Thành phần</th><th>Nội dung</th></tr>
        </thead>
        <tbody>
          <tr>
            <th>
              <span className="sy-dna-tree">├</span>
              Story
            </th>
            <td>
              <DnaVideoCell
                textName="storyFocus"
                urlName="storyVideoUrl"
                textValue={unit.storyFocus || ""}
                urlValue={storyVideoUrlOf(unit, document.resources)}
                placeholder="Mô tả story"
                title="Story"
              />
            </td>
          </tr>
          {DNA_ROWS.map((row) => {
            const value = ((unit as any)[row.name] || []).join("\n");
            return (
              <React.Fragment key={row.name}>
                <tr>
                  <th>
                    <span className="sy-dna-tree">├</span>
                    {row.label}
                  </th>
                  <td>
                    {row.name === "phonicsFocus" ? (
                      <DnaPhonicsCell unit={unit} />
                    ) : (
                      <FitTextarea name={row.name} defaultValue={value} />
                    )}
                  </td>
                </tr>
                {row.name === "phonicsFocus" ? (
                  <tr>
                    <th>
                      <span className="sy-dna-tree">├</span>
                      Flashcard toothpaste worm
                    </th>
                    <td>
                      <DnaVideoCell
                        textName="flashcardFocus"
                        urlName="flashcardVideoUrl"
                        textValue={unit.flashcardFocus || "Flashcard"}
                        urlValue={unit.flashcardVideoUrl || FLASHCARD_DEMO_URL}
                        placeholder="Tiêu đề video flashcard"
                        title="Flashcard"
                      />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
          <tr>
            <th>
              <span className="sy-dna-tree">└</span>
              Teaching aid
            </th>
            <td>
              <TeachingAidCell aids={unit.teachingAids || []} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CoursePane({ document, section }: { document: SyllabusDocument; section: CurriculumSection }) {
  const units = document.units.filter((unit) => unit.sectionId === section.id).sort((a, b) => a.order - b.order);
  const days = document.days.filter((day) => day.sectionId === section.id);
  const course = document.program?.courses?.find((item) => item.number === section.courseNumber);
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="bg-slate-50 px-4 py-3">
      <h2 className="font-semibold text-slate-900">{section.title} <span className="ml-2 text-xs font-medium text-slate-400">{days.filter((day) => day.deliveryMode !== "ONLINE").length} Offline · {days.filter((day) => day.deliveryMode === "ONLINE").length} Online</span></h2>
      <p className="mt-2 text-sm text-slate-600">{course?.focus || "Mỗi buổi Offline kèm 2 buổi Online tự học trên Portal."}</p>
    </div>
    <div className="space-y-3 p-4">
      <ul className="sy-course-units text-sm">{units.map((unit) => <li key={unit.id} className="rounded-lg border border-slate-200 px-3 py-2"><strong>{unit.name}</strong><span className="ml-2 text-xs text-slate-500">{document.days.filter((day) => day.unitId === unit.id).length} buổi</span><p className="mt-1 text-xs text-slate-500">{unit.communicationGoal}</p></li>)}</ul>
    </div>
  </section>;
}

function UnitPane({ document, unit, onChange }: { document: SyllabusDocument; unit: SyllabusUnit; onChange: (document: SyllabusDocument) => void }) {
  const { exportRef, exporting, exportPdf } = useLongPdf();
  const days = document.days.filter((day) => day.unitId === unit.id);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    onChange(await mutate(document.meta.id, {
      action: "updateUnit", id: unit.id, name: fd.get("name"), unitNumber: Number(fd.get("unitNumber") || 1),
      topic: fd.get("topic"), overview: fd.get("overview"), learningObjectives: lines(fd.get("learningObjectives")), communicationGoal: fd.get("communicationGoal"),
      coreVocabulary: lines(fd.get("coreVocabulary")), supportingVocabulary: lines(fd.get("supportingVocabulary")), exposureVocabulary: lines(fd.get("exposureVocabulary")),
      languageMap: encodeLanguageMap({
        WORD: String(fd.get("languageMap:WORD") || ""),
        CHUNK: String(fd.get("languageMap:CHUNK") || ""),
        SENTENCE: String(fd.get("languageMap:SENTENCE") || ""),
        EXPANDED_SENTENCE: String(fd.get("languageMap:EXPANDED_SENTENCE") || ""),
        QA: String(fd.get("languageMap:QA") || ""),
        PERSONAL: String(fd.get("languageMap:PERSONAL") || ""),
        COMMUNICATION: String(fd.get("languageMap:COMMUNICATION") || ""),
      }), coreProduction: lines(fd.get("coreProduction")), expandedProduction: lines(fd.get("expandedProduction")),
      storyFocus: fd.get("storyFocus"), storyVideoUrl: fd.get("storyVideoUrl"), songs: lines(fd.get("songs")), tprActions: lines(fd.get("tprActions")), classroomEnglish: lines(fd.get("classroomEnglish")),
      phonicsFocus: lines(fd.get("phonicsFocus")), phonicsVideoUrl: fd.get("phonicsVideoUrl"),
      flashcardFocus: fd.get("flashcardFocus"), flashcardVideoUrl: fd.get("flashcardVideoUrl"),
      trickyWords: lines(fd.get("trickyWords")), recycledLanguage: lines(fd.get("recycledLanguage")),
      skillFocus: lines(fd.get("skillFocus")),
      teachingAids: (() => { const titles = fd.getAll("teachingAidTitle").map(String); const urls = fd.getAll("teachingAidUrl").map(String); return titles.map((title, index) => ({ title, url: urls[index] || "" })).filter((item) => item.title.trim() || item.url.trim()); })(),
      sourceNotes: lines(fd.get("sourceNotes")), lessonCount: Number(fd.get("lessonCount") || unit.lessonCount || days.length),
    }));
  }
  return (
  <section ref={exportRef} className="sy-day-export overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold text-slate-900">{unit.name} <span className="ml-2 text-xs font-medium text-slate-400">Khoá {unit.courseNumber || "–"} · {days.length} buổi · Language System</span></h2>
        <button type="button" className={`${buttonClass("outline", "sm")} sy-export-hide`} onClick={() => void exportPdf(`${safeFileName(unit.name || "Unit")}.pdf`)} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Đang xuất..." : "Xuất PDF"}
        </button>
      </div>
      <form onSubmit={save} className="mt-3 grid w-full gap-3 sm:grid-cols-2">
        <Field label="Tên Unit"><Input name="name" defaultValue={unit.name} required /></Field>
        <Field label="Unit number"><Input name="unitNumber" type="number" min={1} defaultValue={unit.unitNumber || ""} /></Field>
        <Field label="Số CLASS"><Input name="lessonCount" type="number" min={1} defaultValue={unit.lessonCount || days.length} /></Field>
        <Field label="Topic"><Input name="topic" defaultValue={unit.topic || ""} /></Field>
        <Field label="Overview" className="sm:col-span-2"><FitTextarea name="overview" defaultValue={unit.overview || ""} /></Field>
        <Field label="Communication goal" className="sm:col-span-2"><FitTextarea name="communicationGoal" defaultValue={unit.communicationGoal || ""} /></Field>
        <Field label="Learning objectives" className="sm:col-span-2"><FitTextarea name="learningObjectives" defaultValue={(unit.learningObjectives || []).join("\n")} /></Field>
        <EqualVocabFields
          core={(unit.coreVocabulary || []).join("\n")}
          supporting={(unit.supportingVocabulary || []).join("\n")}
          exposure={(unit.exposureVocabulary || []).join("\n")}
        />
        <LanguageMapFields unit={unit} />
        <DnaFields unit={unit} document={document} />
        <Field label="Source notes" className="sm:col-span-2"><FitTextarea name="sourceNotes" defaultValue={(unit.sourceNotes || []).join("\n")} /></Field>
        <div className="sy-export-hide sm:col-span-2"><Button type="submit" size="sm">Lưu Language System</Button></div>
      </form>
    </div>
  </section>
  );
}

function ExerciseBuilder({ document, lesson, onChange }: { document: SyllabusDocument; lesson: SyllabusLesson; onChange: (document: SyllabusDocument) => void }) {
  type Step = { name: "list" } | { name: "kind"; skill: SkillId } | { name: "edit"; draft: Exercise; exerciseId?: string };
  const [step, setStep] = useState<Step>({ name: "list" }); const [skillOpen, setSkillOpen] = useState(false); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState<Exercise | null>(null);
  const items = document.exercises.filter((item) => item.lessonId === lesson.id);
  function kinds(skill: SkillId) { if (skill === "LISTENING") return LISTENING_KINDS; if (skill === "SPEAKING") return SPEAKING_KINDS; if (skill === "WRITING") return WRITING_KINDS; if (skill === "OTHER") return OTHER_KINDS; return READING_KINDS; }
  function draft(skill: SkillId, kind: string): Exercise { if (skill === "LISTENING") return createListening(kind as ListeningKind); if (skill === "SPEAKING") return createSpeaking(kind as SpeakingKind); if (skill === "WRITING") return createWriting(kind as WritingKind); if (skill === "OTHER") return createOther(kind as OtherKind); return createReading(kind as ReadingKind); }
  async function save(value: Exercise, exerciseId?: string) { setBusy(true); try { onChange(await mutate(document.meta.id, { action: "upsertExercise", lessonId: lesson.id, exerciseId, exercise: value })); setStep({ name: "list" }); } finally { setBusy(false); } }
  async function remove(id: string) { if (!confirm("Xóa bài tập này?")) return; onChange(await mutate(document.meta.id, { action: "deleteExercise", lessonId: lesson.id, exerciseId: id })); }
  if (step.name === "kind") return <div className="space-y-4"><button onClick={() => setStep({ name: "list" })} className={buttonClass("ghost", "sm")}><ArrowLeft className="h-4 w-4" />Chọn kỹ năng</button><div><h3 className="text-sm font-semibold">Chọn dạng {skillLabel(step.skill)}</h3><p className="mt-1 text-xs text-slate-500">Mỗi dạng mở đề mẫu để soạn. Bấm Preview để xem giao diện học sinh.</p></div><div className="grid gap-3">{kinds(step.skill).map((kind, index) => <button key={kind.id} onClick={() => setStep({ name: "edit", draft: draft(step.skill, kind.id) })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand-300"><p className="text-sm font-semibold">Dạng {index + 1}. {kind.label}</p><p className="mt-1 text-xs text-slate-500">{kind.hint}</p></button>)}</div></div>;
  if (step.name === "edit") { const value = step.draft; const editor = value.skill === "LISTENING" ? <ListeningEditor value={value} onChange={(next) => setStep({ ...step, draft: next })} /> : value.skill === "SPEAKING" ? <SpeakingEditor value={value} onChange={(next) => setStep({ ...step, draft: next })} /> : value.skill === "WRITING" ? <WritingEditor value={value} onChange={(next) => setStep({ ...step, draft: next })} /> : value.skill === "OTHER" ? <OtherEditor value={value} onChange={(next) => setStep({ ...step, draft: next })} /> : <ExerciseEditor value={value} onChange={(next) => setStep({ ...step, draft: next })} />; return <div className="space-y-4"><div className="flex items-center justify-between"><button onClick={() => setStep({ name: "list" })} className={buttonClass("ghost", "sm")}><ArrowLeft className="h-4 w-4" />Danh sách bài tập</button><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPreview(value)}><Eye className="h-4 w-4" />Preview</Button><Button size="sm" disabled={busy} onClick={() => save(value, step.exerciseId)}>{busy ? "Đang lưu..." : "Xong"}</Button></div></div><p className="text-sm text-slate-500">{skillLabel(value.skill)} · {kindLabel(value)}</p>{editor}{preview ? <Modal title="Preview bài tập" onClose={() => setPreview(null)}><div className="p-5"><LivePreview exercise={preview} /></div></Modal> : null}</div>; }
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Bài tập tương tác</h3><p className="mt-0.5 text-xs text-slate-500">Mỗi đề lưu riêng khi bấm Xong. Nút Lưu của Day không gửi bài tập.</p></div><div className="relative"><Button variant="secondary" size="sm" className="sy-edit-only" onClick={() => setSkillOpen(!skillOpen)}><Plus className="h-4 w-4" />Thêm bài tập tương tác</Button>{skillOpen ? <div className="absolute right-0 z-10 mt-1 w-60 overflow-hidden rounded-lg border bg-white py-1 shadow-lg">{SKILLS.map((skill) => <button key={skill.id} onClick={() => { setSkillOpen(false); setStep({ name: "kind", skill: skill.id }); }} className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{skill.label}</button>)}</div> : null}</div></div>{items.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-slate-500">Chưa có đề. Bấm Thêm bài tập tương tác, chọn kỹ năng, rồi chọn dạng.</p> : <ul className="divide-y rounded-xl border">{items.map((item) => <li key={item.id} className="flex items-center gap-2 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-slate-500">{skillLabel(item.skill as SkillId)} · {kindLabelFor(item.skill as SkillId, item.kind)}</p></div><Button variant="outline" size="sm" onClick={() => setPreview(item.payload as Exercise)}><Eye className="h-4 w-4" />Preview</Button><Button variant="ghost" size="sm" className="sy-edit-only" onClick={() => setStep({ name: "edit", draft: item.payload as Exercise, exerciseId: item.id })}><Pencil className="h-4 w-4" />Sửa</Button><Button variant="ghost" size="icon" className="sy-edit-only" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>}{preview ? <Modal title="Preview bài tập" onClose={() => setPreview(null)}><div className="p-5"><LivePreview exercise={preview} /></div></Modal> : null}</div>;
}

function DayPane({ document, day, onChange, teacherMode = false }: { document: SyllabusDocument; day: CourseDay; onChange: (document: SyllabusDocument) => void; teacherMode?: boolean }) {
  const { exportRef, exporting, exportPdf } = useLongPdf();
  const lessons = document.lessons.filter((lesson) => lesson.courseDayId === day.id);
  async function run(action: string, extra: Record<string, unknown> = {}) { if (action === "deleteDay" && !confirm("Xóa ngày này?")) return; onChange(await mutate(document.meta.id, { action, id: day.id, ...extra })); }
  const online = day.deliveryMode === "ONLINE" || day.track === "HOME";
  return (
    <section ref={exportRef} className="sy-day-export overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{dayHeading(day, 0)}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className={`rounded-full px-2 py-1 font-semibold ${online ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{online ? "ONLINE" : "OFFLINE"}</span>
            {day.courseNumber ? <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">Khoá {day.courseNumber}</span> : null}
            {day.phase ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{day.phase.replace(/_/g, " ")}</span> : null}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Response {day.responseLevel || "–"}</span>
            <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">{day.durationMinutes || (online ? 20 : 90)} phút</span>
          </div>
        </div>
        <button type="button" className={`${buttonClass("outline", "sm")} sy-export-hide`} onClick={() => void exportPdf(`${safeFileName(dayHeading(day, 0))}.pdf`)} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Đang xuất..." : "Xuất PDF"}
        </button>
        <div className="sy-export-hide flex items-center gap-1">
          {teacherMode ? null : <MoveButtons onMove={(direction) => run("moveDay", { direction })} />}
          {!teacherMode || day.custom ? <Button variant="ghost" size="icon" onClick={() => run("deleteDay")}><Trash2 className="h-4 w-4 text-red-600" /></Button> : null}
        </div>
      </div>
      {lessons.map((lesson) => <LessonEditor key={lesson.id} document={document} day={day} lesson={lesson} onChange={onChange} />)}
    </section>
  );
}

function LessonEditor({ document, day, lesson, onChange }: { document: SyllabusDocument; day: CourseDay; lesson: SyllabusLesson; onChange: (document: SyllabusDocument) => void }) {
  const [skills, setSkills] = useState<Record<LessonSkillKey, boolean>>({
    hasListening: Boolean(lesson.hasListening),
    hasSpeaking: Boolean(lesson.hasSpeaking),
    hasReading: Boolean(lesson.hasReading),
    hasWriting: Boolean(lesson.hasWriting),
  });
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); const fronts = fd.getAll("vocabFront").map(String); const backs = fd.getAll("vocabBack").map(String); const frontImages = fd.getAll("vocabImage").map(String); const backImages = fd.getAll("vocabBackImage").map(String); const vocabulary = fronts.map((front, index) => ({ front, back: backs[index] || "", imageUrl: frontImages[index] || undefined, backImageUrl: backImages[index] || undefined })).filter((item) => item.front || item.back || item.imageUrl || item.backImageUrl); const materialTitles = fd.getAll("materialTitle").map(String); const materialUrls = fd.getAll("materialUrl").map(String); const materials = materialTitles.map((title, index) => ({ title, url: materialUrls[index] || "" })).filter((item) => item.title || item.url); const lessonPlan = lessonPlanFields.map((label) => {
      if (label === "Speaking") {
        const lines = SPEAKING_LEVELS.map((level) => {
          const example = String(fd.get(`speakingLevel:${level.id}`) || "").trim();
          return example ? `L${level.id}: ${example}` : "";
        }).filter(Boolean);
        return lines.length ? `Speaking: ${lines.join("\n")}` : "";
      }
      if (label === "PHONICS" || label === "Song / Chant" || label === "Audio" || label === "Interactive Video") {
        const packed = packPlanMedia(String(fd.get(`lessonPlan:${label}`) || ""), String(fd.get(`planMedia:${label}`) || ""));
        return packed ? `${label}: ${packed}` : "";
      }
      const value = String(fd.get(`lessonPlan:${label}`) || "").trim();
      return value ? `${label}: ${value}` : "";
    }).filter(Boolean); const value = { ...lesson, name: fd.get("dayTitle"), hasListening: fd.has("hasListening"), hasSpeaking: fd.has("hasSpeaking"), hasReading: fd.has("hasReading"), hasWriting: fd.has("hasWriting"), tasks: String(fd.get("tasks") || "").split(/\r?\n/).filter(Boolean), vocabulary, languageTargets: fd.getAll("languageTargets").map(String).filter(Boolean), lessonOutcomes: String(fd.get("lessonOutcomes") || "").split(/\r?\n/).filter(Boolean), lessonPlan, homework: fd.get("homework"), materials }; onChange(await mutate(document.meta.id, { action: "updateLesson", id: lesson.id, lesson: value })); }
  return <div><form onSubmit={save} className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Tên bài học" className="sm:col-span-2 lg:col-span-4"><Input name="dayTitle" required defaultValue={day.title || lesson.name} /></Field><div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4">{lessonPlanSkills.map(([name, label]) => <label key={name} className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700"><input type="checkbox" name={name} checked={skills[name]} onChange={(event) => setSkills((prev) => ({ ...prev, [name]: event.target.checked }))} />{label}</label>)}</div><EqualSplitFields detail={lesson.tasks.join("\n")} outcomes={lesson.lessonOutcomes.join("\n")} /><Field label="Từ vựng" className="sm:col-span-2 lg:col-span-4"><VocabInput defaultValue={lesson.vocabulary} /></Field><Field label="Ngữ pháp" className="sm:col-span-2 lg:col-span-4"><RepeatableList name="languageTargets" defaultValue={lesson.languageTargets} addLabel="Thêm chủ điểm" placeholder="This / These, Where questions" /></Field><LessonPlanTable lesson={lesson} skills={skills} responseLevel={day.responseLevel} unit={document.units.find((item) => item.id === lesson.unitId)} /><Field label="Homework" className="sm:col-span-2 lg:col-span-4"><Textarea name="homework" rows={2} defaultValue={lesson.homework} /></Field><Field label="Teaching material" className="sm:col-span-2 lg:col-span-4"><MaterialsInput defaultValue={lesson.materials} /></Field><div className="sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm">Lưu</Button></div></form><ActivityBuilder document={document} lesson={lesson} onChange={onChange} mutate={(input) => mutate(document.meta.id, input)} />{interactiveExercisesEnabled ? <div className="border-t border-slate-100 p-3"><ExerciseBuilder document={document} lesson={lesson} onChange={onChange} /></div> : null}</div>;
}

function Detail({ id, onBack, embedded = false, readOnly = false }: { id: string; onBack: () => void; embedded?: boolean; readOnly?: boolean }) {
  const [document, setDocument] = useState<SyllabusDocument | null>(null); const [active, setActive] = useState<Target>("overview"); const [addKind, setAddKind] = useState<"section" | "unit" | null>(null); const [addUnitSectionId, setAddUnitSectionId] = useState<string | null>(null); const [addDayTarget, setAddDayTarget] = useState<{ sectionId: string; afterDayId: string; dayNumber: number; unitId?: string } | null>(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/syllabuses/${encodeURIComponent(id)}`).then(setDocument).catch((reason) => setError(reason.message)); }, [id]);
  function update(next: SyllabusDocument) { syncShell(next); setDocument(next); }
  if (error) return <p className="rounded-xl border bg-white p-6 text-sm text-red-600">{error}</p>;
  if (!document) return <p className="p-8 text-sm text-slate-400">Đang tải syllabus...</p>;
  const currentDocument = document;
  async function addSection(type: string, title: string) {
    if (addKind === "unit" && addUnitSectionId) {
      const knownIds = new Set(currentDocument.units.map((item) => item.id));
      const next = await mutate(currentDocument.meta.id, { action: "createUnit", sectionId: addUnitSectionId, title });
      update(next);
      const created = next.units.find((item) => !knownIds.has(item.id));
      if (created) setActive(`unit-${created.id}`);
      return;
    }
    const knownIds = new Set(currentDocument.sections.map((item) => item.id));
    const next = await mutate(currentDocument.meta.id, { action: "createSection", type, title });
    update(next);
    const created = next.sections.find((item) => !knownIds.has(item.id));
    if (created) setActive(created.type === "COURSE" || !created.unitId ? `course-${created.id}` : `unit-${created.unitId}`);
  }
  async function addDay(title: string) { if (!addDayTarget) return; const knownIds = new Set(currentDocument.days.map((item) => item.id)); const next = await mutate(currentDocument.meta.id, { action: "createDay", sectionId: addDayTarget.sectionId, afterDayId: addDayTarget.afterDayId, unitId: addDayTarget.unitId, title }); update(next); const created = next.days.find((item) => !knownIds.has(item.id)); if (created) setActive(`day-${created.id}`); }
  let pane: React.ReactNode = <Overview document={document} onChange={update} />;
  const teacherMode = readOnly;
  const activeDay = active.startsWith("day-") ? document.days.find((item) => item.id === active.slice(4)) : undefined;
  const activeUnit = active.startsWith("unit-") ? document.units.find((item) => item.id === active.slice(5)) : undefined;
  const paneLocked = teacherMode && !activeDay?.custom && !activeUnit?.custom;
  const addUnitSectionIdFromTree = (() => {
    if (active.startsWith("course-")) return active.slice(7);
    if (activeUnit?.sectionId) return activeUnit.sectionId;
    if (activeDay?.sectionId) return activeDay.sectionId;
    const courses = document.sections.filter((item) => item.type === "COURSE");
    return courses[courses.length - 1]?.id || document.sections[0]?.id || "";
  })();
  if (active.startsWith("course-")) { const section = document.sections.find((item) => item.id === active.slice(7)); if (section) pane = <CoursePane key={section.id} document={document} section={section} />; }
  if (activeUnit) pane = <UnitPane key={activeUnit.id} document={document} unit={activeUnit} onChange={update} />;
  if (activeDay) pane = <DayPane key={activeDay.id} document={document} day={activeDay} onChange={update} teacherMode={teacherMode} />;
  return <div className={`${embedded ? "relative flex min-h-[70vh] flex-col" : "absolute inset-0 flex flex-col"} bg-background`}>{embedded ? null : <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-white px-4"><button onClick={onBack} title="Danh sách syllabus" className={buttonClass("ghost", "icon")}><ArrowLeft className="h-4 w-4" /></button><p className="truncate text-[13px] font-bold tracking-tight">{document.meta.name}</p></div>}<div className="flex min-h-0 flex-1"><aside className="hidden w-[17rem] shrink-0 overflow-y-auto border-r bg-white lg:block"><Tree document={document} active={active} canEdit onSelect={setActive} onAdd={() => { setAddUnitSectionId(addUnitSectionIdFromTree || null); setAddKind("unit"); }} onAddDay={(sectionId, afterDayId, dayNumber, unitId) => setAddDayTarget({ sectionId, afterDayId, dayNumber, unitId })} /></aside><div className={`min-w-0 flex-1 overflow-y-auto px-3 py-3 lg:px-6 ${paneLocked ? "sy-readonly" : ""}`}><label className="mb-3 block lg:hidden"><span className="sr-only">Nhảy tới</span><select value={active} onChange={(event) => setActive(event.target.value as Target)} className="sy-nav-select w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value="overview">Overview</option>{document.sections.flatMap((section) => [<option key={`course-${section.id}`} value={section.type === "COURSE" || !section.unitId ? `course-${section.id}` : `unit-${section.unitId}`}>{section.title}</option>, ...document.units.filter((unit) => unit.sectionId === section.id).map((unit) => <option key={`unit-${unit.id}`} value={`unit-${unit.id}`}>{section.title} · {unit.name}</option>), ...document.days.filter((day) => day.sectionId === section.id).map((day, index) => <option key={day.id} value={`day-${day.id}`}>{section.title} · {dayHeading(day, index)}</option>)])}</select></label>{pane}</div></div>{addKind ? <AddSectionModal kind={addKind} unitNumber={document.units.length + 1} onClose={() => { setAddKind(null); setAddUnitSectionId(null); }} onCreate={addSection} /> : null}{addDayTarget ? <AddDayModal dayNumber={addDayTarget.dayNumber} onClose={() => setAddDayTarget(null)} onCreate={addDay} /> : null}</div>;
}

function App() {
  const route = location.pathname.match(/^\/syllabus\/([^/]+)/); const [selected, setSelected] = useState<string | null>(route ? decodeURIComponent(route[1]) : null);
  function open(id: string) { state.selectedSyllabus = id; setSelected(id); history.pushState({}, "", `/syllabus/${id}`); }
  function back() { state.selectedSyllabus = null; setSelected(null); history.pushState({}, "", "/syllabus"); }
  useEffect(() => { const handler = () => { const match = location.pathname.match(/^\/syllabus\/([^/]+)/); setSelected(match ? decodeURIComponent(match[1]) : null); }; addEventListener("popstate", handler); return () => removeEventListener("popstate", handler); }, []);
  useEffect(() => { const content = document.querySelector(".admin-content"); content?.classList.toggle("sy-react-detail", Boolean(selected)); return () => content?.classList.remove("sy-react-detail"); }, [selected]);
  return selected ? <Detail id={selected} onBack={back} /> : <SyllabusList onOpen={open} />;
}

const baseBindApp = bindApp;
adminSyllabusPage = () => '<div id="syllabus-react-root" class="relative min-h-full"></div>';
activityPreviewPage = () => '<div id="activity-preview-root"></div>';
void adminSyllabusPage;
void activityPreviewPage;
bindApp = function () {
  baseBindApp();
  const target = document.getElementById("syllabus-react-root");
  if (target) createRoot(target).render(<App />);
  const classTarget = document.getElementById("class-syllabus-react-root");
  if (classTarget?.dataset.syllabusId) {
    createRoot(classTarget).render(
      <Detail
        id={classTarget.dataset.syllabusId}
        onBack={() => undefined}
        embedded
        readOnly={classTarget.dataset.readonly === "1"}
      />,
    );
  }
  const previewTarget = document.getElementById("activity-preview-root");
  const previewRoute = location.pathname.match(/^\/activity-preview\/([^/]+)\/([^/]+)/);
  if (previewTarget && previewRoute) createRoot(previewTarget).render(<ActivityPreviewApp syllabusId={decodeURIComponent(previewRoute[1])} activityId={decodeURIComponent(previewRoute[2])} />);
  const portalTarget = document.getElementById("portal-activity-root");
  if (portalTarget?.dataset.syllabusId && portalTarget.dataset.activityId) createRoot(portalTarget).render(<PortalActivityEmbed syllabusId={portalTarget.dataset.syllabusId} activityId={portalTarget.dataset.activityId} />);
};

queueMicrotask(() => { if (state.data) render(); });
