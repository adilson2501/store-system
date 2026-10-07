import { requireAdmin } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/products/queries";
import { ProductForm } from "@/app/admin/products/product-form";

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await listCategories({ activeOnly: true });

  return (
    <div className="flex flex-col bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">Nuevo producto</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Registra un producto real de la tienda. El stock inicial es opcional.
        </p>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <ProductForm mode="create" categories={categories} />
        </div>
      </main>

    </div>
  );
}
