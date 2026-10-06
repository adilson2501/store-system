import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { listCashSessions } from "@/features/cash-history/queries";
import { formatCents, parseCents } from "@/features/pos/money";

function money(value: string | null): string {
  if (value === null) return "—";
  const cents = parseCents(value);
  return cents === null ? "—" : `S/. ${formatCents(cents)}`;
}

function signedMoney(value: string | null): string {
  if (value === null) return "—";
  const negative = value.startsWith("-");
  const cents = parseCents(negative ? value.slice(1) : value);
  if (cents === null) return "—";
  if (cents === BigInt(0)) return "S/. 0.00";
  return negative ? `-S/. ${formatCents(cents)}` : `+S/. ${formatCents(cents)}`;
}

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("es-PE") : "—";
}

export default async function CashSessionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const history = await listCashSessions(Number.isNaN(page) ? 1 : page);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Historial de cajas</h1>
            <p className="mt-1 text-sm text-zinc-500">Consulta read-only de sesiones de caja.</p>
          </div>
          <Link href="/cash" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
            Caja operativa
          </Link>
        </div>

        {history.rows.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-zinc-500">No hay cajas registradas todavía.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Operador</th>
                  <th className="px-4 py-3 font-medium">Apertura</th>
                  <th className="px-4 py-3 font-medium">Cierre</th>
                  <th className="px-4 py-3 font-medium">Fondo inicial</th>
                  <th className="px-4 py-3 font-medium">Efectivo esperado</th>
                  <th className="px-4 py-3 font-medium">Efectivo contado</th>
                  <th className="px-4 py-3 font-medium">Diferencia</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.session_id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3"><Link href={`/admin/cash-sessions/${row.session_id}`} className="font-semibold hover:underline">{row.operator_name}</Link></td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{dateTime(row.opened_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{dateTime(row.closed_at)}</td>
                    <td className="px-4 py-3 tabular-nums">{money(row.opening_cash)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.status === "OPEN" ? "En curso" : money(row.expected_cash)}</td>
                    <td className="px-4 py-3 tabular-nums">{money(row.counted_cash)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{signedMoney(row.difference)}</td>
                    <td className="px-4 py-3"><span className={row.status === "OPEN" ? "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800" : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700"}>{row.status === "OPEN" ? "ABIERTA" : "CERRADA"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {history.totalPages > 1 ? (
          <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación de cajas">
            <span className="text-zinc-500">Página {history.page} de {history.totalPages}</span>
            <div className="flex gap-2">
              {history.page > 1 ? <Link href={`/admin/cash-sessions?page=${history.page - 1}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50">Anterior</Link> : null}
              {history.page < history.totalPages ? <Link href={`/admin/cash-sessions?page=${history.page + 1}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold hover:bg-zinc-50">Siguiente</Link> : null}
            </div>
          </nav>
        ) : null}
      </main>
    </div>
  );
}
