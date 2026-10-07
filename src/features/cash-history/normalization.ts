import type { CashHistorySession } from "./types";

export type CashHistorySessionRow = {
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

export type CashHistorySummaryRow = {
  session_id: string;
  operator_id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
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

export function normalizeCashHistoryRow(
  row: CashHistorySessionRow,
  summary: CashHistorySummaryRow,
  operatorName: string,
): CashHistorySession {
  return {
    session_id: summary.session_id,
    operator_id: summary.operator_id,
    operator_name: operatorName,
    status: summary.status,
    opened_at: summary.opened_at,
    closed_at: summary.closed_at,
    opening_cash: String(summary.opening_cash),
    cash_sales: String(summary.cash_sales),
    yape_sales: String(summary.yape_sales),
    credit_sales: String(summary.credit_sales),
    cash_debt_payments: String(summary.cash_debt_payments),
    yape_debt_payments: String(summary.yape_debt_payments),
    total_sales: String(summary.total_sales),
    expected_cash: money(summary.expected_cash ?? (summary.status === "CLOSED" ? row.expected_cash_at_close : null)),
    counted_cash: money(summary.counted_cash ?? (summary.status === "CLOSED" ? row.counted_cash : null)),
    difference: money(summary.difference ?? (summary.status === "CLOSED" ? row.difference : null)),
  };
}
