"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findAuthUserByEmail } from "@/features/users/queries";
import {
  normalizeEmail,
  parseRole,
  validateDisplayName,
  validateEmail,
  validateEmailChange,
  validatePassword,
  validatePasswordConfirmation,
} from "@/features/users/validation";
import type { UserActionResult, UserFormState } from "@/features/users/types";

function managementError(message: string): string {
  if (message.includes("open cash session")) return "El usuario tiene una caja abierta. Debe cerrarla antes de desactivarlo.";
  if (message.includes("active administrator")) return "Debe quedar al menos un administrador activo.";
  if (message.includes("inactive")) return "Tu usuario ya no tiene acceso activo.";
  if (message.includes("User profile not found")) return "No se encontró el perfil del usuario.";
  return message;
}

async function getProfile(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, display_name, is_active, created_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(`No se pudo verificar el perfil: ${error.message}`);
  return data as { id: string; role: "ADMIN" | "SELLER"; display_name: string | null; is_active: boolean; created_at: string };
}

async function updateManagedProfile(input: {
  id: string;
  role: "ADMIN" | "SELLER";
  isActive: boolean;
  displayName: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_managed_user", {
    p_target_user_id: input.id,
    p_role: input.role,
    p_is_active: input.isActive,
    p_display_name: input.displayName,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function setAuthBan(id: string, banned: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) throw new Error(error.message);
}

export async function createManagedUser(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = parseRole(formData.get("role"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const fieldErrors: NonNullable<UserFormState["fieldErrors"]> = {};

  const displayNameError = validateDisplayName(displayName);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const confirmationError = validatePasswordConfirmation(password, confirmPassword);
  if (displayNameError) fieldErrors.displayName = displayNameError;
  if (emailError) fieldErrors.email = emailError;
  if (!role) fieldErrors.role = "Selecciona un rol válido.";
  if (passwordError) fieldErrors.password = passwordError;
  if (confirmationError) fieldErrors.confirmPassword = confirmationError;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const admin = createAdminClient();
  let authUser = await findAuthUserByEmail(email);

  if (authUser) {
    let profile;
    try {
      profile = await getProfile(authUser.id);
    } catch {
      return { error: "La cuenta de Auth existe, pero su perfil no está disponible. Requiere reconciliación administrativa." };
    }
    const supabase = await createClient();
    const { data: createdEvent } = await supabase
      .from("user_management_events")
      .select("id")
      .eq("target_user_id", authUser.id)
      .eq("event_type", "USER_CREATED")
      .maybeSingle();

    if (!createdEvent) {
      return { error: "Ya existe un usuario con ese correo. Verifica los datos antes de continuar." };
    }
    if (profile.role !== role) {
      return { error: "La cuenta ya existe con otro rol. Usa la gestión de usuarios para cambiarlo explícitamente." };
    }

    return {
      success: "La cuenta ya existía y fue reconciliada de forma segura.",
      createdUser: { id: authUser.id, email: authUser.email ?? email, displayName: profile.display_name ?? displayName, role: role! },
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) {
    authUser = await findAuthUserByEmail(email);
    if (authUser) return { error: "La cuenta fue creada por otro intento. Recarga la lista y usa la gestión de usuarios." };
    return { error: "No se pudo crear la cuenta. Intenta nuevamente." };
  }
  if (!data.user) return { error: "Auth no devolvió el usuario creado." };
  authUser = data.user;

  let profile;
  try {
    profile = await getProfile(authUser.id);
  } catch {
    return { error: "La cuenta fue creada, pero su perfil no está disponible. Requiere reconciliación administrativa." };
  }
  const supabase = await createClient();
  if (profile.display_name !== displayName) {
    try {
      await updateManagedProfile({ id: authUser.id, role: "SELLER", isActive: true, displayName });
      profile = await getProfile(authUser.id);
    } catch (profileError) {
      return { error: `La cuenta fue creada como VENDEDOR, pero requiere reconciliación: ${profileError instanceof Error ? profileError.message : "error de perfil"}` };
    }
  }

  const { error: eventError } = await supabase.rpc("record_user_created", { p_target_user_id: authUser.id });
  if (eventError) {
    return { error: `La cuenta fue creada, pero no se pudo registrar la auditoría: ${eventError.message}` };
  }

  if (role === "ADMIN") {
    try {
      await updateManagedProfile({ id: authUser.id, role: "ADMIN", isActive: true, displayName });
    } catch (promotionError) {
      return { error: `La cuenta fue creada como VENDEDOR, pero no se pudo promover: ${managementError(promotionError instanceof Error ? promotionError.message : "Error desconocido")}` };
    }
  }

  revalidatePath("/admin/users");
  return {
    success: "Usuario creado correctamente. Comunícale la contraseña temporal de forma segura.",
    createdUser: { id: authUser.id, email, displayName, role: role! },
  };
}

export async function updateManagedUser(formData: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = parseRole(formData.get("role"));
  const isActive = formData.get("is_active") === "true";
  const displayNameError = validateDisplayName(displayName);
  if (!id || !role || displayNameError) return { error: displayNameError ?? "Datos de usuario inválidos." };

  try {
    if (!isActive) {
      await updateManagedProfile({ id, role, isActive: false, displayName });
      try {
        await setAuthBan(id, true);
      } catch (banError) {
        revalidatePath("/admin/users");
        return { error: `Usuario desactivado, pero el bloqueo de Auth quedó pendiente: ${banError instanceof Error ? banError.message : "error desconocido"}` };
      }
    } else {
      await setAuthBan(id, false);
      await updateManagedProfile({ id, role, isActive: true, displayName });
    }
    revalidatePath("/admin/users");
    return { success: "Usuario actualizado." };
  } catch (error) {
    return { error: managementError(error instanceof Error ? error.message : "No se pudo actualizar el usuario.") };
  }
}

export type PasswordFormState = { error?: string; success?: string };

export type EmailFormState = { error?: string; success?: string };

function emailChangeAuthError(error: unknown): string {
  const authError = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const name = typeof authError.name === "string" ? authError.name : "";
  const status = typeof authError.status === "number" ? authError.status : undefined;
  const code = typeof authError.code === "string" ? authError.code : "";
  const message = typeof authError.message === "string" ? authError.message : "";
  const searchable = `${name} ${code} ${message}`.toLowerCase();

  console.error("[auth] self-service email change failed", { name, status, code, message });

  if (searchable.includes("email_exists") || searchable.includes("already registered")) {
    return "Ese correo ya está registrado.";
  }
  if (status === 429 || searchable.includes("rate limit") || searchable.includes("over_email_send_rate_limit")) {
    return "Se alcanzó el límite temporal de solicitudes. Intenta nuevamente más tarde.";
  }
  if (searchable.includes("email_address_not_authorized") || searchable.includes("not authorized")) {
    return "La configuración de Auth no permite solicitar este cambio de correo.";
  }
  if (searchable.includes("confirmation email") || searchable.includes("smtp") || searchable.includes("email provider")) {
    return "No se pudo enviar el correo de confirmación. Revisa la configuración de correo de Auth.";
  }
  if (status === 401 || status === 403 || searchable.includes("auth session") || searchable.includes("jwt")) {
    return "La sesión ya no es válida. Inicia sesión nuevamente.";
  }
  return "Auth no pudo aceptar el cambio de correo. Intenta nuevamente.";
}

export async function changeOwnEmail(
  _previous: EmailFormState,
  formData: FormData,
): Promise<EmailFormState> {
  const session = await requireUser();
  const requestedEmail = normalizeEmail(String(formData.get("email") ?? ""));
  const validationError = validateEmailChange(session.email, requestedEmail);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ email: requestedEmail });
  if (error) return { error: emailChangeAuthError(error) };

  const { data: refreshedUser, error: refreshError } = await supabase.auth.getUser();
  if (refreshError) {
    const authError = refreshError as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
    console.error("[auth] self-service email change refresh failed", {
      name: typeof authError.name === "string" ? authError.name : "",
      status: typeof authError.status === "number" ? authError.status : undefined,
      code: typeof authError.code === "string" ? authError.code : "",
      message: typeof authError.message === "string" ? authError.message : "",
    });
  }
  const authoritativeEmail = refreshedUser.user?.email ?? data.user?.email ?? session.email;
  if (normalizeEmail(authoritativeEmail) === requestedEmail) {
    return { success: "Correo actualizado correctamente." };
  }

  return { success: "Solicitud de cambio enviada. Completa la confirmación si se solicita." };
}

export async function changeOwnPassword(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");
  const passwordError = validatePassword(password);
  const confirmationError = validatePasswordConfirmation(password, confirmation);
  if (passwordError) return { error: passwordError };
  if (confirmationError) return { error: confirmationError };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo actualizar la contraseña. Intenta nuevamente." };
  return { success: "Contraseña actualizada correctamente." };
}
