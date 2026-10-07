import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { getSupplier } from "@/features/suppliers/queries";
import { SupplierForm } from "@/app/admin/suppliers/supplier-form";
import { SupplierStatusToggle } from "@/app/admin/suppliers/supplier-status-toggle";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  return <div className="flex flex-col bg-zinc-50 text-zinc-900"><main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">{supplier.name}</h1><p className="mt-1 text-sm text-zinc-500">Editar proveedor</p></div><Link href="/admin/suppliers" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Volver a proveedores</Link></div><div className="rounded-lg border border-zinc-200 bg-white p-6"><div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-5"><div><p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p><p className="mt-1 font-semibold">{supplier.active ? "Activo" : "Inactivo"}</p></div><SupplierStatusToggle supplierId={supplier.id} active={supplier.active} /></div><SupplierForm mode="edit" supplierId={supplier.id} defaultValues={{ name: supplier.name, ruc: supplier.ruc ?? "", phone: supplier.phone ?? "", notes: supplier.notes ?? "" }} /></div></main></div>;
}
