export function validateSupplierName(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false as const, error: "El nombre es obligatorio." };
  if (value.length > 200) return { ok: false as const, error: "El nombre admite máximo 200 caracteres." };
  return { ok: true as const, value };
}

export function validateSupplierRuc(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true as const, value: null };
  if (!/^\d{11}$/.test(value)) {
    return { ok: false as const, error: "El RUC debe tener exactamente 11 dígitos." };
  }
  return { ok: true as const, value };
}

export function validateSupplierPhone(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (value && !/^\d{9}$/.test(value)) {
    return { ok: false as const, error: "El teléfono debe contener exactamente 9 dígitos." };
  }
  return { ok: true as const, value: value || null };
}

export function validateSupplierNotes(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (value.length > 1000) return { ok: false as const, error: "Las notas admiten máximo 1000 caracteres." };
  return { ok: true as const, value: value || null };
}
