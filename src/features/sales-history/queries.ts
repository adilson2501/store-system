import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  SaleHistoryDetail,
  SaleHistoryItem,
  SaleHistoryPage,
  SaleHistoryRow,
  SalePaymentMethod,
  SaleStatus,
  SalesHistoryFilters,
} from "@/features/sales-history/types";

const PAGE_SIZE = 20;
const LIMA_TIME_ZONE = "America/Lima";

type SaleRow = {
  id: string;
  seller_id: string;
  payment_method: SalePaymentMethod;
  customer_id: string | null;
  cash_session_id: string | null;
  status: SaleStatus;
  total: string | number;
  amount_received: string | number | null;
  amount_change: string | number | null;
  created_at: string;
};

type SaleItemRow = {
  id: string;
  product_name: string;
  unit_type: "UNIT" | "WEIGHT";
  quantity: string | number;
  unit_purchase_cost: string | number;
  unit_selling_price: string | number;
  line_subtotal: string | number;
};

type ProfileRow = { id: string; display_name: string | null };
type CustomerRow = { id: string; name: string };
type CashSessionRow = {
  id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
};

function asString(value: string | number): string {
  return String(value);
}

function sellerName(displayName: string | null | undefined): string {
  return displayName?.trim() || "Operador sin nombre";
}

function parsePaymentMethod(value: string | undefined): SalePaymentMethod | "" {
  return value === "CASH" || value === "YAPE" || value === "CREDIT" ? value : "";
}

function parseStatus(value: string | undefined): SaleStatus | "" {
  return value === "CONFIRMED" || value === "VOIDED" ? value : "";
}

function validDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function normalizeSalesFilters(input: Partial<SalesHistoryFilters>): SalesHistoryFilters {
  return {
    from: validDate(input.from),
    to: validDate(input.to),
    paymentMethod: parsePaymentMethod(input.paymentMethod),
    status: parseStatus(input.status),
  };
}

function limaDateBoundary(date: string, endOfDay: boolean): Date {
  const [year, month, day] = date.split("-").map(Number);
  // America/Lima uses UTC-05:00 and has no DST transitions.
  return new Date(Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0), 5));
}

async function loadLabels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: SaleRow[],
) {
  const sellerIds = [...new Set(rows.map((row) => row.seller_id))];
  const customerIds = [...new Set(rows.flatMap((row) => (row.customer_id ? [row.customer_id] : [])))];
  const sessionIds = [...new Set(rows.flatMap((row) => (row.cash_session_id ? [row.cash_session_id] : [])))];

  const [profiles, customers, sessions] = await Promise.all([
    sellerIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", sellerIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? supabase.from("cash_sessions").select("id, status, opened_at, closed_at").in("id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profiles.error) throw new Error(`No se pudieron cargar los vendedores: ${profiles.error.message}`);
  if (customers.error) throw new Error(`No se pudieron cargar los clientes: ${customers.error.message}`);
  if (sessions.error) throw new Error(`No se pudieron cargar las cajas: ${sessions.error.message}`);

  return {
    profiles: new Map((profiles.data as ProfileRow[]).map((row) => [row.id, sellerName(row.display_name)])),
    customers: new Map((customers.data as CustomerRow[]).map((row) => [row.id, row.name])),
    sessions: new Map((sessions.data as CashSessionRow[]).map((row) => [row.id, row])),
  };
}

function toHistoryRow(
  row: SaleRow,
  labels: Awaited<ReturnType<typeof loadLabels>>,
): SaleHistoryRow {
  return {
    id: row.id,
    created_at: row.created_at,
    seller_name: labels.profiles.get(row.seller_id) ?? "Operador sin nombre",
    payment_method: row.payment_method,
    customer_name: row.customer_id ? labels.customers.get(row.customer_id) ?? "Cliente no encontrado" : null,
    total: asString(row.total),
    status: row.status,
    cash_session_status: row.cash_session_id ? labels.sessions.get(row.cash_session_id)?.status ?? null : null,
  };
}

export async function listSales(
  requestedPage = 1,
  requestedFilters: Partial<SalesHistoryFilters> = {},
): Promise<SaleHistoryPage> {
  await requireAdmin();
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters = normalizeSalesFilters(requestedFilters);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  let query = supabase
    .from("sales")
    .select("id, seller_id, payment_method, customer_id, cash_session_id, status, total, amount_received, amount_change, created_at", { count: "exact" });
  if (filters.from) query = query.gte("created_at", limaDateBoundary(filters.from, false).toISOString());
  if (filters.to) query = query.lt("created_at", limaDateBoundary(filters.to, true).toISOString());
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);

  const rows = (data ?? []) as SaleRow[];
  const labels = await loadLabels(supabase, rows);
  const total = count ?? 0;

  return {
    rows: rows.map((row) => toHistoryRow(row, labels)),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    filters,
  };
}

