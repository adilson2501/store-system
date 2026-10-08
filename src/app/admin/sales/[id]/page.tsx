import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { getSaleDetail } from "@/features/sales-history/queries";
import type { SalePaymentMethod, SaleStatus } from "@/features/sales-history/types";
import { VoidSaleForm } from "@/app/admin/sales/[id]/void-sale-form";
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
  await requireAdmin();
  const { id } = await params;
  const sale = await getSaleDetail(id);
  if (!sale) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
            <p className="text-zinc-600">Venta no encontrada.</p>
            <Link href="/admin/sales" className="mt-4 inline-block text-sm font-semibold text-zinc-700 hover:text-zinc-900">Volver a ventas</Link>
        </div>
      </div>
    );
  }

  const voided = sale.status === "VOIDED";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/sales" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}><ArrowLeft aria-hidden="true" />Volver a ventas</Link>
      <header><p className="text-sm font-medium text-primary">Ventas y control</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Detalle de venta</h1><p className="mt-2 text-sm text-muted-foreground">Consulta histórica y trazable de la operación.</p></header>
      <Card className={voided ? "border-destructive/30" : undefined}>
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><Receipt aria-hidden="true" className="size-4 text-primary" />Resumen de la venta</CardTitle><CardDescription>{dateTime(sale.created_at)} · {sale.seller_name}</CardDescription></div><div className="flex flex-wrap gap-2"><Badge variant={voided ? "destructive" : "success"}>{voided ? "Anulada" : statusLabels[sale.status]}</Badge><Badge variant={sale.payment_method === "CREDIT" ? "warning" : "info"}>{paymentLabels[sale.payment_method]}</Badge></div></div></CardHeader>
        <CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Vendedor</dt><dd className="mt-1 font-semibold">{sale.seller_name}</dd></div><div><dt className="text-muted-foreground">Método de pago</dt><dd className="mt-1 font-semibold">{paymentLabels[sale.payment_method]}</dd></div><div><dt className="text-muted-foreground">{voided ? "Total original" : "Total"}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(sale.total)}</dd></div><div><dt className="text-muted-foreground">Cliente</dt><dd className="mt-1 font-semibold">{sale.customer_name ?? "—"}</dd></div></dl></CardContent>
      </Card>
      {voided ? <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base text-destructive">Auditoría de anulación</CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><DetailRow label="Fecha de anulación" value={dateTime(sale.voided_at)} /><DetailRow label="Anulada por" value={sale.voided_by_name ?? "Operador sin nombre"} /><div className="sm:col-span-2"><dt className="text-muted-foreground">Motivo</dt><dd className="mt-1 font-semibold">{sale.void_reason}</dd></div></dl></CardContent></Card> : <VoidSaleForm saleId={sale.id} paymentMethod={sale.payment_method} initialClientKey={crypto.randomUUID()} />}
      {sale.payment_method === "CASH" ? <Card><CardHeader><CardTitle className="text-base">Pago en efectivo</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><DetailRow label="Recibido" value={money(sale.amount_received)} /><DetailRow label="Vuelto" value={money(sale.amount_change)} /></dl></CardContent></Card> : null}
      {sale.payment_method === "CREDIT" ? <Card><CardHeader><CardTitle className="text-base">Venta fiada</CardTitle><CardDescription>Esta operación afecta el saldo del cliente según el registro de crédito.</CardDescription></CardHeader><CardContent><dl><DetailRow label="Cliente" value={sale.customer_name ?? "Cliente no encontrado"} /></dl></CardContent></Card> : null}
      <Card><CardHeader><CardTitle className="text-base">Caja asociada</CardTitle></CardHeader><CardContent>{sale.cash_session ? <dl className="grid gap-4 sm:grid-cols-3"><DetailRow label="Estado" value={sale.cash_session.status === "OPEN" ? "Abierta" : "Cerrada"} /><DetailRow label="Apertura" value={dateTime(sale.cash_session.opened_at)} /><DetailRow label="Cierre" value={dateTime(sale.cash_session.closed_at)} /></dl> : <p className="text-sm text-muted-foreground">Sin sesión de caja</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Productos vendidos</CardTitle><CardDescription>Valores históricos guardados en la venta.</CardDescription></CardHeader>{sale.items.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">No hay productos registrados.</p></CardContent> : <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Producto</TableHead><TableHead>Cantidad</TableHead><TableHead className="text-right">Costo unitario</TableHead><TableHead className="text-right">Precio unitario</TableHead><TableHead className="pr-4 text-right">Subtotal</TableHead></TableRow></TableHeader><TableBody>{sale.items.map((item) => <TableRow key={item.id}><TableCell className="pl-4 font-medium">{item.product_name}</TableCell><TableCell className="tabular-nums">{quantity(item.quantity, item.unit_type)}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{money(item.unit_purchase_cost)}</TableCell><TableCell className="text-right tabular-nums">{money(item.unit_selling_price)}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{money(item.line_subtotal)}</TableCell></TableRow>)}</TableBody></Table><dl className="grid max-w-md gap-3 border-t border-border p-4 sm:ml-auto"><DetailRow label={voided ? "Costo total original" : "Costo total"} value={money(sale.cost_total)} /><DetailRow label={voided ? "Ganancia bruta original" : "Ganancia bruta"} value={money(sale.gross_profit)} strong /><DetailRow label={voided ? "Total original" : "Total vendido"} value={money(sale.total)} strong /></dl>{voided ? <p className="m-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Esta venta está anulada y no representa ingreso activo.</p> : null}</div>}</Card>
    </div>
  );
}
