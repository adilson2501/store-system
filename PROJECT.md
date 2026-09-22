# Store System — PROJECT.md

Temporary internal project name: **Store System** (no final brand yet).

This document is the source of truth for the project and V1. AI coding agents and
humans must follow it. Update this file when decisions change.

---

## 1. Project vision

Build an extremely simple, fast, offline-first web system for a small family
grocery/convenience store in Peru. It replaces manual records with reliable
inventory, sales tracking, payment separation (Cash / Yape / Credit), and
customer debt control — usable today by the owner and later by employees.

Core flow of V1:

**Product → Inventory → Sale → Payment (Cash / Yape / Credit)**

## 2. Business problems

- No reliable inventory/stock control.
- Sales are not systematically recorded.
- Daily, weekly and monthly sales totals are unknown.
- Cash and Yape payments are not distinguished.
- Credit sales ("fiado") are forgotten or never recorded.
- Purchase costs and selling prices change over time without traceability.
- Future employees need controlled permissions and accountable cash sessions.

## 3. Users and roles

| Role | Typical device | Main tasks |
|------|----------------|------------|
| ADMIN | Laptop | Products, inventory, prices, customers, credit, purchases, adjustments, administration, users |
| SELLER | Android tablet/phone | Fast POS sales, cart, payment, credit sales within limits, cash sessions |

- Auth via Supabase Auth; roles stored in app data and enforced by PostgreSQL RLS.
- Authorization must be enforced by backend/database security, not only by hiding UI.
- Sellers must NOT have unrestricted access to costs, inventory adjustments,
  historical modifications or administrative functions.

## 4. V1 scope

Included in V1:

- **Products**: name, optional barcode, category, purchase cost, selling price,
  unit type (UNIT or WEIGHT), decimal quantities (e.g. 0.250 kg), pack/case
  purchases that add base units (2 packs × 12 bottles = +24 units).
- **Inventory**: movement-based (purchase/entry, sale, loss/waste, adjustment,
  reversal). Current stock derived from movements; history always traceable.
- **Sales/POS**: tablet-first, responsive; barcode (HID keyboard), favorites,
  text search; weight quick-quantities (0.250/0.500/0.750/1 kg + custom);
  automatic totals; payments CASH (with change), YAPE, CREDIT.
- **Historical integrity**: confirmed sales store snapshots (name, qty, unit
  cost, unit price, subtotal). Later price/cost changes never rewrite history.
  Confirmed operations are not silently edited/deleted — only explicit
  cancellation/reversal with traceability.
- **Customers/credit**: credit sale always tied to customer; credit
  on/off + limit; debt as ledger/history, not only a mutable balance; debt
  payments are NOT sales; paying by cash or Yape.
- **Cash sessions**: open/close; opening amount; separate CASH/YAPE/CREDIT;
  credit counts as sale but not cash; closing compares expected vs counted cash
  and stores the difference; records which user opened/operated/closed.
- **Users/security**: ADMIN and SELLER; Supabase Auth + PostgreSQL RLS.
- **Offline**: POS works without Internet; IndexedDB (Dexie); queued sync;
  idempotent sync; simple connectivity/sync status UI.
- **Purchases**: suppliers (recurring/optional), purchase docs + items;
  confirming a purchase creates inventory entries and may update current cost;
  NEVER auto-changes selling price — admin decides. Full purchase UI does not
  block the first operational milestone.
- **Barcode/hardware**: laptop registration first; USB HID scanners; later
  Android USB-OTG/Bluetooth; camera scanning secondary. No coupling to a
  specific scanner model. Receipt printers, scales, cash drawers are out of V1.

## 5. Explicit non-goals (out of scope)

Not in V1 (and not in the first milestone):

- Wholesale sales.
- Multiple branches.
- Advanced analytics.
- AI/ML.
- Direct Yape integration (manual/recorded payments only).
- Automatic supplier integrations.
- Connected electronic scales.
- Receipt printer integration.
- Cash drawer integration.
- Complex accounting.
- Full purchase-management workflow (first milestone).
- Advanced reporting.
- Dedicated backend in V1 (unless a demonstrated requirement appears).

