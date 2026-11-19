import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createResource, deleteResource, moveResource, updateResource } from "../curriculum-actions";

const resourceTypes = ["LESSON_PLAN", "VIDEO", "AUDIO", "WORKSHEET", "PDF", "SLIDE", "GAME", "QUIZ", "HOMEWORK", "TEACHER_RESOURCE", "STUDENT_RESOURCE", "EXTERNAL_LINK", "OTHER"];
type Target = { id: string; label: string };
type Resource = { id: string; resourceType: string; title: string; url: string; description: string | null; sortOrder: number; isActive: boolean; openInNewTab: boolean; section: { title: string } | null; courseDay: { courseDayNumber: number } | null; unit: { topic: string | null } | null; lesson: { name: string } | null };

function TypeSelect({ value = "EXTERNAL_LINK" }: { value?: string }) {
  return <Select name="resourceType" defaultValue={value}>{resourceTypes.map((type) => <option key={type}>{type}</option>)}</Select>;
}

export function ResourcesManager({ syllabusId, sections, courseDays, units, lessons, resources }: { syllabusId: string; sections: Target[]; courseDays: Target[]; units: Target[]; lessons: Target[]; resources: Resource[] }) {
  return <div className="space-y-4">
    <ActionForm action={createResource} resetOnSuccess className="grid gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4 md:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="syllabusId" value={syllabusId} />
      <Field label="Resource type"><TypeSelect /></Field>
      <Field label="Attach to">
        <Select name="target" defaultValue="syllabus">
          <option value="syllabus">Whole syllabus</option>
          <optgroup label="Sections">{sections.map((item) => <option key={item.id} value={`section:${item.id}`}>{item.label}</option>)}</optgroup>
          <optgroup label="Course days">{courseDays.map((item) => <option key={item.id} value={`courseDay:${item.id}`}>{item.label}</option>)}</optgroup>
          <optgroup label="Units">{units.map((item) => <option key={item.id} value={`unit:${item.id}`}>{item.label}</option>)}</optgroup>
          <optgroup label="Lessons">{lessons.map((item) => <option key={item.id} value={`lesson:${item.id}`}>{item.label}</option>)}</optgroup>
        </Select>
      </Field>
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="URL"><Input name="url" type="url" required placeholder="https://..." /></Field>
      <Field label="Description" className="md:col-span-2"><Textarea name="description" rows={2} /></Field>
      <div className="flex items-center gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Active</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="openInNewTab" defaultChecked /> New tab</label></div>
      <div className="flex items-end"><SubmitButton><Plus className="h-4 w-4" /> Add resource</SubmitButton></div>
    </ActionForm>
    <div className="overflow-hidden rounded-xl border bg-white">
      {resources.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No resources yet.</p> : resources.map((resource) => <details key={resource.id} className="border-b last:border-b-0">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{resource.resourceType}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{resource.title}</span><span className="block truncate text-xs text-slate-400">{resource.lesson?.name ?? (resource.courseDay ? `Course Day ${resource.courseDay.courseDayNumber}` : resource.unit?.topic ?? resource.section?.title ?? "Whole syllabus")}</span></span>
          <a href={resource.url} target="_blank" rel="noreferrer" className="text-brand-600" aria-label="Open resource"><ExternalLink className="h-4 w-4" /></a>
          <ActionForm action={moveResource}><input type="hidden" name="syllabusId" value={syllabusId} /><input type="hidden" name="id" value={resource.id} /><input type="hidden" name="direction" value="up" /><SubmitButton variant="ghost" size="icon"><ChevronUp className="h-4 w-4" /></SubmitButton></ActionForm>
          <ActionForm action={moveResource}><input type="hidden" name="syllabusId" value={syllabusId} /><input type="hidden" name="id" value={resource.id} /><input type="hidden" name="direction" value="down" /><SubmitButton variant="ghost" size="icon"><ChevronDown className="h-4 w-4" /></SubmitButton></ActionForm>
          <ActionForm action={deleteResource}><input type="hidden" name="syllabusId" value={syllabusId} /><input type="hidden" name="id" value={resource.id} /><SubmitButton variant="danger" size="icon" confirm="Delete this resource link?"><Trash2 className="h-4 w-4" /></SubmitButton></ActionForm>
        </summary>
        <ActionForm action={updateResource} className="grid gap-3 border-t bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="syllabusId" value={syllabusId} /><input type="hidden" name="id" value={resource.id} />
          <Field label="Type"><TypeSelect value={resource.resourceType} /></Field><Field label="Title"><Input name="title" required defaultValue={resource.title} /></Field><Field label="URL" className="lg:col-span-2"><Input name="url" type="url" required defaultValue={resource.url} /></Field><Field label="Description" className="md:col-span-2"><Textarea name="description" rows={2} defaultValue={resource.description ?? ""} /></Field>
          <div className="flex items-center gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={resource.isActive} /> Active</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="openInNewTab" defaultChecked={resource.openInNewTab} /> New tab</label></div><div className="flex items-end"><SubmitButton size="sm">Save resource</SubmitButton></div>
        </ActionForm>
      </details>)}
    </div>
  </div>;
}
