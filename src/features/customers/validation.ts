import { formatCents, parseCents } from "@/features/pos/money";

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

export function normalizeCustomerText(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

export function validateCustomerName(raw: unknown) {
  const value = normalizeCustomerText(raw);
  if (!value) return { ok: false as const, error: "El nombre es obligatorio." };
  if (value.length > 200) return { ok: false as const, error: "El nombre admite máximo 200 caracteres." };
  return { ok: true as const, value };
}

export function validateOptionalPhone(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true as const, value: null };
  if (!/^[0-9]{9}$/.test(value)) {
    return { ok: false as const, error: "El teléfono debe tener exactamente 9 dígitos." };
  }
  return { ok: true as const, value };
}

export function validateOptionalNotes(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (value.length > 1000) return { ok: false as const, error: "Las notas admiten máximo 1000 caracteres." };
  return { ok: true as const, value: value || null };
}

export function validateCustomerMoney(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false as const, error: "El límite de crédito es obligatorio." };
  if (!MONEY_RE.test(value)) {
    return { ok: false as const, error: "El límite debe ser un monto no negativo con máximo 2 decimales." };
  }
  return { ok: true as const, value };
}

export function parseSignedCents(raw: string | number | null | undefined): bigint {
  const value = String(raw ?? "").trim();
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const cents = parseCents(absolute);
  if (cents === null) throw new Error(`Invalid money value: ${value}`);
  return negative ? -cents : cents;
}

export function formatCustomerMoney(cents: bigint): string {
  return `S/. ${formatCents(cents)}`;
}
