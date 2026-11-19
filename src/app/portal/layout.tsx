import { Suspense } from "react";

import { auth } from "@/auth";

import { PortalShell } from "./portal-shell";

export const metadata = { title: "Cổng học viên" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return children;

  const showAdmin = session.user.role === "ADMIN" || session.user.role === "ACADEMIC";

  return (
    <Suspense>
      <PortalShell name={session.user.fullName} showAdmin={showAdmin}>
        {children}
      </PortalShell>
    </Suspense>
  );
}
