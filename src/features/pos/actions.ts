"use server";

import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { classifyConfirmSaleError } from "@/features/pos/errors";
import type { ConfirmSaleInput, ConfirmSaleResult, ConfirmedSale } from "@/features/pos/types";
import type { PaymentMethod } from "@/features/pos/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numericString(value: unknown, nullable = false): string | null | undefined {
  if (value === null && nullable) return null;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeConfirmedSale(value: unknown, expectedClientKey: string): ConfirmedSale | null {
  if (!isRecord(value)) return null;

  const saleId = requiredString(value.sale_id);
  const clientKey = requiredString(value.client_key);
  const paymentMethod = value.payment_method;
  const status = value.status;
  const total = numericString(value.total);
  const amountReceived = numericString(value.amount_received, true);
  const amountChange = numericString(value.amount_change, true);
  const customerId = value.customer_id === null ? null : requiredString(value.customer_id);
  const createdAt = requiredString(value.created_at);
  const rawItems = value.items;

  if (
    !saleId || !clientKey || clientKey !== expectedClientKey ||
    !["CASH", "YAPE", "CREDIT"].includes(paymentMethod as PaymentMethod) ||
    status !== "CONFIRMED" ||
    total === null || total === undefined ||
    amountReceived === undefined || amountChange === undefined ||
    customerId === undefined || !createdAt || !Array.isArray(rawItems)
  ) return null;

  const items: ConfirmedSale["items"] = [];
  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) return null;
    const productId = requiredString(rawItem.product_id);
    const productName = requiredString(rawItem.product_name);
    const unitType = rawItem.unit_type;
    const quantity = numericString(rawItem.quantity);
    const unitSellingPrice = numericString(rawItem.unit_selling_price);
    const lineSubtotal = numericString(rawItem.line_subtotal);
    if (
      !productId || !productName ||
      (unitType !== "UNIT" && unitType !== "WEIGHT") ||
      quantity === null || quantity === undefined ||
      unitSellingPrice === null || unitSellingPrice === undefined ||
      lineSubtotal === null || lineSubtotal === undefined
    ) return null;
    items.push({
      product_id: productId,
      product_name: productName,
      unit_type: unitType,
      quantity,
      unit_selling_price: unitSellingPrice,
      line_subtotal: lineSubtotal,
    });
  }

  return {
    sale_id: saleId,
    client_key: clientKey,
    payment_method: paymentMethod as PaymentMethod,
    status: "CONFIRMED",
    total,
    amount_received: amountReceived,
    amount_change: amountChange,
    customer_id: customerId,
    created_at: createdAt,
    items,
  };
}

export async function confirmSale(input: ConfirmSaleInput): Promise<ConfirmSaleResult> {
  await requireUser();

  if (!input.client_key || !input.items.length) {
    return { ok: false, kind: "DEFINITIVE", code: "SALE_ITEMS_INVALID", error: "Agrega al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_sale", {
    p_client_key: input.client_key,
    p_cash_session_id: input.cash_session_id,
    p_payment_method: input.payment_method,
    p_items: input.items,
    p_amount_received: input.amount_received,
    p_customer_id: input.customer_id,
  });

  if (error) return classifyConfirmSaleError(error.message, error.details);

  const sale = normalizeConfirmedSale(data, input.client_key);
  if (!sale) {
    return {
      ok: false,
      kind: "UNKNOWN",
      code: "UNKNOWN_RESULT",
      error: "Sale confirmation returned an invalid result",
    };
  }
  return { ok: true, sale };
}
