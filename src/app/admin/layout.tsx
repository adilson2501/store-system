import type { ReactNode } from "react";

import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/features/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return <AdminShell user={user}>{children}</AdminShell>;
}
