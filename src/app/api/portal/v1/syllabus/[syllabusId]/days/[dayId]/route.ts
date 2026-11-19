import { getPortalSyllabusDay } from "@/lib/portal-syllabus";
import { handlePortalGet } from "@/lib/portal-http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ syllabusId: string; dayId: string }> },
) {
  const { syllabusId, dayId } = await context.params;
  return handlePortalGet(request, (viewer, studentId) =>
    getPortalSyllabusDay(viewer, syllabusId, dayId, studentId),
  );
}
