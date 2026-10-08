import { formatCents, parseCents, parseThousandths, sanitizeDecimalInput } from "@/features/pos/money";
import type { PurchaseLine } from "@/features/purchases/types";

export function newClientKey() {
  return crypto.randomUUID();
}

export function sanitizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

export function purchaseLineCents(quantity: string, unitCost: string): bigint | null {
  const quantityThousandths = parseThousandths(quantity);
  const costCents = parseCents(unitCost);
  if (quantityThousandths === null || costCents === null) return null;
  if (quantityThousandths <= BigInt(0) || costCents < BigInt(0)) return null;
  return (quantityThousandths * costCents + BigInt(500)) / BigInt(1000);
}

export function packageConversion(line: PurchaseLine): {
  quantity: string | null;
  unitCost: string | null;
  packageTotalCents: bigint | null;
  lineCents: bigint | null;
  error?: string;
} {
  const packageQuantity = sanitizeIntegerInput(line.packageQuantity);
  const unitsPerPackage = sanitizeIntegerInput(line.unitsPerPackage);
  const packageTotalCents = parseCents(line.packageCost);

  if (!packageQuantity || !unitsPerPackage || packageTotalCents === null) {
    return { quantity: null, unitCost: null, packageTotalCents: null, lineCents: null };
  }

  const packageCount = BigInt(packageQuantity);
  const unitsPerPackageValue = BigInt(unitsPerPackage);
  const totalUnits = packageCount * unitsPerPackageValue;
  if (packageCount <= BigInt(0) || unitsPerPackageValue <= BigInt(0)) {
    return { quantity: null, unitCost: null, packageTotalCents, lineCents: null, error: "La cantidad de paquetes debe ser positiva." };
  }

  if (packageTotalCents % unitsPerPackageValue !== BigInt(0)) {
    return {
      quantity: totalUnits.toString(),
      unitCost: null,
      packageTotalCents,
      lineCents: null,
      error: "El costo del paquete no se puede convertir exactamente a un costo unitario de 2 decimales. Cambia a ingreso directo por unidad.",
    };
  }

  return {
    quantity: totalUnits.toString(),
    unitCost: formatCents(packageTotalCents / unitsPerPackageValue),
    packageTotalCents,
    lineCents: packageCount * packageTotalCents,
  };
}

export function effectivePurchaseLine(line: PurchaseLine) {
  if (line.entryMode === "PACKAGE") {
    const conversion = packageConversion(line);
    if (!conversion.quantity || !conversion.unitCost) return { ...conversion, lineCents: null };
    return {
      ...conversion,
      quantity: conversion.quantity,
      unitCost: conversion.unitCost,
      lineCents: conversion.lineCents,
    };
  }

  return {
    quantity: line.quantity,
    unitCost: line.unitPurchaseCost,
    lineCents: purchaseLineCents(line.quantity, line.unitPurchaseCost),
    error: undefined,
  };
}

export function sanitizePurchaseDecimal(value: string, maxDecimals: number) {
  return sanitizeDecimalInput(value, maxDecimals);
}
