import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, PackagePlus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listPurchaseSuppliers, listPurchases } from "@/features/purchases/queries";
import type { PurchaseStatus } from "@/features/purchases/history-types";
import { formatCents, parseCents } from "@/features/pos/money";

const statusLabels: Record<PurchaseStatus, string> = { CONFIRMED: "Confirmada", VOIDED: "Anulada" };

function money(value: string): string {
  const cents = parseCents(value);
  return cents === null ? "—" : `S/ ${formatCents(cents)}`;
}

function purchaseDate(value: string): string {
  return new Date(`${value}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

function queryString(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const [history, suppliers] = await Promise.all([
    listPurchases(Number.isNaN(page) ? 1 : page, {
      from: params.from,
      to: params.to,
      supplierId: params.supplier,
      search: params.search,
    }),
    listPurchaseSuppliers(),
  ]);
  const filterValues = {
    from: history.filters.from,
    to: history.filters.to,
    supplier: history.filters.supplierId,
    search: history.filters.search,
  };
  const hasFilters = Object.values(filterValues).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-primary">Inventario</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Historial de compras</h1><p className="mt-2 text-sm text-muted-foreground">Consulta administrativa de compras registradas.</p><p className="mt-2 text-sm text-muted-foreground">{history.total} registros históricos</p></div><Link href="/admin/purchases/new" className={cn(buttonVariants(), "sm:mt-6")}><PackagePlus aria-hidden="true" />Nueva compra</Link></header>
      <Card><CardHeader className="border-b border-border pb-4"><CardTitle className="flex items-center gap-2 text-base"><Filter aria-hidden="true" className="size-4 text-primary" />Filtros de compras</CardTitle><CardDescription>Filtra por fecha, proveedor o referencia.</CardDescription><form className="flex flex-wrap items-end gap-3 pt-2" method="get"><label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Fecha desde</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="date" name="from" defaultValue={history.filters.from} /></label><label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Fecha hasta</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="date" name="to" defaultValue={history.filters.to} /></label><label className="grid min-w-56 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Proveedor</span><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" name="supplier" defaultValue={history.filters.supplierId}><option value="">Todos</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.active ? "" : " (inactivo)"}</option>)}</select></label><label className="grid min-w-56 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Referencia</span><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" type="search" name="search" placeholder="Buscar referencia" defaultValue={history.filters.search} /></div></label><Button type="submit">Filtrar</Button><Link className={cn(buttonVariants({ variant: "ghost" }))} href="/admin/purchases">Limpiar</Link></form></CardHeader>
        {history.rows.length === 0 ? <div className="px-6 py-12 text-center"><p className="text-base font-semibold text-foreground">{hasFilters ? "No se encontraron compras" : "Aún no hay compras registradas"}</p><p className="mt-2 text-sm text-muted-foreground">{hasFilters ? "Prueba con otros filtros." : "Registra la primera compra para comenzar."}</p>{!hasFilters ? <Link href="/admin/purchases/new" className={cn(buttonVariants(), "mt-5")}>Registrar primera compra</Link> : null}</div> : <div className="overflow-x-auto"><Table className="min-w-[1100px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Referencia</TableHead><TableHead>Productos</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Registrado por</TableHead><TableHead>Estado</TableHead><TableHead className="pr-4">Acción</TableHead></TableRow></TableHeader><TableBody>{history.rows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap pl-4">{purchaseDate(row.purchase_date)}</TableCell><TableCell className="font-medium">{row.supplier_name}</TableCell><TableCell className="max-w-48 truncate text-muted-foreground">{row.reference ?? "—"}</TableCell><TableCell>{row.item_count} {row.item_count === 1 ? "línea" : "líneas"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.total)}</TableCell><TableCell className="text-muted-foreground">{row.creator_name}</TableCell><TableCell><Badge variant={row.status === "VOIDED" ? "destructive" : "success"}>{statusLabels[row.status]}</Badge></TableCell><TableCell className="pr-4"><Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/purchases/${row.id}`}>Ver detalle</Link></TableCell></TableRow>)}</TableBody></Table></div>}
      </Card>
      {history.totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginación de compras"><span className="text-muted-foreground">Página {history.page} de {history.totalPages}</span><div className="flex gap-2">{history.page > 1 ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/purchases?${queryString({ ...filterValues, page: String(history.page - 1) })}`}><ChevronLeft aria-hidden="true" />Anterior</Link> : null}{history.page < history.totalPages ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/purchases?${queryString({ ...filterValues, page: String(history.page + 1) })}`}>Siguiente<ChevronRight aria-hidden="true" /></Link> : null}</div></nav> : null}
    </div>
  );
}
