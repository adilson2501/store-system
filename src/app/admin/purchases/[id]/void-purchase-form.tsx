"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      <section className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-destructive">Corrección excepcional</h2>
        <p className="mt-1 text-sm text-destructive/90">Anula la compra únicamente si fue registrada por error.</p>
        <Button type="button" onClick={beginAttempt} variant="destructive" className="mt-4 min-h-12">
          Anular compra
        </Button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6" role="presentation">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="void-purchase-title" aria-describedby="void-purchase-description">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="void-purchase-title" className="text-lg font-bold">Anular compra</h2>
                <p id="void-purchase-description" className="mt-2 text-sm text-muted-foreground">Se revertirá el stock recibido por esta compra. La operación no se puede deshacer y la compra permanecerá registrada en el historial.</p>
              </div>
              <Button type="button" onClick={close} disabled={isPending} variant="ghost" size="icon" aria-label="Cerrar diálogo" className="text-2xl">×</Button>
            </div>

            {error ? <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}

            <label htmlFor="void-purchase-reason" className="mt-5 block text-sm font-semibold">Motivo de anulación</label>
            <textarea id="void-purchase-reason" value={reason} onChange={(event) => changeReason(event.target.value)} maxLength={500} rows={4} disabled={isPending} placeholder="Compra registrada por error" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
            <p className="mt-1 text-xs text-muted-foreground">Entre 3 y 500 caracteres.</p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" onClick={close} disabled={isPending} variant="outline" className="min-h-12">Cancelar</Button>
              <Button type="button" onClick={submit} disabled={isPending} variant="destructive" className="min-h-12">{isPending ? "Anulando…" : "Confirmar anulación"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
