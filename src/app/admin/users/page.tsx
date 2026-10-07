import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/features/auth/session";
import { listManagedUsers, listUserManagementEvents } from "@/features/users/queries";
import { CreateUserForm, UserRow } from "@/app/admin/users/user-management";

export default async function UsersPage() {
  const user = await requireAdmin();
  const [users, events] = await Promise.all([listManagedUsers(), listUserManagementEvents()]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">Usuarios</h1>
        <p className="mt-1 text-sm text-zinc-500">Administra el acceso de administradores y vendedores.</p>
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">Crear usuario</h2>
          <CreateUserForm />
        </section>
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Usuarios registrados</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Creado</th><th className="px-4 py-3">Acciones</th></tr>
              </thead>
              <tbody>{users.map((managedUser) => <UserRow key={managedUser.id} user={managedUser} />)}</tbody>
            </table>
          </div>
        </section>
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Actividad reciente de usuarios</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Usuario objetivo</th><th className="px-4 py-3">Actor</th></tr></thead>
              <tbody>{events.map((event) => <tr key={event.id} className="border-b border-zinc-100"><td className="px-4 py-3 text-zinc-500">{new Date(event.created_at).toLocaleString()}</td><td className="px-4 py-3 font-medium">{event.event_type}</td><td className="px-4 py-3 font-mono text-zinc-500">{event.target_user_id}</td><td className="px-4 py-3 font-mono text-zinc-500">{event.actor_user_id}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
