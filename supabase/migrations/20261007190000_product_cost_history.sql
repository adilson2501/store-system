-- Checkpoint G1: append-only product purchase-cost history.
-- Existing products receive a transition baseline only. Existing purchases are
-- deliberately not backfilled as authoritative PURCHASE events.

create type public.product_cost_history_source as enum (
  'INITIAL',
  'LEGACY_BASELINE',
  'PURCHASE',
  'MANUAL_ADJUSTMENT',
  'PURCHASE_REVERSAL'
);

create table public.product_cost_history (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity not null,
  product_id uuid not null references public.products (id) on delete restrict,
  source_type public.product_cost_history_source not null,
  source_id uuid,
  cost numeric(12, 2) not null check (cost >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint product_cost_history_source_check check (
    (source_type = 'INITIAL' and source_id = product_id)
    or (source_type = 'LEGACY_BASELINE' and source_id is null)
    or (source_type = 'PURCHASE' and source_id is not null)
    or (source_type = 'MANUAL_ADJUSTMENT' and source_id is null)
    or (source_type = 'PURCHASE_REVERSAL' and source_id is not null)
  )
);

create unique index product_cost_history_sequence_unique_idx
  on public.product_cost_history (sequence);

create index product_cost_history_product_sequence_idx
  on public.product_cost_history (product_id, sequence desc);

create unique index product_cost_history_initial_unique_idx
  on public.product_cost_history (product_id)
  where source_type = 'INITIAL';

create unique index product_cost_history_legacy_baseline_unique_idx
  on public.product_cost_history (product_id)
  where source_type = 'LEGACY_BASELINE';

create unique index product_cost_history_purchase_unique_idx
  on public.product_cost_history (product_id, source_id)
  where source_type = 'PURCHASE';

create unique index product_cost_history_purchase_reversal_unique_idx
  on public.product_cost_history (product_id, source_id)
  where source_type = 'PURCHASE_REVERSAL';

-- The current value at the migration boundary is the only authoritative fact
-- available for products created before cost history existed.
insert into public.product_cost_history (
  product_id,
  source_type,
  cost,
  created_by,
  created_at
)
select
  p.id,
  'LEGACY_BASELINE',
  p.purchase_cost,
  null,
  now()
from public.products p;

alter table public.product_cost_history enable row level security;

create policy "Admins can read product cost history"
  on public.product_cost_history
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.product_cost_history from public, anon, authenticated;
grant select on public.product_cost_history to authenticated;

-- Product creation remains atomic with optional initial stock and the INITIAL
-- cost event. The function is now definer-owned because direct product insert
-- access is removed below.
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
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_barcode text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

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

  if p_purchase_cost <> round(p_purchase_cost, 2) then
    raise exception 'Purchase cost must have at most 2 decimals';
  end if;

  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price must be zero or greater';
  end if;

  if p_selling_price <> round(p_selling_price, 2) then
    raise exception 'Selling price must have at most 2 decimals';
  end if;

  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'Initial stock must be zero or greater';
  end if;

  if p_unit_type = 'UNIT' and p_initial_stock <> trunc(p_initial_stock) then
    raise exception 'UNIT products require a whole-number initial stock';
  end if;

  if p_initial_stock <> round(p_initial_stock, 3) then
    raise exception 'Initial stock must have at most 3 decimals';
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

  insert into public.product_cost_history (
    product_id,
    source_type,
    source_id,
    cost,
    created_by
  )
  values (
    v_product_id,
    'INITIAL',
    v_product_id,
    p_purchase_cost,
    auth.uid()
  );

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
) from public, anon;
grant execute on function public.create_product_with_initial_stock(
  text, text, uuid, public.unit_type, numeric, numeric, numeric
) to authenticated;

-- The normal product update path remains able to edit all existing catalog
-- fields, while purchase_cost changes are recorded atomically.
create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_barcode text default null,
  p_category_id uuid default null,
  p_unit_type public.unit_type default null,
  p_purchase_cost numeric default null,
  p_selling_price numeric default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_barcode text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Only administrators can update products';
  end if;

  if p_product_id is null then
    raise exception 'Product is required';
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

  if p_purchase_cost <> round(p_purchase_cost, 2) then
    raise exception 'Purchase cost must have at most 2 decimals';
  end if;

  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price must be zero or greater';
  end if;

  if p_selling_price <> round(p_selling_price, 2) then
    raise exception 'Selling price must have at most 2 decimals';
  end if;

  if p_is_active is null then
    raise exception 'Active state is required';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found';
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_barcode := nullif(trim(p_barcode), '');

  update public.products
  set name = trim(p_name),
      barcode = v_barcode,
      category_id = p_category_id,
      unit_type = p_unit_type,
      purchase_cost = p_purchase_cost,
      selling_price = p_selling_price,
      is_active = p_is_active
  where id = p_product_id;

  if v_product.purchase_cost is distinct from p_purchase_cost then
    insert into public.product_cost_history (
      product_id,
      source_type,
      cost,
      created_by
    )
    values (
      p_product_id,
      'MANUAL_ADJUSTMENT',
      p_purchase_cost,
      auth.uid()
    );
  end if;

  return p_product_id;
end;
$$;

revoke all on function public.update_product(
  uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean
) from public, anon;
grant execute on function public.update_product(
  uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean
) to authenticated;

-- Prevent normal clients from bypassing INITIAL and MANUAL_ADJUSTMENT
-- history. The SECURITY DEFINER RPCs above are the supported write paths.
revoke insert, update on table public.products from authenticated;
grant select on table public.products to authenticated;

-- Every purchase item is inserted by confirm_purchase in the same transaction.
-- This trigger appends exactly one authoritative PURCHASE event per item;
-- direct purchase-item inserts are already revoked and the unique index below
-- makes idempotency explicit at the database boundary.
create or replace function public.record_purchase_cost_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_cost_history (
    product_id,
    source_type,
    source_id,
    cost,
    created_by
  )
  values (
    new.product_id,
    'PURCHASE',
    new.purchase_id,
    new.unit_purchase_cost,
    auth.uid()
  );

  return new;
end;
$$;

create trigger purchase_items_record_cost_history
  after insert on public.purchase_items
  for each row execute function public.record_purchase_cost_history();

revoke all on function public.record_purchase_cost_history() from public, anon;
