import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { AccountEmailForm, AccountPasswordForm } from "./account-forms";
import { cn } from "@/lib/utils";

export default async function AccountPage() {
  const user = await requireUser();
  const returnPath = user.role === "ADMIN" ? "/admin" : "/pos";
  const returnLabel = user.role === "ADMIN" ? "Volver a administración" : "Volver al POS";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={returnPath} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">Cuenta</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Link>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck aria-hidden="true" className="size-4" />
              {user.role === "ADMIN" ? "Administrador" : "Vendedor"}
            </p>
            <h1 className="text-3xl font-black tracking-tight">Cuenta</h1>
            <p className="mt-2 text-muted-foreground">Gestiona tus credenciales de acceso.</p>
          </div>
          <Link href={returnPath} className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft aria-hidden="true" />
            {returnLabel}
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Correo electrónico</CardTitle>
              <CardDescription>Tu correo es la identidad utilizada para iniciar sesión.</CardDescription>
            </CardHeader>
            <AccountEmailForm currentEmail={user.email} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contraseña</CardTitle>
              <CardDescription>Actualiza la contraseña de tu propia cuenta.</CardDescription>
            </CardHeader>
            <AccountPasswordForm />
          </Card>
        </div>
      </div>
    </main>
  );
}
