import { logout } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/session";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <span className="text-sm font-semibold tracking-tight">
          Store System
        </span>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{user.email}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {user.role}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
