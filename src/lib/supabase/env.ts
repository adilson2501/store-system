const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseEnv(): {
  url: string;
  publishableKey: string;
} {
  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local (see .env.example).",
    );
  }
  if (!supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add it to .env.local (see .env.example).",
    );
  }

  return { url: supabaseUrl, publishableKey: supabasePublishableKey };
}

export function getSupabaseAdminEnv(): {
  url: string;
  serviceRoleKey: string;
} {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY on the server.");
  }

  return { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey };
}
