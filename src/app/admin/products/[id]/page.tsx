import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import {
  getProduct,
  listCategories,
} from "@/features/catalog/products/queries";
import {
  formatMoneyPen,
  formatQuantity,
} from "@/features/catalog/products/validation";
import { ProductForm } from "@/app/admin/products/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;

  const product = await getProduct(id);
  if (!product) {
    notFound();
  }

  const categories = await listCategories({ activeOnly: true });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <span className="text-sm font-semibold tracking-tight">
            Sistema de Tienda
          </span>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Volver a productos
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">{product.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Stock actual:{" "}
            <span className="font-medium text-zinc-800">
              {formatQuantity(product.stock_quantity, product.unit_type)}{" "}
              {product.unit_type === "WEIGHT" ? "kg" : "unidades"}
            </span>
            {" · "}
            {formatMoneyPen(product.selling_price)}
            {product.is_active ? "" : " · Inactivo"}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Los cambios de stock (compras, ajustes) vendrán después. El stock
            inicial se configura solo al crear el producto en este hito.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <ProductForm
            mode="edit"
            productId={product.id}
            categories={categories}
            defaultValues={{
              name: product.name,
              barcode: product.barcode ?? "",
              category_id: product.category_id ?? "",
              unit_type: product.unit_type,
              purchase_cost: product.purchase_cost,
              selling_price: product.selling_price,
              initial_stock: "",
              is_active: product.is_active,
            }}
          />
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 text-xs text-zinc-400">
          Sesión iniciada como {user.email}
        </div>
      </footer>
    </div>
  );
}
