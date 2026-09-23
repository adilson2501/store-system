const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const QUANTITY_RE = /^\d{1,10}(\.\d{1,3})?$/;

export function parseCents(value: string): bigint | null {
  const normalized = value.trim();
  if (!MONEY_RE.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function parseThousandths(value: string): bigint | null {
  const normalized = value.trim();
  if (!QUANTITY_RE.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

export function formatCents(cents: bigint): string {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

export function formatQuantityInput(value: string, unitType: "UNIT" | "WEIGHT") {
  if (unitType === "UNIT") return value.replace(/\.\d*$/, "");
  return value;
}

export function applyKeypadKey(
  value: string,
  key: string,
  maxDecimals: number,
): string {
  if (key === "back") {
    return value.slice(0, -1);
  }

  if (key === ".") {
    if (maxDecimals <= 0 || value.includes(".")) return value;
    return value === "" ? "0." : `${value}.`;
  }

  if (!/^\d$/.test(key)) return value;

  const dotIndex = value.indexOf(".");
  if (dotIndex >= 0) {
    const decimals = value.length - dotIndex - 1;
    if (decimals >= maxDecimals) return value;
  }

  if (value === "0") return key;
  return value + key;
}

export function sanitizeDecimalInput(value: string, maxDecimals: number): string {
  const cleaned = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dotIndex = cleaned.indexOf(".");
  if (dotIndex === -1) return cleaned;

  const whole = cleaned.slice(0, dotIndex);
  const fraction = cleaned
    .slice(dotIndex + 1)
    .replace(/\./g, "")
    .slice(0, maxDecimals);
  return `${whole === "" ? "0" : whole}.${fraction}`;
}

export function incrementIntegerQuantity(value: string): string {
  if (!/^\d+$/.test(value)) return "1";
  return (BigInt(value) + BigInt(1)).toString();
}

export function decrementIntegerQuantity(value: string): string {
  if (!/^\d+$/.test(value)) return "1";
  const next = BigInt(value) - BigInt(1);
  return next < BigInt(1) ? "1" : next.toString();
}

export function lineTotalCents(price: string, quantity: string): bigint | null {
  const priceCents = parseCents(price);
  const quantityThousandths = parseThousandths(quantity);
  if (priceCents === null || quantityThousandths === null) return null;

  // PostgreSQL round(numeric, 2): round half away from zero. Both values are positive.
  return (priceCents * quantityThousandths + BigInt(500)) / BigInt(1000);
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "S/. 0.00";
  const text = String(value);
  const cents = parseCents(text);
  return cents === null ? `S/. ${text}` : `S/. ${formatCents(cents)}`;
}
