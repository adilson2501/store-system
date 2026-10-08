"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
    <form action={formAction} className="space-y-6">
      {state.error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{state.error}</p> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" type="text" required maxLength={200} defaultValue={values.name} />
        {errors.name ? <p className="text-sm text-destructive" role="alert">{errors.name}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Input
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
        />
        {errors.phone ? <p className="text-sm text-destructive" role="alert">{errors.phone}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas <span className="font-normal text-muted-foreground">(solo administración)</span></Label>
        <textarea id="notes" name="notes" maxLength={1000} defaultValue={values.notes} rows={3} className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        {errors.notes ? <p className="text-sm text-destructive" role="alert">{errors.notes}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="credit_limit">Límite de crédito (S/.)</Label>
        <Input id="credit_limit" name="credit_limit" type="text" inputMode="decimal" required defaultValue={values.credit_limit} placeholder="0.00" />
        {errors.credit_limit ? <p className="text-sm text-destructive" role="alert">{errors.credit_limit}</p> : null}
      </div>

      <div className="space-y-3 text-sm text-foreground">
        <Label className="flex items-center gap-2"><input type="checkbox" name="credit_enabled" defaultChecked={values.credit_enabled} className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /> Crédito habilitado</Label>
        <Label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={values.active} className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /> Cliente activo</Label>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : mode === "create" ? "Crear cliente" : "Guardar cambios"}</Button>
        <Link href="/admin/customers" className={cn(buttonVariants({ variant: "outline" }))}>Cancelar</Link>
      </div>
    </form>
  );
}
