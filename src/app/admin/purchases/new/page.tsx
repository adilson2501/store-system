import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listActiveSuppliers } from "@/features/suppliers/queries";
import { PurchaseForm } from "@/app/admin/purchases/new/purchase-form";

export default async function NewPurchasePage() {
  await requireAdmin();
  const suppliers = await listActiveSuppliers();
  const initialDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/admin/purchases" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3")}><ArrowLeft aria-hidden="true" />Volver a compras</Link><Link href="/admin/suppliers" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Proveedores</Link></div>
      <header><p className="text-sm font-medium text-primary">Inventario / Compras</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Registrar compra</h1><p className="mt-2 text-sm text-muted-foreground">Ingresa mercancía en unidades base de inventario.</p></header>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackagePlus aria-hidden="true" className="size-4 text-primary" />Nueva compra</CardTitle><CardDescription>Selecciona proveedor, productos y costos. La operación actualizará el inventario al confirmarse.</CardDescription></CardHeader><PurchaseForm suppliers={suppliers} initialDate={initialDate} /></Card>
    </div>
  );
}
