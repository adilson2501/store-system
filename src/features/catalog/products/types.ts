export type UnitType = "UNIT" | "WEIGHT";

export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  category_id: string | null;
  unit_type: UnitType;
  purchase_cost: string;
  selling_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  stock_quantity?: string | null;
};

export type ProductFormValues = {
  name: string;
  barcode: string;
  category_id: string;
  unit_type: UnitType;
  purchase_cost: string;
  selling_price: string;
  initial_stock: string;
  is_active: boolean;
};
