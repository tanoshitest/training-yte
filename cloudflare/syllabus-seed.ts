import { buildFlyersSeventyTwoCurriculum } from "./flyers-curriculum";
import { buildMoversSeventyTwoCurriculum } from "./movers-curriculum";
import { buildStarterFortyEightCurriculum } from "./starter-curriculum";
import type { SyllabusDocument, SyllabusMeta } from "./syllabus-types";

const now = "2026-08-31T00:00:00.000Z";

export const CANONICAL_SYLLABUS_IDS = ["syllabus-starters", "syllabus-movers", "syllabus-flyers"] as const;

export function isRetiredCatalogItem(item: Pick<SyllabusMeta, "id" | "code" | "name">) {
  const id = item.id.toLowerCase();
  const code = (item.code || "").toUpperCase();
  const name = (item.name || "").trim();
  if (id === "syllabus-teens" || code === "STEPS-TEENS" || /^steps teens$/i.test(name)) return true;
  if (id !== "syllabus-starters" && (["STARTER", "STEPS", "STEPS-STARTERS"].includes(code) || /^starter$/i.test(name))) return true;
  return false;
}

export function seedDocuments(): SyllabusDocument[] {
  const steps = buildStarterFortyEightCurriculum({
    id: "syllabus-starters",
    code: "STARTER",
    name: "STARTER — 48 Offline · 96 Online · 2 khóa",
    levelId: "level-1",
    level: "Pre-A1 Starters",
    description: "15 Unit Started.md · 2 khóa · 48 Offline × 90 phút · mỗi buổi Offline kèm 2 buổi Online tự học.",
    status: "ACTIVE",
    totalCourseDays: 144,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  });
  const movers = buildMoversSeventyTwoCurriculum({
    id: "syllabus-movers",
    code: "STEPS-MOVERS",
    name: "MOVERS — 24 Offline · 48 Online · 2 khóa",
    levelId: "level-2",
    level: "A1 Movers",
    description: "12 Unit Movers.md · 2 khóa · 24 Offline × 90 phút · mỗi buổi Offline kèm 2 buổi Online Recognize / Respond.",
    status: "ACTIVE",
    totalCourseDays: 72,
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
  });
  const flyers = buildFlyersSeventyTwoCurriculum({
    id: "syllabus-flyers",
    code: "STEPS-FLYERS",
    name: "FLYERS — 24 Offline · 48 Online · 2 khóa",
    levelId: "level-3",
    level: "A2 Flyers",
    description: "12 Unit Flyers.md · 2 khóa · 24 Offline × 90 phút · mỗi buổi Offline kèm 2 buổi Online Recognize / Respond.",
    status: "ACTIVE",
    totalCourseDays: 72,
    sortOrder: 3,
    createdAt: now,
    updatedAt: now,
  });
  return [steps, movers, flyers];
}
