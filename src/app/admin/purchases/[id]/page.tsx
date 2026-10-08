import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { getPurchaseDetail } from "@/features/purchases/queries";
import { VoidPurchaseForm } from "@/app/admin/purchases/[id]/void-purchase-form";
import { formatCents, parseCents } from "@/features/pos/money";
import type { PurchaseHistoryItem } from "@/features/purchases/history-types";

const statusLabels = { CONFIRMED: "Confirmada", VOIDED: "Anulada" } as const;

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
  await requireAdmin();
  const { id } = await params;
  const purchase = await getPurchaseDetail(id);

  if (!purchase) {
    return <div className="rounded-lg border border-border bg-card px-4 py-10 text-center"><p className="text-muted-foreground">Compra no encontrada.</p><Link href="/admin/purchases" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>Volver a compras</Link></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/purchases" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}><ArrowLeft aria-hidden="true" />Volver a compras</Link>
      <header><p className="text-sm font-medium text-primary">Inventario / Compras</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Detalle de compra</h1><p className="mt-2 text-sm text-muted-foreground">Consulta histórica y read-only de la operación.</p></header>
      <Card className={purchase.status === "VOIDED" ? "border-destructive/30" : undefined}><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><Package aria-hidden="true" className="size-4 text-primary" />Compra a {purchase.supplier_name}</CardTitle><CardDescription>{date(purchase.purchase_date)} · {purchase.reference ?? "Sin referencia"}</CardDescription></div><div className="flex items-center gap-3"><Badge variant={purchase.status === "VOIDED" ? "destructive" : "success"}>{statusLabels[purchase.status]}</Badge><span className="text-lg font-semibold tabular-nums">{money(purchase.total)}</span></div></div></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><DetailRow label="Proveedor" value={purchase.supplier_name} /><DetailRow label="RUC" value={purchase.supplier_ruc ?? "—"} /><DetailRow label="Registrada por" value={purchase.created_by_name} /><DetailRow label="Registrada el" value={dateTime(purchase.created_at)} /></dl></CardContent></Card>
      {purchase.status === "VOIDED" ? <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base text-destructive">Auditoría de anulación</CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><DetailRow label="Anulada el" value={purchase.voided_at ? dateTime(purchase.voided_at) : "—"} /><DetailRow label="Anulada por" value={purchase.voided_by_name} /><div className="sm:col-span-2"><dt className="text-muted-foreground">Motivo</dt><dd className="mt-1 font-semibold">{purchase.void_reason ?? "—"}</dd></div></dl></CardContent></Card> : <VoidPurchaseForm purchaseId={purchase.id} initialClientKey={crypto.randomUUID()} />}
      <Card><CardHeader><CardTitle className="text-base">Productos comprados</CardTitle><CardDescription>Las cantidades permanecen expresadas en unidades base.</CardDescription></CardHeader>{purchase.items.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">No hay productos registrados.</p></CardContent> : <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Producto</TableHead><TableHead>Cantidad</TableHead><TableHead className="text-right">Costo unitario</TableHead><TableHead className="pr-4 text-right">Subtotal</TableHead></TableRow></TableHeader><TableBody>{purchase.items.map((item) => <TableRow key={item.id}><TableCell className="pl-4 font-medium">{item.product_name}</TableCell><TableCell className="tabular-nums">{quantity(item)}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{money(item.unit_purchase_cost)}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{money(item.line_subtotal)}</TableCell></TableRow>)}</TableBody></Table><dl className="flex max-w-md justify-between gap-4 border-t border-border p-4 sm:ml-auto"><dt className="font-semibold">Total de compra</dt><dd className="font-black tabular-nums">{money(purchase.total)}</dd></dl></div>}</Card>
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Esta compra agregó inventario y actualizó el costo de compra de los productos al momento de su registro.</p>
    </div>
  );
}
