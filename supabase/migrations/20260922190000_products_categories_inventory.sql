-- Product catalog + inventory movement foundation (M1).
-- Creates: categories, products, inventory_movements, product_stock,
-- and create_product_with_initial_stock RPC.
-- Does not modify auth/profiles (already applied).

create type public.unit_type as enum ('UNIT', 'WEIGHT');

create type public.inventory_movement_type as enum (
  'ENTRY',
  'SALE',
  'LOSS',
  'ADJUSTMENT',
  'REVERSAL'
);

-- ---------------------------------------------------------------------------
-- Categories (simple managed list; no mandatory seed data)
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_name_unique_idx
  on public.categories (lower(trim(name)));

alter table public.categories enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Products (no stock column; stock is derived from movements)
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  barcode text unique,
  category_id uuid references public.categories (id) on delete set null,
  unit_type public.unit_type not null,
  purchase_cost numeric(12, 2) not null default 0 check (purchase_cost >= 0),
  selling_price numeric(12, 2) not null check (selling_price >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
create index products_name_idx on public.products (lower(trim(name)));
create index products_barcode_idx on public.products (barcode) where barcode is not null;

alter table public.products enable row level security;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory movements (append-oriented ledger)
-- ---------------------------------------------------------------------------

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity numeric(12, 3) not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_direction_check check (
    (movement_type = 'ENTRY' and quantity > 0)
    or (movement_type = 'SALE' and quantity < 0)
    or (movement_type = 'LOSS' and quantity < 0)
    or (movement_type = 'ADJUSTMENT' and quantity <> 0)
    or (movement_type = 'REVERSAL' and quantity <> 0)
  )
);

create index inventory_movements_product_id_idx
  on public.inventory_movements (product_id);

alter table public.inventory_movements enable row level security;

-- PostgreSQL-level guard: UNIT products must have whole-number movement quantities.
-- Works for any INSERT path allowed by RLS (RPC is security invoker).
create or replace function public.enforce_unit_movement_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_type public.unit_type;
begin
  select unit_type into v_unit_type
  from public.products
  where id = new.product_id;

  if v_unit_type = 'UNIT' and new.quantity <> trunc(new.quantity) then
    raise exception 'UNIT products require whole-number inventory quantities';
  end if;

  return new;
end;
$$;

create trigger inventory_movements_unit_quantity_guard
  before insert on public.inventory_movements
  for each row execute function public.enforce_unit_movement_quantity();

-- ---------------------------------------------------------------------------
-- Current stock read model (derived from movements; not an editable field)
-- ---------------------------------------------------------------------------

create or replace view public.product_stock
with (security_invoker = on) as
select
  product_id,
  coalesce(sum(quantity), 0) as quantity
from public.inventory_movements
group by product_id;

-- ---------------------------------------------------------------------------
-- Atomic product + optional initial stock
-- ---------------------------------------------------------------------------

create or replace function public.create_product_with_initial_stock(
  p_name text,
  p_barcode text default null,
  p_category_id uuid default null,
  p_unit_type public.unit_type default null,
  p_purchase_cost numeric default 0,
  p_selling_price numeric default 0,
  p_initial_stock numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product_id uuid;
  v_barcode text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create products';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Product name is required';
  end if;

  if p_unit_type is null then
    raise exception 'Unit type is required';
  end if;

  if p_purchase_cost is null or p_purchase_cost < 0 then
    raise exception 'Purchase cost must be zero or greater';
  end if;

  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price must be zero or greater';
  end if;

  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'Initial stock must be zero or greater';
  end if;

  if p_unit_type = 'UNIT' and p_initial_stock <> trunc(p_initial_stock) then
    raise exception 'UNIT products require a whole-number initial stock';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found';
  end if;

  v_barcode := nullif(trim(p_barcode), '');

  insert into public.products (
    name,
    barcode,
    category_id,
    unit_type,
    purchase_cost,
    selling_price,
    is_active,
    created_by
  )
  values (
    trim(p_name),
    v_barcode,
    p_category_id,
    p_unit_type,
    p_purchase_cost,
    p_selling_price,
    true,
    auth.uid()
  )
  returning id into v_product_id;

  if p_initial_stock > 0 then
    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      note,
      created_by
    )
    values (
      v_product_id,
      'ENTRY',
      p_initial_stock,
      'Initial stock',
      auth.uid()
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.create_product_with_initial_stock(
  text, text, uuid, public.unit_type, numeric, numeric, numeric
) from public;
grant execute on function public.create_product_with_initial_stock(
  text, text, uuid, public.unit_type, numeric, numeric, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Categories: all authenticated can read; only ADMIN writes.
create policy "Authenticated can read categories"
  on public.categories
  for select
  to authenticated
  using (true);

create policy "Admin can insert categories"
  on public.categories
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin can update categories"
  on public.categories
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Products: ADMIN only in M1 (SELLER has no catalog access until POS read model).
create policy "Admin can read products"
  on public.products
  for select
  to authenticated
  using (public.is_admin());

create policy "Admin can insert products"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin can update products"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Inventory movements: ADMIN SELECT/INSERT only; M1 inserts are ENTRY only.
create policy "Admin can read inventory movements"
  on public.inventory_movements
  for select
  to authenticated
  using (public.is_admin());

create policy "Admin can insert entry inventory movements"
  on public.inventory_movements
  for insert
  to authenticated
  with check (
    public.is_admin()
    and movement_type = 'ENTRY'
  );

-- No UPDATE/DELETE policies on movements, products, categories in M1.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert on public.inventory_movements to authenticated;
grant select on public.product_stock to authenticated;
