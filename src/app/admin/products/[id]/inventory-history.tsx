import type { InventoryMovement } from "@/features/catalog/products/queries";
import { formatQuantity } from "@/features/catalog/products/validation";

const movementLabels: Record<InventoryMovement["movement_type"], string> = {
  ENTRY: "Entrada",
  SALE: "Venta",
  LOSS: "Merma",
  ADJUSTMENT: "Ajuste",
  REVERSAL: "Reversión",
};

const reasonLabels: Record<string, string> = {
  EXPIRED: "Vencido",
  DAMAGED: "Dañado",
  BROKEN: "Roto",
  SPOILED: "Malogrado",
  LOST: "Perdido",
  OTHER: "Otro",
};

export function InventoryHistory({ movements, unitType }: { movements: InventoryMovement[]; unitType: "UNIT" | "WEIGHT" }) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-6 py-4">
        <h2 className="text-base font-semibold">Historial de inventario</h2>
        <p className="mt-1 text-xs text-zinc-500">Movimientos append-only que forman el stock actual.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr><th className="px-6 py-3 font-medium">Fecha</th><th className="px-6 py-3 font-medium">Tipo</th><th className="px-6 py-3 font-medium">Cantidad</th><th className="px-6 py-3 font-medium">Motivo / nota</th><th className="px-6 py-3 font-medium">Actor</th></tr>
          </thead>
          <tbody>
            {movements.length === 0 ? <tr><td colSpan={5} className="px-6 py-6 text-zinc-500">Aún no hay movimientos de inventario.</td></tr> : movements.map((movement) => (
              <tr key={movement.id} className="border-b border-zinc-100">
                <td className="whitespace-nowrap px-6 py-3 text-zinc-600">{new Date(movement.created_at).toLocaleString("es-PE")}</td>
                <td className="px-6 py-3 font-medium">{movementLabels[movement.movement_type]}</td>
                <td className={`px-6 py-3 font-semibold tabular-nums ${Number(movement.quantity) < 0 ? "text-red-700" : "text-zinc-900"}`}>{formatQuantity(movement.quantity, unitType)}</td>
                <td className="px-6 py-3 text-zinc-600">{movement.loss_reason ? reasonLabels[movement.loss_reason] : null}{movement.loss_reason && movement.note ? " · " : ""}{movement.note ?? "—"}</td>
                <td className="px-6 py-3 text-zinc-600">{movement.actor_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
