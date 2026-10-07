import "server-only";

import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SalesReport } from "./types";

export async function getSalesReport(start: Date, end: Date): Promise<SalesReport> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_sales_report", {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  if (error) throw new Error("No se pudo cargar el reporte de ventas.");

  const result = data as Partial<SalesReport> | null;
  const kpis = result?.kpis;
  return {
    kpis: {
      total_sold: String(kpis?.total_sold ?? "0.00"),
      sale_count: Number(kpis?.sale_count ?? 0),
      cash: String(kpis?.cash ?? "0.00"),
      yape: String(kpis?.yape ?? "0.00"),
      credit: String(kpis?.credit ?? "0.00"),
      gross_profit: String(kpis?.gross_profit ?? "0.00"),
    },
    daily: Array.isArray(result?.daily) ? result.daily.map((row) => ({
      business_date: String(row.business_date),
      sale_count: Number(row.sale_count),
      total_sold: String(row.total_sold),
      gross_profit: String(row.gross_profit),
    })) : [],
  };
}
