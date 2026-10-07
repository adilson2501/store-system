import type { UnitType } from "@/features/catalog/products/types";

export type PaymentMethod = "CASH" | "YAPE" | "CREDIT";

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: string;
  current_debt: string;
  available_credit: string;
  active: boolean;
  credit_enabled: boolean;
};

export type PosProduct = {
  id: string;
  name: string;
  barcode: string | null;
  unit_type: UnitType;
  selling_price: string;
  is_active: boolean;
  stock_quantity: string;
};

export type CartLine = PosProduct & {
  quantity: string;
};

export type ConfirmSaleInput = {
  client_key: string;
  cash_session_id: string;
  payment_method: PaymentMethod;
  items: ReadonlyArray<Readonly<{ product_id: string; quantity: string }>>;
  amount_received: string | null;
  customer_id: string | null;
};

export type ConfirmedSale = {
  sale_id: string;
  client_key: string;
  payment_method: PaymentMethod;
  status: "CONFIRMED";
  total: string;
  amount_received: string | null;
  amount_change: string | null;
  customer_id: string | null;
  created_at: string;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_type: UnitType;
    quantity: string;
    unit_selling_price: string;
    line_subtotal: string;
  }>;
};

export type ConfirmSaleFailureKind = "DEFINITIVE" | "UNKNOWN";

export type ConfirmSaleFailure = {
  ok: false;
  kind: ConfirmSaleFailureKind;
  code: string;
  error: string;
};

export type ConfirmSaleResult =
  | { ok: true; sale: ConfirmedSale }
  | ConfirmSaleFailure;
