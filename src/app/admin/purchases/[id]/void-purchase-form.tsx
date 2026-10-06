"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidPurchase } from "@/features/purchases/actions";
import { validateVoidReason } from "@/features/sales-history/validation";

function newClientKey() {
  return crypto.randomUUID();
}

export function VoidPurchaseForm({ purchaseId, initialClientKey }: { purchaseId: string; initialClientKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [clientKey, setClientKey] = useState(initialClientKey);
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setOpen(false);
    setError("");
  }

  function beginAttempt() {
    setClientKey(newClientKey());
    setSubmittedReason(null);
    setReason("");
    setError("");
    setOpen(true);
  }

  function changeReason(value: string) {
    setReason(value);
    if (submittedReason !== null && value.trim() !== submittedReason) {
      setClientKey(newClientKey());
      setSubmittedReason(null);
    }
  }

  function submit() {
    const checked = validateVoidReason(reason);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setError("");
    setSubmittedReason(checked.value);
    startTransition(async () => {
      const result = await voidPurchase({ purchaseId, reason: checked.value, clientKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setReason("");
      setError("");
      router.refresh();
    });
  }

  return (
    <>
      <section className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-red-950">Corrección excepcional</h2>
        <p className="mt-1 text-sm text-red-800">Anula la compra únicamente si fue registrada por error.</p>
        <button type="button" onClick={beginAttempt} className="mt-4 min-h-12 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
          Anular compra
        </button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6" role="presentation">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="void-purchase-title" aria-describedby="void-purchase-description">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="void-purchase-title" className="text-lg font-bold text-zinc-950">Anular compra</h2>
                <p id="void-purchase-description" className="mt-2 text-sm text-zinc-700">Se revertirá el stock recibido por esta compra. La operación no se puede deshacer y la compra permanecerá registrada en el historial.</p>
              </div>
              <button type="button" onClick={close} disabled={isPending} aria-label="Cerrar diálogo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-2xl text-zinc-500 hover:bg-zinc-100 disabled:opacity-50">×</button>
            </div>

            {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

            <label htmlFor="void-purchase-reason" className="mt-5 block text-sm font-semibold text-zinc-700">Motivo de anulación</label>
            <textarea id="void-purchase-reason" value={reason} onChange={(event) => changeReason(event.target.value)} maxLength={500} rows={4} disabled={isPending} placeholder="Compra registrada por error" className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-100" />
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
