import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "ADMIN" | "SELLER";

export type SessionUser = {
  userId: string;
  email: string;
  role: AppRole;
  displayName: string | null;
};

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    // Authenticated user without a profile row means migrations are not applied.
    throw new Error(
      "Profile not found for the authenticated user. Apply supabase/migrations and ensure the signup trigger is installed.",
    );
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: profile.role as AppRole,
    displayName: profile.display_name,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();

  if (session.role !== "ADMIN") {
    redirect("/");
  }

  return session;
}
