import Link from "next/link";
import { BarChart3, CalendarDays, Filter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { getSalesReport } from "@/features/sales-reports/queries";
import { normalizeReportPeriod } from "@/features/sales-reports/periods";
import type { ReportPeriod } from "@/features/sales-reports/types";
import { formatMoney } from "@/features/pos/money";

const periodLabels: Record<ReportPeriod, string> = { today: "Hoy", week: "Esta semana", month: "Este mes", custom: "Personalizado" };

function query(period: ReportPeriod): string {
  return `?period=${period}`;
}

function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function MetricCard({ label, value, description, tone = "default" }: { label: string; value: string; description: string; tone?: "default" | "success" | "warning" }) {
  return <Card className={tone === "success" ? "border-success/30" : tone === "warning" ? "border-warning/40" : undefined}><div className="p-5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></Card>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const requested = params.period === "week" || params.period === "month" || params.period === "custom" ? params.period : "today";
  const normalized = normalizeReportPeriod(requested, params.from, params.to);
  let report: Awaited<ReturnType<typeof getSalesReport>> | null = null;
  let error: string | null = "error" in normalized ? normalized.error : null;
  if (!error && !("error" in normalized)) {
    try {
      report = await getSalesReport(normalized.start, normalized.end);
    } catch {
      error = "No se pudo cargar el reporte de ventas. Intenta nuevamente.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-primary">Ventas y control</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Reportes</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Analiza ventas confirmadas por periodo. La ganancia bruta estimada no incluye gastos operativos.</p></div>
        <Link href="/admin/sales" className={cn(buttonVariants({ variant: "outline" }), "sm:mt-6")}><BarChart3 aria-hidden="true" />Historial de ventas</Link>
      </header>

      <Card><CardHeader className="border-b border-border pb-4"><CardTitle className="flex items-center gap-2 text-base"><Filter aria-hidden="true" className="size-4 text-primary" />Periodo del reporte</CardTitle><CardDescription>Los límites del periodo respetan el calendario de America/Lima.</CardDescription><nav className="flex flex-wrap gap-2 pt-2" aria-label="Periodo del reporte">{(Object.keys(periodLabels) as ReportPeriod[]).map((period) => <Link key={period} href={query(period)} aria-current={requested === period ? "page" : undefined} className={cn(buttonVariants({ variant: requested === period ? "default" : "outline", size: "sm" }))}>{period === "today" ? <CalendarDays aria-hidden="true" /> : null}{periodLabels[period]}</Link>)}</nav></CardHeader>{requested === "custom" ? <div className="border-b border-border px-6 py-4"><form className="flex flex-wrap items-end gap-3" method="get"><input type="hidden" name="period" value="custom" /><label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Desde</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="date" name="from" defaultValue={params.from} required /></label><label className="grid min-w-40 gap-1 text-sm"><span className="text-xs font-medium text-muted-foreground">Hasta</span><input className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="date" name="to" defaultValue={params.to} required /></label><Button type="submit">Aplicar periodo</Button></form></div> : null}</Card>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div> : null}
      {report ? <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Indicadores de ventas"><MetricCard label="Total vendido" value={formatMoney(report.kpis.total_sold)} description="Ventas confirmadas del periodo" tone="success" /><MetricCard label="N.º de ventas" value={String(report.kpis.sale_count)} description="Operaciones confirmadas" /><MetricCard label="Efectivo" value={formatMoney(report.kpis.cash)} description="Cobro por método efectivo" /><MetricCard label="Yape" value={formatMoney(report.kpis.yape)} description="Cobro por método Yape" /><MetricCard label="Fiado" value={formatMoney(report.kpis.credit)} description="Ventas a crédito, no efectivo" tone="warning" /><MetricCard label="Ganancia bruta estimada" value={formatMoney(report.kpis.gross_profit)} description="Basada en costos históricos" tone="success" /></section>
        <Card><CardHeader className="border-b border-border"><CardTitle className="text-base">Ventas por día</CardTitle><CardDescription>Desglose del periodo seleccionado por fecha de negocio.</CardDescription></CardHeader>{report.daily.length === 0 ? <p className="px-6 py-12 text-center text-sm text-muted-foreground">No hay ventas confirmadas en este periodo.</p> : <div className="overflow-x-auto"><Table className="min-w-[680px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">Fecha</TableHead><TableHead className="text-right">N.º ventas</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="pr-4 text-right">Ganancia bruta estimada</TableHead></TableRow></TableHeader><TableBody>{report.daily.map((row) => <TableRow key={row.business_date}><TableCell className="whitespace-nowrap pl-4">{formatReportDate(row.business_date)}</TableCell><TableCell className="text-right tabular-nums">{row.sale_count}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatMoney(row.total_sold)}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{formatMoney(row.gross_profit)}</TableCell></TableRow>)}</TableBody></Table></div>}</Card>
      </> : null}
    </div>
  );
}
