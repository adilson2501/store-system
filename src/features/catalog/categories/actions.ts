"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export type CategoryFormState = {
  error?: string;
  success?: boolean;
};

function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const name = normalizeName(formData.get("name"));

  if (!name) {
    return { error: "Category name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .insert({ name, is_active: true });

  if (error) {
    if (error.code === "23505") {
      return { error: "A category with this name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function updateCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = normalizeName(formData.get("name"));
  const isActive = formData.get("is_active") === "on";

  if (!id) {
    return { error: "Category is required." };
  }
  if (!name) {
    return { error: "Category name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name, is_active: isActive })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A category with this name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}
