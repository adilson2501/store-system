"use client";

import { useActionState, useState } from "react";
import {
  adjustProductStock,
  type StockAdjustFormState,
} from "@/features/catalog/products/actions";
import type { UnitType } from "@/features/catalog/products/types";
import { formatQuantity } from "@/features/catalog/products/validation";

const initialState: StockAdjustFormState = {};

function parseThousandths(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d{1,10}(\.\d{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

function formatThousandths(value: bigint, unitType: UnitType): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  const whole = absolute / BigInt(1000);
  const fraction = absolute % BigInt(1000);

  if (unitType === "UNIT") {
    return `${sign}${whole.toString()}`;
  }
  const fractionText = fraction.toString().padStart(3, "0");
  return `${sign}${whole.toString()}.${fractionText}`;
}

type Props = {
  productId: string;
  unitType: UnitType;
  currentStock: string;
};

export function StockAdjustPanel({
  productId,
  unitType,
  currentStock,
}: Props) {
  const [targetStock, setTargetStock] = useState("");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<
    StockAdjustFormState,
    FormData
  >(async (prev, formData) => {
    const result = await adjustProductStock(productId, prev, formData);
    if (result.success) {
      setTargetStock("");
      setReason("");
    }
    return result;
  }, initialState);

  const effectiveStock = state.stock ?? currentStock;
  const currentThousandths = parseThousandths(effectiveStock);
  const targetThousandths = parseThousandths(targetStock);
  const difference =
    currentThousandths !== null && targetThousandths !== null
      ? targetThousandths - currentThousandths
      : null;
  const differenceText =
    difference === null
      ? "—"
      : difference === BigInt(0)
        ? "Sin cambios"
        : `${difference > BigInt(0) ? "+" : ""}${formatThousandths(difference, unitType)}`;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800">Ajustar stock</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Crea un movimiento de ajuste con motivo. No se edita el stock de forma
          directa.
        </p>
      </div>

      <input type="hidden" name="unit_type" value={unitType} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-700">Stock actual</p>
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 tabular-nums">
            {formatQuantity(effectiveStock, unitType)}{" "}
            <span className="font-normal text-zinc-500">
              {unitType === "WEIGHT" ? "kg" : "unidades"}
            </span>
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="target_stock"
            className="block text-sm font-medium text-zinc-700"
          >
            Nuevo stock{" "}
            <span className="font-normal text-zinc-400">
              ({unitType === "WEIGHT" ? "kg" : "unidades"})
            </span>
          </label>
          <input
            id="target_stock"
            name="target_stock"
            type="text"
            inputMode="decimal"
            required
            value={targetStock}
            onChange={(event) => setTargetStock(event.target.value)}
            placeholder={unitType === "WEIGHT" ? "0.000" : "0"}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm">
        <span className="font-medium text-zinc-700">Diferencia</span>
        <span
          className={`font-semibold tabular-nums ${
            difference === BigInt(0)
              ? "text-zinc-500"
              : difference !== null && difference < BigInt(0)
                ? "text-red-600"
                : "text-emerald-700"
          }`}
        >
          {differenceText}
        </span>
      </div>

      <div className="space-y-1">
        <label htmlFor="reason" className="block text-sm font-medium text-zinc-700">
          Motivo
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej.: Recuento de inventario"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          role="status"
        >
          {state.success}
        </p>
      ) : null}

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Aplicando…" : "Confirmar ajuste"}
        </button>
      </div>
    </form>
  );
}
