"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { dayHeading, type CurriculumSection } from "./curriculum-builder";

export type TreeTarget = "overview" | `unit-${string}` | `day-${string}`;

export function SyllabusTree({
  sections,
  active,
  onSelect,
}: {
  sections: CurriculumSection[];
  active: TreeTarget;
  onSelect: (target: TreeTarget) => void;
}) {
  return (
    <nav className="py-2" aria-label="Cây syllabus">
      <button
        type="button"
        onClick={() => onSelect("overview")}
        className={cn(
          "flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm",
          active === "overview" ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100",
        )}
      >
        Overview
      </button>
      {sections.map((section) => (
        <UnitBranch key={section.id} section={section} active={active} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function UnitBranch({
  section,
  active,
  onSelect,
}: {
  section: CurriculumSection;
  active: TreeTarget;
  onSelect: (target: TreeTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const unitId = `unit-${section.id}` as const;
  const unitActive = active === unitId || section.courseDays.some((day) => active === `day-${day.id}`);

  return (
    <div className="mt-1">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700"
          aria-label={open ? "Thu gọn" : "Mở"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect(unitId)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm",
            active === unitId ? "bg-brand-50 font-medium text-brand-700" : unitActive ? "font-medium text-slate-800" : "text-slate-700 hover:bg-slate-100",
          )}
        >
          {section.title}
        </button>
      </div>
      {open ? (
        <ul className="ml-4 border-l border-slate-200 pl-2">
          {section.courseDays.map((day, index) => {
            const id = `day-${day.id}` as const;
            return (
              <li key={day.id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={cn(
                    "flex w-full truncate rounded-md px-2 py-1 text-left text-sm",
                    active === id ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {dayHeading(day, index)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
