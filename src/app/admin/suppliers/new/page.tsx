import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { SupplierForm } from "@/app/admin/suppliers/supplier-form";

export default async function NewSupplierPage() {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/admin/suppliers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}>
        <ArrowLeft aria-hidden="true" />
        Volver a proveedores
      </Link>
      <header>
        <p className="text-sm font-medium text-primary">Inventario</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Nuevo proveedor</h1>
        <p className="mt-2 text-sm text-muted-foreground">Registra un proveedor para futuras compras.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Truck aria-hidden="true" className="size-4 text-primary" />Datos del proveedor</CardTitle>
          <CardDescription>Los campos marcados con * son obligatorios.</CardDescription>
        </CardHeader>
        <CardContent><SupplierForm mode="create" /></CardContent>
      </Card>
    </div>
  );
}
