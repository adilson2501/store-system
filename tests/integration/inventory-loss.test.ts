import { afterEach, describe, expect, it } from "vitest";
import { createLossFixture, type LossFixture } from "./loss-fixtures";

let fixture: LossFixture | null = null;

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
    fixture = null;
  }
});

async function register(input: {
  productId: string;
  quantity: string;
  reason: string;
  note?: string | null;
  operationKey?: string;
}, client = fixture?.admin) {
  if (!client) throw new Error("B1 fixture is not initialized");
  return client.rpc("register_inventory_loss", {
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_note: input.note ?? null,
    p_operation_key: input.operationKey ?? crypto.randomUUID(),
  });
}

async function stock(productId: string): Promise<number> {
  if (!fixture) throw new Error("B1 fixture is not initialized");
  const { data, error } = await fixture.service.from("inventory_movements").select("quantity").eq("product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, movement) => total + Number(movement.quantity), 0);
}

async function lossCount(productId: string): Promise<number> {
  if (!fixture) throw new Error("B1 fixture is not initialized");
  const { count, error } = await fixture.service.from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("movement_type", "LOSS");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

describe("local inventory loss invariants", () => {
  it("registers a UNIT loss exactly once", async () => {
    fixture = await createLossFixture();
    const operationKey = crypto.randomUUID();
    const first = await register({ productId: fixture.productId, quantity: "2", reason: "DAMAGED", operationKey });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ movement_type: "LOSS", quantity: 2, loss_reason: "DAMAGED", operation_key: operationKey, previous_stock: 10, new_stock: 8 });
    const movementId = (first.data as { movement_id: string }).movement_id;

    const retry = await register({ productId: fixture.productId, quantity: "2.0", reason: "DAMAGED", operationKey });
    expect(retry.error).toBeNull();
    expect((retry.data as { movement_id: string }).movement_id).toBe(movementId);
    expect(await lossCount(fixture.productId)).toBe(1);
    expect(await stock(fixture.productId)).toBe(8);
  });

  it("registers a WEIGHT loss with three-decimal quantity", async () => {
    fixture = await createLossFixture({ weight: true });
    const result = await register({ productId: fixture.weightProductId!, quantity: "0.250", reason: "SPOILED", note: "Producto malogrado" });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ quantity: 0.25, previous_stock: 3.5, new_stock: 3.25 });
    expect(await stock(fixture.weightProductId!)).toBeCloseTo(3.25, 6);
  });

  it("rejects insufficient stock atomically", async () => {
    fixture = await createLossFixture({ stock: "1.000" });
    const result = await register({ productId: fixture.productId, quantity: "2", reason: "EXPIRED" });
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("Insufficient stock for inventory loss");
    expect(await lossCount(fixture.productId)).toBe(0);
    expect(await stock(fixture.productId)).toBe(1);
  });

  it("rejects fractional UNIT quantities", async () => {
    fixture = await createLossFixture();
    const result = await register({ productId: fixture.productId, quantity: "1.25", reason: "DAMAGED" });
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("UNIT products require whole-number loss quantities");
    expect(await stock(fixture.productId)).toBe(10);
  });

  it("blocks SELLER registration", async () => {
    fixture = await createLossFixture();
    const result = await register({ productId: fixture.productId, quantity: "1", reason: "LOST" }, fixture.seller);
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("Only administrators can register inventory loss");
    expect(await lossCount(fixture.productId)).toBe(0);
  });

  it("requires a note for OTHER", async () => {
    fixture = await createLossFixture();
    const result = await register({ productId: fixture.productId, quantity: "1", reason: "OTHER" });
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("A note is required for OTHER loss reason");
  });

  it("conflicts when an operation key is reused with changed payload", async () => {
    fixture = await createLossFixture();
    const operationKey = crypto.randomUUID();
    const first = await register({ productId: fixture.productId, quantity: "1", reason: "EXPIRED", operationKey });
    expect(first.error).toBeNull();
    const conflict = await register({ productId: fixture.productId, quantity: "2", reason: "EXPIRED", operationKey });
    expect(conflict.data).toBeNull();
    expect(conflict.error?.message).toContain("LOSS_IDEMPOTENCY_CONFLICT");
    expect(await lossCount(fixture.productId)).toBe(1);
    expect(await stock(fixture.productId)).toBe(9);
  });

  it("allows disposing remaining stock from an inactive product", async () => {
    fixture = await createLossFixture({ inactive: true });
    const result = await register({ productId: fixture.productId, quantity: "1", reason: "LOST" });
    expect(result.error).toBeNull();
    expect(await stock(fixture.productId)).toBe(9);
  });

  it("serializes concurrent losses so stock cannot become negative", async () => {
    fixture = await createLossFixture({ stock: "10.000" });
    const [left, right] = await Promise.all([
      register({ productId: fixture.productId, quantity: "6", reason: "DAMAGED" }),
      register({ productId: fixture.productId, quantity: "6", reason: "DAMAGED" }),
    ]);
    const results = [left, right];
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error?.message.includes("Insufficient stock for inventory loss"))).toHaveLength(1);
    expect(await lossCount(fixture.productId)).toBe(1);
    expect(await stock(fixture.productId)).toBe(4);
  });
});
