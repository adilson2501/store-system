import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { getPurchaseDetail } from "@/features/purchases/queries";
import { formatCents, parseCents } from "@/features/pos/money";
import type { PurchaseHistoryItem } from "@/features/purchases/history-types";

function money(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "—" : `S/ ${formatCents(cents)}`;
}

function date(value: string): string {
  return new Date(`${value}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
}

function quantity(item: PurchaseHistoryItem): string {
  if (item.unit_type === "UNIT") {
    const whole = item.quantity.split(".")[0];
    return `${whole} ${whole === "1" ? "unidad" : "unidades"}`;
  }
  const [whole, fraction = ""] = item.quantity.split(".");
  const cleanFraction = fraction.slice(0, 3).replace(/0+$/, "");
  return `${cleanFraction ? `${whole}.${cleanFraction}` : whole} kg`;
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-sm text-zinc-500">{label}</dt><dd className={strong ? "mt-1 text-lg font-black tabular-nums" : "mt-1 font-semibold"}>{value}</dd></div>;
}

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const purchase = await getPurchaseDetail(id);

  if (!purchase) {
    return <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900"><AppHeader user={user} /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center"><p className="text-zinc-600">Compra no encontrada.</p><Link href="/admin/purchases" className="mt-4 inline-block text-sm font-semibold text-zinc-700 hover:text-zinc-900">Volver a compras</Link></div></main></div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">Detalle de compra</h1><p className="mt-1 text-sm text-zinc-500">Consulta administrativa read-only</p></div><Link href="/admin/purchases" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">Volver a compras</Link></div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p><p className="mt-1 text-xl font-bold">Confirmada</p></div><div className="text-left sm:text-right"><p className="text-xs uppercase tracking-wide text-zinc-500">Total</p><p className="mt-1 text-xl font-black tabular-nums">{money(purchase.total)}</p></div></div><dl className="mt-5 grid gap-4 border-t border-zinc-200 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3"><DetailRow label="Fecha de compra" value={date(purchase.purchase_date)} /><DetailRow label="Proveedor" value={purchase.supplier_name} /><DetailRow label="RUC" value={purchase.supplier_ruc ?? "—"} /><DetailRow label="Referencia" value={purchase.reference ?? "—"} /><DetailRow label="Registrada el" value={dateTime(purchase.created_at)} /><DetailRow label="Registrada por" value={purchase.created_by_name} /></dl></section>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Productos comprados</h2>{purchase.items.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No hay productos registrados.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-[700px] w-full text-left text-sm"><thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-3 py-3 font-medium">Producto</th><th className="px-3 py-3 font-medium">Cantidad</th><th className="px-3 py-3 font-medium">Costo unitario</th><th className="px-3 py-3 font-medium">Subtotal</th></tr></thead><tbody>{purchase.items.map((item) => <tr className="border-b border-zinc-100 last:border-0" key={item.id}><td className="px-3 py-3 font-medium">{item.product_name}</td><td className="px-3 py-3 tabular-nums">{quantity(item)}</td><td className="px-3 py-3 tabular-nums">{money(item.unit_purchase_cost)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(item.line_subtotal)}</td></tr>)}</tbody></table></div>}<dl className="mt-5 flex max-w-md justify-between gap-4 border-t border-zinc-200 pt-5"><dt className="font-semibold">Total de compra</dt><dd className="font-black tabular-nums">{money(purchase.total)}</dd></dl></section>

        <p className="mt-5 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">Esta compra agregó inventario y actualizó el costo de compra de los productos al momento de su registro.</p>
      </main>
    </div>
  );
}
