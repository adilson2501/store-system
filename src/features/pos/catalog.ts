"use client";

import { createClient } from "@/lib/supabase/client";
import type { PosProduct } from "@/features/pos/types";

type PosProductRow = Omit<PosProduct, "selling_price" | "stock_quantity"> & {
  selling_price: string | number;
  stock_quantity: string | number;
};

function normalizeProduct(row: PosProductRow): PosProduct {
  return {
    ...row,
    selling_price: String(row.selling_price),
    stock_quantity: String(row.stock_quantity),
  };
}

export async function findByBarcode(barcode: string): Promise<PosProduct | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_pos_catalog", {
    p_barcode: barcode.trim(),
    p_search: null,
  });

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as PosProductRow | undefined;
  return row ? normalizeProduct(row) : null;
}

export async function searchProducts(search: string): Promise<PosProduct[]> {
  const term = search.trim();
  if (!term) return [];

  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_pos_catalog", {
    p_barcode: null,
    p_search: term,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as PosProductRow[]).map(normalizeProduct);
}
