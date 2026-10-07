import type { AppRole } from "@/features/auth/session";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Ingresa un correo electrónico válido.";
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > 120) {
    return "El nombre debe tener entre 1 y 120 caracteres.";
  }
  return null;
}

export function parseRole(value: unknown): AppRole | null {
  return value === "ADMIN" || value === "SELLER" ? value : null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8 || value.length > 72) {
    return "La contraseña debe tener entre 8 y 72 caracteres.";
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  return password === confirmation ? null : "Las contraseñas no coinciden.";
}
