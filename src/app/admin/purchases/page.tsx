import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { listPurchaseSuppliers, listPurchases } from "@/features/purchases/queries";
import type { PurchaseStatus } from "@/features/purchases/history-types";
import { formatCents, parseCents } from "@/features/pos/money";

const statusLabels: Record<PurchaseStatus, string> = { CONFIRMED: "Confirmada", VOIDED: "Anulada" };

function money(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "—" : `S/ ${formatCents(cents)}`;
}

function purchaseDate(value: string): string {
  return new Date(`${value}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

function queryString(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const [history, suppliers] = await Promise.all([
    listPurchases(Number.isNaN(page) ? 1 : page, {
      from: params.from,
      to: params.to,
      supplierId: params.supplier,
      search: params.search,
    }),
    listPurchaseSuppliers(),
  ]);
  const filterValues = {
    from: history.filters.from,
    to: history.filters.to,
    supplier: history.filters.supplierId,
    search: history.filters.search,
  };
  const hasFilters = Object.values(filterValues).some(Boolean);

  return (
    <div className="flex flex-col bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold">Historial de compras</h1><p className="mt-1 text-sm text-zinc-500">Consulta administrativa de compras registradas.</p></div>
          <Link href="/admin/purchases/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Nueva compra</Link>
        </div>

        <form className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4" method="get">
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Fecha desde</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="from" defaultValue={history.filters.from} /></label>
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Fecha hasta</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="to" defaultValue={history.filters.to} /></label>
          <label className="grid min-w-56 gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Proveedor</span><select className="rounded-md border border-zinc-300 px-3 py-2" name="supplier" defaultValue={history.filters.supplierId}><option value="">Todos</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.active ? "" : " (inactivo)"}</option>)}</select></label>
          <label className="grid min-w-56 gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Referencia</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="search" name="search" placeholder="Buscar referencia" defaultValue={history.filters.search} /></label>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700" type="submit">Filtrar</button>
          <Link className="px-2 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900" href="/admin/purchases">Limpiar</Link>
        </form>

        {history.rows.length === 0 ? <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center"><p className="text-zinc-600">{hasFilters ? "No se encontraron compras con los filtros seleccionados." : "Aún no hay compras registradas."}</p>{!hasFilters ? <Link href="/admin/purchases/new" className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Registrar primera compra</Link> : null}</div> : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-[950px] w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 font-medium">Proveedor</th><th className="px-4 py-3 font-medium">Referencia</th><th className="px-4 py-3 font-medium">Productos</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Registrado por</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Acción</th></tr></thead>
              <tbody>{history.rows.map((row) => <tr className="border-b border-zinc-100 last:border-0" key={row.id}><td className="whitespace-nowrap px-4 py-3">{purchaseDate(row.purchase_date)}</td><td className="px-4 py-3 font-medium">{row.supplier_name}</td><td className="max-w-48 truncate px-4 py-3">{row.reference ?? "—"}</td><td className="px-4 py-3">{row.item_count} {row.item_count === 1 ? "línea" : "líneas"}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(row.total)}</td><td className="px-4 py-3">{row.creator_name}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.status === "VOIDED" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>{statusLabels[row.status]}</span></td><td className="px-4 py-3"><Link className="font-semibold text-zinc-700 hover:text-zinc-950 hover:underline" href={`/admin/purchases/${row.id}`}>Ver detalle</Link></td></tr>)}</tbody>
            </table>
          </div>
        )}

        {history.totalPages > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación de compras"><span className="text-zinc-500">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/purchases?${queryString({ ...filterValues, page: String(history.page - 1) })}`}>Anterior</Link> : null}{history.page < history.totalPages ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/purchases?${queryString({ ...filterValues, page: String(history.page + 1) })}`}>Siguiente</Link> : null}</div></nav> : null}
      </main>
    </div>
  );
}
