"use server";

import { requireUser } from "@/features/auth/session";
import { parseCents } from "@/features/pos/money";
import { createClient } from "@/lib/supabase/server";
import type {
  CashActionResult,
  CashSessionState,
  CloseCashActionResult,
  ClosedCashSession,
  CurrentCashSession,
  CashSessionSummary,
} from "@/features/cash/types";

type CurrentSessionRow = {
  session_id: string;
  opened_at: string;
  opening_cash: string | number;
  status: "OPEN";
};

type SummaryRow = CurrentSessionRow & {
  cash_sales: string | number;
  yape_sales: string | number;
  credit_sales: string | number;
  cash_debt_payments: string | number;
  yape_debt_payments: string | number;
  total_sales: string | number;
  expected_cash: string | number;
};

function money(value: string | number): string {
  return String(value);
}

function mapError(raw: string): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (message.includes("Authentication required")) return "Autenticación requerida.";
  if (message.includes("Cash session access requires")) return "No tienes acceso a la caja.";
  if (message.includes("Opening cash must be")) return "El monto inicial debe ser cero o mayor, con máximo 2 decimales.";
  if (message.includes("Counted cash must be")) return "El efectivo contado debe ser cero o mayor, con máximo 2 decimales.";
  if (message.includes("Operator already has")) return "Ya tienes una caja abierta.";
  if (message.includes("Open session idempotency conflict")) return "La apertura ya fue usada con otros datos.";
  if (message.includes("Close session idempotency conflict")) return "El cierre ya fue usado con otros datos.";
  if (message.includes("Cash session is already closed")) return "Esta caja ya fue cerrada.";
  if (message.includes("Only the session operator")) return "Solo el operador de la caja puede cerrarla.";
  if (message.includes("Cash session not found")) return "No se encontró la sesión de caja.";
  return message || "No se pudo completar la operación de caja.";
}

function normalizeCurrent(row: CurrentSessionRow): CurrentCashSession {
  return {
    session_id: row.session_id,
    opened_at: row.opened_at,
    opening_cash: money(row.opening_cash),
    status: "OPEN",
  };
}

function normalizeSummary(row: SummaryRow): CashSessionSummary {
  return {
    session_id: row.session_id,
    opened_at: row.opened_at,
    opening_cash: money(row.opening_cash),
    cash_sales: money(row.cash_sales),
    yape_sales: money(row.yape_sales),
    credit_sales: money(row.credit_sales),
    cash_debt_payments: money(row.cash_debt_payments),
    yape_debt_payments: money(row.yape_debt_payments),
    total_sales: money(row.total_sales),
    expected_cash: money(row.expected_cash),
  };
}

function normalizeClosed(row: Record<string, unknown>): ClosedCashSession {
  return {
    session_id: String(row.session_id),
    status: "CLOSED",
    opened_at: String(row.opened_at),
    closed_at: String(row.closed_at),
    opening_cash: money(row.opening_cash as string | number),
    cash_sales: money(row.cash_sales as string | number),
    yape_sales: money(row.yape_sales as string | number),
    credit_sales: money(row.credit_sales as string | number),
    cash_debt_payments: money(row.cash_debt_payments as string | number),
    yape_debt_payments: money(row.yape_debt_payments as string | number),
    total_sales: money(row.total_sales as string | number),
    expected_cash: money(row.expected_cash as string | number),
    counted_cash: money(row.counted_cash as string | number),
    difference: money(row.difference as string | number),
  };
}

async function loadCurrentState(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CashSessionState> {
  const { data: sessionData, error: sessionError } = await supabase.rpc("get_current_cash_session");
  if (sessionError) throw new Error(sessionError.message);

  const sessionRow = ((sessionData ?? []) as CurrentSessionRow[])[0];
  if (!sessionRow) return { kind: "NONE" };

  const { data: summaryData, error: summaryError } = await supabase.rpc("get_current_cash_session_summary");
  if (summaryError) throw new Error(summaryError.message);

  const summaryRow = ((summaryData ?? []) as SummaryRow[])[0];
  if (!summaryRow) throw new Error("Current cash session summary not found");

  return {
    kind: "OPEN",
    session: normalizeCurrent(sessionRow),
    summary: normalizeSummary(summaryRow),
  };
}

export async function getCurrentCashSessionState(): Promise<CashSessionState> {
  await requireUser();
  try {
    return await loadCurrentState(await createClient());
  } catch (error) {
    console.error(error);
    throw new Error("No se pudo cargar la caja.");
  }
}

export async function openCashSession(input: {
  clientKey: string;
  openingCash: string;
}): Promise<CashActionResult> {
  await requireUser();
  const cents = parseCents(input.openingCash);
  if (cents === null || cents < BigInt(0)) {
    return { ok: false, error: "El monto inicial debe ser cero o mayor, con máximo 2 decimales." };
  }
  if (!input.clientKey) return { ok: false, error: "No se pudo preparar la clave de apertura." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("open_cash_session", {
      p_client_key: input.clientKey,
      p_opening_cash: input.openingCash,
    });
    if (error) return { ok: false, error: mapError(error.message) };
    return { ok: true, state: await loadCurrentState(supabase) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "No se pudo abrir la caja. Intenta nuevamente." };
  }
}

export async function closeCashSession(input: {
  sessionId: string;
  clientKey: string;
  countedCash: string;
}): Promise<CloseCashActionResult> {
  await requireUser();
  const cents = parseCents(input.countedCash);
  if (cents === null || cents < BigInt(0)) {
    return { ok: false, error: "El efectivo contado debe ser cero o mayor, con máximo 2 decimales." };
  }
  if (!input.sessionId || !input.clientKey) {
    return { ok: false, error: "No se pudo preparar el cierre de caja." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_cash_session", {
      p_session_id: input.sessionId,
      p_close_client_key: input.clientKey,
      p_counted_cash: input.countedCash,
    });
    if (error) return { ok: false, error: mapError(error.message) };
    return { ok: true, snapshot: normalizeClosed((data ?? {}) as Record<string, unknown>) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "No se pudo cerrar la caja. Intenta nuevamente." };
  }
}
