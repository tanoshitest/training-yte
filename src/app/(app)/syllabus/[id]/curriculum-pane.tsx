"use client";

import { useCallback, useEffect, useState } from "react";

import { getCurriculumOutline } from "../curriculum-load";
import { CurriculumBuilder, type CurriculumSection } from "./curriculum-builder";

export function CurriculumPane({ syllabusId }: { syllabusId: string }) {
  const [sections, setSections] = useState<CurriculumSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getCurriculumOutline(syllabusId)
      .then(setSections)
      .catch(() => setError("Không tải được chương trình."));
  }, [syllabusId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <p className="rounded-xl border bg-white p-6 text-sm text-red-600">{error}</p>;
  if (!sections) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  return <CurriculumBuilder syllabusId={syllabusId} sections={sections} onChanged={reload} view="overview" />;
}