## 6. Core business rules

1. Inventory is a ledger of movements, not an editable stock number.
2. Current stock = derived from movements (entry − sale − loss ± adjustments/reversals).
3. Confirmed sales preserve immutable snapshots of product data at sale time.
4. Confirmed financial/inventory operations are never silently edited or deleted;
   corrections use explicit cancellation/reversal with traceability.
5. A credit sale must always reference a customer with credit enabled.
6. A seller must not silently exceed the customer's credit limit.
7. Customer debt is a ledger/history; balance is derived/updated from it.
8. Paying an old debt is a debt payment (cash or Yape), NOT a new sale.
9. Purchase cost changes may update current cost; they never auto-update selling
   price. Admin decides whether to update the price.
10. Cash sessions separate CASH, YAPE and CREDIT; credit sales count as sales
    but not as cash received.
11. Closing stores expected cash vs counted cash and the difference, plus the
    responsible user.
12. Money and inventory quantities use precise numeric handling (no
    floating-point assumptions): store as integer minor units / fixed-precision
    decimals in the database; convert only at the edges.
13. Server-side sale synchronization must be atomic and idempotent (retrying
    the same sale must not create duplicates).
14. Backend/DB security (RLS) enforces role permissions, not just UI visibility.

## 7. Main domain concepts

- **Product**: sellable item; UNIT or WEIGHT; barcode optional; cost + price.
- **Unit type / quantity**: base unit for stock; decimals allowed (weight).
- **Pack/case**: purchase packaging converted to base units on entry.
- **Inventory movement**: entry (purchase), sale, loss/waste, adjustment, reversal.
- **Stock**: derived value from movements.
- **Sale**: cart of line snapshots; total; payment method; cashier; session.
- **Sale line snapshot**: product name, quantity, unit cost, unit price, subtotal.
- **Payment method**: CASH, YAPE, CREDIT (V1).
- **Change**: for CASH payments.
- **Customer**: optional credit enabled + credit limit.
- **Credit ledger entry**: debt incurred by credit sale; payments; running debt.
- **Cash session (shift)**: opening amount, sales by method, counted cash,
  difference, open/close user.
- **Purchase / purchase item / supplier**: future-friendly; confirm → inventory
  entry + optional cost update.
- **User / role**: ADMIN, SELLER.
- **Offline queue / sync operation**: local mutation waiting to sync; idempotency
  key (e.g. client-generated UUID).

## 8. UX principles

- Extremely simple, clean, fast, touch-friendly.
- Mobile/tablet-first for sales; desktop-friendly for administration.
- Seller needs no technical knowledge; minimize taps and typing during a sale.
- Do not expose administrative complexity in the seller POS.
- Barcode scan is the fastest input; favorites/quick products and text search
  also first-class; products without barcodes remain easy to sell.
- Weight products: one-tap common weights + custom weight.
- Responsive: phone → tablet → laptop/desktop → future touch POS terminal.
- Show connectivity/sync state simply to the operator.

## 9. Technical architecture

Stack:

- Next.js (App Router), React, TypeScript, Tailwind CSS.
- Supabase: PostgreSQL, Supabase Auth, Row Level Security.
- PWA; IndexedDB via Dexie for offline persistence.
- Vercel (web), Git/GitHub.
- Feature-oriented modular organization.

Layering (keep it simple, not overengineered):

- **UI** (pages/components) → **application/domain logic** (rules, totals,
  validation) → **data access** (Supabase client, local Dexie, sync queue).
- Business rules live in a domain/application layer usable by UI and by sync —
  so a future dedicated backend (e.g. Spring Boot) can reuse the same domain
  model without rewriting the business domain from scratch.
- Precise numeric handling for money and quantities (integer minor units /
  fixed-precision decimals; no float money math).
