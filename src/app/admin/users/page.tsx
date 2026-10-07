import { UserPlus, Users } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/features/auth/session";
import { listManagedUsers, listUserManagementEvents } from "@/features/users/queries";
import { CreateUserForm, UserRow } from "@/app/admin/users/user-management";

export default async function UsersPage() {
  await requireAdmin();
  const [users, events] = await Promise.all([listManagedUsers(), listUserManagementEvents()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-primary">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Administra el acceso de administradores y vendedores.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserPlus aria-hidden="true" className="size-4 text-primary" />Crear usuario</CardTitle>
          <CardDescription>La contraseña temporal debe comunicarse de forma segura al usuario.</CardDescription>
        </CardHeader>
        <CreateUserForm />
      </Card>

      <Card>
        <CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2 text-base"><Users aria-hidden="true" className="size-4 text-primary" />Usuarios registrados</CardTitle><CardDescription>{users.length} usuarios administrados por este sistema.</CardDescription></CardHeader>
        {users.length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">Aún no hay usuarios administrados.</p> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Creado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody>{users.map((managedUser) => <UserRow key={managedUser.id} user={managedUser} />)}</tbody></table></div>}
      </Card>

      <Card>
        <CardHeader className="border-b border-border"><CardTitle className="text-base">Actividad reciente de usuarios</CardTitle><CardDescription>Eventos de gestión registrados por el sistema.</CardDescription></CardHeader>
        {events.length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">Aún no hay eventos de gestión.</p> : <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Usuario objetivo</th><th className="px-4 py-3">Actor</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-border last:border-0"><td className="px-4 py-3 text-muted-foreground">{new Date(event.created_at).toLocaleString()}</td><td className="px-4 py-3 font-medium text-foreground">{event.event_type}</td><td className="px-4 py-3 font-mono text-muted-foreground">{event.target_user_id}</td><td className="px-4 py-3 font-mono text-muted-foreground">{event.actor_user_id}</td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}
