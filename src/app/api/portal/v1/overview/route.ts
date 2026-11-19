import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  PortalDataError,
  getPortalOverview,
} from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const data = await getPortalOverview(
      {
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email ?? "",
        role: session.user.role,
        studentId: session.user.studentId ?? null,
      },
      url.searchParams.get("studentId"),
    );
    return NextResponse.json(data, {
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PortalDataError) {
      return NextResponse.json(
        { error: "PORTAL_DATA_ERROR", message: error.message },
        { status: error.status },
      );
    }
    console.error("[portal-api] Failed to build overview", error);
    return NextResponse.json({ error: "PORTAL_DATA_UNAVAILABLE" }, { status: 500 });
  }
}
