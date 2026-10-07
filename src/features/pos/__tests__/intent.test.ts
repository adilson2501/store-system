import { describe, expect, it } from "vitest";
import {
  canTransitionSaleIntent,
  createSaleIntent,
  createSubmittedSnapshot,
  normalizeSubmittedItems,
  type SaleIntentDraft,
} from "@/features/pos/intent";

const cashDraft = (): SaleIntentDraft => ({
  cashSessionId: "session-1",
  paymentMethod: "CASH",
  amountReceived: "12.00",
  customer: null,
  items: [
    {
      productId: "PRODUCT-1",
      productName: "Product 1",
      unitType: "UNIT",
      sellingPrice: "4.00",
      quantity: "2",
    },
  ],
});

describe("sale intent domain", () => {
  it("creates a draft with a stable client key and cloned input", () => {
    const draft = cashDraft();
    const intent = createSaleIntent("owner-1", draft, new Date("2026-01-01T00:00:00.000Z"));

    draft.items[0].quantity = "9";
    draft.amountReceived = "99.00";

    expect(intent.state).toBe("DRAFT");
    expect(intent.clientKey).toEqual(expect.any(String));
    expect(intent.clientKey).toBeTruthy();
    expect(intent.draft.items[0].quantity).toBe("2");
    expect(intent.draft.amountReceived).toBe("12.00");
    expect(intent.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(intent.updatedAt).toBe(intent.createdAt);
  });

  it("rejects an empty owner", () => {
    expect(() => createSaleIntent("  ", cashDraft())).toThrow("Sale intent owner is required");
  });

  it("requires a cash session and at least one item for submission", () => {
    const noSession = createSaleIntent("owner-1", { ...cashDraft(), cashSessionId: null });
    expect(() => createSubmittedSnapshot(noSession, "12.00")).toThrow("Cash session is required");

    const noItems = createSaleIntent("owner-1", { ...cashDraft(), items: [] });
    expect(() => createSubmittedSnapshot(noItems, "12.00")).toThrow("At least one sale item is required");
  });

  it("enforces payment-specific amount and customer rules", () => {
    const cash = createSaleIntent("owner-1", cashDraft());
    expect(() => createSubmittedSnapshot(cash, null)).toThrow("Cash received is required");
    expect(() => createSubmittedSnapshot(cash, "invalid")).toThrow("Cash received is required");

    const yape = createSaleIntent("owner-1", { ...cashDraft(), paymentMethod: "YAPE" });
    expect(createSubmittedSnapshot(yape, null).amount_received).toBeNull();
    expect(() => createSubmittedSnapshot(yape, "1.00")).toThrow("Non-cash sale cannot include cash received");

    const credit = createSaleIntent("owner-1", {
      ...cashDraft(),
      paymentMethod: "CREDIT",
      customer: { id: "customer-1", name: "Customer", phone: null },
    });
    expect(createSubmittedSnapshot(credit, null).amount_received).toBeNull();
    expect(() => createSubmittedSnapshot(credit, "1.00")).toThrow("Non-cash sale cannot include cash received");

    const creditWithoutCustomer = createSaleIntent("owner-1", { ...cashDraft(), paymentMethod: "CREDIT" });
    expect(() => createSubmittedSnapshot(creditWithoutCustomer, null)).toThrow("Customer is required for credit sales");

    const yapeWithCustomer = createSaleIntent("owner-1", {
      ...cashDraft(),
      paymentMethod: "YAPE",
      customer: { id: "customer-1", name: "Customer", phone: null },
    });
    expect(() => createSubmittedSnapshot(yapeWithCustomer, null)).toThrow("Customer is only allowed for credit sales");
  });

  it("normalizes duplicate products, identifiers, item order, and quantities", () => {
    const items = normalizeSubmittedItems([
      { productId: " B ", productName: "B", unitType: "WEIGHT", sellingPrice: "1.00", quantity: "0.125" },
      { productId: "a", productName: "A", unitType: "UNIT", sellingPrice: "1.00", quantity: "1" },
      { productId: "b", productName: "B", unitType: "WEIGHT", sellingPrice: "1.00", quantity: "1.2" },
      { productId: "A", productName: "A", unitType: "UNIT", sellingPrice: "1.00", quantity: "2.000" },
    ]);

    expect(items).toEqual([
      { product_id: "a", quantity: "3.000" },
      { product_id: "b", quantity: "1.325" },
    ]);
  });

  it("keeps submitted snapshots independent from later draft data", () => {
    const draft = cashDraft();
    const intent = createSaleIntent("owner-1", draft);
    const snapshot = createSubmittedSnapshot(intent, "12.00");

    intent.draft.items[0].quantity = "99";
    intent.draft.items.push({
      productId: "product-2",
      productName: "Product 2",
      unitType: "UNIT",
      sellingPrice: "1.00",
      quantity: "1",
    });

    expect(snapshot.items).toEqual([{ product_id: "product-1", quantity: "2.000" }]);
    expect(snapshot.client_key).toBe(intent.clientKey);
  });

  it("allows only the defined lifecycle transitions", () => {
    expect(canTransitionSaleIntent("DRAFT", "SUBMITTING")).toBe(true);
    expect(canTransitionSaleIntent("SUBMITTING", "CONFIRMED")).toBe(true);
    expect(canTransitionSaleIntent("SUBMITTING", "FAILED")).toBe(true);
    expect(canTransitionSaleIntent("SUBMITTING", "UNCERTAIN")).toBe(true);
    expect(canTransitionSaleIntent("SUBMITTING", "CONFLICT")).toBe(true);
    expect(canTransitionSaleIntent("UNCERTAIN", "CONFIRMED")).toBe(true);
    expect(canTransitionSaleIntent("UNCERTAIN", "FAILED")).toBe(true);
    expect(canTransitionSaleIntent("UNCERTAIN", "CONFLICT")).toBe(true);
  });

  it("rejects invalid and terminal lifecycle transitions", () => {
    expect(canTransitionSaleIntent("DRAFT", "CONFIRMED")).toBe(false);
    expect(canTransitionSaleIntent("DRAFT", "FAILED")).toBe(false);
    expect(canTransitionSaleIntent("SUBMITTING", "DRAFT")).toBe(false);
    expect(canTransitionSaleIntent("CONFIRMED", "DRAFT")).toBe(false);
    expect(canTransitionSaleIntent("CONFLICT", "FAILED")).toBe(false);
  });
});
