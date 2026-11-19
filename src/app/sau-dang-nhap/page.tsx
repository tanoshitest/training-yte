import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { homePathForRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AfterLoginPage() {
  const session = await auth();
  redirect(homePathForRole(session?.user?.role));
}
