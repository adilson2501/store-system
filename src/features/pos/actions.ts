"use server";

import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ConfirmSaleInput, ConfirmedSale } from "@/features/pos/types";

export async function confirmSale(input: ConfirmSaleInput): Promise<
  { ok: true; sale: ConfirmedSale } | { ok: false; error: string }
> {
  await requireUser();

  if (!input.client_key || !input.items.length) {
    return { ok: false, error: "Agrega al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_sale", {
    p_client_key: input.client_key,
    p_payment_method: input.payment_method,
    p_items: input.items,
    p_amount_received: input.amount_received,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, sale: data as ConfirmedSale };
}
