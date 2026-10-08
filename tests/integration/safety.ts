const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";

export type IntegrationEnvironment = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function requireLocalIntegrationEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): IntegrationEnvironment {
  if (env.SUPABASE_INTEGRATION_LOCAL !== "1") {
    throw new Error("Local Supabase integration tests require SUPABASE_INTEGRATION_LOCAL=1");
  }

  const url = env.SUPABASE_TEST_URL;
  if (!url) throw new Error("SUPABASE_TEST_URL is required for integration tests");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_TEST_URL must be a valid local URL");
  }

  if (
    url !== LOCAL_SUPABASE_URL ||
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "54321" ||
    parsed.pathname !== "/" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Integration tests accept only ${LOCAL_SUPABASE_URL}`);
  }

  const anonKey = env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!anonKey) throw new Error("SUPABASE_TEST_ANON_KEY is required for integration tests");
  if (!serviceRoleKey) throw new Error("SUPABASE_TEST_SERVICE_ROLE_KEY is required for integration tests");

  return { url: LOCAL_SUPABASE_URL, anonKey, serviceRoleKey };
}
