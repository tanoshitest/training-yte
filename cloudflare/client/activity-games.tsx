import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, Download, ChevronRight, Eye, Gamepad2, Headphones, Mic, Pause, Pencil, Play, Plus, RotateCcw, Sparkles, Square, Star, Trash2, Volume2, X } from "lucide-react";

import { flashcardImageUrl } from "../flashcard-images";

import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { activityRegistry, defaultActivity, engineDefinition, parseActivityItems, serializeActivityItems } from "../activity-registry";
import type { ActivityEngineType, GameActivity } from "../activity-types";
import type { SyllabusDocument, SyllabusLesson } from "../syllabus-types";

declare const api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;

type BuilderProps = {
  document: SyllabusDocument;
  lesson: SyllabusLesson;
  onChange: (document: SyllabusDocument) => void;
  mutate: (input: Record<string, unknown>) => Promise<SyllabusDocument>;
};

function ActivityModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose}>
    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>{children}</div>
  </div>;
}

export function ActivityBuilder({ document, lesson, onChange, mutate }: BuilderProps) {
  const activities = (document.activities ?? []).filter((item) => item.lessonId === lesson.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const [chooser, setChooser] = useState(false);
  const [editing, setEditing] = useState<GameActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(engineType: ActivityEngineType) {
    setChooser(false);
    setEditing(defaultActivity(lesson.id, engineType, activities.length + 1));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError("");
    const fd = new FormData(event.currentTarget);
    const next: GameActivity = {
      ...editing,
      engineType: String(fd.get("engineType")) as ActivityEngineType,
      mode: String(fd.get("mode")),
      title: String(fd.get("title") || ""),
      instruction: String(fd.get("instruction") || ""),
      status: String(fd.get("status")) as GameActivity["status"],
      passingScore: Number(fd.get("passingScore") || 70),
      starsReward: Number(fd.get("starsReward") || 1),
      config: {
        prompt: String(fd.get("prompt") || ""),
        content: String(fd.get("content") || ""),
        mediaUrl: String(fd.get("mediaUrl") || ""),
        items: parseActivityItems(String(fd.get("items") || "")),
      },
    };
    try {
      const updated = await mutate({ action: "upsertActivity", lessonId: lesson.id, activityId: activities.some((item) => item.id === editing.id) ? editing.id : undefined, activity: next });
      onChange(updated); setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không lưu được game."); }
    finally { setBusy(false); }
  }

  async function remove(activity: GameActivity) {
    if (!confirm(`Xóa game “${activity.title}”?`)) return;
    onChange(await mutate({ action: "deleteActivity", lessonId: lesson.id, activityId: activity.id }));
  }

  function preview(activity: GameActivity) {
    window.open(`/activity-preview/${encodeURIComponent(document.meta.id)}/${encodeURIComponent(activity.id)}`, "_blank", "noopener,noreferrer");
  }

  return <section className="activity-builder border-t-8 border-slate-100 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><span className="activity-icon"><Gamepad2 className="h-4 w-4" /></span><h3 className="text-base font-semibold text-slate-900">Game tương tác cho Portal</h3></div><p className="mt-1 text-sm text-slate-500">Khối riêng của Day. Game đã xuất bản sẽ xuất hiện trong Portal học viên.</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" className="sy-edit-only" onClick={() => setChooser(true)}><Plus className="h-4 w-4" />Thêm game</Button></div>
    </div>
    {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    {activities.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center"><Gamepad2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium">Chưa có game trong Day này</p><p className="mt-1 text-xs text-slate-500">Bấm Thêm game để chọn loại và soạn nội dung.</p></div> : <div className="mt-4 grid gap-3 xl:grid-cols-2">{activities.map((activity) => {
      const engine = engineDefinition(activity.engineType);
      return <article key={activity.id} className="rounded-xl border border-slate-200 p-4 hover:border-brand-300"><div className="flex items-start gap-3"><span className="activity-number">{activity.sortOrder}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-sm font-semibold">{activity.title}</h4><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${activity.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{activity.status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}</span></div><p className="mt-1 text-xs text-slate-500">{engine.label} · {engine.modes.find((mode) => mode.id === activity.mode)?.label}</p></div></div><div className="mt-3 flex justify-end gap-1"><Button variant="outline" size="sm" onClick={() => preview(activity)}><Eye className="h-4 w-4" />Preview</Button><Button variant="ghost" size="icon" className="sy-edit-only" title="Sửa" onClick={() => setEditing(structuredClone(activity))}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="sy-edit-only" title="Xóa" onClick={() => remove(activity)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></article>;
    })}</div>}

    {chooser ? <ActivityModal onClose={() => setChooser(false)}><div className="flex items-center justify-between border-b p-4"><div><h3 className="font-semibold">Chọn loại game</h3><p className="text-xs text-slate-500">12 activity engines trong plan STEPS LMS</p></div><button className={buttonClass("ghost", "icon")} onClick={() => setChooser(false)}><X className="h-4 w-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{activityRegistry.map((engine, index) => <button key={engine.id} onClick={() => choose(engine.id)} className="rounded-xl border border-slate-200 p-4 text-left hover:border-brand-400 hover:bg-brand-50"><span className="text-xs font-semibold text-brand-600">{String(index + 1).padStart(2, "0")}</span><strong className="mt-1 block text-sm">{engine.label}</strong><span className="mt-1 block text-xs text-slate-500">{engine.description}</span></button>)}</div></ActivityModal> : null}

    {editing ? <ActivityModal onClose={() => setEditing(null)}><form onSubmit={save}><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4"><div><h3 className="font-semibold">Soạn game · {engineDefinition(editing.engineType).label}</h3><p className="text-xs text-slate-500">Mỗi dòng nội dung: Câu hỏi | Đáp án đúng | Đáp án nhiễu 1 | Đáp án nhiễu 2</p></div><button type="button" className={buttonClass("ghost", "icon")} onClick={() => setEditing(null)}><X className="h-4 w-4" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Loại game"><Select name="engineType" value={editing.engineType} onChange={(event) => { const engineType = event.target.value as ActivityEngineType; const engine = engineDefinition(engineType); setEditing({ ...editing, engineType, mode: engine.modes[0]!.id }); }}>{activityRegistry.map((engine) => <option key={engine.id} value={engine.id}>{engine.label}</option>)}</Select></Field>
      <Field label="Chế độ"><Select name="mode" value={editing.mode} onChange={(event) => setEditing({ ...editing, mode: event.target.value })}>{engineDefinition(editing.engineType).modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</Select></Field>
      <Field label="Tên game"><Input name="title" defaultValue={editing.title} required /></Field><Field label="Trạng thái"><Select name="status" defaultValue={editing.status}><option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Xuất bản lên Portal</option></Select></Field>
      <Field label="Hướng dẫn" className="sm:col-span-2"><Input name="instruction" defaultValue={editing.instruction} /></Field>
      <Field label="Câu dẫn / chủ đề" className="sm:col-span-2"><Input name="prompt" defaultValue={editing.config.prompt} placeholder="Ví dụ: Chọn đáp án đúng" /></Field>
      <Field label="URL audio/video" className="sm:col-span-2" hint="Dùng cho Audio Choice, Video, Song hoặc Speaking"><Input name="mediaUrl" type="url" defaultValue={editing.config.mediaUrl} placeholder="https://..." /></Field>
      <Field label="Nội dung / lời bài hát / bài đọc" className="sm:col-span-2" hint="Với Reader, ngăn các trang bằng một dòng ---"><Textarea name="content" rows={4} defaultValue={editing.config.content} /></Field>
      <Field label="Câu hỏi và đáp án" className="sm:col-span-2" hint="Một dòng một mục; các phần cách nhau bằng dấu |"><Textarea name="items" rows={7} defaultValue={serializeActivityItems(editing.config)} required /></Field>
      <Field label="Điểm đạt"><Input name="passingScore" type="number" min={0} max={100} defaultValue={editing.passingScore} /></Field><Field label="Số sao thưởng"><Input name="starsReward" type="number" min={0} max={10} defaultValue={editing.starsReward} /></Field>
      {error ? <p className="sm:col-span-2 text-sm text-red-600">{error}</p> : null}
    </div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Lưu game"}</Button></div></form></ActivityModal> : null}
  </section>;
}

function Media({ activity }: { activity: GameActivity }) {
  const url = activity.config.mediaUrl;
  if (!url) return null;
  if (activity.engineType === "interactive_video") return <video className="activity-media" controls src={url}>Trình duyệt không hỗ trợ video.</video>;
  return <audio className="w-full" controls src={url}>Trình duyệt không hỗ trợ audio.</audio>;
}

function ChoiceGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const [index, setIndex] = useState(0); const [answers, setAnswers] = useState<string[]>([]); const [selected, setSelected] = useState("");
  const item = activity.config.items[index];
  if (!item) return <p>Game chưa có câu hỏi.</p>;
  const options = [...new Set([item.answer, ...item.options])].sort((a, b) => a.localeCompare(b));
  function next() { const nextAnswers = [...answers, selected]; if (index + 1 >= activity.config.items.length) { const correct = nextAnswers.filter((answer, position) => answer === activity.config.items[position]?.answer).length; onFinish(Math.round(correct / activity.config.items.length * 100), nextAnswers); } else { setAnswers(nextAnswers); setIndex(index + 1); setSelected(""); } }
  return <div className="space-y-5"><Media activity={activity} /><div><span className="activity-progress">Câu {index + 1}/{activity.config.items.length}</span><h2 className="mt-3 text-xl font-semibold">{item.prompt}</h2></div><div className="grid gap-3 sm:grid-cols-2">{options.map((option) => <button key={option} onClick={() => setSelected(option)} className={`activity-option ${selected === option ? "selected" : ""}`}>{option}</button>)}</div><Button disabled={!selected} onClick={next}>{index + 1 === activity.config.items.length ? "Hoàn thành" : "Câu tiếp theo"}</Button></div>;
}

const MALE_VOICE = /male|david|daniel|alex|fred|mark|guy|tom|james|aaron|arthur|rishi|george|thomas|gordon|ryan|nathan|matthew/i;
const FEMALE_VOICE = /female|samantha|victoria|karen|moira|tessa|fiona|zira|susan|siri|hazel|serena|allison|ava|jenny|aria|natasha/i;

function englishVoices() {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((voice) => /^en\b/i.test(voice.lang) || /english/i.test(voice.name));
  return english.length ? english : voices;
}

function pickMaleEnglishVoice() {
  return englishVoices().find((voice) => MALE_VOICE.test(voice.name) && !FEMALE_VOICE.test(voice.name));
}

let heldUtterance: SpeechSynthesisUtterance | null = null;
let resumeTimer = 0;

function speakEnglish(text: string) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const word = text.split("/")[0].trim();
  if (!word) return;
  synth.getVoices();
  if (synth.speaking || synth.pending) synth.cancel();
  const speech = new SpeechSynthesisUtterance(word);
  heldUtterance = speech;
  speech.rate = 0.85;
  speech.lang = "en-GB";
  speech.pitch = 0.7;
  const voice = pickMaleEnglishVoice();
  if (voice) {
    speech.voice = voice;
    speech.lang = voice.lang || "en-GB";
    speech.pitch = 1;
  }
  speech.onend = () => window.clearInterval(resumeTimer);
  speech.onerror = () => window.clearInterval(resumeTimer);
  synth.speak(speech);
  synth.resume();
  window.clearInterval(resumeTimer);
  resumeTimer = window.setInterval(() => {
    if (!synth.speaking) {
      window.clearInterval(resumeTimer);
      return;
    }
    if (synth.paused) synth.resume();
  }, 250);
}

let currentClip: HTMLAudioElement | null = null;

/** Có file âm thanh tải lên thì phát file; không có thì đọc bằng giọng máy. */
function playItemSound(item: { prompt: string; audio?: string }) {
  if (currentClip) { currentClip.pause(); currentClip = null; }
  if (item.audio) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    currentClip = new Audio(item.audio);
    currentClip.play().catch(() => speakEnglish(item.prompt));
    return;
  }
  speakEnglish(item.prompt);
}

function CardsGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const [index, setIndex] = useState(0); const [revealed, setRevealed] = useState(false); const [heard, setHeard] = useState(false); const item = activity.config.items[index];
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    const warm = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", warm);
  }, []);
  if (!item) return <p>Game chưa có nội dung.</p>;
  const image = item.image || flashcardImageUrl(item.prompt);
  // Bấm lần 1: phát âm thẻ hiện tại. Bấm lần 2: sang thẻ mới (thẻ cuối thì hoàn thành).
  function next() {
    if (!heard) { playItemSound(item!); setHeard(true); return; }
    if (index + 1 >= activity.config.items.length) onFinish(100, activity.config.items.map((entry) => entry.id));
    else { setIndex(index + 1); setRevealed(false); setHeard(false); }
  }
  return (
    <div className="activity-cards-game mx-auto max-w-2xl text-center">
      <span className="activity-progress">Thẻ {index + 1}/{activity.config.items.length}</span>
      <div className="activity-flash-stack">
        <div className="activity-flash-wrap">
          <button type="button" className={`activity-flashcard${revealed ? " revealed" : ""}`} onClick={() => setRevealed((open) => !open)} aria-label={item.prompt}>
            <span className="activity-flash-inner">
              <span className="activity-flash-face">
                {image ? <img src={image} alt="" /> : <strong>{item.prompt}</strong>}
              </span>
              <span className="activity-flash-face activity-flash-back">
                <strong className="sy-flashcard-word">{item.prompt}</strong>
                {item.answer ? <small className="activity-flash-meaning">{item.answer}</small> : null}
              </span>
            </span>
          </button>
        </div>
      </div>
      <Button onClick={next}>{index + 1 === activity.config.items.length ? "Hoàn thành" : "Thẻ tiếp theo"}</Button>
    </div>
  );
}

function MatchingGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const [left, setLeft] = useState(""); const [matched, setMatched] = useState<string[]>([]); const answers = useMemo(() => [...activity.config.items].reverse(), [activity]);
  function pickAnswer(answer: string) { if (!left) return; const item = activity.config.items.find((entry) => entry.id === left); if (item?.answer === answer) { const next = [...matched, left]; setMatched(next); setLeft(""); if (next.length === activity.config.items.length) onFinish(100, next); } else setLeft(""); }
  return <div><p className="mb-4 text-sm text-slate-500">Chọn một thẻ bên trái rồi chọn đáp án tương ứng.</p><div className="grid grid-cols-2 gap-4"><div className="space-y-2">{activity.config.items.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => setLeft(item.id)} className={`activity-option w-full ${left === item.id ? "selected" : ""}`}>{matched.includes(item.id) ? "✓ " : ""}{item.prompt}</button>)}</div><div className="space-y-2">{answers.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => pickAnswer(item.answer)} className="activity-option w-full">{matched.includes(item.id) ? "✓ " : ""}{item.answer}</button>)}</div></div></div>;
}

function SentenceGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const item = activity.config.items[0]; const words = useMemo(() => (item?.answer || "").split(/\s+/).filter(Boolean).sort((a, b) => b.localeCompare(a)), [item]); const [selected, setSelected] = useState<string[]>([]);
  if (!item) return <p>Game chưa có câu mẫu.</p>;
  const remaining = words.filter((_, index) => !selected.includes(String(index)));
  function finish() { const sentence = selected.map((key) => words[Number(key)]).join(" "); onFinish(sentence === item.answer ? 100 : 0, [sentence]); }
  return <div className="space-y-5"><h2 className="text-xl font-semibold">{item.prompt}</h2><div className="activity-sentence">{selected.length ? selected.map((key) => words[Number(key)]).join(" ") : "Chọn các từ theo đúng thứ tự"}</div><div className="flex flex-wrap gap-2">{words.map((word, index) => !selected.includes(String(index)) ? <button key={`${word}-${index}`} className="activity-token" onClick={() => setSelected([...selected, String(index)])}>{word}</button> : null)}</div><div className="flex gap-2"><Button variant="outline" onClick={() => setSelected([])}>Làm lại</Button><Button disabled={remaining.length > 0} onClick={finish}>Kiểm tra</Button></div></div>;
}

function ReaderGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const items = activity.config.items;
  // Sách soạn ở Portal: mỗi trang = ảnh + câu (+ nghĩa, âm thanh).
  if (activity.portalBlock === "sentences" || items.some((item) => item.image || item.audio)) return <PictureBookGame activity={activity} onFinish={onFinish} />;
  const pages = activity.config.content ? activity.config.content.split(/\n---\n/).filter(Boolean) : activity.config.items.map((item) => `${item.prompt}\n\n${item.answer}`); const [page, setPage] = useState(0);
  // Nhiệm vụ về nhà: phiếu bài tập PDF đính kèm → nút Tải bài tập.
  const homeworkFile = activity.portalBlock === "homework" ? String(activity.config.mediaUrl || "") : "";
  const homeworkName = String(activity.config.prompt || "").trim() || "STEPS - Bai tap ve nha.pdf";
  return <div className="mx-auto max-w-3xl"><span className="activity-progress">Trang {page + 1}/{Math.max(1, pages.length)}</span><article className="activity-reader">{pages[page] || "Chưa có nội dung bài đọc."}</article>{homeworkFile ? <div className="activity-homework-file"><a className="activity-homework-download" href={homeworkFile} download={homeworkName}><Download className="h-5 w-5" />Tải bài tập</a><a className="activity-homework-view" href={homeworkFile} target="_blank" rel="noopener">Xem trước</a></div> : null}<div className="flex justify-between"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Trang trước</Button>{page + 1 >= pages.length ? <Button onClick={() => onFinish(100, ["read"])}>Hoàn thành</Button> : <Button onClick={() => setPage(page + 1)}>Trang sau</Button>}</div></div>;
}

function PictureBookGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const items = activity.config.items; const [page, setPage] = useState(0); const item = items[page];
  if (!item) return <p>Chưa có trang sách.</p>;
  return <div className="activity-book-game mx-auto max-w-3xl"><span className="activity-progress">Trang {page + 1}/{items.length}</span><article className="activity-book-page">{item.image ? <img src={item.image} alt="" /> : null}<div className="activity-book-text"><strong>{item.prompt}</strong>{item.answer ? <small>{item.answer}</small> : null}</div><button type="button" className="activity-speak" onClick={() => playItemSound(item)}><Volume2 className="h-5 w-5" />Nghe</button></article><div className="activity-book-nav flex justify-between"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Trang trước</Button>{page + 1 >= items.length ? <Button onClick={() => onFinish(100, ["read"])}>Hoàn thành</Button> : <Button onClick={() => setPage(page + 1)}>Trang sau</Button>}</div></div>;
}

function SpeakingGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const [recording, setRecording] = useState(false); const [audioUrl, setAudioUrl] = useState(""); const [error, setError] = useState("");
  async function toggle() { if (recording) { recorder.current?.stop(); setRecording(false); return; } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const value = new MediaRecorder(stream); chunks.current = []; value.ondataavailable = (event) => chunks.current.push(event.data); value.onstop = () => { setAudioUrl(URL.createObjectURL(new Blob(chunks.current, { type: value.mimeType }))); stream.getTracks().forEach((track) => track.stop()); }; recorder.current = value; value.start(); setRecording(true); } catch { setError("Trình duyệt chưa cấp quyền microphone."); } }
  return <div className="mx-auto max-w-2xl text-center"><Media activity={activity} /><h2 className="mt-5 text-xl font-semibold">{activity.config.prompt || activity.config.items[0]?.prompt}</h2><p className="mt-2 text-slate-500">{activity.config.items[0]?.answer}</p><button className={`activity-record ${recording ? "recording" : ""}`} onClick={toggle}>{recording ? <Pause /> : <Mic />}<span>{recording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}</span></button>{audioUrl ? <audio className="mx-auto mt-4" controls src={audioUrl} /> : null}{error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}<div className="mt-5"><Button disabled={!audioUrl} onClick={() => onFinish(100, ["recorded"])}>Hoàn thành</Button></div></div>;
}

function MediaGame({ activity, onFinish }: { activity: GameActivity; onFinish: (score: number, answers: unknown[]) => void }) {
  const text = activity.config.content || activity.config.prompt || activity.config.items[0]?.prompt;
  return <div className="activity-media-game space-y-5"><Media activity={activity} /><div className="activity-media-side">{text ? <div className="activity-reader">{text}</div> : null}<Button onClick={() => onFinish(100, ["played"])}>Đã nghe/xem xong</Button></div></div>;
}

/* ---------- Đọc sách (Portal): sách tranh — bìa, chọn Nghe đọc / Tự đọc, lật từng trang ---------- */
type BookPage = { key: string; image?: string; text: string; meaning?: string; audio?: string; cover?: boolean };
type BookModes = { listen?: boolean; read?: boolean };

function bookModesKey(activityId: string) { return `steps.book.${activityId}`; }
function loadBookModes(activityId: string): BookModes { try { return JSON.parse(localStorage.getItem(bookModesKey(activityId)) || "{}") || {}; } catch { return {}; } }
function saveBookModes(activityId: string, modes: BookModes) { try { localStorage.setItem(bookModesKey(activityId), JSON.stringify(modes)); } catch { /* bỏ qua */ } }

