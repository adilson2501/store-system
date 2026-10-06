"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCustomer, updateCustomer, type CustomerFormState } from "@/features/customers/actions";

type CustomerFormValues = {
  name: string;
  phone: string;
  notes: string;
  credit_limit: string;
  credit_enabled: boolean;
  active: boolean;
};

const emptyValues: CustomerFormValues = {
  name: "",
  phone: "",
  notes: "",
  credit_limit: "0.00",
  credit_enabled: true,
  active: true,
};

export function CustomerForm({
  mode,
  customerId,
  defaultValues,
}: {
  mode: "create" | "edit";
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues>;
}) {
  const initialValues = { ...emptyValues, ...defaultValues };
  const action = mode === "create" ? createCustomer : updateCustomer.bind(null, customerId ?? "");
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(action, { values: initialValues });
  const values = state.values ?? initialValues;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p> : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium text-zinc-700">Nombre</label>
        <input id="name" name="name" type="text" required maxLength={200} defaultValue={values.name} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.name ? <p className="text-sm text-red-600">{errors.name}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">Teléfono <span className="font-normal text-zinc-400">(opcional)</span></label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          maxLength={9}
          autoComplete="tel-national"
          defaultValue={values.phone}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 9);
            if (event.target.value !== digits) event.target.value = digits;
          }}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {errors.phone ? <p className="text-sm text-red-600">{errors.phone}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="block text-sm font-medium text-zinc-700">Notas <span className="font-normal text-zinc-400">(solo administración)</span></label>
        <textarea id="notes" name="notes" maxLength={1000} defaultValue={values.notes} rows={3} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.notes ? <p className="text-sm text-red-600">{errors.notes}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="credit_limit" className="block text-sm font-medium text-zinc-700">Límite de crédito (S/.)</label>
        <input id="credit_limit" name="credit_limit" type="text" inputMode="decimal" required defaultValue={values.credit_limit} placeholder="0.00" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500" />
        {errors.credit_limit ? <p className="text-sm text-red-600">{errors.credit_limit}</p> : null}
      </div>

      <div className="space-y-3 text-sm text-zinc-800">
        <label className="flex items-center gap-2"><input type="checkbox" name="credit_enabled" defaultChecked={values.credit_enabled} className="h-4 w-4 rounded border-zinc-300" /> Crédito habilitado</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={values.active} className="h-4 w-4 rounded border-zinc-300" /> Cliente activo</label>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">{pending ? "Guardando…" : mode === "create" ? "Crear cliente" : "Guardar cambios"}</button>
        <Link href="/admin/customers" className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancelar</Link>
      </div>
    </form>
  );
}
