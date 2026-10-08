import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/features/auth/session";
import type { ManagedUser } from "@/features/users/types";
import type { AppRole } from "@/features/auth/session";

type ProfileRow = {
  id: string;
  role: AppRole;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type UserManagementEvent = {
  id: string;
  target_user_id: string;
  actor_user_id: string;
  event_type: string;
  previous_role: AppRole | null;
  new_role: AppRole | null;
  previous_is_active: boolean | null;
  new_is_active: boolean | null;
  created_at: string;
};

export async function listAuthUsers() {
  const admin = createAdminClient();
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`No se pudieron cargar los usuarios de Auth: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }

  return users;
}

export async function findAuthUserByEmail(email: string) {
  const users = await listAuthUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email?.toLowerCase() === normalized) ?? null;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [authUsers, profilesResult] = await Promise.all([
    listAuthUsers(),
    supabase
      .from("profiles")
      .select("id, role, display_name, is_active, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (profilesResult.error) {
    throw new Error(`No se pudieron cargar los perfiles: ${profilesResult.error.message}`);
  }

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );

  return authUsers
    .map((authUser) => {
      const profile = profiles.get(authUser.id);
      if (!profile) return null;
      return {
        id: authUser.id,
        email: authUser.email ?? "",
        displayName: profile.display_name ?? "—",
        role: profile.role,
        isActive: profile.is_active,
        createdAt: profile.created_at,
      } satisfies ManagedUser;
    })
    .filter((user): user is ManagedUser => user !== null)
    .sort((left, right) => {
      const createdAt = right.createdAt.localeCompare(left.createdAt);
      return createdAt === 0 ? right.id.localeCompare(left.id) : createdAt;
    });
}

export async function listUserManagementEvents(): Promise<UserManagementEvent[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_management_events")
    .select("id, target_user_id, actor_user_id, event_type, previous_role, new_role, previous_is_active, new_is_active, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (error) throw new Error(`No se pudo cargar la auditoría de usuarios: ${error.message}`);
  return (data ?? []) as UserManagementEvent[];
}
