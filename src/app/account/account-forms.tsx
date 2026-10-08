"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changeOwnEmail,
  changeOwnPassword,
  type EmailFormState,
  type PasswordFormState,
} from "@/features/users/actions";

const initialEmailState: EmailFormState = {};
const initialPasswordState: PasswordFormState = {};

function FormMessage({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) return <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{state.error}</p>;
  if (state.success) return <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">{state.success}</p>;
  return null;
}

export function AccountEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(changeOwnEmail, initialEmailState);
  const router = useRouter();

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <CardContent>
      <div className="mb-5 rounded-md bg-muted/50 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correo actual</p>
        <p className="mt-1 break-all font-semibold text-foreground">{currentEmail}</p>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="account-email">Nuevo correo</Label>
          <Input id="account-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="tu@correo.com" />
        </div>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Enviando solicitud…" : "Actualizar correo"}
        </Button>
      </form>
    </CardContent>
  );
}

export function AccountPasswordForm() {
  const [state, formAction, pending] = useActionState(changeOwnPassword, initialPasswordState);

  return (
    <CardContent>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="account-password">Nueva contraseña</Label>
          <PasswordInput id="account-password" name="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-confirm-password">Confirmar contraseña</Label>
          <PasswordInput id="account-confirm-password" name="confirm_password" autoComplete="new-password" required minLength={8} maxLength={72} />
        </div>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Guardando…" : "Actualizar contraseña"}
        </Button>
      </form>
    </CardContent>
  );
}
