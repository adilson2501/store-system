export function validateVoidReason(reason: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = reason.trim();
  if (value.length < 3) return { ok: false, error: "El motivo debe tener al menos 3 caracteres." };
  if (value.length > 500) return { ok: false, error: "El motivo admite máximo 500 caracteres." };
  return { ok: true, value };
}
