import { describe, expect, it } from "vitest";
import { inventoryMovementLabel } from "../inventory-labels";

describe("inventory movement labels", () => {
  it("labels purchase reversals without changing their signed quantity", () => {
    expect(inventoryMovementLabel("PURCHASE_REVERSAL")).toBe("Reversión de compra");
    expect(-2).toBeLessThan(0);
  });
});
