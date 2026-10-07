import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { CustomerForm } from "@/app/admin/customers/customer-form";

export default async function NewCustomerPage() {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/admin/customers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}><ArrowLeft aria-hidden="true" />Volver a clientes</Link>
      <header>
        <p className="text-sm font-medium text-primary">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Nuevo cliente</h1>
        <p className="mt-2 text-sm text-muted-foreground">Registra un cliente para controlar su crédito.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserPlus aria-hidden="true" className="size-4 text-primary" />Datos del cliente</CardTitle>
          <CardDescription>Configura su información y límite de crédito.</CardDescription>
        </CardHeader>
        <CardContent><CustomerForm mode="create" /></CardContent>
      </Card>
    </div>
  );
}
