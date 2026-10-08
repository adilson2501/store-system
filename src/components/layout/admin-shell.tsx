import type { ReactNode } from "react";

import type { SessionUser } from "@/features/auth/session";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";

export function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <AdminSidebar user={user} />
      <div className="min-w-0">
        <AdminTopbar user={user} />
        <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
