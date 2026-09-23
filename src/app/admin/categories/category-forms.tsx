"use client";

import { useActionState } from "react";
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
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="min-w-56 flex-1 space-y-1">
        <label
          htmlFor="category-name"
          className="block text-sm font-medium text-zinc-700"
        >
          Nueva categoría
        </label>
        <input
          id="category-name"
          name="name"
          type="text"
          required
          placeholder="Ej.: Bebidas"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Agregando…" : "Agregar categoría"}
      </button>
    </form>
  );
}

export function CategoryRow({ category }: { category: Category }) {
  const [state, formAction, pending] = useActionState(updateCategory, {});

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0"
    >
      <input type="hidden" name="id" value={category.id} />
      <div className="min-w-56 flex-1 space-y-1">
        <label
          htmlFor={`category-${category.id}`}
          className="block text-xs font-medium text-zinc-500"
        >
          Nombre
        </label>
        <input
          id={`category-${category.id}`}
          name="name"
          type="text"
          required
          defaultValue={category.name}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}
      </div>
      <label className="flex h-10 items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={category.is_active}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Activo
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
