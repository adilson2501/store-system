import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { listActiveSuppliers } from "@/features/suppliers/queries";
import { PurchaseForm } from "@/app/admin/purchases/new/purchase-form";

export default async function NewPurchasePage() {
  const user = await requireAdmin();
  const suppliers = await listActiveSuppliers();
  const initialDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

  return <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900"><AppHeader user={user} /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">Registrar compra</h1><p className="mt-1 text-sm text-zinc-500">Ingresa mercancía en unidades base de inventario.</p></div><Link href="/admin/suppliers" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Proveedores</Link></div><PurchaseForm suppliers={suppliers} initialDate={initialDate} /></main></div>;
}
