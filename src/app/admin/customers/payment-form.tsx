"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerCustomerPayment, type PaymentFormState } from "@/features/customers/actions";
import { parseSignedCents } from "@/features/customers/validation";

export function CustomerPaymentForm({ customerId, currentDebt, initialClientKey }: { customerId: string; currentDebt: string; initialClientKey: string }) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    registerCustomerPayment.bind(null, customerId),
    { values: { amount: "", payment_method: "CASH", note: "", client_key: initialClientKey } },
  );

  const debtCents = parseSignedCents(currentDebt);
  const noDebt = debtCents === BigInt(0);
  const values = state.values ?? { amount: "", payment_method: "CASH" as const, note: "", client_key: initialClientKey };

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert"><p>{state.error}</p>{state.error.includes("Debes abrir caja") ? <Link href="/cash" className="mt-2 inline-block font-semibold underline">Abrir caja</Link> : null}</div> : null}
      {state.success ? <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">{state.success}</p> : null}
      <input type="hidden" name="client_key" value={values.client_key} />

      <div className="space-y-2">
        <Label htmlFor="payment-amount">Monto pagado (S/.)</Label>
        <Input id="payment-amount" name="amount" type="text" inputMode="decimal" required={!noDebt} disabled={noDebt || pending} defaultValue={values.amount} placeholder="0.00" />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Medio de pago</legend>
        <div className="flex flex-wrap gap-5 text-sm text-foreground">
          <label className="flex items-center gap-2"><input type="radio" name="payment_method" value="CASH" defaultChecked={values.payment_method === "CASH"} disabled={noDebt || pending} className="accent-primary" /> EFECTIVO</label>
          <label className="flex items-center gap-2"><input type="radio" name="payment_method" value="YAPE" defaultChecked={values.payment_method === "YAPE"} disabled={noDebt || pending} className="accent-primary" /> YAPE</label>
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="payment-note">Nota <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <textarea id="payment-note" name="note" maxLength={1000} rows={2} defaultValue={values.note} disabled={noDebt || pending} className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
      </div>

      {noDebt ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">No hay deuda pendiente para registrar un pago.</p> : null}
      <Button type="submit" disabled={noDebt || pending}>{pending ? "Registrando…" : "Registrar pago"}</Button>
    </form>
  );
}
