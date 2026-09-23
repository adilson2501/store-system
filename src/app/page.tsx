import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8">
          <h1 className="text-xl font-semibold">Sesión iniciada</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Bienvenido/a
            {user.displayName ? `, ${user.displayName}` : ""}. Has iniciado
            sesión como{" "}
            <span className="font-medium text-zinc-700">{user.role}</span>.
          </p>

          {user.role === "ADMIN" ? (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/admin/products"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Productos
              </Link>
              <Link
                href="/admin/categories"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Categorías
              </Link>
              <Link
                href="/admin"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Administración
              </Link>
            </div>
          ) : null}
          <div className="mt-6 flex justify-center">
            <Link
              href="/pos"
              className="rounded-md bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              Ir al POS
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-zinc-400">
          Hito 1 — autenticación y roles
        </div>
      </footer>
    </div>
  );
}
