import Dexie, { type Table } from "dexie";
import type { SaleIntent } from "@/features/pos/intent";

export class StoreSystemLocalDatabase extends Dexie {
  saleIntents!: Table<SaleIntent, string>;

  constructor() {
    super("store-system-local");

    this.version(1).stores({
      saleIntents: "&clientKey, ownerId, state, updatedAt, [ownerId+state]",
    });
  }
}

export const localDb = new StoreSystemLocalDatabase();
