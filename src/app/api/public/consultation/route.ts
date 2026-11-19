import { NextResponse } from "next/server";

import { ConsultationError, createWebsiteConsultation } from "@/lib/public-consultation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await createWebsiteConsultation(body);
    return NextResponse.json(result, { status: result.alreadySubmitted ? 200 : 201 });
  } catch (error) {
    if (error instanceof ConsultationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[public-consultation] Failed to create website lead", error);
    return NextResponse.json({ error: "Không gửi được đăng ký tư vấn." }, { status: 500 });
  }
}
