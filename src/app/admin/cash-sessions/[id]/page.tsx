import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { getCashSessionHistoryDetail } from "@/features/cash-history/queries";
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

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">{label}</dt><dd className={strong ? "font-black tabular-nums" : "font-semibold tabular-nums"}>{value}</dd></div>;
}

export default async function CashSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const session = await getCashSessionHistoryDetail(id);
  if (!session) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold">Detalle de caja</h1><p className="mt-1 text-sm text-zinc-500">Consulta administrativa read-only</p></div>
          <Link href="/admin/cash-sessions" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">Volver al historial</Link>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p><p className="mt-1 text-xl font-bold">{session.status === "OPEN" ? "ABIERTA" : "CERRADA"}</p></div>
            <div className={session.status === "OPEN" ? "rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800" : "rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700"}>{session.status === "OPEN" ? "En curso" : "Finalizada"}</div>
          </div>
          <dl className="mt-5 grid gap-4 border-t border-zinc-200 pt-5 text-sm sm:grid-cols-2">
            <div><dt className="text-zinc-500">Operador</dt><dd className="font-semibold">{session.operator_name}</dd></div>
            <div><dt className="text-zinc-500">Hora de apertura</dt><dd className="font-semibold">{dateTime(session.opened_at)}</dd></div>
            <div><dt className="text-zinc-500">Hora de cierre</dt><dd className="font-semibold">{dateTime(session.closed_at)}</dd></div>
          </dl>
        </section>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold">Resumen de caja</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailRow label="Fondo inicial" value={money(session.opening_cash)} />
            <DetailRow label="Ventas en efectivo" value={money(session.cash_sales)} />
            <DetailRow label="Ventas Yape" value={money(session.yape_sales)} />
            <DetailRow label="Ventas fiadas" value={money(session.credit_sales)} />
            <DetailRow label="Cobros de deuda en efectivo" value={money(session.cash_debt_payments)} />
            <DetailRow label="Cobros de deuda por Yape" value={money(session.yape_debt_payments)} />
            <DetailRow label="Total vendido" value={money(session.total_sales)} strong />
            <DetailRow label="Efectivo esperado" value={money(session.expected_cash)} strong />
            <DetailRow label="Efectivo contado" value={money(session.counted_cash)} strong />
            <DetailRow label="Diferencia" value={signedMoney(session.difference)} strong />
          </dl>
          {session.status === "OPEN" ? <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">La sesión sigue abierta. Los valores de cierre aún no están finalizados.</p> : null}
        </section>
      </main>
    </div>
  );
}
