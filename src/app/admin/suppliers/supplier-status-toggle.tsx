"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
      <button type="button" onClick={() => { setError(""); setOpen(true); }} className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
        {active ? "Desactivar" : "Activar"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`supplier-status-title-${supplierId}`} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 id={`supplier-status-title-${supplierId}`} className="text-base font-semibold">{active ? "Desactivar proveedor" : "Activar proveedor"}</h2>
            <p className="mt-2 text-sm text-zinc-600">{active ? "El proveedor seguirá visible en el historial, pero no podrá seleccionarse para nuevas compras." : "El proveedor volverá a estar disponible para nuevas compras."}</p>
            {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-11 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={pending} onClick={submit} className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">{pending ? "Guardando…" : active ? "Desactivar" : "Activar"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
