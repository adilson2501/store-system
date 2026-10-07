import { afterEach, describe, expect, it } from "vitest";
import { createUserManagementFixture, type UserManagementFixture } from "./user-management-fixtures";

let fixture: UserManagementFixture | null = null;
const createdSaleIds: string[] = [];
const extraProductIds: string[] = [];
let customerId: string | null = null;

afterEach(async () => {
  if (fixture) {
    if (createdSaleIds.length) {
      await fixture.service.from("customer_credit_ledger").delete().in("sale_id", createdSaleIds);
      await fixture.service.from("sale_items").delete().in("sale_id", createdSaleIds);
      await fixture.service.from("inventory_movements").delete().in("sale_id", createdSaleIds);
      await fixture.service.from("sales").delete().in("id", createdSaleIds);
    }
    if (customerId) await fixture.service.from("customers").delete().eq("id", customerId);
    if (extraProductIds.length) {
      await fixture.service.from("inventory_movements").delete().in("product_id", extraProductIds);
      await fixture.service.from("products").delete().in("id", extraProductIds);
    }
    await fixture.cleanup();
    fixture = null;
  }
  createdSaleIds.length = 0;
  extraProductIds.length = 0;
  customerId = null;
});

async function confirm(paymentMethod: "CASH" | "YAPE" | "CREDIT", customer: string | null = null, productId?: string, quantity = "1") {
  if (!fixture) throw new Error("Report fixture is not initialized");
  const result = await fixture.seller.rpc("confirm_sale", {
    p_client_key: crypto.randomUUID(),
    p_cash_session_id: fixture.sessionId,
    p_payment_method: paymentMethod,
    p_items: [{ product_id: productId ?? fixture.productId, quantity }],
    p_amount_received: paymentMethod === "CASH" ? "5.00" : null,
    p_customer_id: customer,
  });
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Sale was not created");
  const saleId = (result.data as { sale_id: string }).sale_id;
  createdSaleIds.push(saleId);
  return saleId;
}

async function report(start: string, end: string) {
  if (!fixture) throw new Error("Report fixture is not initialized");
  const result = await fixture.admin.rpc("get_admin_sales_report", { p_start: start, p_end: end });
  if (result.error) throw new Error(result.error.message);
  return result.data as { kpis: Record<string, string | number>; daily: Array<Record<string, string | number>> };
}

