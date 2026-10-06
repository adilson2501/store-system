"use client";

import { createClient } from "@/lib/supabase/client";
import type { PosCustomer } from "@/features/pos/types";

type PosCustomerRow = Omit<PosCustomer, "credit_limit" | "current_debt" | "available_credit"> & {
  credit_limit: string | number;
  current_debt: string | number;
  available_credit: string | number;
};

function normalizeCustomer(row: PosCustomerRow): PosCustomer {
  return {
    ...row,
    credit_limit: String(row.credit_limit),
    current_debt: String(row.current_debt),
    available_credit: String(row.available_credit),
  };
}

// Seller-safe projection: notes and administrative fields are never returned.
export async function searchPosCustomers(search: string): Promise<PosCustomer[]> {
  const term = search.trim();

  const supabase = createClient();
  const { data, error } = await supabase.rpc("search_pos_customers", {
    p_search: term || null,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as PosCustomerRow[]).map(normalizeCustomer);
}

export async function getPosCustomer(customerId: string): Promise<PosCustomer> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_customer_credit_detail", {
    p_customer_id: customerId,
  });

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as PosCustomerRow | undefined;
  if (!row) throw new Error("Customer not found");
  return normalizeCustomer(row);
}
