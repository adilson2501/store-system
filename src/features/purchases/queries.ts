import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  PurchaseHistoryDetail,
  PurchaseHistoryFilters,
  PurchaseHistoryPage,
  PurchaseHistoryRow,
  PurchaseHistorySupplier,
} from "@/features/purchases/history-types";

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PurchaseRow = {
  id: string;
  supplier_id: string;
  purchase_date: string;
  status: "CONFIRMED";
  reference: string | null;
  total: string | number;
  created_by: string | null;
  created_at: string;
};

type PurchaseItemRow = {
  id: string;
  product_name: string;
  unit_type: "UNIT" | "WEIGHT";
  quantity: string | number;
  unit_purchase_cost: string | number;
  line_subtotal: string | number;
};

type SupplierRow = { id: string; name: string; ruc: string | null; active: boolean };
type ProfileRow = { id: string; display_name: string | null };

function validDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function validSupplierId(value: string | undefined): string {
  return value && UUID_RE.test(value) ? value : "";
}

function escapeSearch(value: string): string {
  return value.replace(/[%_,()]/g, " ");
}

function asString(value: string | number): string {
  return String(value);
}

function normalizePage(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function normalizePurchaseFilters(input: Partial<PurchaseHistoryFilters>): PurchaseHistoryFilters {
  return {
    from: validDate(input.from),
    to: validDate(input.to),
    supplierId: validSupplierId(input.supplierId),
    search: (input.search ?? "").trim().slice(0, 120),
  };
}

async function loadLabels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: PurchaseRow[],
) {
  const supplierIds = [...new Set(rows.map((row) => row.supplier_id))];
  const profileIds = [...new Set(rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
  const [suppliers, profiles] = await Promise.all([
    supplierIds.length
      ? supabase.from("suppliers").select("id, name, ruc, active").in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (suppliers.error) throw new Error(`No se pudieron cargar los proveedores de las compras: ${suppliers.error.message}`);
  if (profiles.error) throw new Error(`No se pudieron cargar los operadores de las compras: ${profiles.error.message}`);

  return {
    suppliers: new Map((suppliers.data as SupplierRow[]).map((row) => [row.id, row])),
    profiles: new Map((profiles.data as ProfileRow[]).map((row) => [row.id, row.display_name?.trim() || "—"])),
  };
}

export async function listPurchaseSuppliers(): Promise<PurchaseHistorySupplier[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, ruc, active")
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);
  return (data ?? []) as PurchaseHistorySupplier[];
}

export async function listPurchases(
  requestedPage = 1,
  requestedFilters: Partial<PurchaseHistoryFilters> = {},
): Promise<PurchaseHistoryPage> {
  await requireAdmin();
  const page = normalizePage(requestedPage);
  const filters = normalizePurchaseFilters(requestedFilters);
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("purchases")
    .select("id, supplier_id, purchase_date, status, reference, total, created_by, created_at, purchase_items(id)", { count: "exact" });
  if (filters.from) query = query.gte("purchase_date", filters.from);
  if (filters.to) query = query.lte("purchase_date", filters.to);
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.search) query = query.ilike("reference", `%${escapeSearch(filters.search)}%`);

  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (error) throw new Error(`No se pudieron cargar las compras: ${error.message}`);

  const rows = (data ?? []) as (PurchaseRow & { purchase_items: { id: string }[] | null })[];
  const labels = await loadLabels(supabase, rows);
  const historyRows: PurchaseHistoryRow[] = rows.map((row) => ({
    id: row.id,
    purchase_date: row.purchase_date,
    created_at: row.created_at,
    supplier_name: labels.suppliers.get(row.supplier_id)?.name ?? "Proveedor no encontrado",
    reference: row.reference,
    item_count: row.purchase_items?.length ?? 0,
    total: asString(row.total),
    creator_name: row.created_by ? labels.profiles.get(row.created_by) ?? "—" : "—",
    status: row.status,
  }));
  const total = count ?? 0;

  return { rows: historyRows, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters };
}

export async function getPurchaseDetail(id: string): Promise<PurchaseHistoryDetail | null> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, supplier_id, purchase_date, status, reference, total, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la compra: ${error.message}`);
  if (!data) return null;

  const purchase = data as PurchaseRow;
  const { data: itemData, error: itemError } = await supabase
    .from("purchase_items")
    .select("id, product_name, unit_type, quantity, unit_purchase_cost, line_subtotal")
    .eq("purchase_id", purchase.id)
    .order("id", { ascending: true });
  if (itemError) throw new Error(`No se pudieron cargar los productos de la compra: ${itemError.message}`);

  const labels = await loadLabels(supabase, [purchase]);
  const supplier = labels.suppliers.get(purchase.supplier_id);
  return {
    id: purchase.id,
    purchase_date: purchase.purchase_date,
    created_at: purchase.created_at,
    supplier_name: supplier?.name ?? "Proveedor no encontrado",
    supplier_ruc: supplier?.ruc ?? null,
    reference: purchase.reference,
    status: purchase.status,
    created_by_name: purchase.created_by ? labels.profiles.get(purchase.created_by) ?? "—" : "—",
    total: asString(purchase.total),
    items: ((itemData ?? []) as PurchaseItemRow[]).map((item) => ({
      id: item.id,
      product_name: item.product_name,
      unit_type: item.unit_type,
      quantity: asString(item.quantity),
      unit_purchase_cost: asString(item.unit_purchase_cost),
      line_subtotal: asString(item.line_subtotal),
    })),
  };
}
