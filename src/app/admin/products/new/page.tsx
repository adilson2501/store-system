import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/products/queries";
import { ProductForm } from "@/app/admin/products/product-form";

export default async function NewProductPage() {
  const user = await requireAdmin();
  const categories = await listCategories({ activeOnly: true });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-zinc-900"
          >
            Sistema de Tienda
          </Link>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Volver a productos
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">Nuevo producto</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Registra un producto real de la tienda. El stock inicial es opcional.
        </p>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <ProductForm mode="create" categories={categories} />
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
