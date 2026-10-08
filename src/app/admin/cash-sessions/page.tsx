import Link from "next/link";
import { ChevronLeft, ChevronRight, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
  await requireAdmin();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const history = await listCashSessions(Number.isNaN(page) ? 1 : page);

  return (
    <div className="flex flex-col gap-6">
      <header><p className="text-sm font-medium text-primary">Ventas y control</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Historial de cajas</h1><p className="mt-2 text-sm text-muted-foreground">Consulta read-only de sesiones de caja.</p><p className="mt-2 text-sm text-muted-foreground">{history.total} sesiones registradas</p></header>
      <Card><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2 text-base"><WalletCards aria-hidden="true" className="size-4 text-primary" />Sesiones de caja</CardTitle><CardDescription>Los valores provienen del resumen administrativo autorizado.</CardDescription></CardHeader>{history.rows.length === 0 ? <p className="px-6 py-12 text-center text-sm text-muted-foreground">No hay cajas registradas todavía.</p> : <div className="overflow-x-auto"><Table className="min-w-[1150px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Operador</TableHead><TableHead>Apertura</TableHead><TableHead>Cierre</TableHead><TableHead className="text-right">Fondo inicial</TableHead><TableHead className="text-right">Efectivo esperado</TableHead><TableHead className="text-right">Efectivo contado</TableHead><TableHead className="text-right">Diferencia</TableHead><TableHead className="pr-4">Estado</TableHead></TableRow></TableHeader><TableBody>{history.rows.map((row) => <TableRow key={row.session_id}><TableCell className="pl-4"><Link href={`/admin/cash-sessions/${row.session_id}`} className="font-semibold text-foreground hover:text-primary hover:underline">{row.operator_name}</Link></TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{dateTime(row.opened_at)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{dateTime(row.closed_at)}</TableCell><TableCell className="text-right tabular-nums">{money(row.opening_cash)}</TableCell><TableCell className="text-right tabular-nums">{row.status === "OPEN" ? "En curso" : money(row.expected_cash)}</TableCell><TableCell className="text-right tabular-nums">{money(row.counted_cash)}</TableCell><TableCell className={cn("text-right font-semibold tabular-nums", row.difference?.startsWith("-") ? "text-destructive" : "text-foreground")}>{signedMoney(row.difference)}</TableCell><TableCell className="pr-4"><Badge variant={row.status === "OPEN" ? "warning" : "secondary"}>{row.status === "OPEN" ? "Abierta" : "Cerrada"}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}</Card>
      {history.totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginación de cajas"><span className="text-muted-foreground">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link href={`/admin/cash-sessions?page=${history.page - 1}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ChevronLeft aria-hidden="true" />Anterior</Link> : null}{history.page < history.totalPages ? <Link href={`/admin/cash-sessions?page=${history.page + 1}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Siguiente<ChevronRight aria-hidden="true" /></Link> : null}</div></nav> : null}
    </div>
  );
}
