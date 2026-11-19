import { getPortalStageDetail } from "@/lib/portal-data";
import { handlePortalGet } from "@/lib/portal-http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string; stageId: string }> },
) {
  const { courseId, stageId } = await context.params;
  return handlePortalGet(request, (viewer, studentId) =>
    getPortalStageDetail(viewer, courseId, stageId, studentId),
  );
}
