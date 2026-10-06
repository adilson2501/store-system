-- Checkpoint A: supplier and purchase schema foundation.
-- Economic purchase writes remain reserved for a future confirm_purchase RPC.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  ruc text,
  phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_ruc_format_check check (
    ruc is null or ruc ~ '^[0-9]{11}$'
  )
);

create index suppliers_name_idx
  on public.suppliers (lower(trim(name)));

create unique index suppliers_ruc_unique_idx
  on public.suppliers (ruc)
  where ruc is not null;

alter table public.suppliers enable row level security;

create or replace function public.normalize_supplier_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.ruc := nullif(btrim(coalesce(new.ruc, '')), '');
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create trigger suppliers_normalize_fields
  before insert or update on public.suppliers
  for each row execute function public.normalize_supplier_fields();

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create type public.purchase_status as enum ('CONFIRMED');

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  client_key uuid not null,
  request_fingerprint text not null check (length(trim(request_fingerprint)) > 0),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_date date not null,
  status public.purchase_status not null default 'CONFIRMED',
  reference text,
  total numeric(12, 2) not null check (total >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchases_reference_length_check check (
    reference is null or length(reference) <= 120
  )
);

create unique index purchases_client_key_unique_idx
  on public.purchases (client_key);

create index purchases_supplier_date_idx
  on public.purchases (supplier_id, purchase_date desc, created_at desc);

create index purchases_date_idx
  on public.purchases (purchase_date desc, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null check (length(trim(product_name)) > 0),
  unit_type public.unit_type not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_purchase_cost numeric(12, 2) not null check (unit_purchase_cost >= 0),
  line_subtotal numeric(12, 2) not null check (line_subtotal >= 0),
  constraint purchase_items_purchase_product_unique unique (purchase_id, product_id)
);

create index purchase_items_purchase_id_idx
  on public.purchase_items (purchase_id);

create index purchase_items_product_id_idx
  on public.purchase_items (product_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

-- Purchase-linked inventory entries need a purchase reference. Initial stock
-- remains an unlinked ENTRY; all other movement types remain sale-independent.
alter table public.inventory_movements
  add column purchase_id uuid references public.purchases (id) on delete restrict;

create index inventory_movements_purchase_id_idx
  on public.inventory_movements (purchase_id)
  where purchase_id is not null;

do $$
begin
  if exists (
    select 1
    from public.inventory_movements
    where (
      movement_type in ('SALE', 'REVERSAL')
      and sale_id is null
    )
    or (
      movement_type not in ('SALE', 'REVERSAL')
      and sale_id is not null
    )
  ) then
    raise exception 'Cannot replace inventory movement source constraint: existing movement has an invalid sale link';
  end if;
end;
$$;

alter table public.inventory_movements
  drop constraint inventory_movements_sale_link_check;

alter table public.inventory_movements
  add constraint inventory_movements_sale_link_check check (
    (
      movement_type in ('SALE', 'REVERSAL')
      and sale_id is not null
      and purchase_id is null
    )
    or (
      movement_type = 'ENTRY'
      and sale_id is null
    )
    or (
      movement_type in ('LOSS', 'ADJUSTMENT')
      and sale_id is null
      and purchase_id is null
    )
  );

-- Keep direct ENTRY insertion compatible with product initial stock, while
-- reserving purchase-linked entries for the future economic RPC.
drop policy "Admin can insert entry inventory movements"
  on public.inventory_movements;

create policy "Admin can insert unlinked entry inventory movements"
  on public.inventory_movements
  for insert
  to authenticated
  with check (
    public.is_admin()
    and movement_type = 'ENTRY'
    and purchase_id is null
  );

create policy "Admins can read suppliers"
  on public.suppliers
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert suppliers"
  on public.suppliers
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update suppliers"
  on public.suppliers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can read purchases"
  on public.purchases
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can read purchase items"
  on public.purchase_items
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.suppliers from public, anon;
revoke all on table public.purchases from public, anon;
revoke all on table public.purchase_items from public, anon;
revoke delete on table public.suppliers from authenticated;
revoke insert, update, delete on table public.purchases from authenticated;
revoke insert, update, delete on table public.purchase_items from authenticated;

grant select, insert, update on public.suppliers to authenticated;
grant select on public.purchases to authenticated;
grant select on public.purchase_items to authenticated;
