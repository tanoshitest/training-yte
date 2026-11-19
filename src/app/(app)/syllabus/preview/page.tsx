import type { Metadata } from "next";

import { requireAdmin } from "@/lib/permissions";

import { ExercisePreviewClient } from "./preview-client";

export const metadata: Metadata = { title: "Preview bài tập" };

export default async function Page() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Preview bài tập</h1>
      <ExercisePreviewClient />
    </div>
  );
}
