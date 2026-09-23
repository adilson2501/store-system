import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { AppHeader } from "@/components/app-header";
import { listCategories } from "@/features/catalog/products/queries";
import {
  CategoryCreateForm,
  CategoryRow,
} from "@/app/admin/categories/category-forms";

export default async function CategoriesPage() {
  const user = await requireAdmin();
  const categories = await listCategories();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Categorías</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Etiquetas opcionales para organizar productos.
            </p>
          </div>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Volver a productos
          </Link>
        </div>

        <CategoryCreateForm />

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {categories.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              Aún no hay categorías.
            </p>
          ) : (
            categories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
