import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { PortalDataError, type PortalViewer } from "@/lib/portal-data";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};

export async function handlePortalGet(
  request: Request,
  load: (viewer: PortalViewer, studentId: string | null) => Promise<unknown>,
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const data = await load(
      {
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email ?? "",
        role: session.user.role,
        studentId: session.user.studentId ?? null,
      },
      url.searchParams.get("studentId"),
    );
    return NextResponse.json(data, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof PortalDataError) {
      return NextResponse.json(
        { error: "PORTAL_DATA_ERROR", message: error.message },
        { status: error.status },
      );
    }
    console.error("[portal-api] Failed to build portal payload", error);
    return NextResponse.json({ error: "PORTAL_DATA_UNAVAILABLE" }, { status: 500 });
  }
}