function stopAllSound() {
  if (currentClip) { currentClip.onended = null; currentClip.pause(); currentClip = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  window.clearInterval(resumeTimer);
}

/** Đọc cả câu bằng giọng máy, xong mới resolve (có hạn giờ phòng máy không báo onend). */
function speakWait(text: string) {
  return new Promise<void>((resolve) => {
    const clean = text.trim();
    if (!clean || !("speechSynthesis" in window)) { setTimeout(resolve, 1200); return; }
    const synth = window.speechSynthesis;
    synth.getVoices();
    const speech = new SpeechSynthesisUtterance(clean);
    heldUtterance = speech;
    speech.rate = 0.8; speech.lang = "en-GB";
    const voice = pickMaleEnglishVoice();
    if (voice) { speech.voice = voice; speech.lang = voice.lang || "en-GB"; }
    let settled = false;
    const done = () => { if (settled) return; settled = true; window.clearTimeout(guard); window.clearInterval(resumeTimer); resolve(); };
    const guard = window.setTimeout(done, 2500 + clean.length * 110);
    speech.onend = done; speech.onerror = done;
    synth.speak(speech); synth.resume();
    window.clearInterval(resumeTimer);
    resumeTimer = window.setInterval(() => { if (synth.paused) synth.resume(); }, 250);
  });
}

/** Phát file âm thanh của trang (không có thì giọng máy) và chờ phát xong. */
function playAndWait(page: { text: string; audio?: string }) {
  stopAllSound();
  if (!page.audio) return speakWait(page.text);
  return new Promise<void>((resolve) => {
    const clip = new Audio(page.audio); currentClip = clip;
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    clip.onended = done;
    clip.onerror = () => { void speakWait(page.text).then(done); };
    clip.play().catch(() => { void speakWait(page.text).then(done); });
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function StoryBookGame({ activity, onSave, onFinish }: { activity: GameActivity; onSave: (score: number, answers: unknown[]) => Promise<boolean>; onFinish: (score: number, answers: unknown[]) => void }) {
  const items = activity.config.items.filter((item) => item.prompt?.trim() || item.image);
  const cover = activity.config.mediaUrl || items[0]?.image || "";
  const pages: BookPage[] = useMemo(() => [
    { key: "cover", cover: true, image: cover, text: activity.title },
    ...items.map((item) => ({ key: item.id, image: item.image, text: item.prompt?.trim() || "", meaning: item.answer, audio: item.audio })),
  ], [activity.id, activity.config.items.length]);
  const words = String(activity.config.content || "").split(/[\n,;]+/).map((word) => word.trim()).filter(Boolean);
  const [mode, setMode] = useState<"menu" | "listen" | "read" | "done">("menu");
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<"next" | "prev">("next");
  const [playing, setPlaying] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [modes, setModes] = useState<BookModes>(() => loadBookModes(activity.id));
  const [lastMode, setLastMode] = useState<"listen" | "read">("listen");
  const [saved, setSaved] = useState<"" | "saving" | "ok" | "fail">("");
  const [phase, setPhase] = useState<"idle" | "recording" | "checking">("idle");
  const [micError, setMicError] = useState("");
  const [results, setResults] = useState<Record<string, ReadResult>>({});
  const run = useRef(0);
  const touch = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = pages[page];
  const last = pages.length - 1;

  useEffect(() => () => { run.current += 1; stopAllSound(); if (stopTimer.current) clearTimeout(stopTimer.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => { if ("speechSynthesis" in window) window.speechSynthesis.getVoices(); }, []);

  // Nghe đọc: đọc trang hiện tại → chờ → tự lật trang, hết sách thì sang màn chúc mừng.
  useEffect(() => {
    if (mode !== "listen" || !playing) return;
    const token = ++run.current;
    (async () => {
      await sleep(page === 0 ? 400 : 650);
      if (token !== run.current) return;
      setSpeaking(true);
      await playAndWait(current);
      if (token !== run.current) return;
      setSpeaking(false);
      await sleep(900);
      if (token !== run.current) return;
      if (page >= last) finishMode("listen"); else { setTurn("next"); setPage(page + 1); }
    })();
    return () => { if (token === run.current) { run.current += 1; stopAllSound(); setSpeaking(false); } };
  }, [mode, page, playing]);

  function open(next: "listen" | "read") { run.current += 1; stopAllSound(); setTurn("next"); setPage(0); setPlaying(true); setSpeaking(false); setMicError(""); setMode(next); setLastMode(next); }
  function toMenu() { run.current += 1; stopAllSound(); setSpeaking(false); setMode("menu"); }
  function go(delta: number) {
    if (phase !== "idle") return;
    const target = page + delta;
    if (target < 0) return;
    if (target > last) { if (mode === "read") finishMode("read"); return; }
    run.current += 1; stopAllSound(); setSpeaking(false); setMicError("");
    setTurn(delta > 0 ? "next" : "prev"); setPage(target);
  }
  function finishMode(which: "listen" | "read") {
    run.current += 1; stopAllSound(); setSpeaking(false);
    const nextModes = { ...modes, [which]: true }; setModes(nextModes); saveBookModes(activity.id, nextModes);
    setMode("done"); setSaved("saving");
    const scores = Object.values(results).map((result) => result.score);
    const score = which === "read" && scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 100;
    void onSave(Math.max(score, 60), [{ mode: which, pages: pages.length - 1, read: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.score])) }]).then((ok) => setSaved(ok ? "ok" : "fail"));
  }
  async function hear() { if (speaking) { stopAllSound(); setSpeaking(false); return; } const token = ++run.current; setSpeaking(true); await playAndWait(current); if (token === run.current) setSpeaking(false); }

  async function record() {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMicError("Máy chưa hỗ trợ ghi âm — dùng Chrome nhé."); return; }
    try {
      run.current += 1; stopAllSound(); setSpeaking(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      const target = current;
      rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      rec.onstop = () => { stream.getTracks().forEach((track) => track.stop()); void check(target, new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" })); };
      recorder.current = rec; rec.start(); setPhase("recording");
      stopTimer.current = setTimeout(stopRecord, 15000);
    } catch { setMicError("Chưa mở được micro — em cho phép trình duyệt dùng micro nhé."); }
  }
  function stopRecord() { if (stopTimer.current) clearTimeout(stopTimer.current); if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); }
  async function check(target: BookPage, blob: Blob) {
    setPhase("checking");
    try {
      const audioBase64 = await blobToBase64(blob);
      const response = await api<ReadResult>("/api/portal/read-check", { method: "POST", body: JSON.stringify({ text: target.text, audioBase64, mime: blob.type }) });
      setResults((prev) => ({ ...prev, [target.key]: response }));
    } catch (reason) { setMicError(reason instanceof Error ? reason.message : "Chưa chấm được, em đọc lại nhé."); }
    finally { setPhase("idle"); }
  }

  const modeButton = (which: "listen" | "read", label: string, hint: string, IconEl: typeof Headphones) => <button type="button" className={`sb-mode ${modes[which] ? "done" : ""}`} disabled={items.length === 0} onClick={() => open(which)}><span className="sb-mode-icon"><IconEl />{modes[which] ? <i><Check /></i> : null}</span><span className="sb-mode-copy"><b>{label}</b><small>{hint}</small></span><ChevronRight className="sb-mode-go" /></button>;

  if (mode === "menu") {
    return <div className="sb-menu">
      <div className="sb-cover">{cover ? <img src={cover} alt="" /> : <span className="sb-cover-blank"><BookOpen /></span>}</div>
      <div className="sb-menu-side">
        <h2 className="sb-title">{activity.title}</h2>
        {activity.config.prompt ? <p className="sb-author">{activity.config.prompt}</p> : null}
        {words.length ? <div className="sb-words"><small>Từ cần biết</small><div>{words.map((word) => <span key={word}>{word}</span>)}</div></div> : null}
        {items.length ? <div className="sb-modes">
          {modeButton("listen", "Nghe đọc", "Sách tự đọc và tự lật trang", Headphones)}
          {modeButton("read", "Tự đọc", "Em tự lật trang, bấm Nghe hoặc thu âm đọc to", BookOpen)}
        </div> : <p className="sb-empty">Sách đang được soạn — cô sẽ cập nhật sớm nhé!</p>}
      </div>
    </div>;
  }

  if (mode === "done") {
    const other = lastMode === "listen" ? "read" : "listen";
    return <div className="sb-done">
      <div className="sb-ribbon">Tuyệt vời!</div>
      <div className="sb-burst">{[0, 1, 2].map((index) => <Star key={index} />)}</div>
      <p className="sb-done-text">Em đã {lastMode === "listen" ? "nghe" : "đọc"} xong cuốn <b>{activity.title}</b>.</p>
      <div className="sb-done-modes">
        <span className={modes.listen ? "on" : ""}><Headphones />{modes.listen ? <i><Check /></i> : null}</span>
        <span className={modes.read ? "on" : ""}><BookOpen />{modes.read ? <i><Check /></i> : null}</span>
      </div>
      <small className="sb-saved">{saved === "saving" ? "Đang lưu kết quả…" : saved === "ok" ? (activity.starsReward ? `Đã lưu · +${activity.starsReward} sao` : "Đã lưu kết quả") : saved === "fail" ? "Chưa lưu được kết quả — kiểm tra mạng nhé." : ""}</small>
      <div className="sb-done-actions">
        <Button variant="outline" onClick={() => open(other)}>{other === "listen" ? <Headphones className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}{other === "listen" ? "Nghe đọc" : "Tự đọc"}</Button>
        <Button variant="outline" onClick={toMenu}><RotateCcw className="h-4 w-4" />Về bìa sách</Button>
      </div>
    </div>;
  }

  const result = results[current.key];
  return <div className={`sb-viewer ${mode}`}>
    <div className="sb-bar">
      <button type="button" className="sb-icon-btn" onClick={toMenu} aria-label="Về bìa sách"><ArrowLeft /></button>
      <div className="sb-bar-title"><b>{activity.title}</b><small>{mode === "listen" ? "Nghe đọc" : "Tự đọc"} · {page === 0 ? "Bìa" : `Trang ${page}/${last}`}</small></div>
      {mode === "listen"
        ? <button type="button" className="sb-icon-btn primary" onClick={() => setPlaying(!playing)} aria-label={playing ? "Tạm dừng" : "Phát"}>{playing ? <Pause /> : <Play />}</button>
        : <button type="button" className={`sb-icon-btn ${speaking ? "primary" : ""}`} onClick={hear} aria-label="Nghe trang này"><Volume2 /></button>}
    </div>
    <div className="sb-stage" onTouchStart={(event) => { touch.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const start = touch.current; touch.current = null; if (start == null) return; const dx = (event.changedTouches[0]?.clientX ?? start) - start; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <button type="button" className="sb-arrow left" disabled={page === 0} onClick={() => go(-1)} aria-label="Trang trước"><ChevronLeft /></button>
      <article key={current.key} className={`sb-page turn-${turn} ${current.cover ? "is-cover" : ""}`}>
        {current.cover
          ? <><h2 className="sb-page-title">{activity.title}</h2>{current.image ? <div className="sb-page-image"><img src={current.image} alt="" /></div> : null}{activity.config.prompt ? <small className="sb-page-author">{activity.config.prompt}</small> : null}</>
          : <>{current.image ? <div className="sb-page-image"><img src={current.image} alt="" /></div> : null}<p className={`sb-page-text ${speaking ? "speaking" : ""}`}>{current.text}</p>{current.meaning ? <small className="sb-page-meaning">{current.meaning}</small> : null}<span className="sb-page-no">{page}</span></>}
        {mode === "read" && !current.cover && current.text ? <div className="sb-read-tools">
          {phase === "recording"
            ? <button type="button" className="sb-mic recording" onClick={stopRecord}><Square className="h-4 w-4" />Dừng</button>
            : <button type="button" className="sb-mic" disabled={phase === "checking"} onClick={record}><Mic className="h-4 w-4" />{phase === "checking" ? "AI đang chấm…" : result ? "Đọc lại" : "Thu âm đọc to"}</button>}
          {result ? <span className={`sb-score s${result.stars}`}><b>{result.score}</b>{[0, 1, 2].map((star) => <Star key={star} className={star < result.stars ? "on" : ""} />)}</span> : null}
          {micError ? <small className="sb-mic-error">{micError}</small> : result?.feedback ? <small className="sb-feedback">{result.feedback}</small> : null}
        </div> : null}
      </article>
      <button type="button" className="sb-arrow right" disabled={mode === "listen" && page >= last} onClick={() => go(1)} aria-label={page >= last ? "Đọc xong" : "Trang sau"}>{mode === "read" && page >= last ? <Check /> : <ChevronRight />}</button>
    </div>
    <div className="sb-dots">{pages.map((entry, index) => <i key={entry.key} className={index === page ? "active" : index < page ? "seen" : ""} />)}</div>
  </div>;
}

/* ---------- Đọc sách: đọc to từ vựng + câu của cả buổi, AI chấm ---------- */
export type ReadAloudItem = { id: string; kind: "word" | "sentence"; text: string; meaning?: string; image?: string; audio?: string };

/** Gom từ vựng (các flashcard) + câu (các trang sách) đã xuất bản trong cùng buổi với hoạt động đọc. */
export function readAloudItemsFor(document: SyllabusDocument, activity: GameActivity): ReadAloudItem[] | null {
  if (activity.portalBlock !== "reader") return null;
  const sameDay = (document.activities || []).filter((item) => item.lessonId === activity.lessonId && (item.status === "PUBLISHED" || item.id === activity.id))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const words: ReadAloudItem[] = sameDay.filter((item) => item.portalBlock === "flashcard").flatMap((item) => item.config.items
    .filter((entry) => entry.prompt?.trim())
    .map((entry) => ({ id: `${item.id}:${entry.id}`, kind: "word" as const, text: entry.prompt.trim(), meaning: entry.answer, image: entry.image || flashcardImageUrl(entry.prompt) || undefined, audio: entry.audio })));
  const sentences: ReadAloudItem[] = sameDay.filter((item) => item.portalBlock === "sentences" || (item.portalBlock === "reader" && item.config.items.length)).flatMap((item) => item.config.items
    .filter((entry) => entry.prompt?.trim())
    .map((entry) => ({ id: `${item.id}:${entry.id}`, kind: "sentence" as const, text: entry.prompt.trim(), meaning: entry.answer, image: entry.image, audio: entry.audio })));
  const seen = new Set<string>();
  return [...words, ...sentences].filter((item) => { const key = `${item.kind}|${item.text.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

type ReadResult = { score: number; stars: number; transcript: string; feedback: string; practiceWords: string[] };

function pickRecorderMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const option of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(option)) return option;
  return "";
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]+,/, "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

function ReadAloudGame({ items, onFinish }: { items: ReadAloudItem[]; onFinish: (score: number, answers: unknown[]) => void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "checking">("idle");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Record<string, ReadResult>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const item = items[index];
  useEffect(() => () => { if (stopTimer.current) clearTimeout(stopTimer.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => { setError(""); setPhase("idle"); }, [index]);
  if (!item) return <p>Buổi này chưa có từ vựng hay câu để đọc.</p>;
  const result = results[item.id];

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Trình duyệt chưa hỗ trợ ghi âm — dùng Chrome nhé."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      rec.onstop = () => { stream.getTracks().forEach((track) => track.stop()); void check(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" })); };
      recorder.current = rec;
      rec.start();
      setPhase("recording");
      stopTimer.current = setTimeout(() => stop(), item.kind === "word" ? 6000 : 15000);
    } catch {
      setError("Chưa mở được micro — em cho phép trình duyệt dùng micro nhé.");
    }
  }
  function stop() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }
  async function check(blob: Blob) {
    const target = items[index]!;
    setPhase("checking");
    try {
      const audioBase64 = await blobToBase64(blob);
      const response = await api<ReadResult>("/api/portal/read-check", { method: "POST", body: JSON.stringify({ text: target.text, audioBase64, mime: blob.type }) });
      setResults((prev) => ({ ...prev, [target.id]: response }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa chấm được, em đọc lại nhé.");
    } finally {
      setPhase("idle");
    }
  }
  function finish() {
    const scores = items.map((entry) => results[entry.id]?.score ?? 0);
    const average = Math.round(scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length));
    onFinish(average, items.map((entry) => ({ id: entry.id, text: entry.text, score: results[entry.id]?.score ?? null })));
  }
  const done = Object.keys(results).length;
  return <div className="activity-read-game">
    <div className="activity-read-top"><span className="activity-progress">{item.kind === "word" ? "Từ vựng" : "Câu"} · {index + 1}/{items.length}</span><span className="activity-read-count">Đã chấm {done}/{items.length}</span></div>
    <div className="activity-read-card">
      <div className="activity-read-image">{item.image ? <img src={item.image} alt="" /> : <span>{item.text.slice(0, 1).toUpperCase()}</span>}</div>
      <div className="activity-read-side">
        <strong className={`activity-read-text ${item.kind}`}>{item.text}</strong>
        {item.meaning ? <small className="activity-read-meaning">{item.meaning}</small> : null}
        <div className="activity-read-actions">
          <button type="button" className="activity-speak" onClick={() => playItemSound({ prompt: item.text, audio: item.audio })}><Volume2 className="h-5 w-5" />Nghe mẫu</button>
          {phase === "recording"
            ? <button type="button" className="activity-read-mic recording" onClick={stop}><Square className="h-5 w-5" />Dừng</button>
            : <button type="button" className="activity-read-mic" disabled={phase === "checking"} onClick={start}><Mic className="h-5 w-5" />{phase === "checking" ? "AI đang chấm…" : result ? "Đọc lại" : "Đọc"}</button>}
        </div>
        {error ? <p className="activity-read-error">{error}</p> : null}
        {result ? <div className={`activity-read-result s${result.stars}`}>
          <div className="activity-read-score"><b>{result.score}</b><span>điểm</span><i>{[0, 1, 2].map((star) => <Star key={star} className={star < result.stars ? "on" : ""} />)}</i></div>
          <div className="activity-read-feedback"><p>{result.feedback}</p><small>Em đọc: “{result.transcript || "…"}”</small>{result.practiceWords?.length ? <div className="activity-read-words">{result.practiceWords.map((word) => <span key={word}>{word}</span>)}</div> : null}</div>
        </div> : phase === "idle" ? <p className="activity-read-hint">Bấm <b>Nghe mẫu</b>, rồi bấm <b>Đọc</b> và đọc to. Đọc xong bấm <b>Dừng</b> — AI sẽ chấm và nhận xét.</p> : null}
      </div>
    </div>
    <div className="activity-read-nav">
      <Button variant="outline" disabled={index === 0 || phase !== "idle"} onClick={() => setIndex(index - 1)}><ArrowLeft className="h-4 w-4" />Trước</Button>
      {result ? <Button variant="outline" disabled={phase !== "idle"} onClick={start}><RotateCcw className="h-4 w-4" />Đọc lại</Button> : null}
      {index + 1 >= items.length
        ? <Button disabled={phase !== "idle"} onClick={finish}>Hoàn thành</Button>
        : <Button disabled={phase !== "idle"} onClick={() => setIndex(index + 1)}>Tiếp theo<ArrowRight className="h-4 w-4" /></Button>}
    </div>
  </div>;
}

export function ActivityPlayer({ activity, syllabusId, readAloudItems }: { activity: GameActivity; syllabusId: string; readAloudItems?: ReadAloudItem[] | null }) {
  const [finished, setFinished] = useState<{ score: number; saved: boolean } | null>(null); const started = useRef(Date.now());
  async function save(score: number, answers: unknown[]) { try { const result = await api<{ passed?: boolean }>("/api/activity-attempts", { method: "POST", body: JSON.stringify({ syllabusId, activityId: activity.id, score, accuracy: score, durationSeconds: Math.round((Date.now() - started.current) / 1000), answers }) }); window.dispatchEvent(new CustomEvent("steps-activity-saved", { detail: { activityId: activity.id, ...result } })); if (result.passed && "BroadcastChannel" in window) { const channel = new BroadcastChannel("steps-portal-progress"); channel.postMessage({ type: "progress-updated" }); channel.close(); } return true; } catch { return false; } }
  async function finish(score: number, answers: unknown[]) { setFinished({ score, saved: false }); try { const result = await api<{ passed?: boolean }>("/api/activity-attempts", { method: "POST", body: JSON.stringify({ syllabusId, activityId: activity.id, score, accuracy: score, durationSeconds: Math.round((Date.now() - started.current) / 1000), answers }) }); setFinished({ score, saved: true }); window.dispatchEvent(new CustomEvent("steps-activity-saved", { detail: { activityId: activity.id, ...result } })); if (result.passed && "BroadcastChannel" in window) { const channel = new BroadcastChannel("steps-portal-progress"); channel.postMessage({ type: "progress-updated" }); channel.close(); } } catch { setFinished({ score, saved: false }); } }
  if (finished) return <div className="activity-result"><Sparkles className="h-10 w-10" /><h2>Hoàn thành!</h2><strong>{finished.score} điểm</strong><p>{finished.score >= activity.passingScore ? (activity.starsReward ? `Bạn nhận được ${activity.starsReward} sao.` : "Em đã hoàn thành hoạt động này.") : `Cần ${activity.passingScore} điểm để đạt.`}</p><small>{finished.saved ? "Kết quả đã lưu vào Portal." : "Đã hoàn thành; chưa lưu được kết quả."}</small><Button onClick={() => { started.current = Date.now(); setFinished(null); }}>Chơi lại</Button></div>;
  let game: React.ReactNode;
  if (["flashcard", "reveal"].includes(activity.engineType)) game = <CardsGame activity={activity} onFinish={finish} />;
  else if (activity.engineType === "matching" || activity.engineType === "drag_drop") game = <MatchingGame activity={activity} onFinish={finish} />;
  else if (activity.engineType === "sentence_builder") game = <SentenceGame activity={activity} onFinish={finish} />;
  else if (activity.portalBlock === "reader") game = <StoryBookGame activity={activity} onSave={save} onFinish={finish} />;
  else if (activity.engineType === "reader" && readAloudItems?.length) game = <ReadAloudGame items={readAloudItems} onFinish={finish} />;
  else if (activity.engineType === "reader") game = <ReaderGame activity={activity} onFinish={finish} />;
  else if (activity.engineType === "speaking") game = <SpeakingGame activity={activity} onFinish={finish} />;
  else if (["song", "interactive_video"].includes(activity.engineType) && activity.config.items.length <= 1 && !activity.config.items[0]?.prompt) game = <MediaGame activity={activity} onFinish={finish} />;
  else game = <ChoiceGame activity={activity} onFinish={finish} />;
  return <main className="activity-stage"><div className="activity-stage-head"><div><span>{activity.portalBlock === "sentences" ? "Mẫu câu" : activity.portalBlock === "homework" ? "Nhiệm vụ về nhà" : engineDefinition(activity.engineType).label}</span><h1>{activity.title}</h1><p>{activity.instruction}</p></div><span className="activity-stars">★ {activity.starsReward}</span></div><div className="activity-game">{game}</div></main>;
}

// Học ngay trong trang Portal: tải tài liệu chương trình một lần cho mọi hoạt động.
const portalDocuments = new Map<string, Promise<SyllabusDocument>>();
export function PortalActivityEmbed({ syllabusId, activityId }: { syllabusId: string; activityId: string }) {
  const [document, setDocument] = useState<SyllabusDocument | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    let request = portalDocuments.get(syllabusId);
    if (!request) { request = api<SyllabusDocument>(`/api/syllabuses/${encodeURIComponent(syllabusId)}`); portalDocuments.set(syllabusId, request); request.catch(() => portalDocuments.delete(syllabusId)); }
    request.then(setDocument).catch((reason) => setError(reason.message));
  }, [syllabusId]);
  const activity = document?.activities?.find((item) => item.id === activityId);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!document) return <p className="portal-activity-loading">Đang tải hoạt động...</p>;
  if (!activity) return <p>Không tìm thấy hoạt động.</p>;
  return <ActivityPlayer key={activity.id} activity={activity} syllabusId={syllabusId} readAloudItems={readAloudItemsFor(document, activity)} />;
}

export function ActivityPreviewApp({ syllabusId, activityId }: { syllabusId: string; activityId: string }) {
  const [document, setDocument] = useState<SyllabusDocument | null>(null); const [error, setError] = useState("");
  useEffect(() => { api<SyllabusDocument>(`/api/syllabuses/${encodeURIComponent(syllabusId)}`).then(setDocument).catch((reason) => setError(reason.message)); }, [syllabusId]);
  const activity = document?.activities?.find((item) => item.id === activityId);
  const fromPortal = new URLSearchParams(location.search).get("from") === "portal";
  function close() { window.close(); setTimeout(() => { if (!window.closed) location.href = "/portal"; }, 150); }
  return <div className="activity-preview-page"><header className="activity-preview-header"><button onClick={close} className={buttonClass("ghost", "sm")}><ArrowLeft className="h-4 w-4" />{fromPortal ? "Quay lại Roadmap" : "Đóng preview"}</button><div><strong>STEPS LMS</strong><span>{fromPortal ? "Học và chơi theo Roadmap" : "Preview như học viên"}</span></div><Gamepad2 className="h-5 w-5 text-brand-600" /></header><div className="activity-preview-content">{error ? <p className="text-red-600">{error}</p> : !document ? <p>Đang tải game...</p> : !activity ? <p>Không tìm thấy game.</p> : <ActivityPlayer activity={activity} syllabusId={syllabusId} readAloudItems={readAloudItemsFor(document, activity)} />}</div></div>;
}
