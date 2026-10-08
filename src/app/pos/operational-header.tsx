import Link from "next/link";
import { CircleUserRound, LogOut, ShieldCheck, ShoppingCart, Store, Users, WalletCards } from "lucide-react";
import { logout } from "@/features/auth/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  sellerName: string;
  userRole: "ADMIN" | "SELLER";
  cashSessionOpen: boolean;
  currentArea: "POS" | "CASH" | "CUSTOMERS";
};

const areaLabels = {
  POS: "POS",
  CASH: "Caja",
  CUSTOMERS: "Clientes",
} as const;

export function OperationalHeader({ sellerName, userRole, cashSessionOpen, currentArea }: Props) {
  const contextLabel = areaLabels[currentArea];

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">Store System / {contextLabel}</p>
            <p className="truncate text-xs text-muted-foreground">{sellerName}</p>
          </div>
          <Badge variant={cashSessionOpen ? "success" : "warning"} className="hidden shrink-0 sm:inline-flex">
            <WalletCards aria-hidden="true" className="mr-1 size-3" />
            {cashSessionOpen ? "Caja abierta" : "Caja cerrada"}
          </Badge>
        </div>

        <nav className="flex flex-wrap items-center justify-end gap-1" aria-label="Navegacion operativa">
          <Link href="/pos" aria-current={currentArea === "POS" ? "page" : undefined} className={cn(buttonVariants({ variant: currentArea === "POS" ? "secondary" : "ghost", size: "sm" }), "min-h-10")}>
            <ShoppingCart aria-hidden="true" />POS
          </Link>
          <Link href="/cash" aria-current={currentArea === "CASH" ? "page" : undefined} className={cn(buttonVariants({ variant: currentArea === "CASH" ? "secondary" : "ghost", size: "sm" }), "min-h-10")}>
            <WalletCards aria-hidden="true" />Caja
          </Link>
          <Link href="/customers" aria-current={currentArea === "CUSTOMERS" ? "page" : undefined} className={cn(buttonVariants({ variant: currentArea === "CUSTOMERS" ? "secondary" : "ghost", size: "sm" }), "min-h-10")}>
            <Users aria-hidden="true" />Clientes
          </Link>
          {userRole === "ADMIN" ? (
            <Link href="/admin" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-10")}>
              <ShieldCheck aria-hidden="true" />Administracion
            </Link>
          ) : null}
          <Link href="/account" aria-label="Cuenta y contrasena" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "min-h-10 min-w-10")}>
            <CircleUserRound aria-hidden="true" />
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Cerrar sesion" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "min-h-10 min-w-10")}>
              <LogOut aria-hidden="true" />
            </button>
          </form>
        </nav>

        <Badge variant={cashSessionOpen ? "success" : "warning"} className="w-fit sm:hidden">
          <WalletCards aria-hidden="true" className="mr-1 size-3" />
          {cashSessionOpen ? "Caja abierta" : "Caja cerrada"}
        </Badge>
      </div>
    </header>
  );
}
