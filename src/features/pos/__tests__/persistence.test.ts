import { beforeEach, describe, expect, it } from "vitest";
import {
  ActiveSaleIntentError,
  cleanupConfirmedIntentForOwner,
  createDraftIntent,
  deleteEmptyDraft,
  discardFailedIntent,
  loadActiveIntentForOwner,
  persistSubmittedIntent,
  recordSaleIntentError,
  replaceFailedIntentWithDraft,
  transitionSaleIntent,
  updateDraftIntent,
} from "@/features/pos/persistence";
import { createSubmittedSnapshot, type SaleIntentDraft } from "@/features/pos/intent";
import { localDb } from "@/features/pos/local-db";

const draft = (paymentMethod: SaleIntentDraft["paymentMethod"] = "CASH"): SaleIntentDraft => ({
  cashSessionId: "session-1",
  paymentMethod,
  amountReceived: paymentMethod === "CASH" ? "10.00" : "",
  customer: paymentMethod === "CREDIT" ? { id: "customer-1", name: "Customer", phone: null } : null,
  items: [{
    productId: "product-1",
    productName: "Product 1",
    unitType: "UNIT",
    sellingPrice: "5.00",
    quantity: "1",
  }],
});

async function submittedIntent(ownerId = "owner-1") {
  const intent = await createDraftIntent(ownerId, draft());
  const submitted = createSubmittedSnapshot(intent, "10.00");
  const persisted = await persistSubmittedIntent(ownerId, intent.clientKey, submitted, "2026-01-01T00:00:01.000Z");
  return { intent, submitted, persisted };
}

describe("sale intent persistence", () => {
  beforeEach(async () => {
    if (!localDb.isOpen()) await localDb.open();
    await localDb.saleIntents.clear();
  });

  it("creates and loads one draft per owner", async () => {
    const intent = await createDraftIntent("owner-1", draft());

    await expect(loadActiveIntentForOwner("owner-1")).resolves.toMatchObject({
      clientKey: intent.clientKey,
      state: "DRAFT",
    });
    await expect(loadActiveIntentForOwner("owner-2")).resolves.toBeNull();
    await expect(createDraftIntent("owner-1", draft())).rejects.toBeInstanceOf(ActiveSaleIntentError);
  });

  it("updates an owned draft and rejects another owner", async () => {
    const intent = await createDraftIntent("owner-1", draft());
    const updated = await updateDraftIntent("owner-1", intent.clientKey, {
      ...draft(),
      amountReceived: "20.00",
    });

    expect(updated.draft.amountReceived).toBe("20.00");
    await expect(updateDraftIntent("owner-2", intent.clientKey, draft())).rejects.toThrow("Sale intent not found");
  });

  it("persists a submitted snapshot and prevents draft mutation", async () => {
    const intent = await createDraftIntent("owner-1", draft());
    const snapshot = createSubmittedSnapshot(intent, "10.00");
    const submitted = {
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
    };
    await persistSubmittedIntent("owner-1", intent.clientKey, submitted, "2026-01-01T00:00:01.000Z");
    const loaded = await loadActiveIntentForOwner("owner-1");

    expect(loaded).toMatchObject({
      clientKey: intent.clientKey,
      state: "SUBMITTING",
      submittedAt: "2026-01-01T00:00:01.000Z",
      submitted,
    });
    await expect(updateDraftIntent("owner-1", intent.clientKey, draft())).rejects.toThrow("Only a draft sale intent can be edited");

    submitted.items[0].quantity = "99.000";
    const stored = await localDb.saleIntents.get(intent.clientKey);
    expect(stored?.submitted?.items).toEqual([{ product_id: "product-1", quantity: "1.000" }]);
  });

  it("keeps the same key and exact snapshot through UNCERTAIN recovery", async () => {
    const { intent, submitted } = await submittedIntent();
    const uncertain = await transitionSaleIntent("owner-1", intent.clientKey, "UNCERTAIN");

    expect(uncertain.clientKey).toBe(intent.clientKey);
    expect(uncertain.submitted).toEqual(submitted);
    expect((await loadActiveIntentForOwner("owner-1"))?.state).toBe("UNCERTAIN");
  });

  it("replaces a FAILED operation with a new key", async () => {
    const { intent } = await submittedIntent();
    await recordSaleIntentError("owner-1", intent.clientKey, {
      kind: "DEFINITIVE",
      code: "INSUFFICIENT_STOCK",
      message: "Insufficient stock",
    });

    const replacement = await replaceFailedIntentWithDraft("owner-1", intent.clientKey, draft());

    expect(replacement.clientKey).not.toBe(intent.clientKey);
    expect(replacement.state).toBe("DRAFT");
    expect(await localDb.saleIntents.get(intent.clientKey)).toBeUndefined();
    expect((await loadActiveIntentForOwner("owner-1"))?.clientKey).toBe(replacement.clientKey);
  });

  it("discards only the owned FAILED operation", async () => {
    const { intent } = await submittedIntent();
    await recordSaleIntentError("owner-1", intent.clientKey, {
      kind: "DEFINITIVE",
      code: "INSUFFICIENT_STOCK",
      message: "Insufficient stock",
    });

    await expect(discardFailedIntent("owner-2", intent.clientKey)).rejects.toThrow("Sale intent not found");
    await discardFailedIntent("owner-1", intent.clientKey);
    await expect(loadActiveIntentForOwner("owner-1")).resolves.toBeNull();
  });

  it("cleans up a CONFIRMED intent", async () => {
    const { intent } = await submittedIntent();
    await transitionSaleIntent("owner-1", intent.clientKey, "CONFIRMED");

    await cleanupConfirmedIntentForOwner("owner-1");
    expect(await localDb.saleIntents.get(intent.clientKey)).toBeUndefined();
  });

  it("deletes only an empty unsubmitted draft", async () => {
    const empty = await createDraftIntent("owner-1", { ...draft(), items: [] });
    await deleteEmptyDraft("owner-1", empty.clientKey);
    expect(await localDb.saleIntents.get(empty.clientKey)).toBeUndefined();

    const nonEmpty = await createDraftIntent("owner-1", draft());
    await expect(deleteEmptyDraft("owner-1", nonEmpty.clientKey)).rejects.toThrow("Only an empty draft can be deleted");
    await expect(localDb.saleIntents.get(nonEmpty.clientKey)).resolves.toBeDefined();
  });

  it("does not delete a submitted operation as an empty draft", async () => {
    const { intent } = await submittedIntent();

    await expect(deleteEmptyDraft("owner-1", intent.clientKey)).rejects.toThrow("Only an empty draft can be deleted");
    await expect(localDb.saleIntents.get(intent.clientKey)).resolves.toBeDefined();
  });

  it("retains the key and snapshot after closing and reopening Dexie", async () => {
    const { intent, submitted } = await submittedIntent();
    localDb.close();
    await localDb.open();

    const restored = await loadActiveIntentForOwner("owner-1");
    expect(restored?.clientKey).toBe(intent.clientKey);
    expect(restored?.submitted).toEqual(submitted);
  });
});
