export type Supplier = {
  id: string;
  name: string;
  ruc: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierPage = {
  rows: Supplier[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
};
