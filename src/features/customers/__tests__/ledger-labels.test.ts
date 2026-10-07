import { describe, expect, it } from "vitest";
import { customerLedgerMovementLabel } from "../ledger-labels";

describe("customer ledger labels", () => {
  it("labels credit-sale reversals distinctly", () => {
    expect(customerLedgerMovementLabel("CREDIT_SALE_REVERSAL")).toBe("Reversión de venta fiada");
  });
});
