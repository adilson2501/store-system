import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireLocalIntegrationEnvironment } from "./safety";

const environment = requireLocalIntegrationEnvironment();
const PASSWORD = "A1.4b-local-test-password";

export type FixtureOptions = {
  customer?: boolean;
  secondCustomer?: boolean;
  secondProduct?: boolean;
  secondProductStock?: string;
  unitStock?: string;
  weight?: boolean;
  weightStock?: string;
};

export type SaleFixture = {
  admin: SupabaseClient;
  seller: SupabaseClient;
  sellerId: string;
  sessionId: string;
  unitProductId: string;
  secondProductId: string | null;
  weightProductId: string | null;
  customerId: string | null;
  secondCustomerId: string | null;
  cleanup: () => Promise<void>;
};

function client(key: string): SupabaseClient {
  return createClient(environment.url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function requireData<T>(result: { data: T; error: { message: string } | null }): Promise<NonNullable<T>> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Local integration fixture returned no data");
  return result.data as NonNullable<T>;
}

async function requireSuccess(result: { error: { message: string } | null }): Promise<void> {
  if (result.error) throw new Error(result.error.message);
}

export async function createSaleFixture(options: FixtureOptions = {}): Promise<SaleFixture> {
  const admin = client(environment.serviceRoleKey);
  const sellerClient = client(environment.anonKey);
  const namespace = crypto.randomUUID();
  const email = `a14b-${namespace}@local.test`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `A1.4b ${namespace}` },
  });
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("Local seller user was not created");
  const sellerId = userData.user.id;

  const profile = await requireData(
    await admin.from("profiles").select("id, role").eq("id", sellerId).single(),
  );
  if (profile.role !== "SELLER") throw new Error("Local fixture user is not a SELLER");

  const { error: signInError } = await sellerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(signInError.message);

  const session = await requireData(
    await admin
      .from("cash_sessions")
      .insert({
        operator_id: sellerId,
        opening_cash: "100.00",
        open_client_key: crypto.randomUUID(),
        status: "OPEN",
      })
      .select("id")
      .single(),
  );

  const productIds: string[] = [];
  const createProduct = async (name: string, unitType: "UNIT" | "WEIGHT", price: string, stock: string) => {
    const product = await requireData(
      await admin
        .from("products")
        .insert({
          name,
          barcode: `${namespace}-${productIds.length}`,
          unit_type: unitType,
          purchase_cost: "2.00",
          selling_price: price,
          is_active: true,
          created_by: sellerId,
        })
        .select("id")
        .single(),
    );
    productIds.push(product.id);
    if (Number(stock) > 0) {
      await requireSuccess(
        await admin.from("inventory_movements").insert({
          product_id: product.id,
          movement_type: "ENTRY",
          quantity: stock,
          note: `A1.4b fixture ${namespace}`,
          created_by: sellerId,
        }),
      );
    }
    return product.id;
  };

  const unitProductId = await createProduct("A1.4b UNIT", "UNIT", "5.00", options.unitStock ?? "20.000");
  const secondProductId = options.secondProduct
    ? await createProduct("A1.4b UNIT 2", "UNIT", "5.00", options.secondProductStock ?? "20.000")
    : null;
  const weightProductId = options.weight
    ? await createProduct("A1.4b WEIGHT", "WEIGHT", "1.00", options.weightStock ?? "1.000")
    : null;

  const customerIds: string[] = [];
  const createCustomer = async (name: string) => {
    const customer = await requireData(
      await admin
        .from("customers")
        .insert({
          name,
          phone: `a14b-${namespace}-${customerIds.length}`,
          credit_limit: "100.00",
          credit_enabled: true,
          active: true,
          created_by: sellerId,
        })
        .select("id")
        .single(),
    );
    customerIds.push(customer.id);
    return customer.id;
  };

  const customerId = options.customer || options.secondCustomer ? await createCustomer("A1.4b Customer") : null;
  const secondCustomerId = options.secondCustomer ? await createCustomer("A1.4b Customer 2") : null;

  return {
    admin,
    seller: sellerClient,
    sellerId,
    sessionId: session.id,
    unitProductId,
    secondProductId,
    weightProductId,
    customerId,
    secondCustomerId,
    cleanup: async () => {
      const sales = await requireData(
        await admin.from("sales").select("id").eq("seller_id", sellerId),
      );
      const saleIds = sales.map((sale) => sale.id);
      if (saleIds.length) {
        await requireSuccess(await admin.from("customer_credit_ledger").delete().in("sale_id", saleIds));
        await requireSuccess(await admin.from("sale_items").delete().in("sale_id", saleIds));
        await requireSuccess(await admin.from("inventory_movements").delete().in("sale_id", saleIds));
        await requireSuccess(await admin.from("sales").delete().in("id", saleIds));
      }
      if (customerIds.length) {
        await requireSuccess(await admin.from("customer_credit_ledger").delete().in("customer_id", customerIds));
      }
      await requireSuccess(await admin.from("inventory_movements").delete().in("product_id", productIds));
      await requireSuccess(await admin.from("cash_sessions").delete().eq("id", session.id));
      if (customerIds.length) {
        await requireSuccess(await admin.from("customers").delete().in("id", customerIds));
      }
      await requireSuccess(await admin.from("products").delete().in("id", productIds));
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(sellerId);
      if (deleteUserError) throw new Error(deleteUserError.message);
    },
  };
}
