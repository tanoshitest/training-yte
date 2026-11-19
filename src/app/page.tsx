import { redirect } from "next/navigation";

import { homeForRole, requireUser } from "@/lib/permissions";

export default async function RootPage() {
  const user = await requireUser();
  redirect(homeForRole(user.role));
}
