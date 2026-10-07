import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CashHistoryPage, CashHistorySession } from "@/features/cash-history/types";
import {
  normalizeCashHistoryRow,
  type CashHistorySessionRow,
  type CashHistorySummaryRow,
} from "@/features/cash-history/normalization";

const PAGE_SIZE = 20;

type SessionRow = CashHistorySessionRow;
type SummaryRow = CashHistorySummaryRow;

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

async function loadSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionIds: string[],
): Promise<Map<string, SummaryRow>> {
  const results = await Promise.all(sessionIds.map(async (sessionId) => {
    const { data, error } = await supabase.rpc("get_admin_cash_session_summary", {
      p_session_id: sessionId,
    });
    if (error) throw new Error(`No se pudo cargar el resumen de la caja: ${error.message}`);
    const summary = ((data ?? []) as SummaryRow[])[0];
    if (!summary) throw new Error("No se pudo cargar el resumen de la caja.");
    return summary;
  }));
  return new Map(results.map((summary) => [summary.session_id, summary]));
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
  const summaries = await loadSummaries(supabase, rows.map((row) => row.id));
  const total = count ?? 0;
  return {
    rows: rows.map((row) => normalizeCashHistoryRow(
      row,
      summaries.get(row.id)!,
      names.get(row.operator_id) ?? "Operador sin nombre",
    )),
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
    expected_cash: row.expected_cash === null ? null : String(row.expected_cash),
    counted_cash: row.counted_cash === null ? null : String(row.counted_cash),
    difference: row.difference === null ? null : String(row.difference),
  };
}
