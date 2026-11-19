"use client";

import { useEffect, useState } from "react";

import { getCurriculumResources } from "../curriculum-load";
import { ResourcesManager } from "./resources-manager";

export function ResourcesPane({ syllabusId }: { syllabusId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCurriculumResources>> | null>(null);

  useEffect(() => {
    getCurriculumResources(syllabusId).then(setData);
  }, [syllabusId]);

  if (!data) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  }

  return <ResourcesManager syllabusId={syllabusId} {...data} />;
}
