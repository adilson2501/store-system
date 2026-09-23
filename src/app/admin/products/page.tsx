import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { AppHeader } from "@/components/app-header";
import { listProducts } from "@/features/catalog/products/queries";
import {
  formatMoneyPen,
  formatQuantity,
} from "@/features/catalog/products/validation";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireAdmin();
  const { q = "" } = await searchParams;
  const products = await listProducts(q);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Productos</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {products.length} {products.length === 1 ? "producto" : "productos"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/categories"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              Categorías
            </Link>
            <Link
              href="/admin/products/new"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Nuevo producto
            </Link>
          </div>
        </div>

        <form method="get" className="mb-4 flex max-w-md gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o código de barras"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Buscar
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Código de barras</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Costo</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-zinc-500">
                    {q
                      ? "Ningún producto coincide con tu búsqueda."
                      : "Aún no hay productos. Crea tu primer producto real."}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="border-b border-zinc-100">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {product.barcode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {product.category_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {product.unit_type === "WEIGHT" ? "kg" : "unidad"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatMoneyPen(product.purchase_cost)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatMoneyPen(product.selling_price)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatQuantity(product.stock_quantity, product.unit_type)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          product.is_active
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                            : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                        }
                      >
                        {product.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
