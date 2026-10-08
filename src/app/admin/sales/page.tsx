import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
  await requireAdmin();
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-primary">Ventas y control</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Ventas</h1><p className="mt-2 text-sm text-muted-foreground">Historial administrativo de ventas confirmadas y anuladas.</p><p className="mt-2 text-sm text-muted-foreground">{history.total} registros históricos</p></div>
        <Link href="/pos" className={cn(buttonVariants({ variant: "outline" }), "sm:mt-6")}><ShoppingCart aria-hidden="true" />POS operativo</Link>
      </header>
      <Card>
        <CardHeader className="border-b border-border pb-4"><CardTitle className="flex items-center gap-2 text-base"><Filter aria-hidden="true" className="size-4 text-primary" />Filtros de ventas</CardTitle><CardDescription>Consulta el historial por periodo, método de pago o estado.</CardDescription>
          <form className="flex flex-wrap items-end gap-3 pt-2" method="get">
            <label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Desde</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="date" name="from" defaultValue={history.filters.from} /></label>
            <label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Hasta</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="date" name="to" defaultValue={history.filters.to} /></label>
            <label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Método</span><select className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="method" defaultValue={history.filters.paymentMethod}><option value="">Todos</option><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="CREDIT">Fiado</option></select></label>
            <label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Estado</span><select className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="status" defaultValue={history.filters.status}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="VOIDED">Anulada</option></select></label>
            <Button type="submit">Filtrar</Button><Link className={cn(buttonVariants({ variant: "outline" }))} href={todayQuery ? `/admin/sales?${todayQuery}` : "/admin/sales"}><CalendarDays aria-hidden="true" />Hoy</Link><Link className={cn(buttonVariants({ variant: "ghost" }))} href="/admin/sales">Limpiar</Link>
          </form>
        </CardHeader>
        {history.rows.length === 0 ? <p className="px-6 py-12 text-center text-sm text-muted-foreground">No hay ventas registradas con los filtros seleccionados.</p> : <div className="overflow-x-auto"><Table className="min-w-[1050px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Fecha/hora</TableHead><TableHead>Vendedor</TableHead><TableHead>Método</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead><TableHead className="pr-4">Caja</TableHead></TableRow></TableHeader><TableBody>{history.rows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap pl-4"><Link className="font-semibold text-foreground hover:text-primary hover:underline" href={`/admin/sales/${row.id}`}>{dateTime(row.created_at)}</Link></TableCell><TableCell>{row.seller_name}</TableCell><TableCell><Badge variant={row.payment_method === "CREDIT" ? "warning" : "info"}>{paymentLabels[row.payment_method]}</Badge></TableCell><TableCell className="text-muted-foreground">{row.customer_name ?? "—"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.total)}</TableCell><TableCell><Badge variant={row.status === "VOIDED" ? "destructive" : "success"}>{statusLabels[row.status]}</Badge></TableCell><TableCell className="pr-4 text-muted-foreground">{row.cash_session_status === "OPEN" ? "Abierta" : row.cash_session_status === "CLOSED" ? "Cerrada" : "Sin sesión"}</TableCell></TableRow>)}</TableBody></Table></div>}
      </Card>
      {history.totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginación de ventas"><span className="text-muted-foreground">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/sales?${queryString({ ...filterValues, page: String(history.page - 1) })}`}><ChevronLeft aria-hidden="true" />Anterior</Link> : null}{history.page < history.totalPages ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/sales?${queryString({ ...filterValues, page: String(history.page + 1) })}`}>Siguiente<ChevronRight aria-hidden="true" /></Link> : null}</div></nav> : null}
    </div>
  );
}
