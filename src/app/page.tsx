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
          <h1 className="text-xl font-semibold">Signed in</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Welcome
            {user.displayName ? `, ${user.displayName}` : ""}. You are signed
            in as{" "}
            <span className="font-medium text-zinc-700">{user.role}</span>.
          </p>

          {user.role === "ADMIN" ? (
            <Link
              href="/admin"
              className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Admin area
            </Link>
          ) : null}
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-zinc-400">
          Milestone 1 — auth &amp; roles
        </div>
      </footer>
    </div>
  );
}
