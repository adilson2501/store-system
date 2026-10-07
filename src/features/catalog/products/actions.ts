"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { UnitType } from "@/features/catalog/products/types";
import {
  normalizeOptionalBarcode,
  validateInventoryLossNote,
  validateInventoryLossQuantity,
  validateInventoryLossReason,
  validateAdjustmentReason,
  validateMoney,
  validateNewStock,
  validateQuantity,
} from "@/features/catalog/products/validation";

export type ProductFormState = {
  error?: string;
  fieldErrors?: {
    name?: string;
    barcode?: string;
    category_id?: string;
    unit_type?: string;
    purchase_cost?: string;
    selling_price?: string;
    initial_stock?: string;
    is_active?: string;
  };
  values?: {
    name: string;
    barcode: string;
    category_id: string;
    unit_type: UnitType;
    purchase_cost: string;
    selling_price: string;
    initial_stock: string;
    is_active: boolean;
  };
};

function parseUnitType(raw: unknown): UnitType | null {
  if (raw === "UNIT" || raw === "WEIGHT") {
    return raw;
  }
  return null;
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const barcodeRaw = String(formData.get("barcode") ?? "");
  const categoryIdRaw = String(formData.get("category_id") ?? "").trim();
  const unitType = parseUnitType(formData.get("unit_type"));
  const purchaseCostRaw = String(formData.get("purchase_cost") ?? "").trim();
  const sellingPriceRaw = String(formData.get("selling_price") ?? "").trim();
  const initialStockRaw = String(formData.get("initial_stock") ?? "0").trim();

  const values = {
    name,
    barcode: barcodeRaw,
    category_id: categoryIdRaw,
    unit_type: unitType ?? ("UNIT" as UnitType),
    purchase_cost: purchaseCostRaw,
    selling_price: sellingPriceRaw,
    initial_stock: initialStockRaw,
    is_active: true,
  };

  const fieldErrors: NonNullable<ProductFormState["fieldErrors"]> = {};

  if (!name) {
    fieldErrors.name = "El nombre es obligatorio.";
  }
  if (!unitType) {
    fieldErrors.unit_type = "Selecciona UNIT o WEIGHT.";
  }

  const cost = validateMoney(purchaseCostRaw, "El costo de compra");
  if (!cost.ok) {
    fieldErrors.purchase_cost = cost.error;
  }

  const price = validateMoney(sellingPriceRaw, "El precio de venta");
  if (!price.ok) {
    fieldErrors.selling_price = price.error;
  }

  if (unitType) {
    const stock = validateQuantity(initialStockRaw, unitType);
    if (!stock.ok) {
      fieldErrors.initial_stock = stock.error;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const stockCheck = validateQuantity(initialStockRaw, unitType!);
  if (!stockCheck.ok) {
    return {
      fieldErrors: { initial_stock: stockCheck.error },
      values,
    };
  }

  const supabase = await createClient();
  const barcode = normalizeOptionalBarcode(barcodeRaw);
  const categoryId = categoryIdRaw || null;

  const { data, error } = await supabase.rpc(
    "create_product_with_initial_stock",
    {
      p_name: name,
      p_barcode: barcode,
      p_category_id: categoryId,
      p_unit_type: unitType!,
      p_purchase_cost: cost.ok ? cost.value : "0",
      p_selling_price: price.ok ? price.value : "0",
      p_initial_stock: stockCheck.value,
    },
  );

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { barcode: "Este código de barras ya está en uso." },
        values,
        error: "El código de barras debe ser único.",
      };
    }
    return { error: error.message, values };
  }

  const productId = typeof data === "string" ? data : String(data);
  revalidatePath("/admin/products");
  redirect(`/admin/products/${productId}`);
}

