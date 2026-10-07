"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
    <form ref={formRef} action={formAction} className="grid gap-5 px-6 pb-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="display_name">Nombre</Label>
        <Input id="display_name" name="display_name" required />
        {state.fieldErrors?.displayName ? <p className="text-sm text-destructive" role="alert">{state.fieldErrors.displayName}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        {state.fieldErrors?.email ? <p className="text-sm text-destructive" role="alert">{state.fieldErrors.email}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <select id="role" name="role" defaultValue="SELLER" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <option value="SELLER">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </select>
        {state.fieldErrors?.role ? <p className="text-sm text-destructive" role="alert">{state.fieldErrors.role}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña temporal</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
        {state.fieldErrors?.password ? <p className="text-sm text-destructive" role="alert">{state.fieldErrors.password}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirmar contraseña</Label>
        <Input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" />
        {state.fieldErrors?.confirmPassword ? <p className="text-sm text-destructive" role="alert">{state.fieldErrors.confirmPassword}</p> : null}
      </div>
      <div className="sm:col-span-2">
        {state.error ? <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{state.error}</p> : null}
        {state.success ? <p className="mb-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">{state.success}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear usuario"}
        </Button>
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
    <tr className="border-b border-border align-top transition-colors hover:bg-muted/50 last:border-0">
      <td className="px-4 py-3">
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={pending} className="h-9 min-w-40" aria-label={`Nombre de ${user.email}`} />
        <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <select value={role} disabled={pending} onChange={(event) => setRole(event.target.value as "ADMIN" | "SELLER")} className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="SELLER">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <Badge variant={user.isActive ? "success" : "secondary"}>{user.isActive ? "Activo" : "Inactivo"}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleString()}</td>
      <td className="px-4 py-3">
        <Button type="button" disabled={pending} onClick={() => submit()} variant="outline" size="sm" className="mr-2">
          Guardar
        </Button>
        <Button type="button" disabled={pending} onClick={() => submit(!user.isActive)} variant="outline" size="sm">
          {pending ? "Guardando…" : user.isActive ? "Desactivar" : "Reactivar"}
        </Button>
        {message ? <p className={cn("mt-2 max-w-56 text-xs", message.includes("actualizado") || message.includes("reconciliada") ? "text-success" : "text-destructive")} role="status">{message}</p> : null}
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
