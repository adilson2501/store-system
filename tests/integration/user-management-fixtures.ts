import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireLocalIntegrationEnvironment } from "./safety";

const environment = requireLocalIntegrationEnvironment();
const execFileAsync = promisify(execFile);
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const password = "B2-local-user-test-password";

function client(key: string) {
  return createClient(environment.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function promote(userId: string) {
  await execFileAsync("psql", [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `begin; alter table public.profiles disable trigger protect_profile_role; update public.profiles set role = 'ADMIN' where id = '${userId}'; alter table public.profiles enable trigger protect_profile_role; commit;`,
  ]);
}

export type UserManagementFixture = {
  service: SupabaseClient;
  admin: SupabaseClient;
  seller: SupabaseClient;
  adminId: string;
  sellerId: string;
  sessionId: string;
  productId: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
};

export async function createUserManagementFixture(): Promise<UserManagementFixture> {
  const service = client(environment.serviceRoleKey);
  const namespace = crypto.randomUUID();
  const create = async (prefix: string) => {
    const email = `b2-${prefix}-${namespace}@local.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `B2 ${prefix} ${namespace}` },
    });
    if (error || !data.user) throw new Error(error?.message ?? "B2 user was not created");
    return { id: data.user.id, email };
  };

  const adminUser = await create("admin");
  const sellerUser = await create("seller");
  await promote(adminUser.id);

  const admin = client(environment.anonKey);
  const seller = client(environment.anonKey);
  if ((await admin.auth.signInWithPassword({ email: adminUser.email, password })).error) throw new Error("B2 admin sign-in failed");
  if ((await seller.auth.signInWithPassword({ email: sellerUser.email, password })).error) throw new Error("B2 seller sign-in failed");

  const product = await service.from("products").insert({
    name: `B2 product ${namespace}`,
    unit_type: "UNIT",
    purchase_cost: "1.00",
    selling_price: "2.00",
    created_by: adminUser.id,
  }).select("id").single();
  if (product.error || !product.data) throw new Error(product.error?.message ?? "B2 product was not created");
  const movement = await service.from("inventory_movements").insert({
    product_id: product.data.id,
    movement_type: "ENTRY",
    quantity: "10",
    created_by: adminUser.id,
  });
  if (movement.error) throw new Error(movement.error.message);

  const session = await service.from("cash_sessions").insert({
    operator_id: sellerUser.id,
    opening_cash: "0.00",
    open_client_key: crypto.randomUUID(),
    status: "OPEN",
  }).select("id").single();
  if (session.error || !session.data) throw new Error(session.error?.message ?? "B2 cash session was not created");

  return {
    service,
    admin,
    seller,
    adminId: adminUser.id,
    sellerId: sellerUser.id,
    sessionId: session.data.id,
    productId: product.data.id,
    email: sellerUser.email,
    password,
    cleanup: async () => {
      await service.from("user_management_events").delete().or(`target_user_id.in.(${adminUser.id},${sellerUser.id}),actor_user_id.in.(${adminUser.id},${sellerUser.id})`);
      await service.from("cash_sessions").delete().eq("id", session.data.id);
      await service.from("inventory_movements").delete().eq("product_id", product.data.id);
      await service.from("products").delete().eq("id", product.data.id);
      await service.auth.admin.deleteUser(adminUser.id);
      await service.auth.admin.deleteUser(sellerUser.id);
    },
  };
}
