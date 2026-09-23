"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createProduct,
  updateProduct,
  type ProductFormState,
} from "@/features/catalog/products/actions";
import type { Category } from "@/features/catalog/categories/types";
import type { ProductFormValues, UnitType } from "@/features/catalog/products/types";

type Props = {
  mode: "create" | "edit";
  categories: Category[];
  productId?: string;
  defaultValues?: Partial<ProductFormValues>;
};

const emptyValues: ProductFormValues = {
  name: "",
  barcode: "",
  category_id: "",
  unit_type: "UNIT",
  purchase_cost: "",
  selling_price: "",
  initial_stock: "0",
  is_active: true,
};

export function ProductForm({ mode, categories, productId, defaultValues }: Props) {
  const initialValues: ProductFormValues = {
    ...emptyValues,
    ...defaultValues,
  };

  const [unitType, setUnitType] = useState<UnitType>(
    initialValues.unit_type ?? "UNIT",
  );

  const action =
    mode === "create"
      ? createProduct
      : updateProduct.bind(null, productId ?? "");

  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    { values: initialValues },
  );

  const values = state.values ?? initialValues;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium text-zinc-700">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={values.name}
          placeholder="Ej.: Coca-Cola 500 ml"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {errors.name ? (
          <p className="text-sm text-red-600">{errors.name}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="barcode" className="block text-sm font-medium text-zinc-700">
          Código de barras <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <input
          id="barcode"
          name="barcode"
          type="text"
          autoComplete="off"
          defaultValue={values.barcode}
          placeholder="Escanea o escribe"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {errors.barcode ? (
          <p className="text-sm text-red-600">{errors.barcode}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="category_id"
          className="block text-sm font-medium text-zinc-700"
        >
          Categoría <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={values.category_id}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        >
          <option value="">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.category_id ? (
          <p className="text-sm text-red-600">{errors.category_id}</p>
        ) : null}
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-zinc-700">Tipo de unidad</legend>
        <div className="flex gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="unit_type"
              value="UNIT"
              checked={unitType === "UNIT"}
              onChange={() => setUnitType("UNIT")}
              className="h-4 w-4 border-zinc-300"
            />
            UNIT (por unidad)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="unit_type"
              value="WEIGHT"
              checked={unitType === "WEIGHT"}
              onChange={() => setUnitType("WEIGHT")}
              className="h-4 w-4 border-zinc-300"
            />
            WEIGHT (kilo)
          </label>
        </div>
        {errors.unit_type ? (
          <p className="text-sm text-red-600">{errors.unit_type}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="purchase_cost"
            className="block text-sm font-medium text-zinc-700"
          >
            Costo de compra (S/.)
          </label>
          <input
            id="purchase_cost"
            name="purchase_cost"
            type="text"
            inputMode="decimal"
            required
            defaultValue={values.purchase_cost}
            placeholder="0.00"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          {errors.purchase_cost ? (
            <p className="text-sm text-red-600">{errors.purchase_cost}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="selling_price"
            className="block text-sm font-medium text-zinc-700"
          >
            Precio de venta (S/.)
          </label>
          <input
            id="selling_price"
            name="selling_price"
            type="text"
            inputMode="decimal"
            required
            defaultValue={values.selling_price}
            placeholder="0.00"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          {errors.selling_price ? (
            <p className="text-sm text-red-600">{errors.selling_price}</p>
          ) : null}
        </div>
      </div>

      {mode === "create" ? (
        <div className="space-y-1">
          <label
            htmlFor="initial_stock"
            className="block text-sm font-medium text-zinc-700"
          >
            Stock inicial{" "}
            <span className="font-normal text-zinc-400">
              ({unitType === "WEIGHT" ? "kg" : "unidades"})
            </span>
          </label>
          <input
            id="initial_stock"
            name="initial_stock"
            type="text"
            inputMode="decimal"
            required
            defaultValue={values.initial_stock}
            placeholder={unitType === "WEIGHT" ? "0.000" : "0"}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          <p className="text-xs text-zinc-500">
            Se registra como un movimiento de entrada de inventario. Usa 0 si aún no hay stock.
          </p>
          {errors.initial_stock ? (
            <p className="text-sm text-red-600">{errors.initial_stock}</p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={values.is_active}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Activo
        </label>
      ) : null}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending
            ? "Guardando…"
            : mode === "create"
              ? "Crear producto"
              : "Guardar cambios"}
        </button>
        <Link
          href="/admin/products"
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
