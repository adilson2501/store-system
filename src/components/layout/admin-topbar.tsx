import Link from "next/link";

import { logout } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

export function AdminTopbar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <MobileNavigation />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Administración</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">Sistema de Tienda</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden max-w-48 truncate text-sm text-muted-foreground xl:block" title={user.email}>{user.email}</span>
          <Link href="/account" className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex">
            Cuenta
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">Salir</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
