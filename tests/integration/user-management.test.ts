import { afterEach, describe, expect, it } from "vitest";
import { createUserManagementFixture, type UserManagementFixture } from "./user-management-fixtures";

let fixture: UserManagementFixture | null = null;

afterEach(async () => {
  await fixture?.cleanup();
  fixture = null;
});

async function updateUser(input: { target: string; role: "ADMIN" | "SELLER"; active: boolean; name?: string }) {
  if (!fixture) throw new Error("Fixture is not initialized");
  return fixture.admin.rpc("update_managed_user", {
    p_target_user_id: input.target,
    p_role: input.role,
    p_is_active: input.active,
    p_display_name: input.name ?? "B2 managed user",
  });
}

describe("local user management invariants", () => {
  it("active ADMIN can create and audit SELLER and ADMIN profiles", async () => {
    fixture = await createUserManagementFixture();
    const seller = await fixture.service.auth.admin.createUser({ email: `b2-created-seller-${crypto.randomUUID()}@local.test`, password: fixture.password, email_confirm: true });
    const admin = await fixture.service.auth.admin.createUser({ email: `b2-created-admin-${crypto.randomUUID()}@local.test`, password: fixture.password, email_confirm: true });
    expect(seller.error).toBeNull();
    expect(admin.error).toBeNull();
    expect(seller.data.user).toBeTruthy();
    expect(admin.data.user).toBeTruthy();
    await updateUser({ target: admin.data.user!.id, role: "ADMIN", active: true });
    await fixture.admin.rpc("record_user_created", { p_target_user_id: seller.data.user!.id });
    await fixture.admin.rpc("record_user_created", { p_target_user_id: admin.data.user!.id });
    const events = await fixture.service.from("user_management_events").select("event_type, target_user_id").in("target_user_id", [seller.data.user!.id, admin.data.user!.id]);
    expect(events.error).toBeNull();
    expect(events.data?.filter((event) => event.event_type === "USER_CREATED")).toHaveLength(2);
    await fixture.service.from("user_management_events").delete().in("target_user_id", [seller.data.user!.id, admin.data.user!.id]);
    await fixture.service.auth.admin.deleteUser(seller.data.user!.id);
    await fixture.service.auth.admin.deleteUser(admin.data.user!.id);
  });

  it("normalizes duplicate email identity safely", async () => {
    fixture = await createUserManagementFixture();
    const email = `B2-DUP-${crypto.randomUUID()}@LOCAL.TEST`;
    const first = await fixture.service.auth.admin.createUser({ email: email.toLowerCase(), password: fixture.password, email_confirm: true });
    const second = await fixture.service.auth.admin.createUser({ email: email.trim().toLowerCase(), password: fixture.password, email_confirm: true });
    expect(first.error).toBeNull();
    expect(second.error).toBeTruthy();
    await fixture.service.auth.admin.deleteUser(first.data.user!.id);
  });

  it("rejects SELLER management calls", async () => {
    fixture = await createUserManagementFixture();
    const result = await fixture.seller.rpc("update_managed_user", { p_target_user_id: fixture.sellerId, p_role: "SELLER", p_is_active: true, p_display_name: "Seller" });
    expect(result.error?.message).toContain("Required user role");
  });

  it("changes roles and protects the last active ADMIN", async () => {
    fixture = await createUserManagementFixture();
    const promoteResult = await updateUser({ target: fixture.sellerId, role: "ADMIN", active: true });
    expect(promoteResult.error).toBeNull();
    const demoteResult = await updateUser({ target: fixture.sellerId, role: "SELLER", active: true });
    expect(demoteResult.error).toBeNull();
    const lastAdmin = await updateUser({ target: fixture.adminId, role: "SELLER", active: true });
    expect(lastAdmin.error?.message ?? "").toContain("active administrator");
  });

  it("blocks deactivation with an open cash session", async () => {
    fixture = await createUserManagementFixture();
    const result = await updateUser({ target: fixture.sellerId, role: "SELLER", active: false });
    expect(result.error?.message).toContain("open cash session");
  });

  it("blocks inactive existing sessions from economic operations", async () => {
    fixture = await createUserManagementFixture();
    await fixture.service.from("cash_sessions").update({ status: "CLOSED", closed_at: new Date().toISOString(), closed_by: fixture.sellerId, counted_cash: "0.00", expected_cash_at_close: "0.00", difference: "0.00", close_client_key: crypto.randomUUID(), cash_sales_at_close: "0.00", yape_sales_at_close: "0.00", credit_sales_at_close: "0.00", cash_debt_payments_at_close: "0.00", yape_debt_payments_at_close: "0.00" }).eq("id", fixture.sessionId);
    const deactivated = await updateUser({ target: fixture.sellerId, role: "SELLER", active: false });
    expect(deactivated.error).toBeNull();
    const sale = await fixture.seller.rpc("confirm_sale", { p_client_key: crypto.randomUUID(), p_payment_method: "CASH", p_items: [{ product_id: fixture.productId, quantity: 1 }], p_amount_received: "2.00", p_customer_id: null, p_cash_session_id: fixture.sessionId });
    const cash = await fixture.seller.rpc("get_current_cash_session");
    const payment = await fixture.seller.rpc("register_customer_payment", { p_client_key: crypto.randomUUID(), p_customer_id: crypto.randomUUID(), p_amount: "1.00", p_payment_method: "CASH", p_note: null });
    expect(sale.error?.message).toContain("inactive");
    expect(cash.error?.message).toContain("inactive");
    expect(payment.error?.message).toContain("inactive");
  });

  it("reactivates access and records only real state changes", async () => {
    fixture = await createUserManagementFixture();
    await fixture.service.from("cash_sessions").update({ status: "CLOSED", closed_at: new Date().toISOString(), closed_by: fixture.sellerId, counted_cash: "0.00", expected_cash_at_close: "0.00", difference: "0.00", close_client_key: crypto.randomUUID(), cash_sales_at_close: "0.00", yape_sales_at_close: "0.00", credit_sales_at_close: "0.00", cash_debt_payments_at_close: "0.00", yape_debt_payments_at_close: "0.00" }).eq("id", fixture.sessionId);
    const first = await updateUser({ target: fixture.sellerId, role: "SELLER", active: false });
    expect(first.error).toBeNull();
    const second = await updateUser({ target: fixture.sellerId, role: "SELLER", active: false });
    expect(second.error).toBeNull();
    const reactivated = await updateUser({ target: fixture.sellerId, role: "SELLER", active: true });
    expect(reactivated.error).toBeNull();
    const events = await fixture.service.from("user_management_events").select("event_type").eq("target_user_id", fixture.sellerId);
    expect(events.data?.filter((event) => event.event_type === "USER_DEACTIVATED")).toHaveLength(1);
    expect(events.data?.filter((event) => event.event_type === "USER_REACTIVATED")).toHaveLength(1);
  });

  it("blocks direct client role and active-state bypasses", async () => {
    fixture = await createUserManagementFixture();
    const role = await fixture.admin.from("profiles").update({ role: "SELLER" }).eq("id", fixture.adminId);
    const active = await fixture.admin.from("profiles").update({ is_active: false }).eq("id", fixture.adminId);
    expect(role.error?.message).toContain("Only administrators can change roles");
    expect(active.error?.message).toContain("Only administrators can change roles");
  });

  it("preserves historical cash-session ownership after deactivation", async () => {
    fixture = await createUserManagementFixture();
    await fixture.service.from("cash_sessions").update({ status: "CLOSED", closed_at: new Date().toISOString(), closed_by: fixture.sellerId, counted_cash: "0.00", expected_cash_at_close: "0.00", difference: "0.00", close_client_key: crypto.randomUUID(), cash_sales_at_close: "0.00", yape_sales_at_close: "0.00", credit_sales_at_close: "0.00", cash_debt_payments_at_close: "0.00", yape_debt_payments_at_close: "0.00" }).eq("id", fixture.sessionId);
    await updateUser({ target: fixture.sellerId, role: "SELLER", active: false });
    const historical = await fixture.service.from("cash_sessions").select("operator_id").eq("id", fixture.sessionId).single();
    expect(historical.data?.operator_id).toBe(fixture.sellerId);
  });
});
