import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { CustomerForm } from "@/app/admin/customers/customer-form";

export default async function NewCustomerPage() {
  await requireAdmin();
  return <div className="flex flex-col bg-zinc-50 text-zinc-900"><main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8"><div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">Nuevo cliente</h1><p className="mt-1 text-sm text-zinc-500">Registra un cliente para controlar su crédito.</p></div><Link href="/admin/customers" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Volver a clientes</Link></div><div className="rounded-lg border border-zinc-200 bg-white p-6"><CustomerForm mode="create" /></div></main></div>;
}
