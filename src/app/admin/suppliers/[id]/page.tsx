import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { getSupplier } from "@/features/suppliers/queries";
import { SupplierForm } from "@/app/admin/suppliers/supplier-form";
import { SupplierStatusToggle } from "@/app/admin/suppliers/supplier-status-toggle";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/admin/suppliers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}>
        <ArrowLeft aria-hidden="true" />
        Volver a proveedores
      </Link>
      <header>
        <p className="text-sm font-medium text-primary">Inventario / Proveedores</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{supplier.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Edita los datos y disponibilidad del proveedor.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Truck aria-hidden="true" className="size-4 text-primary" />Datos del proveedor</CardTitle>
          <CardDescription>Los cambios se guardan en el registro actual del proveedor.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado actual</p><Badge variant={supplier.active ? "success" : "secondary"} className="mt-2">{supplier.active ? "Activo" : "Inactivo"}</Badge></div>
            <SupplierStatusToggle supplierId={supplier.id} active={supplier.active} />
          </div>
          <SupplierForm mode="edit" supplierId={supplier.id} defaultValues={{ name: supplier.name, ruc: supplier.ruc ?? "", phone: supplier.phone ?? "", notes: supplier.notes ?? "" }} />
        </CardContent>
      </Card>
    </div>
  );
}
