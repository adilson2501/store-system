import { describe, expect, it } from "vitest";
import { normalizeCashHistoryRow } from "../normalization";

describe("cash history normalization", () => {
  it("uses the authoritative summary for list values", () => {
    const row = normalizeCashHistoryRow(
      {
        id: "session-1",
        operator_id: "operator-1",
        status: "CLOSED",
        opened_at: "2026-10-07T15:00:00Z",
        closed_at: "2026-10-07T23:00:00Z",
        opening_cash: "10.00",
        expected_cash_at_close: "13.00",
        counted_cash: "13.50",
        difference: "0.50",
      },
      {
        session_id: "session-1",
        operator_id: "operator-1",
        status: "CLOSED",
        opened_at: "2026-10-07T15:00:00Z",
        closed_at: "2026-10-07T23:00:00Z",
        opening_cash: "10.00",
        cash_sales: "2.00",
        yape_sales: "2.00",
        credit_sales: "2.00",
        cash_debt_payments: "1.00",
        yape_debt_payments: "0.00",
        total_sales: "6.00",
        expected_cash: "13.00",
        counted_cash: "13.50",
        difference: "0.50",
      },
      "Operador",
    );

    expect(row).toMatchObject({
      opening_cash: "10.00",
      cash_sales: "2.00",
      yape_sales: "2.00",
      credit_sales: "2.00",
      cash_debt_payments: "1.00",
      total_sales: "6.00",
      expected_cash: "13.00",
      counted_cash: "13.50",
      difference: "0.50",
    });
  });
});