describe("local admin sales reporting", () => {
  it("returns zeroes and an empty trend with no sales", async () => {
    fixture = await createUserManagementFixture();
    const invalid = await fixture.admin.rpc("get_admin_sales_report", { p_start: "2026-10-08T05:00:00Z", p_end: "2026-10-07T05:00:00Z" });
    expect(invalid.error?.message).toContain("invalid");
    const result = await report("2026-10-07T05:00:00Z", "2026-10-08T05:00:00Z");
    expect(Number(result.kpis.total_sold)).toBe(0);
    expect(Number(result.kpis.sale_count)).toBe(0);
    expect(result.daily).toEqual([]);
  });

  it("includes CASH, YAPE, and CREDIT sales and uses the historical cost snapshot", async () => {
    fixture = await createUserManagementFixture();
    const customer = await fixture.service.from("customers").insert({ name: "B3 customer", credit_limit: "100.00", credit_enabled: true, active: true, created_by: fixture.adminId }).select("id").single();
    if (customer.error || !customer.data) throw new Error(customer.error?.message ?? "Customer was not created");
    customerId = customer.data.id;
    await confirm("CASH");
    await confirm("YAPE");
    await confirm("CREDIT", customerId);
    const costChange = await fixture.service.from("products").update({ purchase_cost: "99.00" }).eq("id", fixture.productId);
    expect(costChange.error).toBeNull();
    const result = await report("2026-10-07T05:00:00Z", "2026-10-08T05:00:00Z");
    expect(Number(result.kpis.sale_count)).toBe(3);
    expect(Number(result.kpis.total_sold)).toBe(6);
    expect(Number(result.kpis.cash)).toBe(2);
    expect(Number(result.kpis.yape)).toBe(2);
    expect(Number(result.kpis.credit)).toBe(2);
    expect(Number(result.kpis.gross_profit)).toBe(3);
  });

  it("reports WEIGHT snapshots and Lima start/end boundaries", async () => {
    fixture = await createUserManagementFixture();
    const weight = await fixture.service.from("products").insert({ name: "B3 weight", unit_type: "WEIGHT", purchase_cost: "1.00", selling_price: "1.00", is_active: true, created_by: fixture.adminId }).select("id").single();
    if (weight.error || !weight.data) throw new Error(weight.error?.message ?? "Weight product was not created");
    extraProductIds.push(weight.data.id);
    const movement = await fixture.service.from("inventory_movements").insert({ product_id: weight.data.id, movement_type: "ENTRY", quantity: "1.000", created_by: fixture.adminId });
    expect(movement.error).toBeNull();
    await confirm("YAPE", null, weight.data.id, "0.555");
    const startSale = await fixture.service.from("sales").insert({ seller_id: fixture.sellerId, payment_method: "CASH", status: "CONFIRMED", total: "4.00", amount_received: "4.00", amount_change: "0.00", created_at: "2026-10-07T05:00:00Z" }).select("id").single();
    const endSale = await fixture.service.from("sales").insert({ seller_id: fixture.sellerId, payment_method: "CASH", status: "CONFIRMED", total: "8.00", amount_received: "8.00", amount_change: "0.00", created_at: "2026-10-08T05:00:00Z" }).select("id").single();
    if (startSale.error || !startSale.data || endSale.error || !endSale.data) throw new Error("Boundary sale was not created");
    createdSaleIds.push(startSale.data.id, endSale.data.id);
    const result = await report("2026-10-07T05:00:00Z", "2026-10-08T05:00:00Z");
    expect(Number(result.kpis.sale_count)).toBe(2);
    expect(Number(result.kpis.total_sold)).toBe(4.6);
    expect(Number(result.kpis.gross_profit)).toBe(0.05);
    expect(result.daily).toEqual([expect.objectContaining({ business_date: "2026-10-07", sale_count: 2 })]);
  });

  it("excludes a voided sale and keeps the end boundary exclusive", async () => {
    fixture = await createUserManagementFixture();
    const saleId = await confirm("CASH");
    const voided = await fixture.admin.rpc("void_sale", { p_sale_id: saleId, p_reason: "B3 test", p_client_key: crypto.randomUUID() });
    expect(voided.error).toBeNull();
    const atEnd = await fixture.service.from("sales").insert({ seller_id: fixture.sellerId, payment_method: "CASH", status: "CONFIRMED", total: "2.00", amount_received: "5.00", amount_change: "3.00", created_at: "2026-10-08T05:00:00Z" }).select("id").single();
    if (atEnd.error || !atEnd.data) throw new Error(atEnd.error?.message ?? "Boundary sale was not created");
    createdSaleIds.push(atEnd.data.id);
    const result = await report("2026-10-07T05:00:00Z", "2026-10-08T05:00:00Z");
    expect(Number(result.kpis.sale_count)).toBe(0);
  });

  it("blocks SELLER and inactive ADMIN callers", async () => {
    fixture = await createUserManagementFixture();
    const sellerResult = await fixture.seller.rpc("get_admin_sales_report", { p_start: "2026-10-07T05:00:00Z", p_end: "2026-10-08T05:00:00Z" });
    expect(sellerResult.error?.message).toContain("Required user role");
    await fixture.seller.auth.signOut();
    const anonResult = await fixture.seller.rpc("get_admin_sales_report", { p_start: "2026-10-07T05:00:00Z", p_end: "2026-10-08T05:00:00Z" });
    expect(anonResult.error).toBeTruthy();
    expect((await fixture.admin.rpc("update_managed_user", { p_target_user_id: fixture.sellerId, p_role: "ADMIN", p_is_active: true, p_display_name: "B3 second admin" })).error).toBeNull();
    expect((await fixture.admin.rpc("update_managed_user", { p_target_user_id: fixture.adminId, p_role: "ADMIN", p_is_active: false, p_display_name: "B3 inactive admin" })).error).toBeNull();
    const inactiveResult = await fixture.admin.rpc("get_admin_sales_report", { p_start: "2026-10-07T05:00:00Z", p_end: "2026-10-08T05:00:00Z" });
    expect(inactiveResult.error?.message).toContain("inactive");
  });
});