export async function updateProduct(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  if (!productId) {
    return { error: "El producto es obligatorio." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const barcodeRaw = String(formData.get("barcode") ?? "");
  const categoryIdRaw = String(formData.get("category_id") ?? "").trim();
  const unitType = parseUnitType(formData.get("unit_type"));
  const purchaseCostRaw = String(formData.get("purchase_cost") ?? "").trim();
  const sellingPriceRaw = String(formData.get("selling_price") ?? "").trim();
  const isActive = formData.get("is_active") === "on";

  const values = {
    name,
    barcode: barcodeRaw,
    category_id: categoryIdRaw,
    unit_type: unitType ?? ("UNIT" as UnitType),
    purchase_cost: purchaseCostRaw,
    selling_price: sellingPriceRaw,
    initial_stock: "",
    is_active: isActive,
  };

  const fieldErrors: NonNullable<ProductFormState["fieldErrors"]> = {};

  if (!name) {
    fieldErrors.name = "El nombre es obligatorio.";
  }
  if (!unitType) {
    fieldErrors.unit_type = "Selecciona UNIT o WEIGHT.";
  }

  const cost = validateMoney(purchaseCostRaw, "El costo de compra");
  if (!cost.ok) {
    fieldErrors.purchase_cost = cost.error;
  }

  const price = validateMoney(sellingPriceRaw, "El precio de venta");
  if (!price.ok) {
    fieldErrors.selling_price = price.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createClient();
  const barcode = normalizeOptionalBarcode(barcodeRaw);

  const { error } = await supabase.rpc("update_product", {
    p_product_id: productId,
    p_name: name,
    p_barcode: barcode,
    p_category_id: categoryIdRaw || null,
    p_unit_type: unitType,
    p_purchase_cost: cost.ok ? cost.value : "0",
    p_selling_price: price.ok ? price.value : "0",
    p_is_active: isActive,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { barcode: "Este código de barras ya está en uso." },
        values,
        error: "El código de barras debe ser único.",
      };
    }
    if (
      error.message ===
      "Product unit type cannot be changed after inventory history exists"
    ) {
      return {
        fieldErrors: {
          unit_type:
            "El tipo de unidad no puede cambiarse porque el producto ya tiene historial de inventario.",
        },
        values,
        error:
          "El tipo de unidad no puede cambiarse porque el producto ya tiene historial de inventario.",
      };
    }
    return { error: error.message, values };
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  return { values };
}

export type StockAdjustFormState = {
  error?: string;
  success?: string;
  stock?: string;
  values?: {
    target_stock: string;
    reason: string;
  };
};

export type InventoryLossFormState = {
  error?: string;
  success?: string;
  stock?: string;
  nextOperationKey?: string;
  values?: {
    quantity: string;
    reason: string;
    note: string;
  };
};

function toStockAdjustErrorMessage(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (message === "Authentication required") {
    return "Autenticación requerida.";
  }
  if (message.includes("Only administrators can adjust stock")) {
    return "Solo los administradores pueden ajustar el stock.";
  }
  if (message.includes("Adjustment reason is required")) {
    return "El motivo es obligatorio.";
  }
  if (message.includes("Product not found")) {
    return "Producto no encontrado.";
  }
  if (message.includes("Target stock must be zero or greater")) {
    return "El nuevo stock no puede ser negativo.";
  }
  if (message.includes("Target stock must have at most 3 decimals")) {
    return "El nuevo stock admite máximo 3 decimales.";
  }
  if (message.includes("UNIT products require a whole-number target stock")) {
    return "Los productos UNIT requieren un stock entero.";
  }
  if (message.includes("UNIT products require whole-number inventory quantities")) {
    return "Los productos UNIT requieren cantidades enteras.";
  }

  return message;
}

function toInventoryLossErrorMessage(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (message.includes("Only administrators can register inventory loss")) {
    return "Solo los administradores pueden registrar mermas.";
  }
  if (message.includes("LOSS_IDEMPOTENCY_CONFLICT")) {
    return "La clave de esta merma ya fue usada con otros datos.";
  }
  if (message.includes("Insufficient stock for inventory loss")) {
    return "La merma no puede superar el stock disponible.";
  }
  if (message.includes("UNIT products require whole-number loss quantities")) {
    return "Los productos UNIT requieren una cantidad entera.";
  }
  if (message.includes("Loss quantity must be greater than zero")) {
    return "La cantidad de merma debe ser mayor que cero.";
  }
  if (message.includes("Loss note must have at most 500 characters")) {
    return "La nota admite máximo 500 caracteres.";
  }
  if (message.includes("A note is required for OTHER loss reason")) {
    return "La nota es obligatoria para el motivo Otro.";
  }
  if (message.includes("Product not found")) {
    return "Producto no encontrado.";
  }
  return message;
}

export async function registerInventoryLoss(
  productId: string,
  _prevState: InventoryLossFormState,
  formData: FormData,
): Promise<InventoryLossFormState> {
  await requireAdmin();

  if (!productId) return { error: "El producto es obligatorio." };

  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "");
  const operationKey = String(formData.get("operation_key") ?? "").trim() || crypto.randomUUID();
  const unitTypeRaw = String(formData.get("unit_type") ?? "");
  const unitType: UnitType = unitTypeRaw === "WEIGHT" ? "WEIGHT" : "UNIT";
  const values = { quantity: quantityRaw, reason: reasonRaw, note: noteRaw };

  const quantity = validateInventoryLossQuantity(quantityRaw, unitType);
  if (!quantity.ok) return { error: quantity.error, values };

  const reason = validateInventoryLossReason(reasonRaw);
  if (!reason.ok) return { error: reason.error, values };

  const note = validateInventoryLossNote(noteRaw, reason.value);
  if (!note.ok) return { error: note.error, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_inventory_loss", {
    p_product_id: productId,
    p_quantity: quantity.value,
    p_reason: reason.value,
    p_note: note.value,
    p_operation_key: operationKey,
  });

  if (error) return { error: toInventoryLossErrorMessage(error.message), values };

  const result = (data ?? {}) as { new_stock?: string | number; quantity?: string | number };
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);

  return {
    success: `Merma registrada (${String(result.quantity ?? quantity.value)}).`,
    stock: String(result.new_stock ?? "0"),
    nextOperationKey: crypto.randomUUID(),
    values: { quantity: "", reason: "", note: "" },
  };
}

