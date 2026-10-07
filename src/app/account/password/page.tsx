import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/features/auth/session";
import { changeOwnPassword } from "@/features/users/actions";
import { PasswordForm } from "@/app/admin/users/user-management";

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-lg font-semibold">Cambiar contraseña</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-500">Usa una contraseña que no compartas con otros operadores.</p>
        <PasswordForm action={changeOwnPassword} initialState={{}} />
      </main>
    </div>
  );
}
