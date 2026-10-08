import { describe, expect, it } from "vitest";
import {
  validateInventoryLossNote,
  validateInventoryLossQuantity,
  validateInventoryLossReason,
} from "@/features/catalog/products/validation";

describe("inventory loss validation", () => {
  it("accepts the stable loss reason codes", () => {
    for (const reason of ["EXPIRED", "DAMAGED", "BROKEN", "SPOILED", "LOST", "OTHER"] as const) {
      expect(validateInventoryLossReason(reason)).toEqual({ ok: true, value: reason });
    }
  });

  it("rejects an invalid reason", () => {
    expect(validateInventoryLossReason("UNKNOWN")).toEqual({
      ok: false,
      error: "Selecciona un motivo válido para la merma.",
    });
  });

  it("requires a note for OTHER and accepts a valid note", () => {
    expect(validateInventoryLossNote("", "OTHER")).toEqual({
      ok: false,
      error: "La nota es obligatoria para el motivo Otro.",
    });
    expect(validateInventoryLossNote("Revisión de bodega", "OTHER")).toEqual({
      ok: true,
      value: "Revisión de bodega",
    });
  });

  it("enforces the note limit", () => {
    expect(validateInventoryLossNote("x".repeat(501), "DAMAGED")).toEqual({
      ok: false,
      error: "La nota admite máximo 500 caracteres.",
    });
  });

  it("validates positive quantities for UNIT and WEIGHT", () => {
    expect(validateInventoryLossQuantity("2", "UNIT")).toEqual({ ok: true, value: "2" });
    expect(validateInventoryLossQuantity("2.0", "UNIT")).toEqual({ ok: true, value: "2.0" });
    expect(validateInventoryLossQuantity("2.5", "UNIT").ok).toBe(false);
    expect(validateInventoryLossQuantity("0", "WEIGHT").ok).toBe(false);
    expect(validateInventoryLossQuantity("-1", "WEIGHT").ok).toBe(false);
    expect(validateInventoryLossQuantity("0.250", "WEIGHT")).toEqual({ ok: true, value: "0.250" });
    expect(validateInventoryLossQuantity("0.2505", "WEIGHT").ok).toBe(false);
  });
});
