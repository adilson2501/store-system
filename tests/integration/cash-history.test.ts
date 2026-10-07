import { afterEach, describe, expect, it } from "vitest";
import { createUserManagementFixture, type UserManagementFixture } from "./user-management-fixtures";

let fixture: UserManagementFixture | null = null;
const saleIds: string[] = [];
let customerId: string | null = null;

afterEach(async () => {
  if (fixture) {
    if (saleIds.length) {
      await fixture.service.from("customer_credit_ledger").delete().in("sale_id", saleIds);
      await fixture.service.from("sale_items").delete().in("sale_id", saleIds);
      await fixture.service.from("inventory_movements").delete().in("sale_id", saleIds);
      await fixture.service.from("sales").delete().in("id", saleIds);
    }
    if (customerId) await fixture.service.from("customer_credit_ledger").delete().eq("customer_id", customerId);
    if (customerId) await fixture.service.from("customers").delete().eq("id", customerId);
    await fixture.cleanup();
    fixture = null;
  }
  saleIds.length = 0;
  customerId = null;
});

async function confirm(paymentMethod: "CASH" | "YAPE" | "CREDIT", customer: string | null = null) {
  if (!fixture) throw new Error("Cash history fixture is not initialized");
  const result = await fixture.seller.rpc("confirm_sale", {
    p_client_key: crypto.randomUUID(),
    p_cash_session_id: fixture.sessionId,
    p_payment_method: paymentMethod,
    p_items: [{ product_id: fixture.productId, quantity: 1 }],
    p_amount_received: paymentMethod === "CASH" ? "5.00" : null,
    p_customer_id: customer,
  });
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Sale was not created");
  const saleId = (result.data as { sale_id: string }).sale_id;
  saleIds.push(saleId);
}

describe("local cash history authoritative summary", () => {
  it("keeps list-equivalent summary values aligned with the closed-session detail", async () => {
    fixture = await createUserManagementFixture();
    const opening = await fixture.service.from("cash_sessions").update({ opening_cash: "10.00" }).eq("id", fixture.sessionId);
    expect(opening.error).toBeNull();

    const customer = await fixture.service.from("customers").insert({ name: "B4 cash customer", credit_limit: "100.00", credit_enabled: true, active: true, created_by: fixture.adminId }).select("id").single();
    if (customer.error || !customer.data) throw new Error(customer.error?.message ?? "Customer was not created");
    customerId = customer.data.id;

    await confirm("CASH");
    await confirm("YAPE");
    await confirm("CREDIT", customerId);
    const payment = await fixture.seller.rpc("register_customer_payment", {
      p_client_key: crypto.randomUUID(),
      p_customer_id: customerId,
      p_amount: "1.00",
      p_payment_method: "CASH",
      p_note: "B4 test payment",
    });
    expect(payment.error).toBeNull();

    const closed = await fixture.seller.rpc("close_cash_session", {
      p_session_id: fixture.sessionId,
      p_close_client_key: crypto.randomUUID(),
      p_counted_cash: "13.50",
    });
    expect(closed.error).toBeNull();

    const summary = await fixture.admin.rpc("get_admin_cash_session_summary", { p_session_id: fixture.sessionId });
    expect(summary.error).toBeNull();
    const row = (summary.data as Array<Record<string, string | number>>)[0];
    expect(row).toMatchObject({
      opening_cash: 10,
      cash_sales: 2,
      yape_sales: 2,
      credit_sales: 2,
      cash_debt_payments: 1,
      total_sales: 6,
      expected_cash: 13,
      counted_cash: 13.5,
      difference: 0.5,
    });
    expect(Number(row.total_sales)).not.toBe(Number(row.opening_cash));
    expect(Number(row.total_sales)).not.toBe(Number(row.cash_debt_payments));
  });
});
