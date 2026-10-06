import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CashHistoryPage, CashHistorySession } from "@/features/cash-history/types";

const PAGE_SIZE = 20;

type SessionRow = {
  id: string;
  operator_id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  opening_cash: string | number;
  expected_cash_at_close: string | number | null;
  counted_cash: string | number | null;
  difference: string | number | null;
};

type SummaryRow = Omit<SessionRow, "id" | "expected_cash_at_close" | "counted_cash" | "difference"> & {
  session_id: string;
  opening_cash: string | number;
  cash_sales: string | number;
  yape_sales: string | number;
  credit_sales: string | number;
  cash_debt_payments: string | number;
  yape_debt_payments: string | number;
  total_sales: string | number;
  expected_cash: string | number | null;
  counted_cash: string | number | null;
  difference: string | number | null;
};

function money(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

function operatorName(displayName: string | null | undefined): string {
  return displayName?.trim() || "Operador sin nombre";
}

async function profileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  operatorIds: string[],
) {
  if (operatorIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", operatorIds);
  if (error) throw new Error(`No se pudieron cargar los operadores: ${error.message}`);
  return new Map((data ?? []).map((profile) => [profile.id, operatorName(profile.display_name)]));
}

function toHistoryRow(row: SessionRow, names: Map<string, string>): CashHistorySession {
  return {
    session_id: row.id,
    operator_id: row.operator_id,
    operator_name: names.get(row.operator_id) ?? "Operador sin nombre",
    status: row.status,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    opening_cash: String(row.opening_cash),
    cash_sales: "0.00",
    yape_sales: "0.00",
    credit_sales: "0.00",
    cash_debt_payments: "0.00",
    yape_debt_payments: "0.00",
    total_sales: "0.00",
    expected_cash: row.status === "CLOSED" ? money(row.expected_cash_at_close) : null,
    counted_cash: row.status === "CLOSED" ? money(row.counted_cash) : null,
    difference: row.status === "CLOSED" ? money(row.difference) : null,
  };
}

export async function listCashSessions(requestedPage = 1): Promise<CashHistoryPage> {
  await requireAdmin();
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("cash_sessions")
    .select("id, operator_id, status, opened_at, closed_at, opening_cash, expected_cash_at_close, counted_cash, difference", { count: "exact" })
    .order("opened_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`No se pudieron cargar las cajas: ${error.message}`);

  const rows = (data ?? []) as SessionRow[];
  const names = await profileNames(supabase, [...new Set(rows.map((row) => row.operator_id))]);
  const total = count ?? 0;
  return {
    rows: rows.map((row) => toHistoryRow(row, names)),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getCashSessionHistoryDetail(sessionId: string): Promise<CashHistorySession | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_cash_session_summary", {
    p_session_id: sessionId,
  });
  if (error) {
    if (error.message.includes("Cash session not found")) return null;
    throw new Error(`No se pudo cargar la caja: ${error.message}`);
  }
  const row = ((data ?? []) as SummaryRow[])[0];
  if (!row) return null;
  const names = await profileNames(supabase, [row.operator_id]);
  return {
    session_id: row.session_id,
    operator_id: row.operator_id,
    operator_name: names.get(row.operator_id) ?? "Operador sin nombre",
    status: row.status,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    opening_cash: String(row.opening_cash),
    cash_sales: String(row.cash_sales),
    yape_sales: String(row.yape_sales),
    credit_sales: String(row.credit_sales),
    cash_debt_payments: String(row.cash_debt_payments),
    yape_debt_payments: String(row.yape_debt_payments),
    total_sales: String(row.total_sales),
    expected_cash: money(row.expected_cash),
    counted_cash: money(row.counted_cash),
    difference: money(row.difference),
  };
}
