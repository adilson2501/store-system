import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Customer, CustomerLedgerEntry } from "@/features/customers/types";
import { parseSignedCents } from "@/features/customers/validation";
import { formatCents } from "@/features/pos/money";

type CustomerRow = Omit<Customer, "current_debt" | "available_credit">;
type LedgerRow = CustomerLedgerEntry & { customer_id: string };

function balanceMap(rows: LedgerRow[]) {
  const balances = new Map<string, bigint>();
  for (const row of rows) {
    balances.set(
      row.customer_id,
      (balances.get(row.customer_id) ?? BigInt(0)) + parseSignedCents(row.amount),
    );
  }
  return balances;
}

function withBalance(row: CustomerRow, debtCents: bigint): Customer {
  const limitCents = parseSignedCents(row.credit_limit);
  return {
    ...row,
    current_debt: formatCents(debtCents),
    available_credit: formatCents(limitCents - debtCents),
  };
}

async function loadLedger(supabase: Awaited<ReturnType<typeof createClient>>, customerIds: string[]) {
  if (customerIds.length === 0) return [] as LedgerRow[];
  const { data, error } = await supabase
    .from("customer_credit_ledger")
    .select("id, customer_id, movement_type, amount, sale_id, payment_method, note, created_by, created_at")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`No se pudo cargar el historial de crédito: ${error.message}`);
  return (data ?? []) as LedgerRow[];
}

export async function listCustomers(search?: string): Promise<Customer[]> {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, phone, notes, credit_limit, credit_enabled, active, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const term = search?.trim();
  if (term) {
    const escaped = term.replace(/[%_,()]/g, " ");
    query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
  const rows = (data ?? []) as CustomerRow[];
  const ledger = await loadLedger(supabase, rows.map((row) => row.id));
  const balances = balanceMap(ledger);
  return rows.map((row) => withBalance(row, balances.get(row.id) ?? BigInt(0)));
}

export async function getCustomer(id: string): Promise<{ customer: Customer; ledger: CustomerLedgerEntry[] } | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, notes, credit_limit, credit_enabled, active, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el cliente: ${error.message}`);
  if (!data) return null;
  const ledger = await loadLedger(supabase, [id]);
  const debt = balanceMap(ledger).get(id) ?? BigInt(0);
  return { customer: withBalance(data as CustomerRow, debt), ledger };
}
