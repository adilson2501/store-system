export type CashHistorySession = {
  session_id: string;
  operator_id: string;
  operator_name: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  cash_sales: string;
  yape_sales: string;
  credit_sales: string;
  cash_debt_payments: string;
  yape_debt_payments: string;
  total_sales: string;
  expected_cash: string | null;
  counted_cash: string | null;
  difference: string | null;
};

export type CashHistoryPage = {
  rows: CashHistorySession[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
