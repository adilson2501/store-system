import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Supplier, SupplierPage } from "@/features/suppliers/types";

const PAGE_SIZE = 20;

function normalizePage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function escapeSearch(value: string) {
  return value.replace(/[%_,()]/g, " ");
}

export async function listSuppliers(requestedPage = 1, requestedSearch = ""): Promise<SupplierPage> {
  await requireAdmin();
  const page = normalizePage(requestedPage);
  const search = requestedSearch.trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  let query = supabase
    .from("suppliers")
    .select("id, name, ruc, phone, notes, active, created_by, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (search) {
    const term = escapeSearch(search);
    query = query.or(`name.ilike.%${term}%,ruc.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);

  const total = count ?? 0;
  return {
    rows: (data ?? []) as Supplier[],
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    search,
  };
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, ruc, phone, notes, active, created_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el proveedor: ${error.message}`);
  return (data as Supplier | null) ?? null;
}

export async function listActiveSuppliers(): Promise<Supplier[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, ruc, phone, notes, active, created_by, created_at, updated_at")
    .eq("active", true)
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los proveedores activos: ${error.message}`);
  return (data ?? []) as Supplier[];
}
