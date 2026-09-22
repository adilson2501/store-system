import type { UnitType } from "@/features/catalog/products/types";

export type MoneyString = string;
export type QuantityString = string;

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const QUANTITY_RE = /^\d{1,10}(\.\d{1,3})?$/;

export function validateMoney(
  raw: unknown,
  label: string,
): { ok: true; value: MoneyString } | { ok: false; error: string } {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: false, error: `${label} is required.` };
  }
  if (!MONEY_RE.test(value)) {
    return {
      ok: false,
      error: `${label} must be a non-negative amount with at most 2 decimals.`,
    };
  }

  return { ok: true, value };
}

export function validateQuantity(
  raw: unknown,
  unitType: UnitType,
): { ok: true; value: QuantityString } | { ok: false; error: string } {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: false, error: "Initial stock is required (use 0 if none)." };
  }
  if (!QUANTITY_RE.test(value)) {
    return {
      ok: false,
      error:
        "Initial stock must be a non-negative number with at most 3 decimals.",
    };
  }

  if (unitType === "UNIT" && !/^\d+$/.test(value)) {
    return {
      ok: false,
      error: "UNIT products require a whole-number initial stock.",
    };
  }

  return { ok: true, value };
}

export function normalizeOptionalBarcode(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value.length > 0 ? value : null;
}

export function formatMoneyPen(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "S/. 0.00";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return `S/. ${value}`;
  }
  return `S/. ${n.toFixed(2)}`;
}

export function formatQuantity(
  value: string | number | null | undefined,
  unitType: UnitType,
): string {
  if (value === null || value === undefined || value === "") {
    return unitType === "WEIGHT" ? "0.000" : "0";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return String(value);
  }
  return unitType === "WEIGHT" ? n.toFixed(3) : String(n);
}
