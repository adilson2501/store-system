export type PurchaseStatus = "CONFIRMED";
export type PurchaseUnitType = "UNIT" | "WEIGHT";

export type PurchaseHistoryFilters = {
  from: string;
  to: string;
  supplierId: string;
  search: string;
};

export type PurchaseHistoryRow = {
  id: string;
  purchase_date: string;
  created_at: string;
  supplier_name: string;
  reference: string | null;
  item_count: number;
  total: string;
  creator_name: string;
  status: PurchaseStatus;
};

export type PurchaseHistoryPage = {
  rows: PurchaseHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: PurchaseHistoryFilters;
};

export type PurchaseHistorySupplier = {
  id: string;
  name: string;
  ruc: string | null;
  active: boolean;
};

export type PurchaseHistoryItem = {
  id: string;
  product_name: string;
  unit_type: PurchaseUnitType;
  quantity: string;
  unit_purchase_cost: string;
  line_subtotal: string;
};

export type PurchaseHistoryDetail = {
  id: string;
  purchase_date: string;
  created_at: string;
  supplier_name: string;
  supplier_ruc: string | null;
  reference: string | null;
  status: PurchaseStatus;
  created_by_name: string;
  total: string;
  items: PurchaseHistoryItem[];
};
