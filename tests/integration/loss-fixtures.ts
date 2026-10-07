import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireLocalIntegrationEnvironment } from "./safety";

const environment = requireLocalIntegrationEnvironment();
const PASSWORD = "B1-local-loss-test-password";
const execFileAsync = promisify(execFile);
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function client(key: string): SupabaseClient {
  return createClient(environment.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function row<T>(result: { data: T; error: { message: string } | null }): Promise<NonNullable<T>> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Loss fixture returned no row");
  return result.data as NonNullable<T>;
}

async function success(result: { error: { message: string } | null }): Promise<void> {
  if (result.error) throw new Error(result.error.message);
}

export type LossFixture = {
  service: SupabaseClient;
  admin: SupabaseClient;
  seller: SupabaseClient;
  adminId: string;
  sellerId: string;
  productId: string;
  weightProductId: string | null;
  cleanup: () => Promise<void>;
};

export async function createLossFixture(options: {
  stock?: string;
  weight?: boolean;
  inactive?: boolean;
} = {}): Promise<LossFixture> {
  const service = client(environment.serviceRoleKey);
  const namespace = crypto.randomUUID();

  const createUser = async (prefix: string) => {
    const email = `b1-${prefix}-${namespace}@local.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `B1 ${prefix} ${namespace}` },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("B1 fixture user was not created");
    return { email, id: data.user.id };
  };

  const adminUser = await createUser("admin");
  const sellerUser = await createUser("seller");
  await execFileAsync("psql", [
    LOCAL_DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `begin; alter table public.profiles disable trigger protect_profile_role; update public.profiles set role = 'ADMIN' where id = '${adminUser.id}'; alter table public.profiles enable trigger protect_profile_role; commit;`,
  ]);

  const admin = client(environment.anonKey);
  const seller = client(environment.anonKey);
  const adminSignIn = await admin.auth.signInWithPassword({ email: adminUser.email, password: PASSWORD });
  const sellerSignIn = await seller.auth.signInWithPassword({ email: sellerUser.email, password: PASSWORD });
  if (adminSignIn.error) throw new Error(adminSignIn.error.message);
  if (sellerSignIn.error) throw new Error(sellerSignIn.error.message);

  const product = await row(
    await service.from("products").insert({
      name: `B1 UNIT ${namespace}`,
      barcode: `b1-${namespace}-unit`,
      unit_type: "UNIT",
      purchase_cost: "2.00",
      selling_price: "5.00",
      is_active: !options.inactive,
      created_by: adminUser.id,
    }).select("id").single(),
  );
  await success(await service.from("inventory_movements").insert({
    product_id: product.id,
    movement_type: "ENTRY",
    quantity: options.stock ?? "10.000",
    note: `B1 fixture ${namespace}`,
    created_by: adminUser.id,
  }));

  let weightProductId: string | null = null;
  if (options.weight) {
    const weightProduct = await row(
      await service.from("products").insert({
        name: `B1 WEIGHT ${namespace}`,
        barcode: `b1-${namespace}-weight`,
        unit_type: "WEIGHT",
        purchase_cost: "2.00",
        selling_price: "5.00",
        is_active: true,
        created_by: adminUser.id,
      }).select("id").single(),
    );
    weightProductId = weightProduct.id;
    await success(await service.from("inventory_movements").insert({
      product_id: weightProduct.id,
      movement_type: "ENTRY",
      quantity: "3.500",
      note: `B1 fixture ${namespace}`,
      created_by: adminUser.id,
    }));
  }

  return {
    service,
    admin,
    seller,
    adminId: adminUser.id,
    sellerId: sellerUser.id,
    productId: product.id,
    weightProductId,
    cleanup: async () => {
      const productIds = [product.id, ...(weightProductId ? [weightProductId] : [])];
      await success(await service.from("inventory_movements").delete().in("product_id", productIds));
      await success(await service.from("products").delete().in("id", productIds));
      const adminDelete = await service.auth.admin.deleteUser(adminUser.id);
      if (adminDelete.error) throw new Error(adminDelete.error.message);
      const sellerDelete = await service.auth.admin.deleteUser(sellerUser.id);
      if (sellerDelete.error) throw new Error(sellerDelete.error.message);
    },
  };
}
