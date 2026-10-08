export type CashSessionMoney = string;

export type CurrentCashSession = {
  session_id: string;
  opened_at: string;
  opening_cash: CashSessionMoney;
  status: "OPEN";
};

export type CashSessionSummary = {
  session_id: string;
  opened_at: string;
  opening_cash: CashSessionMoney;
  cash_sales: CashSessionMoney;
  yape_sales: CashSessionMoney;
  credit_sales: CashSessionMoney;
  cash_debt_payments: CashSessionMoney;
  yape_debt_payments: CashSessionMoney;
  total_sales: CashSessionMoney;
  expected_cash: CashSessionMoney;
};

export type ClosedCashSession = {
  session_id: string;
  status: "CLOSED";
  opened_at: string;
  closed_at: string;
  opening_cash: CashSessionMoney;
  cash_sales: CashSessionMoney;
  yape_sales: CashSessionMoney;
  credit_sales: CashSessionMoney;
  cash_debt_payments: CashSessionMoney;
  yape_debt_payments: CashSessionMoney;
  total_sales: CashSessionMoney;
  expected_cash: CashSessionMoney;
  counted_cash: CashSessionMoney;
  difference: CashSessionMoney;
};

export type CashSessionState =
  | { kind: "NONE" }
  | { kind: "OPEN"; session: CurrentCashSession; summary: CashSessionSummary }
  | { kind: "CLOSED"; snapshot: ClosedCashSession };

export type CashActionResult =
  | { ok: true; state: CashSessionState }
  | { ok: false; error: string };

export type CloseCashActionResult =
  | { ok: true; snapshot: ClosedCashSession }
  | { ok: false; error: string };
