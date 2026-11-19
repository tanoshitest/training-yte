"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { getCurriculumOutline } from "../curriculum-load";
import { CurriculumBuilder, type CurriculumSection } from "./curriculum-builder";
import { SyllabusTree, type TreeTarget } from "./tree";

function isTarget(value: string): value is TreeTarget {
  return value === "overview" || value.startsWith("unit-") || value.startsWith("day-");
}

export function SyllabusWorkspace({
  syllabusId,
  overview,
}: {
  syllabusId: string;
  overview: ReactNode;
}) {
  const [sections, setSections] = useState<CurriculumSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TreeTarget>("overview");

  const reload = useCallback(() => {
    getCurriculumOutline(syllabusId)
      .then(setSections)
      .catch(() => setError("Không tải được chương trình."));
  }, [syllabusId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (isTarget(hash)) setActive(hash);
  }, []);

  function select(target: TreeTarget) {
    setActive(target);
    const url = `${window.location.pathname}${window.location.search}#${target}`;
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[17rem] shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
        {sections ? <SyllabusTree sections={sections} active={active} onSelect={select} /> : <p className="px-3 py-4 text-sm text-slate-400">Đang tải cây...</p>}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto px-3 py-3 lg:px-6">
        {sections ? (
          <label className="mb-3 block lg:hidden">
            <span className="sr-only">Nhảy tới</span>
            <select
              value={active}
              onChange={(event) => select(event.target.value as TreeTarget)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="overview">Overview</option>
              {sections.flatMap((section) => [
                <option key={`unit-${section.id}`} value={`unit-${section.id}`}>
                  {section.title}
                </option>,
                ...section.courseDays.map((day, index) => (
                  <option key={day.id} value={`day-${day.id}`}>
                    {section.title} · {day.title || day.lessons[0]?.name || `Day ${day.unitDayNumber ?? index + 1}`}
                  </option>
                )),
              ])}
            </select>
          </label>
        ) : null}
        {error ? <p className="rounded-xl border bg-white p-6 text-sm text-red-600">{error}</p> : null}
        {!sections && !error ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : null}
        {active === "overview" ? <div className="space-y-4">{overview}</div> : null}
        {sections ? (
          <div className={active === "overview" ? "mt-4" : undefined}>
            <CurriculumBuilder syllabusId={syllabusId} sections={sections} onChanged={reload} view={active} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
