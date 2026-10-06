"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ConfirmPurchaseInput, ConfirmedPurchase } from "@/features/purchases/types";
import { parseCents, parseThousandths } from "@/features/pos/money";
import { validateVoidReason } from "@/features/sales-history/validation";

export type ConfirmPurchaseResult =
  | { ok: true; purchase: ConfirmedPurchase }
  | { ok: false; error: string };

function mapPurchaseError(raw: string) {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (message === "Authentication required") return "Autenticación requerida.";
  if (message === "Only administrators can confirm purchases") return "Solo un administrador puede registrar compras.";
  if (message === "Supplier is required") return "Selecciona un proveedor.";
  if (message === "Supplier not found") return "El proveedor no existe.";
  if (message === "Supplier is inactive") return "El proveedor está inactivo.";
  if (message === "Purchase date is required") return "Selecciona la fecha de compra.";
  if (message.includes("Purchase reference must have at most 120 characters")) return "La referencia admite máximo 120 caracteres.";
  if (message.includes("At least one purchase item")) return "Agrega al menos un producto.";
  if (message === "Duplicate product in purchase") return "El producto está repetido en la compra.";
  if (message === "Product not found" || message === "Invalid purchase item product") return "Uno de los productos ya no existe.";
  if (message === "Product is inactive or unavailable") return "Uno de los productos está inactivo.";
  if (message === "UNIT products require whole-number quantities") return "Los productos por unidad requieren cantidades enteras.";
  if (message === "WEIGHT quantities must have at most 3 decimals") return "La cantidad en kg admite como máximo 3 decimales.";
  if (message.includes("Acquisition cost must have at most 2 decimals")) return "El costo admite como máximo 2 decimales.";
  if (message.includes("Invalid acquisition cost")) return "El costo de adquisición no es válido.";
  if (message.includes("Invalid purchase item quantity") || message.includes("Purchase quantity must")) return "La cantidad ingresada no es válida.";
  if (message === "Purchase idempotency conflict") return "La compra cambió durante un reintento. Revisa los datos e inténtalo nuevamente.";
  if (message.includes("Purchase items must be a JSON array")) return "Los productos de la compra no son válidos.";
  console.error("confirm_purchase failed", { message });
  return "No se pudo registrar la compra. Intenta nuevamente.";
}

function validateInput(input: ConfirmPurchaseInput) {
  if (!input.client_key || !input.supplier_id) return "Selecciona un proveedor y prepara la compra nuevamente.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchase_date)) return "Selecciona una fecha de compra válida.";
  if (!Array.isArray(input.items) || input.items.length === 0) return "Agrega al menos un producto.";
  if (input.reference.trim().length > 120) return "La referencia admite máximo 120 caracteres.";

  const productIds = new Set<string>();
  for (const item of input.items) {
    if (!item.product_id || productIds.has(item.product_id)) return "El producto está repetido en la compra.";
    productIds.add(item.product_id);
    if (parseThousandths(item.quantity) === null || parseThousandths(item.quantity)! <= BigInt(0)) {
      return "La cantidad ingresada no es válida.";
    }
    if (parseCents(item.unit_purchase_cost) === null || parseCents(item.unit_purchase_cost)! < BigInt(0)) {
      return "El costo de adquisición no es válido.";
    }
  }
  return null;
}

export async function confirmPurchase(input: ConfirmPurchaseInput): Promise<ConfirmPurchaseResult> {
  await requireAdmin();
  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_purchase", {
    p_client_key: input.client_key,
    p_supplier_id: input.supplier_id,
    p_purchase_date: input.purchase_date,
    p_items: input.items,
    p_reference: input.reference.trim() || null,
  });

  if (error) return { ok: false, error: mapPurchaseError(error.message) };
  return { ok: true, purchase: data as ConfirmedPurchase };
}

export type VoidPurchaseInput = {
  purchaseId: string;
  reason: string;
  clientKey: string;
};

export type VoidPurchaseResult =
  | { ok: true }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function voidPurchaseError(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (message.includes("Authentication required")) return "Sesión requerida.";
  if (message.includes("Only administrators can void purchases")) return "Solo un administrador puede anular compras.";
  if (message.includes("Purchase is required")) return "La compra es obligatoria.";
  if (message.includes("Purchase not found")) return "La compra no existe.";
  if (message.includes("Void client key is required")) return "No se pudo preparar la clave de anulación.";
  if (message.includes("Purchase is already voided")) return "La compra ya fue anulada.";
  if (message.includes("Void idempotency conflict")) return "La solicitud de anulación entra en conflicto con una operación anterior.";
  if (message.includes("Void reason must have at least 3 characters")) return "El motivo debe tener al menos 3 caracteres.";
  if (message.includes("Void reason must have at most 500 characters")) return "El motivo admite máximo 500 caracteres.";
  if (message.includes("Insufficient stock to reverse purchase")) return "No hay stock suficiente para anular esta compra.";
  if (message.includes("Purchase cost history is incomplete")) return "Esta compra pertenece al historial anterior y no puede anularse de forma segura porque no existe trazabilidad completa de su costo.";
  if (message.includes("Purchase reversal already exists") || message.includes("Purchase reversal consistency failure")) {
    return "No se pudo completar la anulación porque la trazabilidad de la compra es inconsistente.";
  }
  if (message.includes("Purchase has no items")) return "La compra no tiene productos registrados.";
  if (message.includes("Product not found for purchase item")) return "No se encontró un producto de la compra.";
  console.error("void_purchase failed", { message });
  return "No se pudo anular la compra. Intenta nuevamente.";
}

export async function voidPurchase(input: VoidPurchaseInput): Promise<VoidPurchaseResult> {
  await requireAdmin();

  if (!UUID_RE.test(input.purchaseId.trim())) return { ok: false, error: "La compra no es válida." };
  if (!UUID_RE.test(input.clientKey.trim())) return { ok: false, error: "No se pudo preparar la clave de anulación." };

  const checkedReason = validateVoidReason(input.reason);
  if (!checkedReason.ok) return checkedReason;

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_purchase", {
    p_purchase_id: input.purchaseId.trim(),
    p_reason: checkedReason.value,
    p_client_key: input.clientKey.trim(),
  });

  if (error) return { ok: false, error: voidPurchaseError(error.message) };

  revalidatePath("/admin/purchases");
  revalidatePath(`/admin/purchases/${input.purchaseId.trim()}`);
  revalidatePath("/admin/products");
  return { ok: true };
}
