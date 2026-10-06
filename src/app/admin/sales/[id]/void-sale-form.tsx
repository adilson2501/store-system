"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSale } from "@/features/sales-history/actions";
import type { SalePaymentMethod } from "@/features/sales-history/types";
import { validateVoidReason } from "@/features/sales-history/validation";

function newClientKey() {
  return crypto.randomUUID();
}

export function VoidSaleForm({ saleId, paymentMethod, initialClientKey }: { saleId: string; paymentMethod: SalePaymentMethod; initialClientKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [clientKey, setClientKey] = useState(initialClientKey);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setOpen(false);
    setError("");
  }

  function beginAttempt() {
    setClientKey(newClientKey());
    setReason("");
    setError("");
    setOpen(true);
  }

  function submit() {
    const checked = validateVoidReason(reason);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await voidSale({ saleId, reason: checked.value, clientKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setReason("");
      setError("");
      setClientKey(newClientKey());
      router.refresh();
    });
  }

  return (
    <>
      <section className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-red-950">Corrección excepcional</h2>
        <p className="mt-1 text-sm text-red-800">Anula la venta únicamente si fue registrada por error.</p>
        <button type="button" onClick={beginAttempt} className="mt-4 min-h-12 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
          Anular venta
        </button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6" role="presentation">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="void-sale-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="void-sale-title" className="text-lg font-bold text-zinc-950">Anular venta</h2>
                <p className="mt-2 text-sm text-zinc-700">Esta acción anulará la venta y restaurará el inventario. No se puede deshacer.</p>
              </div>
              <button type="button" onClick={close} disabled={isPending} aria-label="Cerrar diálogo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-2xl text-zinc-500 hover:bg-zinc-100 disabled:opacity-50">×</button>
            </div>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              {paymentMethod === "CASH" ? "Debes devolver físicamente el dinero al cliente antes de confirmar la anulación." : null}
              {paymentMethod === "YAPE" ? "Cualquier devolución por Yape debe realizarse externamente." : null}
              {paymentMethod === "CREDIT" ? "También se revertirá el efecto de esta venta sobre la deuda del cliente, si su saldo actual lo permite." : null}
            </div>

            {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

            <label htmlFor="void-reason" className="mt-5 block text-sm font-semibold text-zinc-700">Motivo de anulación</label>
            <textarea id="void-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} disabled={isPending} placeholder="Producto registrado por error" className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-100" />
            <p className="mt-1 text-xs text-zinc-500">Entre 3 y 500 caracteres.</p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} disabled={isPending} className="min-h-12 rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={submit} disabled={isPending} className="min-h-12 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-zinc-400">{isPending ? "Anulando…" : "Confirmar anulación"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
