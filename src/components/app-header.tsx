import Link from "next/link";
import { logout } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/session";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight hover:text-zinc-900"
        >
          Sistema de Tienda
        </Link>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{user.email}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {user.role}
          </span>
          <Link href="/pos" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
            POS
          </Link>
          <Link href="/customers" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
            Clientes
          </Link>
          <Link href="/cash" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
            Caja
          </Link>
          {user.role === "ADMIN" ? (
            <>
              <Link href="/admin/customers" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
                Administración
              </Link>
              <Link href="/admin/sales" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
                Ventas
              </Link>
              <Link href="/admin/cash-sessions" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
                Historial de cajas
              </Link>
            </>
          ) : null}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
