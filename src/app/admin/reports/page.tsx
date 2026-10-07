import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { getSalesReport } from "@/features/sales-reports/queries";
import { normalizeReportPeriod } from "@/features/sales-reports/periods";
import type { ReportPeriod } from "@/features/sales-reports/types";
import { formatMoney } from "@/features/pos/money";

const periodLabels: Record<ReportPeriod, string> = { today: "Hoy", week: "Esta semana", month: "Este mes", custom: "Personalizado" };

function query(period: ReportPeriod): string {
  return `?period=${period}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const requested = params.period === "week" || params.period === "month" || params.period === "custom" ? params.period : "today";
  const normalized = normalizeReportPeriod(requested, params.from, params.to);
  const report = "error" in normalized ? null : await getSalesReport(normalized.start, normalized.end).catch(() => null);
  const error = "error" in normalized ? normalized.error : report ? null : "No se pudo cargar el reporte de ventas. Intenta nuevamente.";

  return (
    <div className="flex flex-col bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6"><h1 className="text-lg font-semibold">Reportes de ventas</h1><p className="mt-1 text-sm text-zinc-500">Resumen de ventas confirmadas. La ganancia bruta estimada no incluye gastos operativos.</p></div>
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Periodo del reporte">{(Object.keys(periodLabels) as ReportPeriod[]).map((period) => <Link key={period} href={period === "custom" ? query(period) : query(period)} className={`rounded-md border px-4 py-2 text-sm font-semibold ${requested === period ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{periodLabels[period]}</Link>)}</nav>
        {requested === "custom" ? <form className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4" method="get"><input type="hidden" name="period" value="custom" /><label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Desde</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="from" defaultValue={params.from} required /></label><label className="grid gap-1 text-sm"><span className="text-xs font-medium text-zinc-500">Hasta</span><input className="rounded-md border border-zinc-300 px-3 py-2" type="date" name="to" defaultValue={params.to} required /></label><button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700" type="submit">Aplicar</button></form> : null}
        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
        {report ? <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Indicadores de ventas">
            {[["Total vendido", report.kpis.total_sold], ["N.º de ventas", String(report.kpis.sale_count)], ["Efectivo", report.kpis.cash], ["Yape", report.kpis.yape], ["Fiado", report.kpis.credit], ["Ganancia bruta estimada", report.kpis.gross_profit]].map(([label, value]) => <div className="rounded-lg border border-zinc-200 bg-white p-4" key={label}><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{label === "N.º de ventas" ? value : formatMoney(value)}</p></div>)}
          </section>
          <section className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-4"><h2 className="font-semibold">Ventas por día</h2></div>{report.daily.length === 0 ? <p className="px-4 py-10 text-center text-sm text-zinc-500">No hay ventas confirmadas en este periodo.</p> : <table className="min-w-[680px] w-full text-left text-sm"><thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 font-medium">N.º ventas</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Ganancia bruta estimada</th></tr></thead><tbody>{report.daily.map((row) => <tr className="border-b border-zinc-100 last:border-0" key={row.business_date}><td className="px-4 py-3">{row.business_date}</td><td className="px-4 py-3 tabular-nums">{row.sale_count}</td><td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(row.total_sold)}</td><td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(row.gross_profit)}</td></tr>)}</tbody></table>}</section>
        </> : null}
      </main>
    </div>
  );
}
