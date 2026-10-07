import { afterEach, describe, expect, it } from "vitest";
import { createSaleFixture, type SaleFixture } from "./fixtures";

type SaleInput = {
  clientKey: string;
  sessionId: string;
  paymentMethod: "CASH" | "YAPE" | "CREDIT";
  items: Array<{ product_id: string; quantity: string }>;
  amountReceived: string | null;
  customerId: string | null;
};

let fixture: SaleFixture | null = null;

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
    fixture = null;
  }
});

async function confirm(input: SaleInput) {
  if (!fixture) throw new Error("Fixture is not initialized");
  return fixture.seller.rpc("confirm_sale", {
    p_client_key: input.clientKey,
    p_cash_session_id: input.sessionId,
    p_payment_method: input.paymentMethod,
    p_items: input.items,
    p_amount_received: input.amountReceived,
    p_customer_id: input.customerId,
  });
}

function cashInput(clientKey: string, overrides: Partial<SaleInput> = {}): SaleInput {
  if (!fixture) throw new Error("Fixture is not initialized");
  return {
    clientKey,
    sessionId: fixture.sessionId,
    paymentMethod: "CASH",
    items: [{ product_id: fixture.unitProductId, quantity: "1" }],
    amountReceived: "10.00",
    customerId: null,
    ...overrides,
  };
}

async function countRows(table: string, column: string, value: string): Promise<number> {
  if (!fixture) throw new Error("Fixture is not initialized");
  const { count, error } = await fixture.admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function stock(productId: string): Promise<number> {
  if (!fixture) throw new Error("Fixture is not initialized");
  const { data, error } = await fixture.admin
    .from("inventory_movements")
    .select("quantity")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, row) => total + Number(row.quantity), 0);
}

async function summary() {
  if (!fixture) throw new Error("Fixture is not initialized");
  const { data, error } = await fixture.seller.rpc("get_current_cash_session_summary");
  if (error) throw new Error(error.message);
  return (data as Array<Record<string, string | number>>)[0];
}

