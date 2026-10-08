"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  adminNavigationGroups,
  isAdminNavigationItemActive,
  operationalNavigation,
  type AdminNavigationItem,
} from "@/components/layout/admin-navigation";

function NavigationLink({ item, onNavigate }: { item: AdminNavigationItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isAdminNavigationItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-5">
      {adminNavigationGroups.map((group) => (
        <section key={group.label} aria-labelledby={`admin-nav-${group.label}`}>
          <h2 id={`admin-nav-${group.label}`} className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.items.map((item) => <NavigationLink key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        </section>
      ))}
      <section aria-labelledby="admin-nav-operational">
        <h2 id="admin-nav-operational" className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Operación
        </h2>
        <div className="space-y-1">
          {operationalNavigation.map((item) => <NavigationLink key={item.href} item={item} onNavigate={onNavigate} />)}
        </div>
      </section>
    </div>
  );
}
