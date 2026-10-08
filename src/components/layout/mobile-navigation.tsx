"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú administrativo">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex h-dvh max-h-dvh w-[min(18rem,calc(100vw-2rem))] flex-col overflow-x-hidden overflow-y-hidden p-0">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-5 pr-14">
          <SheetTitle className="text-left text-sm">Sistema de Tienda</SheetTitle>
          <p className="text-left text-xs text-muted-foreground">Administración</p>
        </SheetHeader>
        <nav aria-label="Navegación administrativa móvil" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5">
          <AdminNavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <div className="shrink-0 border-t border-border px-3 py-4">
          <Link href="/account" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start")}>Cuenta</Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