async function ledgerTotal(customerId: string): Promise<number> {
  if (!fixture) throw new Error("Fixture is not initialized");
  const { data, error } = await fixture.admin
    .from("customer_credit_ledger")
    .select("amount")
    .eq("customer_id", customerId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

async function expectConflict(input: SaleInput) {
  const { data, error } = await confirm(input);
  expect(data).toBeNull();
  expect(error?.message).toContain("SALE_IDEMPOTENCY_CONFLICT");
}

describe("local confirm_sale economic invariants", () => {
  it("retries a CASH sale without duplicating any economic effect", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID());
    const before = await summary();

    const first = await confirm(input);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      client_key: input.clientKey,
      status: "CONFIRMED",
      payment_method: "CASH",
      amount_received: 10,
      amount_change: 5,
      customer_id: null,
    });
    const saleId = (first.data as { sale_id: string }).sale_id;

    const retry = await confirm(input);
    expect(retry.error).toBeNull();
    expect((retry.data as { sale_id: string }).sale_id).toBe(saleId);
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("sale_items", "sale_id", saleId)).toBe(1);
    expect(await countRows("inventory_movements", "sale_id", saleId)).toBe(1);
    expect(await stock(fixture.unitProductId)).toBe(19);
    expect((await fixture.admin.from("sales").select("cash_session_id").eq("id", saleId).single()).data?.cash_session_id).toBe(fixture.sessionId);

    const after = await summary();
    expect(Number(after.cash_sales) - Number(before.cash_sales)).toBe(5);
    expect(Number(after.expected_cash) - Number(before.expected_cash)).toBe(5);
  });

  it("treats reordered items and equivalent quantities as the same operation", async () => {
    fixture = await createSaleFixture({ secondProduct: true });
    const clientKey = crypto.randomUUID();
    const firstInput = cashInput(clientKey, {
      items: [
        { product_id: fixture.unitProductId, quantity: "1" },
        { product_id: fixture.secondProductId!, quantity: "1" },
      ],
    });
    const first = await confirm(firstInput);
    expect(first.error).toBeNull();
    const saleId = (first.data as { sale_id: string }).sale_id;

    const retry = await confirm({
      ...firstInput,
      items: [
        { product_id: fixture.secondProductId!, quantity: "1.000" },
        { product_id: fixture.unitProductId, quantity: "1.000" },
      ],
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { sale_id: string }).sale_id).toBe(saleId);
    expect(await countRows("sales", "client_key", clientKey)).toBe(1);
    expect(await countRows("sale_items", "sale_id", saleId)).toBe(2);
    expect(await countRows("inventory_movements", "sale_id", saleId)).toBe(2);
    expect(await stock(fixture.unitProductId)).toBe(19);
    expect(await stock(fixture.secondProductId!)).toBe(19);
  });

  it("rejects a changed quantity without changing the original operation", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID());
    const first = await confirm(input);
    const saleId = (first.data as { sale_id: string }).sale_id;
    const beforeStock = await stock(fixture.unitProductId);

    await expectConflict({ ...input, items: [{ product_id: fixture.unitProductId, quantity: "2" }] });
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("sale_items", "sale_id", saleId)).toBe(1);
    expect(await stock(fixture.unitProductId)).toBe(beforeStock);
  });

  it("rejects a changed payment method", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID());
    const first = await confirm(input);
    const saleId = (first.data as { sale_id: string }).sale_id;
    const before = await summary();

    await expectConflict({ ...input, paymentMethod: "YAPE", amountReceived: null });
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("sale_items", "sale_id", saleId)).toBe(1);
    expect(await summary()).toMatchObject({
      cash_sales: before.cash_sales,
      yape_sales: before.yape_sales,
      expected_cash: before.expected_cash,
    });
  });

  it("rejects a changed customer", async () => {
    fixture = await createSaleFixture({ customer: true, secondCustomer: true });
    const input = cashInput(crypto.randomUUID(), {
      paymentMethod: "CREDIT",
      amountReceived: null,
      customerId: fixture.customerId,
    });
    const first = await confirm(input);
    const saleId = (first.data as { sale_id: string }).sale_id;
    const beforeDebt = await ledgerTotal(fixture.customerId!);

    await expectConflict({ ...input, customerId: fixture.secondCustomerId });
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("customer_credit_ledger", "sale_id", saleId)).toBe(1);
    expect(await ledgerTotal(fixture.customerId!)).toBe(beforeDebt);
  });

  it("rejects a changed cash session", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID());
    const first = await confirm(input);
    const saleId = (first.data as { sale_id: string }).sale_id;
    const before = await summary();

    await expectConflict({ ...input, sessionId: crypto.randomUUID() });
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect((await fixture.admin.from("sales").select("cash_session_id").eq("id", saleId).single()).data?.cash_session_id).toBe(fixture.sessionId);
    expect(await summary()).toMatchObject({
      cash_sales: before.cash_sales,
      expected_cash: before.expected_cash,
    });
  });

  it("rejects a changed CASH amount", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID());
    const first = await confirm(input);
    const saleId = (first.data as { sale_id: string }).sale_id;
    const before = await summary();

    await expectConflict({ ...input, amountReceived: "11.00" });
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("sale_items", "sale_id", saleId)).toBe(1);
    expect(await summary()).toMatchObject({
      cash_sales: before.cash_sales,
      expected_cash: before.expected_cash,
    });
  });

  it("keeps YAPE outside physical cash and remains retry-safe", async () => {
    fixture = await createSaleFixture();
    const input = cashInput(crypto.randomUUID(), { paymentMethod: "YAPE", amountReceived: null });
    const before = await summary();

    const first = await confirm(input);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ amount_received: null, amount_change: null, payment_method: "YAPE" });
    const saleId = (first.data as { sale_id: string }).sale_id;
    const retry = await confirm(input);
    expect((retry.data as { sale_id: string }).sale_id).toBe(saleId);
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("inventory_movements", "sale_id", saleId)).toBe(1);
    expect(await stock(fixture.unitProductId)).toBe(19);

    const after = await summary();
    expect(Number(after.yape_sales) - Number(before.yape_sales)).toBe(5);
    expect(after.cash_sales).toBe(before.cash_sales);
    expect(after.expected_cash).toBe(before.expected_cash);
  });

  it("records one FIADO debt effect and remains retry-safe", async () => {
    fixture = await createSaleFixture({ customer: true, secondCustomer: true });
    const input = cashInput(crypto.randomUUID(), {
      paymentMethod: "CREDIT",
      amountReceived: null,
      customerId: fixture.customerId,
    });
    const before = await summary();

    const first = await confirm(input);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      amount_received: null,
      amount_change: null,
      payment_method: "CREDIT",
      customer_id: fixture.customerId,
    });
    const saleId = (first.data as { sale_id: string }).sale_id;
    const retry = await confirm(input);
    expect((retry.data as { sale_id: string }).sale_id).toBe(saleId);
    expect(await countRows("customer_credit_ledger", "sale_id", saleId)).toBe(1);
    expect(await ledgerTotal(fixture.customerId!)).toBe(5);
    expect(await stock(fixture.unitProductId)).toBe(19);
    expect((await summary()).expected_cash).toBe(before.expected_cash);
  });

  it("applies insufficient stock atomically", async () => {
    fixture = await createSaleFixture({ unitStock: "1.000" });
    const input = cashInput(crypto.randomUUID(), { items: [{ product_id: fixture.unitProductId, quantity: "2" }] });
    const before = await summary();

    const { data, error } = await confirm(input);
    expect(data).toBeNull();
    expect(error?.message).toContain("Insufficient stock for product");
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(0);
    expect(await countRows("customer_credit_ledger", "created_by", fixture.sellerId)).toBe(0);
    expect(await stock(fixture.unitProductId)).toBe(1);
    expect(await countRows("inventory_movements", "product_id", fixture.unitProductId)).toBe(1);
    expect((await summary()).cash_sales).toBe(before.cash_sales);
    expect((await summary()).expected_cash).toBe(before.expected_cash);
  });

  it("cross-checks WEIGHT rounding and retry idempotency in PostgreSQL", async () => {
    fixture = await createSaleFixture({ weight: true });
    const input = cashInput(crypto.randomUUID(), {
      items: [{ product_id: fixture.weightProductId!, quantity: "0.05" }],
    });

    const first = await confirm(input);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ total: 0.1 });
    const saleId = (first.data as { sale_id: string }).sale_id;
    const retry = await confirm(input);
    expect((retry.data as { sale_id: string }).sale_id).toBe(saleId);
    expect(await countRows("sales", "client_key", input.clientKey)).toBe(1);
    expect(await countRows("inventory_movements", "sale_id", saleId)).toBe(1);
    expect(await stock(fixture.weightProductId!)).toBeCloseTo(0.95, 6);
  });
});
