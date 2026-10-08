"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
    <form action={formAction} className="space-y-6">
      {state.error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{state.error}</p> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre <span className="font-normal text-muted-foreground">*</span></Label>
        <Input id="name" name="name" type="text" required maxLength={200} autoComplete="organization" defaultValue={values.name} />
        {errors.name ? <p className="text-sm text-destructive" role="alert">{errors.name}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ruc">RUC <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Input id="ruc" name="ruc" type="text" inputMode="numeric" maxLength={11} autoComplete="off" defaultValue={values.ruc} placeholder="11 dígitos" onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 11); }} />
        {errors.ruc ? <p className="text-sm text-destructive" role="alert">{errors.ruc}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Input id="phone" name="phone" type="tel" inputMode="numeric" maxLength={9} autoComplete="tel" defaultValue={values.phone} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 9); }} />
        {errors.phone ? <p className="text-sm text-destructive" role="alert">{errors.phone}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <textarea id="notes" name="notes" maxLength={1000} rows={4} defaultValue={values.notes} className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        {errors.notes ? <p className="text-sm text-destructive" role="alert">{errors.notes}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : mode === "create" ? "Crear proveedor" : "Guardar cambios"}</Button>
        <Link href={mode === "edit" ? `/admin/suppliers/${supplierId}` : "/admin/suppliers"} className={cn(buttonVariants({ variant: "outline" }))}>Cancelar</Link>
      </div>
    </form>
  );
}
