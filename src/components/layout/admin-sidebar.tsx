import Link from "next/link";

import type { SessionUser } from "@/features/auth/session";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";

export function AdminSidebar({ user }: { user: SessionUser }) {
  return (
    <aside className="hidden border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="border-b border-border px-5 py-5">
        <Link href="/admin" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="text-sm font-semibold tracking-tight text-foreground">Sistema de Tienda</p>
          <p className="mt-1 text-xs text-muted-foreground">Administración</p>
        </Link>
      </div>
      <nav aria-label="Navegación administrativa" className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <AdminNavLinks />
      </nav>
      <div className="border-t border-border px-5 py-4">
        <p className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary">{user.role}</p>
      </div>
    </aside>
  );
}
