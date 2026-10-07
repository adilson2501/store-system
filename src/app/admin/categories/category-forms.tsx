"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createCategory,
  updateCategory,
} from "@/features/catalog/categories/actions";
import type { Category } from "@/features/catalog/categories/types";

export function CategoryCreateForm() {
  const [state, formAction, pending] = useActionState(createCategory, {});

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="category-name">Nombre</Label>
        <Input
          id="category-name"
          name="name"
          type="text"
          required
          placeholder="Ej.: Bebidas"
        />
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="sm:shrink-0">
        {pending ? "Agregando…" : "Agregar categoría"}
      </Button>
    </form>
  );
}

export function CategoryRow({ category }: { category: Category }) {
  const [state, formAction, pending] = useActionState(updateCategory, {});

  return (
    <form
      action={formAction}
      className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
    >
      <input type="hidden" name="id" value={category.id} />
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`category-${category.id}`}>Nombre</Label>
        <Input
          id={`category-${category.id}`}
          name="name"
          type="text"
          required
          defaultValue={category.name}
        />
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        ) : null}
      </div>
      <Label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={category.is_active}
          className={cn("size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        />
        Activo
      </Label>
      <Button type="submit" disabled={pending} variant="outline" className="sm:shrink-0">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
