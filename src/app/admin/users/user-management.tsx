"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateManagedUser, createManagedUser, type PasswordFormState } from "@/features/users/actions";
import type { ManagedUser, UserFormState } from "@/features/users/types";

const initialCreateState: UserFormState = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createManagedUser, initialCreateState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2">
      <div className="space-y-1">
        <label htmlFor="display_name" className="block text-sm font-medium text-zinc-700">Nombre</label>
        <input id="display_name" name="display_name" required className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        {state.fieldErrors?.displayName ? <p className="text-sm text-red-600">{state.fieldErrors.displayName}</p> : null}
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">Correo</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        {state.fieldErrors?.email ? <p className="text-sm text-red-600">{state.fieldErrors.email}</p> : null}
      </div>
      <div className="space-y-1">
        <label htmlFor="role" className="block text-sm font-medium text-zinc-700">Rol</label>
        <select id="role" name="role" defaultValue="SELLER" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="SELLER">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700">Contraseña temporal</label>
        <input id="password" name="password" type="password" required autoComplete="new-password" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        {state.fieldErrors?.password ? <p className="text-sm text-red-600">{state.fieldErrors.password}</p> : null}
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm_password" className="block text-sm font-medium text-zinc-700">Confirmar contraseña</label>
        <input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        {state.fieldErrors?.confirmPassword ? <p className="text-sm text-red-600">{state.fieldErrors.confirmPassword}</p> : null}
      </div>
      <div className="sm:col-span-2">
        {state.error ? <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
        {state.success ? <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{state.success}</p> : null}
        <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

export function UserRow({ user }: { user: ManagedUser }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.displayName === "—" ? "Usuario" : user.displayName);
  const [role, setRole] = useState(user.role);

  function submit(isActive: boolean = user.isActive) {
    setMessage("");
    const formData = new FormData();
    formData.set("id", user.id);
    formData.set("display_name", displayName);
    formData.set("role", role);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      const result = await updateManagedUser(formData);
      setMessage(result.error ?? result.success ?? "");
      if (result.success) router.refresh();
    });
  }

  return (
    <tr className="border-b border-zinc-100 align-top">
      <td className="px-4 py-3">
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={pending} className="w-full min-w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
        <p className="text-xs text-zinc-500">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <select value={role} disabled={pending} onChange={(event) => setRole(event.target.value as "ADMIN" | "SELLER")} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
          <option value="SELLER">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
          {user.isActive ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">{new Date(user.createdAt).toLocaleString()}</td>
      <td className="px-4 py-3">
        <button type="button" disabled={pending} onClick={() => submit()} className="mr-2 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 disabled:opacity-50">
          Guardar
        </button>
        <button type="button" disabled={pending} onClick={() => submit(!user.isActive)} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 disabled:opacity-50">
          {pending ? "Guardando…" : user.isActive ? "Desactivar" : "Reactivar"}
        </button>
        {message ? <p className={`mt-2 max-w-56 text-xs ${message.includes("actualizado") || message.includes("reconciliada") ? "text-emerald-700" : "text-red-600"}`}>{message}</p> : null}
      </td>
    </tr>
  );
}

export function PasswordForm({ action, initialState }: { action: (state: PasswordFormState, formData: FormData) => Promise<PasswordFormState>; initialState: PasswordFormState }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700">Nueva contraseña</label>
        <input id="password" name="password" type="password" required autoComplete="new-password" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm_password" className="block text-sm font-medium text-zinc-700">Confirmar contraseña</label>
        <input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      </div>
      {state.error ? <p className="text-sm text-red-600" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700" role="status">{state.success}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
