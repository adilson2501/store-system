import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";

export default async function AdminPage() {
  const user = await requireAdmin();

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">Administración</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Perfiles visibles bajo RLS (ADMIN ve todos).
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Correo / ID</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Creado</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-red-600">
                    {error.message}
                  </td>
                </tr>
              ) : (profiles ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-zinc-500">
                    No se encontraron perfiles.
                  </td>
                </tr>
              ) : (
                (profiles ?? []).map((profile) => (
                  <tr key={profile.id} className="border-b border-zinc-100">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {profile.id}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium">
                        {profile.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {profile.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(profile.created_at).toLocaleString()}
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
