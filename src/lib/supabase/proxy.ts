import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{
  response: NextResponse;
  isAuthenticated: boolean;
}> {
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh auth cookies when the session is expired.
  const { data, error } = await supabase.auth.getClaims();

  return {
    response,
    isAuthenticated: !error && data !== null,
  };
}
