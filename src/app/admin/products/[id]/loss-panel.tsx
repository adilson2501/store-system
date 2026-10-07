"use client";

import { useActionState, useState } from "react";
import {
  registerInventoryLoss,
  type InventoryLossFormState,
} from "@/features/catalog/products/actions";
import {
  INVENTORY_LOSS_REASONS,
  type InventoryLossReason,
} from "@/features/catalog/products/validation";
import type { UnitType } from "@/features/catalog/products/types";

const initialState: InventoryLossFormState = {};

type Props = {
  productId: string;
  unitType: UnitType;
  currentStock: string;
};

export function LossPanel({ productId, unitType, currentStock }: Props) {
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState<InventoryLossReason | "">("");
  const [state, formAction, pending] = useActionState<InventoryLossFormState, FormData>(
    async (previous, formData) => {
      const result = await registerInventoryLoss(productId, previous, formData);
      if (result.success) {
        setReason("");
        setOperationKey(result.nextOperationKey ?? crypto.randomUUID());
      }
      return result;
    },
    initialState,
  );

  const effectiveStock = state.stock ?? currentStock;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800">Registrar merma</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Registra una pérdida real de inventario. El stock disminuirá y el movimiento quedará en el historial.
        </p>
      </div>

      <input type="hidden" name="unit_type" value={unitType} />
      <input type="hidden" name="operation_key" value={operationKey} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-700">Stock actual</p>
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 tabular-nums">
            {effectiveStock} {unitType === "WEIGHT" ? "kg" : "unidades"}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="loss_quantity" className="block text-sm font-medium text-zinc-700">
            Cantidad de merma ({unitType === "WEIGHT" ? "kg" : "unidades"})
          </label>
          <input
            id="loss_quantity"
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            defaultValue={state.values?.quantity ?? ""}
            placeholder={unitType === "WEIGHT" ? "0.000" : "0"}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="loss_reason" className="block text-sm font-medium text-zinc-700">Motivo</label>
        <select
          id="loss_reason"
          name="reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value as InventoryLossReason | "")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        >
          <option value="">Selecciona un motivo</option>
          {INVENTORY_LOSS_REASONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="loss_note" className="block text-sm font-medium text-zinc-700">
          Nota {reason === "OTHER" ? <span className="font-normal text-red-600">(obligatoria)</span> : <span className="font-normal text-zinc-400">(opcional)</span>}
        </label>
        <textarea
          id="loss_note"
          name="note"
          required={reason === "OTHER"}
          defaultValue={state.values?.note ?? ""}
          maxLength={500}
          rows={3}
          placeholder="Ej.: producto vencido durante revisión"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
      {state.success ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{state.success}</p> : null}

      <button type="submit" disabled={pending} className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
        {pending ? "Registrando…" : "Confirmar merma"}
      </button>
    </form>
  );
}
