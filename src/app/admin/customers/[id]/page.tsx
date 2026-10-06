import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { AppHeader } from "@/components/app-header";
import { CustomerForm } from "@/app/admin/customers/customer-form";
import { CustomerPaymentForm } from "@/app/admin/customers/payment-form";
import { getCustomer } from "@/features/customers/queries";
import { formatCustomerMoney, parseSignedCents } from "@/features/customers/validation";

function movementLabel(type: "CREDIT_SALE" | "PAYMENT") { return type === "CREDIT_SALE" ? "Venta fiada" : "Pago"; }

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const result = await getCustomer(id);
  if (!result) notFound();
  const { customer, ledger } = result;
  const debt = parseSignedCents(customer.current_debt);

  return <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900"><AppHeader user={user} /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-lg font-semibold">{customer.name}</h1><p className="mt-1 text-sm text-zinc-500">Detalle del cliente</p></div><Link href="/admin/customers" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Volver a clientes</Link></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-lg border border-zinc-200 bg-white p-6"><h2 className="mb-4 text-base font-semibold">Datos del cliente</h2><CustomerForm mode="edit" customerId={customer.id} defaultValues={{ name: customer.name, phone: customer.phone ?? "", notes: customer.notes ?? "", credit_limit: customer.credit_limit, credit_enabled: customer.credit_enabled, active: customer.active }} /></section>
      <div className="space-y-6"><section className="rounded-lg border border-zinc-200 bg-white p-6"><h2 className="text-base font-semibold">Crédito</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase text-zinc-500">Deuda actual</p><p className="mt-1 text-xl font-bold">{formatCustomerMoney(debt)}</p></div><div><p className="text-xs uppercase text-zinc-500">Límite</p><p className="mt-1 text-xl font-bold">{formatCustomerMoney(parseSignedCents(customer.credit_limit))}</p></div><div><p className="text-xs uppercase text-zinc-500">Disponible</p><p className="mt-1 text-xl font-bold">{formatCustomerMoney(parseSignedCents(customer.available_credit))}</p></div></div></section>
        <section className="rounded-lg border border-zinc-200 bg-white p-6"><h2 className="mb-1 text-base font-semibold">Registrar pago</h2><p className="mb-4 text-sm text-zinc-500">Los pagos no crean ventas ni movimientos de inventario.</p><CustomerPaymentForm customerId={customer.id} currentDebt={customer.current_debt} initialClientKey={crypto.randomUUID()} /></section></div>
    </div>
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-6 py-4"><h2 className="text-base font-semibold">Historial de crédito</h2><p className="mt-1 text-sm text-zinc-500">Historial append-only. No se puede editar ni eliminar.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-6 py-3 font-medium">Fecha</th><th className="px-6 py-3 font-medium">Tipo</th><th className="px-6 py-3 font-medium">Importe</th><th className="px-6 py-3 font-medium">Medio</th><th className="px-6 py-3 font-medium">Nota</th></tr></thead><tbody>{ledger.length === 0 ? <tr><td colSpan={5} className="px-6 py-6 text-zinc-500">Aún no hay movimientos de crédito.</td></tr> : ledger.map((entry) => <tr key={entry.id} className="border-b border-zinc-100"><td className="whitespace-nowrap px-6 py-3 text-zinc-600">{new Date(entry.created_at).toLocaleString("es-PE")}</td><td className="px-6 py-3 font-medium">{movementLabel(entry.movement_type)}</td><td className={`px-6 py-3 font-semibold ${parseSignedCents(entry.amount) < BigInt(0) ? "text-emerald-700" : "text-zinc-900"}`}>{parseSignedCents(entry.amount) > BigInt(0) ? "+" : ""}{formatCustomerMoney(parseSignedCents(entry.amount))}</td><td className="px-6 py-3 text-zinc-700">{entry.payment_method === "CASH" ? "Efectivo" : entry.payment_method === "YAPE" ? "Yape" : "—"}</td><td className="px-6 py-3 text-zinc-600">{entry.note ?? "—"}</td></tr>)}</tbody></table></div></section>
  </main></div>;
}
