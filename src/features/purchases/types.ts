import type { PosProduct } from "@/features/pos/types";

export type PurchaseLine = {
  product: PosProduct;
  entryMode: "UNIT" | "PACKAGE";
  quantity: string;
  unitPurchaseCost: string;
  packageQuantity: string;
  unitsPerPackage: string;
  packageCost: string;
};

export type ConfirmPurchaseItem = {
  product_id: string;
  quantity: string;
  unit_purchase_cost: string;
};

export type ConfirmPurchaseInput = {
  client_key: string;
  supplier_id: string;
  purchase_date: string;
  reference: string;
  items: ConfirmPurchaseItem[];
};

export type ConfirmedPurchase = {
  purchase_id: string;
  client_key: string;
  supplier_id: string;
  purchase_date: string;
  status: "CONFIRMED";
  reference: string | null;
  total: string | number;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_type: "UNIT" | "WEIGHT";
    quantity: string | number;
    unit_purchase_cost: string | number;
    line_subtotal: string | number;
  }>;
};
