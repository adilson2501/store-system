import { localDb } from "@/features/pos/local-db";
import {
  canTransitionSaleIntent,
  cloneDraft,
  createSaleIntent,
  type SaleIntent,
  type SaleIntentDraft,
  type SaleIntentError,
  type SaleIntentState,
  type SubmittedSaleSnapshot,
} from "@/features/pos/intent";

const ACTIVE_STATES: SaleIntentState[] = ["DRAFT", "SUBMITTING", "UNCERTAIN", "FAILED", "CONFLICT"];

export class ActiveSaleIntentError extends Error {
  constructor() {
    super("An active sale intent already exists for this owner");
  }
}

export class SaleIntentNotFoundError extends Error {
  constructor() {
    super("Sale intent not found");
  }
}

export async function createDraftIntent(ownerId: string, draft: SaleIntentDraft): Promise<SaleIntent> {
  const intent = createSaleIntent(ownerId, draft);

  await localDb.transaction("rw", localDb.saleIntents, async () => {
    const active = await findActiveForOwner(ownerId);
    if (active) throw new ActiveSaleIntentError();
    await localDb.saleIntents.add(intent);
  });

  return intent;
}

export async function loadActiveIntentForOwner(ownerId: string): Promise<SaleIntent | null> {
  const intents = await localDb.saleIntents
    .where("ownerId")
    .equals(ownerId)
    .filter((intent) => ACTIVE_STATES.includes(intent.state))
    .toArray();

  if (intents.length > 1) {
    throw new ActiveSaleIntentError();
  }
  return intents[0] ?? null;
}

export async function loadUnresolvedIntentForOwner(ownerId: string): Promise<SaleIntent | null> {
  const intents = await localDb.saleIntents
    .where("ownerId")
    .equals(ownerId)
    .filter((intent) => ["SUBMITTING", "UNCERTAIN"].includes(intent.state))
    .toArray();

  if (intents.length > 1) {
    throw new ActiveSaleIntentError();
  }
  return intents[0] ?? null;
}

export async function updateDraftIntent(
  ownerId: string,
  clientKey: string,
  draft: SaleIntentDraft,
): Promise<SaleIntent> {
  return localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (intent.state !== "DRAFT" || intent.submitted !== null) {
      throw new Error("Only a draft sale intent can be edited");
    }

    const updated = {
      ...intent,
      draft: cloneDraft(draft),
      updatedAt: new Date().toISOString(),
    };
    await localDb.saleIntents.put(updated);
    return updated;
  });
}

export async function persistSubmittedIntent(
  ownerId: string,
  clientKey: string,
  submitted: SubmittedSaleSnapshot,
  submittedAt = new Date().toISOString(),
): Promise<SaleIntent> {
  if (submitted.client_key !== clientKey) {
    throw new Error("Submitted sale key does not match the intent");
  }

  return localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (!canTransitionSaleIntent(intent.state, "SUBMITTING") || intent.submitted !== null) {
      throw new Error("Only an unsubmitted draft can be submitted");
    }

    const updated: SaleIntent = {
      ...intent,
      state: "SUBMITTING",
      submittedAt,
      updatedAt: submittedAt,
      submitted: cloneSubmittedSnapshot(submitted),
      lastError: null,
    };
    await localDb.saleIntents.put(updated);
    return updated;
  });
}

export async function transitionSaleIntent(
  ownerId: string,
  clientKey: string,
  nextState: SaleIntentState,
  at = new Date().toISOString(),
): Promise<SaleIntent> {
  return localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (!canTransitionSaleIntent(intent.state, nextState)) {
      throw new Error(`Invalid sale intent transition: ${intent.state} -> ${nextState}`);
    }

    const updated: SaleIntent = {
      ...intent,
      state: nextState,
      updatedAt: at,
      confirmedAt: nextState === "CONFIRMED" ? at : intent.confirmedAt,
    };
    await localDb.saleIntents.put(updated);
    return updated;
  });
}

export async function markSubmittingAsUncertain(ownerId: string, clientKey: string): Promise<SaleIntent> {
  return transitionSaleIntent(ownerId, clientKey, "UNCERTAIN");
}

export async function recordSaleIntentError(
  ownerId: string,
  clientKey: string,
  error: Omit<SaleIntentError, "at">,
  at = new Date().toISOString(),
): Promise<SaleIntent> {
  const nextState: SaleIntentState = error.kind === "UNKNOWN"
    ? "UNCERTAIN"
    : error.code === "SALE_IDEMPOTENCY_CONFLICT"
      ? "CONFLICT"
      : "FAILED";

  return localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (!canTransitionSaleIntent(intent.state, nextState)) {
      throw new Error(`Invalid sale intent error transition: ${intent.state} -> ${nextState}`);
    }

    const updated: SaleIntent = {
      ...intent,
      state: nextState,
      updatedAt: at,
      lastError: { ...error, at },
    };
    await localDb.saleIntents.put(updated);
    return updated;
  });
}

export async function deleteEmptyDraft(ownerId: string, clientKey: string): Promise<void> {
  await localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (intent.state !== "DRAFT" || intent.submitted !== null || intent.draft.items.length > 0) {
      throw new Error("Only an empty draft can be deleted");
    }
    await localDb.saleIntents.delete(clientKey);
  });
}

export async function deleteConfirmedIntent(ownerId: string, clientKey: string): Promise<void> {
  await localDb.transaction("rw", localDb.saleIntents, async () => {
    const intent = await requireOwnedIntent(ownerId, clientKey);
    if (intent.state !== "CONFIRMED") throw new Error("Only a confirmed intent can be deleted");
    await localDb.saleIntents.delete(clientKey);
  });
}

async function findActiveForOwner(ownerId: string): Promise<SaleIntent | undefined> {
  const intents = await localDb.saleIntents
    .where("ownerId")
    .equals(ownerId)
    .filter((intent) => ACTIVE_STATES.includes(intent.state))
    .toArray();
  if (intents.length > 1) throw new ActiveSaleIntentError();
  return intents[0];
}

async function requireOwnedIntent(ownerId: string, clientKey: string): Promise<SaleIntent> {
  const intent = await localDb.saleIntents.get(clientKey);
  if (!intent || intent.ownerId !== ownerId) throw new SaleIntentNotFoundError();
  return intent;
}

function cloneSubmittedSnapshot(snapshot: SubmittedSaleSnapshot): SubmittedSaleSnapshot {
  return {
    client_key: snapshot.client_key,
    cash_session_id: snapshot.cash_session_id,
    payment_method: snapshot.payment_method,
    items: snapshot.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    amount_received: snapshot.amount_received,
    customer_id: snapshot.customer_id,
  };
}