- Server-side synchronization of a sale is atomic (single transaction/edge
  function/SQL function) and idempotent (idempotency key on client-generated ID).
- Audit fields (created_at, created_by, etc.) on financial/inventory records.
- No dedicated backend in V1 unless a demonstrated need arises.

## 10. Offline / synchronization principles

- POS is offline-first: loss of Internet must not stop ordinary sales on the tablet.
- Local persistence: IndexedDB, via Dexie.
- Offline mutations (sales, debt payments, cash session events) are queued and
  synchronized when connectivity returns.
- Synchronization is **idempotent**: retrying the same operation must not create
  duplicates (client-generated UUID / idempotency key).
- Display connectivity and pending-sync state simply to the operator.
- Do not build advanced conflict resolution in the first milestone; design the
  architecture so it can evolve safely (e.g. central server authority on
  confirmed sales, append-only ledgers, explicit reversals).

## 11. Security and audit principles

- Supabase Auth for identity; PostgreSQL RLS for authorization (ADMIN/SELLER).
- Hide UI where appropriate, but NEVER rely on the UI alone for authorization.
- Sellers cannot access costs (where restricted), inventory adjustments,
  historical modifications or admin functions beyond their role.
- Confirmed financial and inventory operations are append-only in effect:
  corrections via cancellation/reversal with who/when/why traceability.
- Audit who opened/operated/closed each cash session.
- Never expose secrets to the client; use RLS + server-side functions for
  privileged writes.

## 12. Milestone roadmap

**Milestone 1 — Foundation (current target)**

- Project foundation (Next.js, TS, Tailwind, Supabase, modular structure, PWA shell).
- Authentication and basic roles (ADMIN, SELLER) with RLS.
- Product catalog.
- Product creation/editing.
- Barcode field/input (USB HID friendly).
- UNIT and WEIGHT products; decimal quantities.
- Initial inventory.
- Inventory movement foundation.
- Responsive administration UI.

**Milestone 2 — POS**

- Tablet POS: cart, search, favorites, barcode, weight quick-quantities.
- Payments CASH (change), YAPE, CREDIT.
- Customers + credit ledger + limits.
- Cash sessions open/close.
- Offline queue + idempotent sync + status UI.

**Later (within V1, not milestone-blocking)**

- Purchases/suppliers workflow, cost update → price suggestion.
- Reversals/cancellations UX, richer admin reporting (basic totals only).

## 13. Milestone 1 acceptance criteria

The administrator can open the application from a laptop and begin registering
REAL store products and their initial stock:

- Can log in as ADMIN (Supabase Auth).
- Can create/edit products with name, category, optional barcode, cost, price,
  unit type (UNIT/WEIGHT) and decimal quantity support.
- Can record initial inventory as an inventory ENTRY movement (not a bare
  editable stock number); stock is derivable from movements.
- Basic roles exist (ADMIN/SELLER) and RLS is in place (even if only ADMIN is
  actively used in M1).
- Administration UI is responsive on laptop (usable, clean, not POS-optimized yet).
- No POS, sales, credit, cash sessions, offline sync or purchases required yet.

## 14. Open questions / decisions intentionally deferred

- Final brand/product name.
- Exact tax/document requirements (boleta/factura) — not designed yet.
- Whether sellers can see purchase cost at all (default: hidden).
- Credit limit enforcement policy: block vs require ADMIN override (default: block).
- Cash session: multiple simultaneous sessions per user? (default: one open session per user).
- Barcode format details (EAN-13 only vs any code) — support any scanned string in M1.
- Sale cancellation policy: who can cancel, time window, required reason.
- Purchase cost precision/display (decimals for S/.) and currency: PEN assumed.
- Receipt/printing needs later; camera scanning priority later.
- Whether categories are free-form or a managed catalog (default: simple managed list).
- Supabase Edge Functions vs Row-Level Security + client transactions for atomic sale sync (decide at M2 design).
- Conflict strategy when the same sale is retried vs edited offline (idempotency key decided; merge policy deferred).
