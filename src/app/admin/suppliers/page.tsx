import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listSuppliers } from "@/features/suppliers/queries";
import { SupplierStatusToggle } from "@/app/admin/suppliers/supplier-status-toggle";

function queryString(values: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const history = await listSuppliers(Number.isNaN(parsedPage) ? 1 : parsedPage, params.q ?? "");
  const baseQuery = { q: history.search };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Inventario</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Proveedores</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Administra proveedores activos e históricos para tus compras.</p>
          <p className="mt-2 text-sm text-muted-foreground">{history.total} proveedores registrados</p>
        </div>
        <Link href="/admin/suppliers/new" className={cn(buttonVariants(), "sm:mt-6")}>
          <Plus aria-hidden="true" />
          Nuevo proveedor
        </Link>
      </header>

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck aria-hidden="true" className="size-4 text-primary" />
            Directorio de proveedores
          </CardTitle>
          <CardDescription>Busca por nombre, RUC o teléfono.</CardDescription>
          <form method="get" className="flex w-full max-w-2xl flex-col gap-2 pt-2 sm:flex-row">
            <label htmlFor="supplier-search" className="sr-only">Buscar proveedores</label>
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="supplier-search" type="search" name="q" defaultValue={history.search} placeholder="Buscar por nombre, RUC o teléfono" className="pl-9" />
            </div>
            <Button type="submit" variant="secondary" className="sm:w-auto">Buscar</Button>
            {history.search ? <Link href="/admin/suppliers" className={cn(buttonVariants({ variant: "ghost" }), "sm:w-auto")}>Limpiar</Link> : null}
          </form>
        </CardHeader>
        {history.rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-semibold text-foreground">{history.search ? "No encontramos proveedores" : "Aún no hay proveedores"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{history.search ? "Prueba con otro nombre, RUC o teléfono." : "Registra el primer proveedor para comenzar tus compras."}</p>
            {!history.search ? <Link href="/admin/suppliers/new" className={cn(buttonVariants(), "mt-5")}><Plus aria-hidden="true" />Nuevo proveedor</Link> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[22%] pl-4">Nombre</TableHead>
                  <TableHead className="w-[14%]">RUC</TableHead>
                  <TableHead className="w-[14%]">Teléfono</TableHead>
                  <TableHead className="w-[25%]">Notas</TableHead>
                  <TableHead className="w-[12%]">Estado</TableHead>
                  <TableHead className="w-[13%] pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.rows.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="pl-4"><Link href={`/admin/suppliers/${supplier.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{supplier.name}</Link></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{supplier.ruc ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{supplier.phone ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{supplier.notes ?? "—"}</TableCell>
                    <TableCell><Badge variant={supplier.active ? "success" : "secondary"}>{supplier.active ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="pr-4"><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/suppliers/${supplier.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Editar</Link><SupplierStatusToggle supplierId={supplier.id} active={supplier.active} /></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {history.totalPages > 1 ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Paginación de proveedores">
          <span className="text-muted-foreground">Página {history.page} de {history.totalPages}</span>
          <div className="flex gap-2">
            {history.page > 1 ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/suppliers?${queryString({ ...baseQuery, page: String(history.page - 1) })}`}><ChevronLeft aria-hidden="true" />Anterior</Link> : null}
            {history.page < history.totalPages ? <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/admin/suppliers?${queryString({ ...baseQuery, page: String(history.page + 1) })}`}>Siguiente<ChevronRight aria-hidden="true" /></Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
