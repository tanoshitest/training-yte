import { getPortalLessonExercise } from "@/lib/portal-syllabus";
import { handlePortalGet } from "@/lib/portal-http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ syllabusId: string; exerciseId: string }> },
) {
  const { syllabusId, exerciseId } = await context.params;
  return handlePortalGet(request, (viewer, studentId) =>
    getPortalLessonExercise(viewer, syllabusId, exerciseId, studentId),
  );
}
