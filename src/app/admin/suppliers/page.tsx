import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { listSuppliers } from "@/features/suppliers/queries";
import { SupplierStatusToggle } from "@/app/admin/suppliers/supplier-status-toggle";

function queryString(values: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const history = await listSuppliers(Number.isNaN(parsedPage) ? 1 : parsedPage, params.q ?? "");
  const baseQuery = { q: history.search };

  return (
    <div className="flex flex-col bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold">Proveedores</h1><p className="mt-1 text-sm text-zinc-500">Proveedores activos e históricos.</p></div>
          <Link href="/admin/suppliers/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">Nuevo proveedor</Link>
        </div>

        <form method="get" className="mb-4 flex max-w-lg gap-2">
          <label htmlFor="supplier-search" className="sr-only">Buscar proveedores</label>
          <input id="supplier-search" type="search" name="q" defaultValue={history.search} placeholder="Buscar por nombre, RUC o teléfono" className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
          <button type="submit" className="min-h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Buscar</button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">RUC</th><th className="px-4 py-3 font-medium">Teléfono</th><th className="px-4 py-3 font-medium">Notas</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Acciones</th></tr></thead>
            <tbody>
              {history.rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-zinc-500">{history.search ? "Ningún proveedor coincide con tu búsqueda." : "Aún no hay proveedores."}</td></tr> : history.rows.map((supplier) => (
                <tr key={supplier.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3"><Link href={`/admin/suppliers/${supplier.id}`} className="font-medium text-zinc-900 hover:underline">{supplier.name}</Link></td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">{supplier.ruc ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{supplier.phone ?? "—"}</td>
                  <td className="max-w-xs px-4 py-3 text-zinc-600">{supplier.notes ?? "—"}</td>
                  <td className="px-4 py-3"><span className={supplier.active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800" : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"}>{supplier.active ? "Activo" : "Inactivo"}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/suppliers/${supplier.id}`} className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">Editar</Link><SupplierStatusToggle supplierId={supplier.id} active={supplier.active} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {history.totalPages > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación de proveedores"><span className="text-zinc-500">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/suppliers?${queryString({ ...baseQuery, page: String(history.page - 1) })}`}>Anterior</Link> : null}{history.page < history.totalPages ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/suppliers?${queryString({ ...baseQuery, page: String(history.page + 1) })}`}>Siguiente</Link> : null}</div></nav> : null}
      </main>
    </div>
  );
}
