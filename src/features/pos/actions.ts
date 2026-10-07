"use server";

import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ConfirmSaleInput, ConfirmSaleResult, ConfirmedSale } from "@/features/pos/types";
import type { PaymentMethod } from "@/features/pos/types";

const DEFINITIVE_ERROR_CODES: Array<{ match: string; code: string }> = [
  { match: "SALE_IDEMPOTENCY_CONFLICT", code: "SALE_IDEMPOTENCY_CONFLICT" },
  { match: "Insufficient stock for product", code: "INSUFFICIENT_STOCK" },
  { match: "Credit limit exceeded", code: "CREDIT_LIMIT_EXCEEDED" },
  { match: "Open cash session is required", code: "OPEN_CASH_SESSION_REQUIRED" },
  { match: "Product not found", code: "PRODUCT_NOT_FOUND" },
  { match: "Product is inactive or unavailable", code: "PRODUCT_UNAVAILABLE" },
  { match: "Customer not found", code: "CUSTOMER_NOT_FOUND" },
  { match: "Customer is inactive", code: "CUSTOMER_INACTIVE" },
  { match: "Customer credit is disabled", code: "CUSTOMER_CREDIT_DISABLED" },
  { match: "Customer is required only for FIADO", code: "CUSTOMER_REQUIREMENT_INVALID" },
  { match: "Cash received must be at least", code: "CASH_AMOUNT_INVALID" },
  { match: "YAPE does not accept cash received", code: "YAPE_AMOUNT_INVALID" },
  { match: "FIADO does not accept cash received", code: "CREDIT_AMOUNT_INVALID" },
  { match: "Quantity must be positive", code: "QUANTITY_INVALID" },
  { match: "UNIT products require whole-number", code: "UNIT_QUANTITY_INVALID" },
  { match: "Unsupported payment method", code: "PAYMENT_METHOD_INVALID" },
  { match: "At least one sale item", code: "SALE_ITEMS_INVALID" },
  { match: "Invalid sale item", code: "SALE_ITEM_INVALID" },
  { match: "Cash session is required", code: "CASH_SESSION_REQUIRED" },
  { match: "Authentication required", code: "AUTHENTICATION_REQUIRED" },
  { match: "POS access requires", code: "POS_ACCESS_FORBIDDEN" },
];

function classifyConfirmSaleError(raw: string): ConfirmSaleResult {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  const known = DEFINITIVE_ERROR_CODES.find(({ match }) => message.includes(match));
  if (known) return { ok: false, kind: "DEFINITIVE", code: known.code, error: message };
  return { ok: false, kind: "UNKNOWN", code: "UNKNOWN_SERVER_ERROR", error: message || "Sale confirmation failed" };
}

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

  if (error) return classifyConfirmSaleError(error.message);

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
