import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { PortalViewer } from "@/lib/portal-data";

export async function requirePortalViewer(): Promise<PortalViewer> {
  const session = await auth();
  if (!session?.user) redirect("/dang-nhap?callbackUrl=/portal");
  return {
    id: session.user.id,
    fullName: session.user.fullName,
    email: session.user.email ?? "",
    role: session.user.role,
    studentId: session.user.studentId ?? null,
  };
}

export function isPortalStaff(role: PortalViewer["role"]) {
  return role === "ADMIN" || role === "ACADEMIC";
}
