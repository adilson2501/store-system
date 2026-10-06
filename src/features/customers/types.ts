export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  credit_limit: string;
  credit_enabled: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  current_debt: string;
  available_credit: string;
};

export type CustomerLedgerEntry = {
  id: string;
  movement_type: "CREDIT_SALE" | "PAYMENT";
  amount: string;
  sale_id: string | null;
  payment_method: "CASH" | "YAPE" | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};
