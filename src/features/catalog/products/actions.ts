"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { UnitType } from "@/features/catalog/products/types";
import {
  normalizeOptionalBarcode,
  validateMoney,
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
    fieldErrors.name = "Name is required.";
  }
  if (!unitType) {
    fieldErrors.unit_type = "Select UNIT or WEIGHT.";
  }

  const cost = validateMoney(purchaseCostRaw, "Purchase cost");
  if (!cost.ok) {
    fieldErrors.purchase_cost = cost.error;
  }

  const price = validateMoney(sellingPriceRaw, "Selling price");
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
        fieldErrors: { barcode: "This barcode is already in use." },
        values,
        error: "Barcode must be unique.",
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
    return { error: "Product is required." };
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
    fieldErrors.name = "Name is required.";
  }
  if (!unitType) {
    fieldErrors.unit_type = "Select UNIT or WEIGHT.";
  }

  const cost = validateMoney(purchaseCostRaw, "Purchase cost");
  if (!cost.ok) {
    fieldErrors.purchase_cost = cost.error;
  }

  const price = validateMoney(sellingPriceRaw, "Selling price");
  if (!price.ok) {
    fieldErrors.selling_price = price.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createClient();
  const barcode = normalizeOptionalBarcode(barcodeRaw);

  const { error } = await supabase
    .from("products")
    .update({
      name,
      barcode,
      category_id: categoryIdRaw || null,
      unit_type: unitType,
      purchase_cost: cost.ok ? cost.value : "0",
      selling_price: price.ok ? price.value : "0",
      is_active: isActive,
    })
    .eq("id", productId);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { barcode: "This barcode is already in use." },
        values,
        error: "Barcode must be unique.",
      };
    }
    return { error: error.message, values };
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  return { values };
}
