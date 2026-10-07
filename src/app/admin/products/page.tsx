import Link from "next/link";
import { PackageOpen, Plus, Search, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listProducts } from "@/features/catalog/products/queries";
import { formatMoneyPen, formatQuantity } from "@/features/catalog/products/validation";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const products = await listProducts(q);
  const hasSearch = Boolean(q);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Inventario</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Productos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Administra el catálogo, precios y existencias de tu tienda.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "producto" : "productos"}
            {hasSearch ? " encontrados" : " en el catálogo"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pt-6">
          <Link href="/admin/categories" className={cn(buttonVariants({ variant: "outline" }))}>
            <Tags aria-hidden="true" />
            Categorías
          </Link>
          <Link href="/admin/products/new" className={cn(buttonVariants(), "min-w-40")}>
            <Plus aria-hidden="true" />
            Nuevo producto
          </Link>
        </div>
      </header>

      <section aria-label="Buscar productos" className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <form method="get" className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
          <label htmlFor="product-search" className="sr-only">Buscar productos</label>
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="product-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o código de barras"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" className="sm:w-auto">Buscar</Button>
          {hasSearch ? (
            <Link href="/admin/products" className={cn(buttonVariants({ variant: "ghost" }), "sm:w-auto")}>
              Limpiar
            </Link>
          ) : null}
        </form>
      </section>

      {products.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center shadow-sm">
          <PackageOpen aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold text-foreground">
            {hasSearch ? "No encontramos productos" : "Aún no hay productos"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {hasSearch
              ? `Ningún producto coincide con “${q}”. Prueba con otro nombre o código de barras.`
              : "Crea el primer producto para comenzar a administrar tu catálogo."}
          </p>
          {hasSearch ? (
            <Link href="/admin/products" className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>
              Limpiar búsqueda
            </Link>
          ) : (
            <Link href="/admin/products/new" className={cn(buttonVariants(), "mt-5")}>
              <Plus aria-hidden="true" />
              Nuevo producto
            </Link>
          )}
        </section>
      ) : (
        <section aria-label="Catálogo de productos" className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[23%] pl-4">Nombre</TableHead>
                  <TableHead className="w-[16%]">Código de barras</TableHead>
                  <TableHead className="w-[16%]">Categoría</TableHead>
                  <TableHead className="w-[9%]">Unidad</TableHead>
                  <TableHead className="w-[11%] text-right">Costo</TableHead>
                  <TableHead className="w-[11%] text-right">Precio</TableHead>
                  <TableHead className="w-[9%] text-right">Stock</TableHead>
                  <TableHead className="w-[10%] pr-4">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="max-w-0 pl-4">
                      <Link href={`/admin/products/${product.id}`} className="block truncate font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{product.barcode ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{product.category_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{product.unit_type === "WEIGHT" ? "kg" : "unidad"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatMoneyPen(product.purchase_cost)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMoneyPen(product.selling_price)}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">{formatQuantity(product.stock_quantity, product.unit_type)}</TableCell>
                    <TableCell className="pr-4">
                      <Badge variant={product.is_active ? "success" : "secondary"}>
                        {product.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
