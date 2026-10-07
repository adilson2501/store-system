"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setSupplierActive } from "@/features/suppliers/actions";

export function SupplierStatusToggle({ supplierId, active }: { supplierId: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await setSupplierActive(supplierId, !active);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(""); setOpen(true); }}>
        {active ? "Desactivar" : "Activar"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`supplier-status-title-${supplierId}`} className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg">
            <h2 id={`supplier-status-title-${supplierId}`} className="text-base font-semibold">{active ? "Desactivar proveedor" : "Activar proveedor"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{active ? "El proveedor seguirá visible en el historial, pero no podrá seleccionarse para nuevas compras." : "El proveedor volverá a estar disponible para nuevas compras."}</p>
            {error ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <Button type="button" disabled={pending} onClick={() => setOpen(false)} variant="outline">Cancelar</Button>
              <Button type="button" disabled={pending} onClick={submit} variant={active ? "destructive" : "default"}>{pending ? "Guardando…" : active ? "Desactivar" : "Activar"}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
