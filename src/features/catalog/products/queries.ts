import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/features/catalog/categories/types";
import type { Product } from "@/features/catalog/products/types";

type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  category_id: string | null;
  unit_type: Product["unit_type"];
  purchase_cost: string;
  selling_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category: { name: string } | { name: string }[] | null;
};

async function attachStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ProductRow[],
): Promise<Map<string, string>> {
  const ids = rows.map((row) => row.id);
  const stockMap = new Map<string, string>();

  if (ids.length === 0) {
    return stockMap;
  }

  const { data, error } = await supabase
    .from("product_stock")
    .select("product_id, quantity")
    .in("product_id", ids);

  if (error) {
    throw new Error(`Failed to load stock: ${error.message}`);
  }

  for (const row of data ?? []) {
    stockMap.set(row.product_id, String(row.quantity));
  }

  return stockMap;
}

function toProduct(row: ProductRow, stockMap: Map<string, string>): Product {
  const category = Array.isArray(row.category)
    ? row.category[0]
    : row.category;

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    category_id: row.category_id,
    unit_type: row.unit_type,
    purchase_cost: row.purchase_cost,
    selling_price: row.selling_price,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_name: category?.name ?? null,
    stock_quantity: stockMap.get(row.id) ?? "0",
  };
}

export async function listCategories(options?: {
  activeOnly?: boolean;
}): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase
    .from("categories")
    .select("id, name, is_active, created_at, updated_at")
    .order("name", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (data ?? []) as Category[];
}

export async function listProducts(search?: string): Promise<Product[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(
      "id, name, barcode, category_id, unit_type, purchase_cost, selling_price, is_active, created_at, updated_at, category:categories(name)",
    )
    .order("name", { ascending: true });

  const term = search?.trim();
  if (term) {
    const escaped = term.replace(/[%_,()]/g, " ");
    query = query.or(`name.ilike.%${escaped}%,barcode.ilike.%${escaped}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  const rows = (data ?? []) as ProductRow[];
  const stockMap = await attachStock(supabase, rows);

  return rows.map((row) => toProduct(row, stockMap));
}

export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, barcode, category_id, unit_type, purchase_cost, selling_price, is_active, created_at, updated_at, category:categories(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const stockMap = await attachStock(supabase, [data as ProductRow]);
  return toProduct(data as ProductRow, stockMap);
}
