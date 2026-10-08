import Link from "next/link";
import { BarChart3, Boxes, CreditCard, Package, ShoppingCart, Users, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { getSalesReport } from "@/features/sales-reports/queries";
import { normalizeReportPeriod } from "@/features/sales-reports/periods";
import { formatMoney } from "@/features/pos/money";
import { createClient } from "@/lib/supabase/server";

const quickLinks = [
  { href: "/admin/products", label: "Productos", description: "Catálogo e inventario", icon: Package },
  { href: "/admin/purchases", label: "Compras", description: "Entradas de mercancía", icon: Boxes },
  { href: "/admin/sales", label: "Ventas", description: "Historial administrativo", icon: ShoppingCart },
  { href: "/admin/cash-sessions", label: "Cajas", description: "Sesiones y cierres", icon: WalletCards },
  { href: "/admin/reports", label: "Reportes", description: "Análisis por periodo", icon: BarChart3 },
  { href: "/admin/customers", label: "Clientes", description: "Clientes y crédito", icon: CreditCard },
];

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles, error }, normalized] = await Promise.all([
    supabase.from("profiles").select("id, role, display_name, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }),
    Promise.resolve(normalizeReportPeriod("today", undefined, undefined)),
  ]);
  let todayReport: Awaited<ReturnType<typeof getSalesReport>> | null = null;
  let todayReportError: string | null = "error" in normalized ? normalized.error : null;
  if (!todayReportError && !("error" in normalized)) {
    try {
      todayReport = await getSalesReport(normalized.start, normalized.end);
    } catch {
      todayReportError = "No se pudo cargar el resumen de ventas de hoy. Consulta Reportes para volver a intentar.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header><p className="text-sm font-medium text-primary">Store System</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Administración</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Orientación rápida para gestionar el catálogo, las operaciones y el control administrativo.</p></header>

      {todayReport ? <section aria-labelledby="today-summary"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="today-summary" className="text-base font-semibold">Resumen de hoy</h2><p className="text-sm text-muted-foreground">Valores confirmados del reporte de ventas.</p></div><Link href="/admin/reports?period=today" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Ver reporte</Link></div><div className="grid gap-3 sm:grid-cols-3"><Card><div className="p-5"><p className="text-sm text-muted-foreground">Total vendido</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(todayReport.kpis.total_sold)}</p></div></Card><Card><div className="p-5"><p className="text-sm text-muted-foreground">Ventas confirmadas</p><p className="mt-2 text-xl font-semibold tabular-nums">{todayReport.kpis.sale_count}</p></div></Card><Card><div className="p-5"><p className="text-sm text-muted-foreground">Ganancia bruta estimada</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(todayReport.kpis.gross_profit)}</p></div></Card></div></section> : <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{todayReportError ?? "No se pudo cargar el resumen de ventas de hoy."}</div>}

      <section aria-labelledby="quick-access"><div className="mb-3"><h2 id="quick-access" className="text-base font-semibold">Accesos administrativos</h2><p className="text-sm text-muted-foreground">Continúa con la tarea que necesitas resolver.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{quickLinks.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} className="group rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-4"><span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span><span className="text-sm font-semibold text-muted-foreground transition-colors group-hover:text-primary">Abrir</span></div><p className="mt-5 font-semibold">{label}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></Link>)}</div></section>

      <Card><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2 text-base"><Users aria-hidden="true" className="size-4 text-primary" />Perfiles administrativos</CardTitle><CardDescription>Visibilidad actual de perfiles bajo las políticas RLS.</CardDescription></CardHeader>{error ? <p className="px-6 py-5 text-sm text-destructive" role="alert">No se pudo cargar la lista de perfiles.</p> : (profiles ?? []).length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">No se encontraron perfiles.</p> : <div className="overflow-x-auto"><Table className="min-w-[680px]"><TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent"><TableHead className="pl-4">ID</TableHead><TableHead>Rol</TableHead><TableHead>Nombre</TableHead><TableHead className="pr-4">Creado</TableHead></TableRow></TableHeader><TableBody>{(profiles ?? []).map((profile) => <TableRow key={profile.id}><TableCell className="pl-4 font-mono text-xs text-muted-foreground">{profile.id}</TableCell><TableCell><Badge variant="secondary">{profile.role}</Badge></TableCell><TableCell>{profile.display_name ?? "—"}</TableCell><TableCell className="whitespace-nowrap pr-4 text-muted-foreground">{new Date(profile.created_at).toLocaleString("es-PE")}</TableCell></TableRow>)}</TableBody></Table></div>}</Card>
    </div>
  );
}
