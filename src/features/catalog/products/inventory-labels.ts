export type InventoryMovementType = "ENTRY" | "SALE" | "LOSS" | "ADJUSTMENT" | "REVERSAL" | "PURCHASE_REVERSAL";

export const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  ENTRY: "Entrada",
  SALE: "Venta",
  LOSS: "Merma",
  ADJUSTMENT: "Ajuste",
  REVERSAL: "Reversión",
  PURCHASE_REVERSAL: "Reversión de compra",
};

export function inventoryMovementLabel(type: InventoryMovementType): string {
  return inventoryMovementLabels[type];
}
