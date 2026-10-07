"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";

export function MobileNavigation() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú administrativo">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(18rem,calc(100vw-2rem))] p-0">
        <SheetHeader className="border-b border-border px-5 py-5 pr-14">
          <SheetTitle className="text-left text-sm">Sistema de Tienda</SheetTitle>
          <p className="text-left text-xs text-muted-foreground">Administración</p>
        </SheetHeader>
        <nav aria-label="Navegación administrativa móvil" className="overflow-y-auto px-3 py-5">
          <AdminNavLinks />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
