export type SalePaymentMethod = "CASH" | "YAPE" | "CREDIT";
export type SaleStatus = "CONFIRMED" | "VOIDED";
export type SaleUnitType = "UNIT" | "WEIGHT";

export type SalesHistoryFilters = {
  from: string;
  to: string;
  paymentMethod: SalePaymentMethod | "";
  status: SaleStatus | "";
};

export type SaleHistoryRow = {
  id: string;
  created_at: string;
  seller_name: string;
  payment_method: SalePaymentMethod;
  customer_name: string | null;
  total: string;
  status: SaleStatus;
  cash_session_status: "OPEN" | "CLOSED" | null;
};

export type SaleHistoryPage = {
  rows: SaleHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: SalesHistoryFilters;
};

export type SaleHistoryItem = {
  id: string;
  product_name: string;
  unit_type: SaleUnitType;
  quantity: string;
  unit_purchase_cost: string;
  unit_selling_price: string;
  line_subtotal: string;
};

export type SaleHistoryDetail = {
  id: string;
  created_at: string;
  seller_name: string;
  status: SaleStatus;
  payment_method: SalePaymentMethod;
  total: string;
  amount_received: string | null;
  amount_change: string | null;
  customer_name: string | null;
  cash_session: {
    status: "OPEN" | "CLOSED";
    opened_at: string;
    closed_at: string | null;
  } | null;
  items: SaleHistoryItem[];
  cost_total: string;
  gross_profit: string;
};
