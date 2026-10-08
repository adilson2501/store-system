import { describe, expect, it } from "vitest";
import { classifyConfirmSaleError, formatInsufficientStockMessage } from "@/features/pos/errors";

const stockDetail = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  code: "INSUFFICIENT_STOCK",
  productId: "product-1",
  productName: "A1.4b UNIT",
  unitType: "UNIT",
  availableStock: "2.000",
  ...overrides,
});

describe("confirm sale stock error details", () => {
  it("parses valid UNIT metadata", () => {
    expect(classifyConfirmSaleError("Insufficient stock for product A1.4b UNIT", stockDetail())).toEqual({
      ok: false,
      kind: "DEFINITIVE",
      code: "INSUFFICIENT_STOCK",
      error: "Insufficient stock for product A1.4b UNIT",
      stock: {
        code: "INSUFFICIENT_STOCK",
        version: 2,
        items: [{
          productId: "product-1",
          productName: "A1.4b UNIT",
          unitType: "UNIT",
          availableStock: "2.000",
        }],
      },
    });
  });

  it("parses valid WEIGHT metadata without converting the authoritative string", () => {
    const result = classifyConfirmSaleError(
      "Insufficient stock for product A1.4b WEIGHT",
      stockDetail({ productName: "A1.4b WEIGHT", unitType: "WEIGHT", availableStock: "0.750" }),
    );

    expect(result).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      stock: {
        version: 2,
        items: [{
          productName: "A1.4b WEIGHT",
          unitType: "WEIGHT",
          availableStock: "0.750",
        }],
      },
    });
  });

  it("normalizes a V2 multi-item payload", () => {
    const result = classifyConfirmSaleError(
      "Insufficient stock for product A1.4b UNIT",
      JSON.stringify({
        code: "INSUFFICIENT_STOCK",
        version: 2,
        items: [
          { productId: "product-1", productName: "A1.4b UNIT", unitType: "UNIT", requestedQuantity: "8.000", availableStock: "6.000" },
          { productId: "product-2", productName: "A1.4b WEIGHT", unitType: "WEIGHT", requestedQuantity: "1.500", availableStock: "0.750" },
        ],
      }),
    );

    expect(result).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      stock: {
        version: 2,
        items: [
          { productId: "product-1", requestedQuantity: "8.000", availableStock: "6.000" },
          { productId: "product-2", requestedQuantity: "1.500", availableStock: "0.750" },
        ],
      },
    });
  });

  it.each([
    undefined,
    "not-json",
    stockDetail({ availableStock: "0.0000" }),
    JSON.stringify({ code: "INSUFFICIENT_STOCK", version: 2, items: [{ productId: "product-1", availableStock: "bad" }] }),
  ])(
    "falls back to the existing known stock failure for malformed or absent detail: %s",
    (details) => {
      expect(classifyConfirmSaleError("Insufficient stock for product A1.4b UNIT", details)).toEqual({
        ok: false,
        kind: "DEFINITIVE",
        code: "INSUFFICIENT_STOCK",
        error: "Insufficient stock for product A1.4b UNIT",
      });
    },
  );

  it.each([
    [{ unitType: "UNIT", availableStock: "1.000" }, "Disponible actualmente: 1 unidad."],
    [{ unitType: "UNIT", availableStock: "0.000" }, "Disponible actualmente: 0 unidades."],
    [{ unitType: "WEIGHT", availableStock: "0.750" }, "Disponible actualmente: 0.750 kg."],
  ])("formats %s using the existing quantity semantics", (overrides, expected) => {
    expect(formatInsufficientStockMessage({
      code: "INSUFFICIENT_STOCK",
      productId: "product-1",
      productName: "Arroz",
      unitType: overrides.unitType as "UNIT" | "WEIGHT",
      availableStock: overrides.availableStock,
    })).toContain(expected);
  });
});
