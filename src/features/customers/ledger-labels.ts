export type CustomerLedgerMovementType = "CREDIT_SALE" | "PAYMENT" | "CREDIT_SALE_REVERSAL";

export function customerLedgerMovementLabel(type: CustomerLedgerMovementType): string {
  if (type === "CREDIT_SALE") return "Venta fiada";
  if (type === "CREDIT_SALE_REVERSAL") return "Reversión de venta fiada";
  return "Pago";
}
