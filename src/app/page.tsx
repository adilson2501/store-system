export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
          <span className="text-sm font-semibold tracking-tight">
            Store System
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">Store System</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Application foundation is running.
          </p>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-zinc-400">
          Milestone 1 — foundation
        </div>
      </footer>
    </div>
  );
}
