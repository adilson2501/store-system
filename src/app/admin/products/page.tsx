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
            <h1 className="text-lg font-semibold">Products</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/categories"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              Categories
            </Link>
            <Link
              href="/admin/products/new"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              New product
            </Link>
          </div>
        </div>

        <form method="get" className="mb-4 flex max-w-md gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or barcode"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Search
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-zinc-500">
                    {q
                      ? "No products match your search."
                      : "No products yet. Create your first real product."}
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
                      {product.unit_type === "WEIGHT" ? "kg" : "unit"}
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
                        {product.is_active ? "Active" : "Inactive"}
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
