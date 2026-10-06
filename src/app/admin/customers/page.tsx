import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { AppHeader } from "@/components/app-header";
import { listCustomers } from "@/features/customers/queries";
import { formatCustomerMoney, parseSignedCents } from "@/features/customers/validation";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireAdmin();
  const { q = "" } = await searchParams;
  const customers = await listCustomers(q);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold">Clientes</h1><p className="mt-1 text-sm text-zinc-500">Clientes y crédito fiado</p></div>
          <Link href="/admin/customers/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">Nuevo cliente</Link>
        </div>
        <form method="get" className="mb-4 flex max-w-md gap-2">
          <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
          <button type="submit" className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Buscar</button>
        </form>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Teléfono</th><th className="px-4 py-3 font-medium">Deuda actual</th><th className="px-4 py-3 font-medium">Límite</th><th className="px-4 py-3 font-medium">Disponible</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Crédito</th></tr></thead>
            <tbody>
              {customers.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-zinc-500">{q ? "Ningún cliente coincide con tu búsqueda." : "Aún no hay clientes."}</td></tr> : customers.map((customer) => {
                const debt = parseSignedCents(customer.current_debt);
                return <tr key={customer.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3"><Link href={`/admin/customers/${customer.id}`} className="font-medium text-zinc-900 hover:underline">{customer.name}</Link></td>
                  <td className="px-4 py-3 text-zinc-700">{customer.phone ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-zinc-800">{formatCustomerMoney(debt)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatCustomerMoney(parseSignedCents(customer.credit_limit))}</td>
                  <td className={`px-4 py-3 font-medium ${parseSignedCents(customer.available_credit) < BigInt(0) ? "text-red-700" : "text-zinc-700"}`}>{formatCustomerMoney(parseSignedCents(customer.available_credit))}</td>
                  <td className="px-4 py-3"><span className={customer.active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800" : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"}>{customer.active ? "Activo" : "Inactivo"}</span></td>
                  <td className="px-4 py-3 text-zinc-700">{customer.credit_enabled ? "Habilitado" : "Deshabilitado"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
