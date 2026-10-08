"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  validateSupplierName,
  validateSupplierNotes,
  validateSupplierPhone,
  validateSupplierRuc,
} from "@/features/suppliers/validation";

export type SupplierFormState = {
  error?: string;
  fieldErrors?: {
    name?: string;
    ruc?: string;
    phone?: string;
    notes?: string;
  };
  values?: {
    name: string;
    ruc: string;
    phone: string;
    notes: string;
  };
};

type SupplierFormValues = NonNullable<SupplierFormState["values"]>;

function readSupplierForm(formData: FormData): SupplierFormValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    ruc: String(formData.get("ruc") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

function validateSupplierForm(values: SupplierFormValues) {
  const fieldErrors: NonNullable<SupplierFormState["fieldErrors"]> = {};
  const name = validateSupplierName(values.name);
  const ruc = validateSupplierRuc(values.ruc);
  const phone = validateSupplierPhone(values.phone);
  const notes = validateSupplierNotes(values.notes);
  if (!name.ok) fieldErrors.name = name.error;
  if (!ruc.ok) fieldErrors.ruc = ruc.error;
  if (!phone.ok) fieldErrors.phone = phone.error;
  if (!notes.ok) fieldErrors.notes = notes.error;
  return { fieldErrors, name, ruc, phone, notes };
}

function databaseError(message: string) {
  if (message.includes("suppliers_ruc_unique_idx") || message.includes("duplicate key")) {
    return "Ya existe un proveedor registrado con este RUC.";
  }
  if (message.includes("suppliers_ruc_format_check")) {
    return "El RUC debe tener exactamente 11 dígitos.";
  }
  if (message.includes("suppliers_name_check")) {
    return "El nombre del proveedor es obligatorio.";
  }
  return "No se pudo guardar el proveedor. Intenta nuevamente.";
}

export async function createSupplier(
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await requireAdmin();
  const values = readSupplierForm(formData);
  const checked = validateSupplierForm(values);
  if (Object.keys(checked.fieldErrors).length > 0) return { fieldErrors: checked.fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: checked.name.value,
      ruc: checked.ruc.value,
      phone: checked.phone.value,
      notes: checked.notes.value,
      active: true,
      created_by: user.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("create supplier failed", { message: error.message });
    return { error: databaseError(error.message), values };
  }

  revalidatePath("/admin/suppliers");
  redirect(`/admin/suppliers/${data.id}`);
}

export async function updateSupplier(
  supplierId: string,
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireAdmin();
  if (!supplierId) return { error: "El proveedor es obligatorio." };

  const values = readSupplierForm(formData);
  const checked = validateSupplierForm(values);
  if (Object.keys(checked.fieldErrors).length > 0) return { fieldErrors: checked.fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: checked.name.value,
      ruc: checked.ruc.value,
      phone: checked.phone.value,
      notes: checked.notes.value,
    })
    .eq("id", supplierId);

  if (error) {
    console.error("update supplier failed", { supplierId, message: error.message });
    return { error: databaseError(error.message), values };
  }

  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
  return { values };
}

export async function setSupplierActive(
  supplierId: string,
  active: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!supplierId) return { error: "El proveedor es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ active })
    .eq("id", supplierId);

  if (error) {
    console.error("set supplier active failed", { supplierId, active, message: error.message });
    return { error: "No se pudo actualizar el estado del proveedor." };
  }

  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
  return {};
}
