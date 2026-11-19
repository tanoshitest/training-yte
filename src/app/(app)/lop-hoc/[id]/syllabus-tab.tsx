import Link from "next/link";
import { BookOpen, ExternalLink, Headphones, MessageCircle, PenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { parseMaterials } from "@/app/(app)/syllabus/materials";
import { VocabCards } from "@/app/(app)/syllabus/vocab-cards";
import { stringList } from "@/app/(app)/syllabus/vocab";

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
function TextBlock({ title, value }: { title: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p></div>;
}
function ListBlock({ title, value }: { title: string; value: unknown }) {
  const items = arrayStrings(value);
  if (!items.length) return null;
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>;
}

export async function SyllabusTab({ classId, lessonId }: { classId: string; lessonId?: string }) {
  const [assigned, sessions] = await Promise.all([
    prisma.classSyllabus.findMany({
      where: { classId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { syllabus: { select: {
        id: true, code: true, name: true,
        sections: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: {
          id: true, type: true, title: true,
          unit: { select: { id: true, topic: true, overview: true, learningObjectives: true, resources: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } },
          resources: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
          courseDays: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: {
            id: true, courseDayNumber: true, unitDayNumber: true, title: true,
            resources: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            lessons: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: {
              id: true, name: true, order: true, lessonNumber: true, lessonType: true,
              pupilBookPage: true, activityBookPage: true, hasListening: true, hasSpeaking: true, hasReading: true, hasWriting: true,
              tasks: true, vocabulary: true, languageTargets: true, lessonOutcomes: true, lessonPlan: true, grammar: true, homework: true, materials: true,
              resources: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            } },
          } },
        } },
        resources: { where: { isActive: true, sectionId: null, courseDayId: null, lessonId: null, unitId: null }, orderBy: { sortOrder: "asc" } },
      } } },
    }),
    prisma.lessonSession.findMany({ where: { classId, syllabusLessonId: { not: null } }, select: { syllabusLessonId: true, date: true, status: true } }),
  ]);
  const syllabuses = assigned.map((item) => item.syllabus);
  const days = syllabuses.flatMap((syllabus) => syllabus.sections.flatMap((section) => section.courseDays.map((day) => ({ syllabus, section, day }))));
  if (!syllabuses.length) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
        Lớp chưa gán syllabus. Vào tab Thông tin lớp, chọn syllabus rồi bấm Thêm — hệ thống ghi ngay, không cần Lưu thông tin lớp.
      </div>
    );
  }
  if (!days.length) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
        Syllabus đã gán nhưng chưa có nội dung curriculum (Course Day).
      </div>
    );
  }
  const selected = days.find((item) => item.day.lessons.some((lesson) => lesson.id === lessonId)) ?? days[0];
  const sessionMap = new Map(sessions.filter((item) => item.syllabusLessonId).map((item) => [item.syllabusLessonId!, item]));
  const sharedResources = [...selected.syllabus.resources, ...selected.section.resources, ...(selected.section.unit?.resources ?? []), ...selected.day.resources];
  return <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <nav className="max-h-[calc(100vh-15rem)] overflow-y-auto rounded-xl border bg-white p-2">
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Lo trinh hoc</p>
      {syllabuses.flatMap((syllabus) => syllabus.sections.map((section) => <details key={section.id} open={section.id === selected.section.id} className="rounded-lg">
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2 hover:bg-slate-50"><span className="block truncate text-sm font-semibold">{section.title}</span><span className="text-xs text-slate-400">{section.type} · {section.courseDays.length} course days</span></summary>
        <div className="space-y-1 pb-2 pl-3">{section.courseDays.map((day) => {
          const active = day.id === selected.day.id;
          const targetLesson = day.lessons[0]?.id;
          const dayNumber = day.unitDayNumber ?? day.courseDayNumber;
          const dayTitle = day.title || day.lessons[0]?.name;
          return <Link key={day.id} href={targetLesson ? `/lop-hoc/${classId}?tab=syllabus&buoi=${targetLesson}` : `/lop-hoc/${classId}?tab=syllabus`} className={cn("block rounded-lg px-3 py-2 text-sm", active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50")}><span className="block font-medium">{dayTitle ? `Day ${dayNumber} : ${dayTitle}` : `Day ${dayNumber}`}</span></Link>;
        })}</div>
      </details>))}
    </nav>
    <main className="min-w-0 space-y-4">
      <header className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center gap-2"><Badge>{selected.section.type}</Badge><span className="text-sm text-slate-400">{selected.day.title || selected.day.lessons[0]?.name ? `Day ${selected.day.unitDayNumber ?? selected.day.courseDayNumber} : ${selected.day.title || selected.day.lessons[0]?.name}` : `Day ${selected.day.unitDayNumber ?? selected.day.courseDayNumber}`}</span></div><h2 className="mt-2 text-xl font-semibold">{selected.section.title}</h2>{selected.section.unit?.overview ? <p className="mt-2 text-sm leading-6 text-slate-600">{selected.section.unit.overview}</p> : null}</header>
      {selected.day.lessons.map((lesson) => {
        const skills = [[lesson.hasListening, Headphones, "Listening"], [lesson.hasSpeaking, MessageCircle, "Speaking"], [lesson.hasReading, BookOpen, "Reading"], [lesson.hasWriting, PenLine, "Writing"]] as const;
        const lessonMaterials = parseMaterials(lesson.materials);
        const resources = [...sharedResources, ...lesson.resources];
        const session = sessionMap.get(lesson.id);
        return <details key={lesson.id} open={lesson.id === lessonId || selected.day.lessons.length === 1} className="overflow-hidden rounded-xl border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4"><span><span className="font-semibold">Lesson {lesson.lessonNumber ?? lesson.order}: {lesson.name}</span><span className="ml-2 text-xs text-slate-400">{lesson.lessonType}</span></span>{session ? <span className="text-xs text-slate-400">{session.status}</span> : null}</summary>
          <div className="space-y-5 border-t p-5">
            {(lesson.pupilBookPage || lesson.activityBookPage) ? <div className="flex flex-wrap gap-2 text-xs">{lesson.pupilBookPage ? <Badge>Pupil Book {lesson.pupilBookPage}</Badge> : null}{lesson.activityBookPage ? <Badge>Activity Book {lesson.activityBookPage}</Badge> : null}</div> : null}
            {skills.some(([enabled]) => enabled) ? <div className="flex flex-wrap gap-3">{skills.filter(([enabled]) => enabled).map(([, Icon, label]) => <span key={label} className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon className="h-4 w-4 text-brand-600" />{label}</span>)}</div> : null}
            <div className="grid gap-5 md:grid-cols-2">
              <ListBlock title="Detail" value={lesson.tasks} />
              <ListBlock title="Ngữ pháp" value={arrayStrings(lesson.languageTargets).length ? lesson.languageTargets : stringList(lesson.grammar)} />
              <ListBlock title="Outcomes" value={lesson.lessonOutcomes} />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Từ vựng</h4>
                <div className="mt-1"><VocabCards value={lesson.vocabulary} empty="—" /></div>
              </div>
              <ListBlock title="Lesson plan" value={stringList(lesson.lessonPlan).map((step, index) => `Step ${index + 1}: ${step}`)} />
              <TextBlock title="Homework" value={lesson.homework} />
            </div>
            {lessonMaterials.length ? <div><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teaching material</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{lessonMaterials.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-lg border p-3 text-sm hover:border-brand-300 hover:bg-brand-50"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span className="block font-medium text-brand-700">{item.title || item.url}</span></a>)}</div></div> : null}
            {resources.length ? <div><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hoc lieu</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{resources.map((resource) => <a key={resource.id} href={resource.url} target={resource.openInNewTab ? "_blank" : undefined} rel="noreferrer" className="flex items-start gap-2 rounded-lg border p-3 text-sm hover:border-brand-300 hover:bg-brand-50"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span><span className="block font-medium text-brand-700">{resource.title}</span>{resource.description ? <span className="block text-xs text-slate-500">{resource.description}</span> : null}</span></a>)}</div></div> : null}
          </div>
        </details>;
      })}
      <p className="text-xs text-slate-400">Syllabus: {selected.syllabus.name}{selected.syllabus.code ? ` · ${selected.syllabus.code}` : ""}</p>
    </main>
  </div>;
}
