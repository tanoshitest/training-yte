import { getPortalSchedule } from "@/lib/portal-data";
import { handlePortalGet } from "@/lib/portal-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handlePortalGet(request, (viewer, studentId) =>
    getPortalSchedule(
      viewer,
      studentId,
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    ),
  );
}
