import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { getSaleDetail } from "@/features/sales-history/queries";
import type { SalePaymentMethod, SaleStatus } from "@/features/sales-history/types";
import { formatCents, parseCents } from "@/features/pos/money";

const paymentLabels: Record<SalePaymentMethod, string> = { CASH: "Efectivo", YAPE: "Yape", CREDIT: "Fiado" };
const statusLabels: Record<SaleStatus, string> = { CONFIRMED: "Confirmada", VOIDED: "Anulada" };

function money(value: string | null): string {
  if (value === null) return "—";
  const cents = parseCents(value);
  return cents === null ? "—" : `S/. ${formatCents(cents)}`;
}

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "—";
}

function quantity(value: string, unitType: "UNIT" | "WEIGHT"): string {
  if (unitType === "UNIT") return value.split(".")[0];
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(3, "0").slice(0, 3)} kg`;
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">{label}</dt><dd className={strong ? "font-black tabular-nums" : "font-semibold tabular-nums"}>{value}</dd></div>;
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const sale = await getSaleDetail(id);
  if (!sale) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center">
            <p className="text-zinc-600">Venta no encontrada.</p>
            <Link href="/admin/sales" className="mt-4 inline-block text-sm font-semibold text-zinc-700 hover:text-zinc-900">Volver a ventas</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">Detalle de venta</h1><p className="mt-1 text-sm text-zinc-500">Consulta administrativa read-only</p></div><Link href="/admin/sales" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">Volver a ventas</Link></div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p><p className="mt-1 text-xl font-bold">{statusLabels[sale.status]}</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">{paymentLabels[sale.payment_method]}</span></div><dl className="mt-5 grid gap-4 border-t border-zinc-200 pt-5 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Fecha/hora</dt><dd className="font-semibold">{dateTime(sale.created_at)}</dd></div><div><dt className="text-zinc-500">Vendedor</dt><dd className="font-semibold">{sale.seller_name}</dd></div><div><dt className="text-zinc-500">Método de pago</dt><dd className="font-semibold">{paymentLabels[sale.payment_method]}</dd></div><div><dt className="text-zinc-500">Total</dt><dd className="font-black tabular-nums">{money(sale.total)}</dd></div></dl></section>

        {sale.payment_method === "CASH" ? <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Pago en efectivo</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><DetailRow label="Recibido" value={money(sale.amount_received)} /><DetailRow label="Vuelto" value={money(sale.amount_change)} /></dl></section> : null}
        {sale.payment_method === "CREDIT" ? <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Venta fiada</h2><dl className="mt-4"><DetailRow label="Cliente" value={sale.customer_name ?? "Cliente no encontrado"} /></dl></section> : null}

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Caja</h2>{sale.cash_session ? <dl className="mt-4 grid gap-3 sm:grid-cols-3"><DetailRow label="Estado" value={sale.cash_session.status === "OPEN" ? "Abierta" : "Cerrada"} /><DetailRow label="Apertura" value={dateTime(sale.cash_session.opened_at)} /><DetailRow label="Cierre" value={dateTime(sale.cash_session.closed_at)} /></dl> : <p className="mt-4 text-sm text-zinc-500">Sin sesión de caja</p>}</section>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Productos vendidos</h2>{sale.items.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No hay productos registrados.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-3 py-3 font-medium">Producto</th><th className="px-3 py-3 font-medium">Cantidad</th><th className="px-3 py-3 font-medium">Costo unitario</th><th className="px-3 py-3 font-medium">Precio unitario</th><th className="px-3 py-3 font-medium">Subtotal</th></tr></thead><tbody>{sale.items.map((item) => <tr className="border-b border-zinc-100 last:border-0" key={item.id}><td className="px-3 py-3 font-medium">{item.product_name}</td><td className="px-3 py-3 tabular-nums">{quantity(item.quantity, item.unit_type)}</td><td className="px-3 py-3 tabular-nums">{money(item.unit_purchase_cost)}</td><td className="px-3 py-3 tabular-nums">{money(item.unit_selling_price)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(item.line_subtotal)}</td></tr>)}</tbody></table></div>}<dl className="mt-5 grid max-w-md gap-3 border-t border-zinc-200 pt-5"><DetailRow label="Costo total" value={money(sale.cost_total)} /><DetailRow label="Ganancia bruta" value={money(sale.gross_profit)} strong /><DetailRow label="Total vendido" value={money(sale.total)} strong /></dl></section>
      </main>
    </div>
  );
}
