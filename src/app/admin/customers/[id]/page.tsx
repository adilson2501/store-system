import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { CustomerForm } from "@/app/admin/customers/customer-form";
import { CustomerPaymentForm } from "@/app/admin/customers/payment-form";
import { getCustomer } from "@/features/customers/queries";
import { formatCustomerMoney, parseSignedCents } from "@/features/customers/validation";
import { customerLedgerMovementLabel } from "@/features/customers/ledger-labels";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const result = await getCustomer(id);
  if (!result) notFound();
  const { customer, ledger } = result;
  const debt = parseSignedCents(customer.current_debt);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Link href="/admin/customers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ml-3")}><ArrowLeft aria-hidden="true" />Volver a clientes</Link>
      <header>
        <p className="text-sm font-medium text-primary">Administración / Clientes</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Consulta la información, crédito y movimientos del cliente.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del cliente</CardTitle><CardDescription>Información editable del cliente.</CardDescription></CardHeader>
          <CardContent><CustomerForm mode="edit" customerId={customer.id} defaultValues={{ name: customer.name, phone: customer.phone ?? "", notes: customer.notes ?? "", credit_limit: customer.credit_limit, credit_enabled: customer.credit_enabled, active: customer.active }} /></CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard aria-hidden="true" className="size-4 text-primary" />Resumen de crédito</CardTitle><CardDescription>Valores calculados desde el historial de crédito.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deuda actual</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatCustomerMoney(debt)}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Límite de crédito</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatCustomerMoney(parseSignedCents(customer.credit_limit))}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Crédito disponible</p><p className={cn("mt-1 text-xl font-semibold tabular-nums", parseSignedCents(customer.available_credit) < BigInt(0) ? "text-destructive" : "text-foreground")}>{formatCustomerMoney(parseSignedCents(customer.available_credit))}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Registrar pago</CardTitle><CardDescription>Los pagos no crean ventas ni movimientos de inventario.</CardDescription></CardHeader>
            <CardContent><CustomerPaymentForm customerId={customer.id} currentDebt={customer.current_debt} initialClientKey={crypto.randomUUID()} /></CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border"><CardTitle className="text-base">Historial de crédito</CardTitle><CardDescription>Historial append-only. No se puede editar ni eliminar.</CardDescription></CardHeader>
        {ledger.length === 0 ? <CardContent className="py-10 text-center"><Badge variant="secondary">Sin movimientos de crédito</Badge><p className="mt-3 text-sm text-muted-foreground">Los créditos y pagos aparecerán aquí.</p></CardContent> : (
          <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-6">Fecha</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Medio</TableHead><TableHead className="pr-6">Nota</TableHead></TableRow></TableHeader><TableBody>{ledger.map((entry) => { const amount = parseSignedCents(entry.amount); return <TableRow key={entry.id}><TableCell className="whitespace-nowrap pl-6 text-muted-foreground">{new Date(entry.created_at).toLocaleString("es-PE")}</TableCell><TableCell className="font-medium">{customerLedgerMovementLabel(entry.movement_type)}</TableCell><TableCell className={cn("text-right font-semibold tabular-nums", amount < BigInt(0) ? "text-success" : "text-foreground")}>{amount > BigInt(0) ? "+" : ""}{formatCustomerMoney(amount)}</TableCell><TableCell className="text-muted-foreground">{entry.payment_method === "CASH" ? "Efectivo" : entry.payment_method === "YAPE" ? "Yape" : "—"}</TableCell><TableCell className="pr-6 text-muted-foreground">{entry.note ?? "—"}</TableCell></TableRow>; })}</TableBody></Table></div>
        )}
      </Card>
    </div>
  );
}
