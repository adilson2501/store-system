import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { listSales } from "@/features/sales-history/queries";
import type { SalePaymentMethod, SaleStatus } from "@/features/sales-history/types";
import { formatCents, parseCents } from "@/features/pos/money";

const paymentLabels: Record<SalePaymentMethod, string> = { CASH: "Efectivo", YAPE: "Yape", CREDIT: "Fiado" };
const statusLabels: Record<SaleStatus, string> = { CONFIRMED: "Confirmada", VOIDED: "Anulada" };

function money(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "—" : `S/. ${formatCents(cents)}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
}

function queryString(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const history = await listSales(Number.isNaN(page) ? 1 : page, {
    from: params.from,
    to: params.to,
    paymentMethod: params.method as SalePaymentMethod | undefined,
    status: params.status as SaleStatus | undefined,
  });
  const filterValues = { from: history.filters.from, to: history.filters.to, method: history.filters.paymentMethod, status: history.filters.status };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const todayQuery = queryString({ from: today, to: today, method: history.filters.paymentMethod, status: history.filters.status });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold">Ventas</h1><p className="mt-1 text-sm text-zinc-500">Historial administrativo de ventas.</p></div>
          <Link href="/pos" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">POS operativo</Link>
        </div>

        <form className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4" method="get">
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Desde</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="from" defaultValue={history.filters.from} /></label>
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Hasta</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="to" defaultValue={history.filters.to} /></label>
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Método</span><select className="rounded-md border border-zinc-300 px-3 py-2" name="method" defaultValue={history.filters.paymentMethod}><option value="">Todos</option><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="CREDIT">Fiado</option></select></label>
          <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Estado</span><select className="rounded-md border border-zinc-300 px-3 py-2" name="status" defaultValue={history.filters.status}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="VOIDED">Anulada</option></select></label>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700" type="submit">Filtrar</button>
          <Link className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50" href={todayQuery ? `/admin/sales?${todayQuery}` : "/admin/sales"}>Hoy</Link>
          <Link className="px-2 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900" href="/admin/sales">Limpiar</Link>
        </form>

        {history.rows.length === 0 ? <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-zinc-500">No hay ventas registradas.</div> : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-[950px] w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3 font-medium">Fecha/hora</th><th className="px-4 py-3 font-medium">Vendedor</th><th className="px-4 py-3 font-medium">Método</th><th className="px-4 py-3 font-medium">Cliente</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Caja</th></tr></thead>
              <tbody>{history.rows.map((row) => <tr className="border-b border-zinc-100 last:border-0" key={row.id}><td className="whitespace-nowrap px-4 py-3"><Link className="font-semibold hover:underline" href={`/admin/sales/${row.id}`}>{dateTime(row.created_at)}</Link></td><td className="px-4 py-3">{row.seller_name}</td><td className="px-4 py-3">{paymentLabels[row.payment_method]}</td><td className="px-4 py-3">{row.customer_name ?? "—"}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(row.total)}</td><td className="px-4 py-3">{statusLabels[row.status]}</td><td className="px-4 py-3">{row.cash_session_status === "OPEN" ? "Abierta" : row.cash_session_status === "CLOSED" ? "Cerrada" : "Sin sesión de caja"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {history.totalPages > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación de ventas"><span className="text-zinc-500">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/sales?${queryString({ ...filterValues, page: String(history.page - 1) })}`}>Anterior</Link> : null}{history.page < history.totalPages ? <Link className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50" href={`/admin/sales?${queryString({ ...filterValues, page: String(history.page + 1) })}`}>Siguiente</Link> : null}</div></nav> : null}
      </main>
    </div>
  );
}
