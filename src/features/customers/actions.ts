"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeCustomerText,
  validateCustomerMoney,
  validateCustomerName,
  validateOptionalNotes,
  validateOptionalPhone,
} from "@/features/customers/validation";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: { name?: string; phone?: string; notes?: string; credit_limit?: string };
  values?: {
    name: string;
    phone: string;
    notes: string;
    credit_limit: string;
    credit_enabled: boolean;
    active: boolean;
  };
};

function readCustomerForm(formData: FormData) {
  return {
    name: normalizeCustomerText(formData.get("name")),
    phone: normalizeCustomerText(formData.get("phone")),
    notes: String(formData.get("notes") ?? "").trim(),
    credit_limit: String(formData.get("credit_limit") ?? "").trim(),
    credit_enabled: formData.get("credit_enabled") === "on",
    active: formData.get("active") === "on",
  };
}

function validateCustomerForm(values: ReturnType<typeof readCustomerForm>) {
  const fieldErrors: NonNullable<CustomerFormState["fieldErrors"]> = {};
  const name = validateCustomerName(values.name);
  const phone = validateOptionalPhone(values.phone);
  const notes = validateOptionalNotes(values.notes);
  const limit = validateCustomerMoney(values.credit_limit);
  if (!name.ok) fieldErrors.name = name.error;
  if (!phone.ok) fieldErrors.phone = phone.error;
  if (!notes.ok) fieldErrors.notes = notes.error;
  if (!limit.ok) fieldErrors.credit_limit = limit.error;
  return { fieldErrors, name, phone, notes, limit };
}

function customerSaveError(): string {
  return "No se pudo guardar el cliente. Intenta nuevamente.";
}

export async function createCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireAdmin();
  const values = readCustomerForm(formData);
  const checked = validateCustomerForm(values);
  if (Object.keys(checked.fieldErrors).length > 0) return { fieldErrors: checked.fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: checked.name.value,
      phone: checked.phone.value,
      notes: checked.notes.value,
      credit_limit: checked.limit.value,
      credit_enabled: values.credit_enabled,
      active: values.active,
      created_by: user.userId,
    })
    .select("id")
    .single();
  if (error) return { error: customerSaveError(), values };
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${data.id}`);
}

export async function updateCustomer(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();
  if (!customerId) return { error: "El cliente es obligatorio." };
  const values = readCustomerForm(formData);
  const checked = validateCustomerForm(values);
  if (Object.keys(checked.fieldErrors).length > 0) return { fieldErrors: checked.fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: checked.name.value,
      phone: checked.phone.value,
      notes: checked.notes.value,
      credit_limit: checked.limit.value,
      credit_enabled: values.credit_enabled,
      active: values.active,
    })
    .eq("id", customerId);
  if (error) return { error: customerSaveError(), values };
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  return { values };
}

export type PaymentFormState = {
  error?: string;
  success?: string;
  values?: { amount: string; payment_method: "CASH" | "YAPE"; note: string; client_key: string };
};

export type CustomerPaymentInput = {
  customerId: string;
  amount: string;
  paymentMethod: "CASH" | "YAPE";
  note: string;
  clientKey: string;
};

function paymentError(raw: string) {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (message.includes("Payment amount must be positive")) return "El monto debe ser positivo con máximo 2 decimales.";
  if (message.includes("Payment must be CASH or YAPE")) return "El medio de pago debe ser Efectivo o Yape.";
  if (message.includes("Payment exceeds current debt")) return "El pago no puede superar la deuda actual.";
  if (message.includes("Payment idempotency conflict")) return "La clave de pago ya fue usada con otros datos.";
  if (message.includes("Customer is inactive")) return "El cliente está inactivo.";
  if (message.includes("Open cash session is required")) return "Debes abrir caja antes de registrar un pago.";
  return "No se pudo registrar el pago. Intenta nuevamente.";
}

export async function registerCustomerPayment(
  customerId: string,
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SELLER") return { error: "No tienes acceso a clientes." };
  const amount = String(formData.get("amount") ?? "").trim();
  const paymentMethod = formData.get("payment_method") === "YAPE" ? "YAPE" : "CASH";
  const note = String(formData.get("note") ?? "").trim();
  const clientKey = String(formData.get("client_key") ?? "").trim();
  return registerCustomerPaymentForUser({ customerId, amount, paymentMethod, note, clientKey });
}

async function registerCustomerPaymentForUser(input: CustomerPaymentInput): Promise<PaymentFormState> {
  const { customerId, amount, paymentMethod, note, clientKey } = input;
  const values = { amount, payment_method: paymentMethod, note, client_key: clientKey } as const;
  if (paymentMethod !== "CASH" && paymentMethod !== "YAPE") {
    return { error: "El medio de pago debe ser Efectivo o Yape.", values };
  }
  const checked = validateCustomerMoney(amount);
  if (!checked.ok) return { error: checked.error, values };
  if (!clientKey) return { error: "No se pudo preparar la clave de pago.", values };
  if (note.length > 1000) return { error: "La nota admite máximo 1000 caracteres.", values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_customer_payment", {
    p_client_key: clientKey,
    p_customer_id: customerId,
    p_amount: checked.value,
    p_payment_method: paymentMethod,
    p_note: note || null,
  });
  if (error) return { error: paymentError(error.message), values };
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return {
    success: "Pago registrado correctamente.",
    values: { ...values, client_key: crypto.randomUUID() },
  };
}

export async function registerCustomerPaymentForPos(input: CustomerPaymentInput): Promise<PaymentFormState> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SELLER") return { error: "No tienes acceso a clientes." };
  return registerCustomerPaymentForUser(input);
}
