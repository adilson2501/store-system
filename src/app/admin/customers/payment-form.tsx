"use client";

import { useActionState } from "react";
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
      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
      {state.success ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{state.success}</p> : null}
      <input type="hidden" name="client_key" value={values.client_key} />

      <div className="space-y-1">
        <label htmlFor="payment-amount" className="block text-sm font-medium text-zinc-700">Monto pagado (S/.)</label>
        <input id="payment-amount" name="amount" type="text" inputMode="decimal" required={!noDebt} disabled={noDebt || pending} defaultValue={values.amount} placeholder="0.00" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-100" />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-700">Medio de pago</legend>
        <div className="flex gap-5 text-sm text-zinc-800">
          <label className="flex items-center gap-2"><input type="radio" name="payment_method" value="CASH" defaultChecked={values.payment_method === "CASH"} disabled={noDebt || pending} /> EFECTIVO</label>
          <label className="flex items-center gap-2"><input type="radio" name="payment_method" value="YAPE" defaultChecked={values.payment_method === "YAPE"} disabled={noDebt || pending} /> YAPE</label>
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="payment-note" className="block text-sm font-medium text-zinc-700">Nota <span className="font-normal text-zinc-400">(opcional)</span></label>
        <textarea id="payment-note" name="note" maxLength={1000} rows={2} defaultValue={values.note} disabled={noDebt || pending} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-100" />
      </div>

      {noDebt ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">No hay deuda pendiente para registrar un pago.</p> : null}
      <button type="submit" disabled={noDebt || pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300">{pending ? "Registrando…" : "Registrar pago"}</button>
    </form>
  );
}
