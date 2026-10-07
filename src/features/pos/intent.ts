import type { UnitType } from "@/features/catalog/products/types";
import { parseCents, parseThousandths } from "@/features/pos/money";
import type { PaymentMethod } from "@/features/pos/types";

export type SaleIntentState =
  | "DRAFT"
  | "SUBMITTING"
  | "UNCERTAIN"
  | "CONFIRMED"
  | "FAILED"
  | "CONFLICT";

export type SaleIntentErrorKind = "DEFINITIVE" | "UNKNOWN";

export type SaleIntentError = {
  kind: SaleIntentErrorKind;
  code: string;
  message: string;
  at: string;
};

export type SaleIntentProduct = {
  productId: string;
  productName: string;
  unitType: UnitType;
  sellingPrice: string;
  quantity: string;
};

export type SaleIntentCustomer = {
  id: string;
  name: string;
  phone: string | null;
};

export type SaleIntentDraft = {
  cashSessionId: string | null;
  paymentMethod: PaymentMethod;
  amountReceived: string;
  customer: SaleIntentCustomer | null;
  items: SaleIntentProduct[];
};

export type SubmittedSaleSnapshot = Readonly<{
  client_key: string;
  cash_session_id: string;
  payment_method: PaymentMethod;
  items: ReadonlyArray<Readonly<{
    product_id: string;
    quantity: string;
  }>>;
  amount_received: string | null;
  customer_id: string | null;
}>;

export type SaleIntent = {
  clientKey: string;
  ownerId: string;
  state: SaleIntentState;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  draft: SaleIntentDraft;
  submitted: SubmittedSaleSnapshot | null;
  lastError: SaleIntentError | null;
};

export type SubmittedAmount = string | null;

export function createSaleIntent(ownerId: string, draft: SaleIntentDraft, now = new Date()): SaleIntent {
  if (!ownerId.trim()) throw new Error("Sale intent owner is required");

  const timestamp = now.toISOString();
  return {
    clientKey: crypto.randomUUID(),
    ownerId,
    state: "DRAFT",
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: null,
    confirmedAt: null,
    draft: cloneDraft(draft),
    submitted: null,
    lastError: null,
  };
}

export function createSubmittedSnapshot(
  intent: SaleIntent,
  amountReceived: SubmittedAmount,
): SubmittedSaleSnapshot {
  if (intent.state !== "DRAFT" || intent.submitted !== null) {
    throw new Error("Only a draft sale intent can be submitted");
  }
  if (!intent.draft.cashSessionId) throw new Error("Cash session is required");
  if (intent.draft.items.length === 0) throw new Error("At least one sale item is required");

  const items = normalizeSubmittedItems(intent.draft.items);
  if (intent.draft.paymentMethod === "CASH") {
    if (amountReceived === null || parseCents(amountReceived) === null) {
      throw new Error("Cash received is required");
    }
  } else if (amountReceived !== null) {
    throw new Error("Non-cash sale cannot include cash received");
  }

  if (intent.draft.paymentMethod === "CREDIT" && !intent.draft.customer) {
    throw new Error("Customer is required for credit sales");
  }
  if (intent.draft.paymentMethod !== "CREDIT" && intent.draft.customer) {
    throw new Error("Customer is only allowed for credit sales");
  }

  return {
    client_key: intent.clientKey,
    cash_session_id: intent.draft.cashSessionId,
    payment_method: intent.draft.paymentMethod,
    items,
    amount_received: amountReceived,
    customer_id: intent.draft.customer?.id ?? null,
  };
}

export function normalizeSubmittedItems(items: ReadonlyArray<SaleIntentProduct>): SubmittedSaleSnapshot["items"] {
  const quantities = new Map<string, bigint>();

  for (const item of items) {
    const productId = item.productId.trim().toLowerCase();
    const quantity = parseThousandths(item.quantity);
    if (!productId || quantity === null || quantity <= BigInt(0)) {
      throw new Error("Sale item quantity is invalid");
    }
    quantities.set(productId, (quantities.get(productId) ?? BigInt(0)) + quantity);
  }

  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productId, quantity]) => ({
      product_id: productId,
      quantity: formatThousandths(quantity),
    }));
}

function formatThousandths(value: bigint): string {
  const whole = value / BigInt(1000);
  const fraction = (value % BigInt(1000)).toString().padStart(3, "0");
  return `${whole}.${fraction}`;
}

export function cloneDraft(draft: SaleIntentDraft): SaleIntentDraft {
  return {
    cashSessionId: draft.cashSessionId,
    paymentMethod: draft.paymentMethod,
    amountReceived: draft.amountReceived,
    customer: draft.customer ? { ...draft.customer } : null,
    items: draft.items.map((item) => ({ ...item })),
  };
}

export function isActiveSaleIntentState(state: SaleIntentState): boolean {
  return state !== "CONFIRMED";
}

export function canTransitionSaleIntent(from: SaleIntentState, to: SaleIntentState): boolean {
  if (from === "CONFIRMED" || from === "CONFLICT") return false;
  if (from === "DRAFT") return to === "SUBMITTING";
  if (from === "SUBMITTING") return to === "CONFIRMED" || to === "FAILED" || to === "UNCERTAIN" || to === "CONFLICT";
  if (from === "UNCERTAIN") return to === "CONFIRMED" || to === "FAILED" || to === "CONFLICT";
  return false;
}
