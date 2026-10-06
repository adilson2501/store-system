"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createSupplier, updateSupplier, type SupplierFormState } from "@/features/suppliers/actions";

type SupplierFormValues = {
  name: string;
  ruc: string;
  phone: string;
  notes: string;
};

const emptyValues: SupplierFormValues = { name: "", ruc: "", phone: "", notes: "" };

export function SupplierForm({
  mode,
  supplierId,
  defaultValues,
}: {
  mode: "create" | "edit";
  supplierId?: string;
  defaultValues?: Partial<SupplierFormValues>;
}) {
  const initialValues = { ...emptyValues, ...defaultValues };
  const action = mode === "create" ? createSupplier : updateSupplier.bind(null, supplierId ?? "");
  const [state, formAction, pending] = useActionState<SupplierFormState, FormData>(action, { values: initialValues });
  const values = state.values ?? initialValues;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p> : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium text-zinc-700">Nombre *</label>
        <input id="name" name="name" type="text" required maxLength={200} autoComplete="organization" defaultValue={values.name} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.name ? <p className="text-sm text-red-600">{errors.name}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="ruc" className="block text-sm font-medium text-zinc-700">RUC <span className="font-normal text-zinc-400">(opcional)</span></label>
        <input id="ruc" name="ruc" type="text" inputMode="numeric" maxLength={11} autoComplete="off" defaultValue={values.ruc} placeholder="11 dígitos" onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 11); }} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.ruc ? <p className="text-sm text-red-600">{errors.ruc}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">Teléfono <span className="font-normal text-zinc-400">(opcional)</span></label>
        <input id="phone" name="phone" type="tel" inputMode="numeric" maxLength={9} autoComplete="tel" defaultValue={values.phone} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 9); }} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.phone ? <p className="text-sm text-red-600">{errors.phone}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="block text-sm font-medium text-zinc-700">Notas <span className="font-normal text-zinc-400">(opcional)</span></label>
        <textarea id="notes" name="notes" maxLength={1000} rows={4} defaultValue={values.notes} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.notes ? <p className="text-sm text-red-600">{errors.notes}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">{pending ? "Guardando…" : mode === "create" ? "Crear proveedor" : "Guardar cambios"}</button>
        <Link href={mode === "edit" ? `/admin/suppliers/${supplierId}` : "/admin/suppliers"} className="inline-flex min-h-11 items-center rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancelar</Link>
      </div>
    </form>
  );
}