export async function adjustProductStock(
  productId: string,
  _prevState: StockAdjustFormState,
  formData: FormData,
): Promise<StockAdjustFormState> {
  await requireAdmin();

  if (!productId) {
    return { error: "El producto es obligatorio." };
  }

  const unitTypeRaw = String(formData.get("unit_type") ?? "");
  const unitType: UnitType =
    unitTypeRaw === "WEIGHT" ? "WEIGHT" : "UNIT";
  const targetStockRaw = String(formData.get("target_stock") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "");

  const values = {
    target_stock: targetStockRaw,
    reason: reasonRaw,
  };

  const stock = validateNewStock(targetStockRaw, unitType);
  if (!stock.ok) {
    return { error: stock.error, values };
  }

  const reason = validateAdjustmentReason(reasonRaw);
  if (!reason.ok) {
    return { error: reason.error, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_target_stock: stock.value,
    p_reason: reason.value,
  });

  if (error) {
    return { error: toStockAdjustErrorMessage(error.message), values };
  }

  const result = (data ?? {}) as {
    new_stock?: string | number;
    difference?: string | number;
    movement_id?: string | null;
  };
  const newStock =
    result.new_stock === undefined || result.new_stock === null
      ? stock.value
      : String(result.new_stock);
  const difference = Number(result.difference ?? 0);
  const success =
    difference === 0
      ? "Sin cambios."
      : `Ajuste aplicado (${difference > 0 ? "+" : ""}${String(result.difference)}).`;

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);

  return {
    success,
    stock: newStock,
    values: { target_stock: "", reason: "" },
  };
}
