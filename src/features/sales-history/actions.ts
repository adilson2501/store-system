"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateVoidReason } from "@/features/sales-history/validation";

export type VoidSaleInput = {
  saleId: string;
  reason: string;
  clientKey: string;
};

export type VoidSaleResult =
  | { ok: true }
  | { ok: false; error: string };

function voidError(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (message.includes("Sale is already voided")) return "La venta ya fue anulada.";
  if (message.includes("Sales belonging to closed cash sessions cannot be voided")) {
    return "No se puede anular una venta perteneciente a una caja cerrada.";
  }
  if (message.includes("Credit sale cannot be voided because the current customer balance is lower")) {
    return "No se puede anular: el saldo actual del cliente es menor que el total de la venta.";
  }
  if (message.includes("Void idempotency conflict")) {
    return "La solicitud de anulación entra en conflicto con una operación anterior.";
  }
  if (message.includes("Only administrators can void sales")) return "No tienes permisos para anular ventas.";
  if (message.includes("Void reason must have at least 3 characters")) return "El motivo debe tener al menos 3 caracteres.";
  if (message.includes("Void reason must have at most 500 characters")) return "El motivo admite máximo 500 caracteres.";
  if (message.includes("Sale not found")) return "Venta no encontrada.";
  return "No se pudo anular la venta. Intenta de nuevo.";
}

export async function voidSale(input: VoidSaleInput): Promise<VoidSaleResult> {
  await requireAdmin();

  if (!input.saleId.trim()) return { ok: false, error: "La venta es obligatoria." };
  if (!input.clientKey.trim()) return { ok: false, error: "No se pudo preparar la clave de anulación." };

  const checkedReason = validateVoidReason(input.reason);
  if (!checkedReason.ok) return checkedReason;

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", {
    p_sale_id: input.saleId,
    p_reason: checkedReason.value,
    p_client_key: input.clientKey,
  });

  if (error) {
    console.error("void_sale failed", { saleId: input.saleId, message: error.message });
    return { ok: false, error: voidError(error.message) };
  }

  revalidatePath(`/admin/sales/${input.saleId}`);
  revalidatePath("/admin/sales");
  return { ok: true };
}
