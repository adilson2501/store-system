import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
  await requireAdmin();
  const { id } = await params;
  const session = await getCashSessionHistoryDetail(id);
  if (!session) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href="/admin/cash-sessions" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}><ArrowLeft aria-hidden="true" />Volver al historial</Link>
      <header><p className="text-sm font-medium text-primary">Ventas y control / Cajas</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Detalle de caja</h1><p className="mt-2 text-sm text-muted-foreground">Consulta administrativa read-only de la sesión.</p></header>
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><WalletCards aria-hidden="true" className="size-4 text-primary" />Sesión de caja</CardTitle><CardDescription>{session.operator_name} · Apertura {dateTime(session.opened_at)}</CardDescription></div><Badge variant={session.status === "OPEN" ? "warning" : "secondary"}>{session.status === "OPEN" ? "Abierta" : "Cerrada"}</Badge></div></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><DetailRow label="Operador" value={session.operator_name} /><DetailRow label="Hora de apertura" value={dateTime(session.opened_at)} /><DetailRow label="Hora de cierre" value={dateTime(session.closed_at)} /></dl></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Resumen de caja</CardTitle><CardDescription>Valores calculados por el resumen administrativo autorizado.</CardDescription></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><DetailRow label="Fondo inicial" value={money(session.opening_cash)} /><DetailRow label="Ventas en efectivo" value={money(session.cash_sales)} /><DetailRow label="Ventas Yape" value={money(session.yape_sales)} /><DetailRow label="Ventas fiadas" value={money(session.credit_sales)} /><DetailRow label="Cobros de deuda en efectivo" value={money(session.cash_debt_payments)} /><DetailRow label="Cobros de deuda por Yape" value={money(session.yape_debt_payments)} /><DetailRow label="Total vendido" value={money(session.total_sales)} strong /><DetailRow label="Efectivo esperado" value={money(session.expected_cash)} strong /><DetailRow label="Efectivo contado" value={money(session.counted_cash)} strong /><DetailRow label="Diferencia" value={signedMoney(session.difference)} strong /></dl>{session.status === "OPEN" ? <p className="mt-5 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-foreground">La sesión sigue abierta. Los valores de cierre aún no están finalizados.</p> : null}</CardContent></Card>
    </div>
  );
}
