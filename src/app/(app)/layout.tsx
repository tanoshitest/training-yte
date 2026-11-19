import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/permissions";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <AppShell user={{ fullName: user.fullName, email: user.email, role: user.role }}>
      {children}
    </AppShell>
  );
}
