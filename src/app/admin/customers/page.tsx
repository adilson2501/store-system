import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listCustomers } from "@/features/customers/queries";
import { formatCustomerMoney, parseSignedCents } from "@/features/customers/validation";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const customers = await listCustomers(q);
  const hasSearch = Boolean(q);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Administración</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Clientes</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Administra clientes, límites de crédito y saldos fiados.</p>
          <p className="mt-2 text-sm text-muted-foreground">{customers.length} {customers.length === 1 ? "cliente" : "clientes"} registrados</p>
        </div>
        <Link href="/admin/customers/new" className={cn(buttonVariants(), "sm:mt-6")}>
          <Plus aria-hidden="true" />
          Nuevo cliente
        </Link>
      </header>

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><Users aria-hidden="true" className="size-4 text-primary" />Directorio de clientes</CardTitle>
          <CardDescription>Busca por nombre o teléfono.</CardDescription>
          <form method="get" className="flex w-full max-w-2xl flex-col gap-2 pt-2 sm:flex-row">
            <label htmlFor="customer-search" className="sr-only">Buscar clientes</label>
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="customer-search" type="search" name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" className="pl-9" />
            </div>
            <Button type="submit" variant="secondary" className="sm:w-auto">Buscar</Button>
            {hasSearch ? <Link href="/admin/customers" className={cn(buttonVariants({ variant: "ghost" }), "sm:w-auto")}>Limpiar</Link> : null}
          </form>
        </CardHeader>
        {customers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-semibold text-foreground">{hasSearch ? "No encontramos clientes" : "Aún no hay clientes"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{hasSearch ? "Prueba con otro nombre o teléfono." : "Registra el primer cliente para comenzar a gestionar crédito."}</p>
            {!hasSearch ? <Link href="/admin/customers/new" className={cn(buttonVariants(), "mt-5")}><Plus aria-hidden="true" />Nuevo cliente</Link> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[20%] pl-4">Nombre</TableHead>
                  <TableHead className="w-[13%]">Teléfono</TableHead>
                  <TableHead className="w-[14%] text-right">Deuda actual</TableHead>
                  <TableHead className="w-[14%] text-right">Límite</TableHead>
                  <TableHead className="w-[14%] text-right">Disponible</TableHead>
                  <TableHead className="w-[12%]">Estado</TableHead>
                  <TableHead className="w-[13%] pr-4">Crédito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => {
                  const debt = parseSignedCents(customer.current_debt);
                  const available = parseSignedCents(customer.available_credit);
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="pl-4"><Link href={`/admin/customers/${customer.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{customer.name}</Link></TableCell>
                      <TableCell className="text-muted-foreground">{customer.phone ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-foreground">{formatCustomerMoney(debt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCustomerMoney(parseSignedCents(customer.credit_limit))}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", available < BigInt(0) ? "text-destructive" : "text-foreground")}>{formatCustomerMoney(available)}</TableCell>
                      <TableCell><Badge variant={customer.active ? "success" : "secondary"}>{customer.active ? "Activo" : "Inactivo"}</Badge></TableCell>
                      <TableCell className="pr-4"><Badge variant={customer.credit_enabled ? "info" : "secondary"}>{customer.credit_enabled ? "Habilitado" : "Deshabilitado"}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