function parseFixed(value: string | number, decimals: number): bigint {
  const text = String(value);
  const [whole, fraction = ""] = text.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(padded || "0");
}

function formatScaledMoney(value: bigint, scale: number): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const factor = BigInt(10) ** BigInt(scale - 2);
  const cents = (absolute + factor / BigInt(2)) / factor;
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function historicalTotals(items: SaleItemRow[]) {
  const costScale = 5;
  const costTotal = items.reduce(
    (total, item) => total + parseFixed(item.unit_purchase_cost, 2) * parseFixed(item.quantity, 3),
    BigInt(0),
  );
  const revenueAtCostScale = items.reduce(
    (total, item) => total + parseFixed(item.line_subtotal, 2) * BigInt(1000),
    BigInt(0),
  );
  return {
    cost_total: formatScaledMoney(costTotal, costScale),
    gross_profit: formatScaledMoney(revenueAtCostScale - costTotal, costScale),
  };
}

export async function getSaleDetail(saleId: string): Promise<SaleHistoryDetail | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, seller_id, payment_method, customer_id, cash_session_id, status, total, amount_received, amount_change, created_at")
    .eq("id", saleId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la venta: ${error.message}`);
  if (!data) return null;

  const sale = data as SaleRow;
  const { data: itemData, error: itemError } = await supabase
    .from("sale_items")
    .select("id, product_name, unit_type, quantity, unit_purchase_cost, unit_selling_price, line_subtotal")
    .eq("sale_id", sale.id)
    .order("id", { ascending: true });
  if (itemError) throw new Error(`No se pudieron cargar los productos de la venta: ${itemError.message}`);

  const labels = await loadLabels(supabase, [sale]);
  const items = (itemData ?? []) as SaleItemRow[];
  const totals = historicalTotals(items);
  const session = sale.cash_session_id ? labels.sessions.get(sale.cash_session_id) ?? null : null;

  return {
    id: sale.id,
    created_at: sale.created_at,
    seller_name: labels.profiles.get(sale.seller_id) ?? "Operador sin nombre",
    status: sale.status,
    payment_method: sale.payment_method,
    total: asString(sale.total),
    amount_received: sale.amount_received === null ? null : asString(sale.amount_received),
    amount_change: sale.amount_change === null ? null : asString(sale.amount_change),
    customer_name: sale.customer_id ? labels.customers.get(sale.customer_id) ?? "Cliente no encontrado" : null,
    cash_session: session,
    items: items.map((item): SaleHistoryItem => ({
      id: item.id,
      product_name: item.product_name,
      unit_type: item.unit_type,
      quantity: asString(item.quantity),
      unit_purchase_cost: asString(item.unit_purchase_cost),
      unit_selling_price: asString(item.unit_selling_price),
      line_subtotal: asString(item.line_subtotal),
    })),
    ...totals,
  };
}

export { LIMA_TIME_ZONE };
