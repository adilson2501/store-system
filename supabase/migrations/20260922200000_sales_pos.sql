-- Basic POS sales for CASH and YAPE.
-- Confirmed sales are append-oriented and inventory changes are ledger entries.

create type public.payment_method as enum ('CASH', 'YAPE');

create type public.sale_status as enum ('CONFIRMED', 'VOIDED');

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  client_key uuid,
  seller_id uuid not null references auth.users (id) on delete restrict,
  payment_method public.payment_method not null,
  status public.sale_status not null default 'CONFIRMED',
  total numeric(12, 2) not null check (total >= 0),
  amount_received numeric(12, 2),
  amount_change numeric(12, 2),
  created_at timestamptz not null default now(),
  constraint sales_cash_values_check check (
    (payment_method = 'CASH'
      and amount_received is not null
      and amount_change is not null
      and amount_received >= total
      and amount_change = amount_received - total)
    or (payment_method = 'YAPE'
      and amount_received is null
      and amount_change is null)
  )
);

create unique index sales_client_key_unique_idx
  on public.sales (client_key)
  where client_key is not null;

create index sales_seller_created_at_idx
  on public.sales (seller_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_type public.unit_type not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_purchase_cost numeric(12, 2) not null check (unit_purchase_cost >= 0),
  unit_selling_price numeric(12, 2) not null check (unit_selling_price >= 0),
  line_subtotal numeric(12, 2) not null check (line_subtotal >= 0)
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);

alter table public.inventory_movements
  add column sale_id uuid references public.sales (id) on delete restrict;

alter table public.inventory_movements
  add constraint inventory_movements_sale_link_check check (
    (movement_type = 'SALE' and sale_id is not null)
    or (movement_type <> 'SALE' and sale_id is null)
  );

create index inventory_movements_sale_id_idx
  on public.inventory_movements (sale_id)
  where sale_id is not null;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy "Admins can read all sales"
  on public.sales
  for select
  to authenticated
  using (public.is_admin());

create policy "Sellers can read own sales"
  on public.sales
  for select
  to authenticated
  using (seller_id = auth.uid());

create policy "Admins can read sale items"
  on public.sale_items
  for select
  to authenticated
  using (public.is_admin());

grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;

-- Controlled POS catalog projection. This function is the only seller product
-- read path and deliberately omits purchase_cost.
create or replace function public.get_pos_catalog(
  p_barcode text default null,
  p_search text default null
)
returns table (
  id uuid,
  name text,
  barcode text,
  unit_type public.unit_type,
  selling_price numeric(12, 2),
  is_active boolean,
  stock_quantity numeric(12, 3)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode text := nullif(trim(p_barcode), '');
  v_search text := nullif(trim(p_search), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('ADMIN', 'SELLER')
  ) then
    raise exception 'POS access requires ADMIN or SELLER role';
  end if;

  return query
  select
    p.id,
    p.name,
    p.barcode,
    p.unit_type,
    p.selling_price,
    p.is_active,
    coalesce(sum(im.quantity), 0)::numeric(12, 3) as stock_quantity
  from public.products p
  left join public.inventory_movements im on im.product_id = p.id
  where (
    (v_barcode is not null and p.barcode = v_barcode)
    or (
      v_barcode is null
      and v_search is not null
      and p.is_active
      and (
        p.name ilike '%' || v_search || '%'
        or p.barcode ilike '%' || v_search || '%'
      )
    )
    or (v_barcode is null and v_search is null and p.is_active)
  )
  group by p.id, p.name, p.barcode, p.unit_type, p.selling_price, p.is_active
  order by p.name asc
  limit 50;
end;
$$;

revoke all on function public.get_pos_catalog(text, text) from public;
revoke all on function public.get_pos_catalog(text, text) from anon;
grant execute on function public.get_pos_catalog(text, text) to authenticated;

-- Atomic, authoritative sale confirmation. The client supplies only product
-- IDs, quantities, payment method, amount received, and an idempotency key.
create or replace function public.confirm_sale(
  p_client_key uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_amount_received numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total numeric(12, 2) := 0;
  v_change numeric(12, 2);
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12, 3);
  v_name text;
  v_unit_type public.unit_type;
  v_is_active boolean;
  v_purchase_cost numeric(12, 2);
  v_selling_price numeric(12, 2);
  v_stock numeric(12, 3);
  v_line_subtotal numeric(12, 2);
  v_lines jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('ADMIN', 'SELLER')
  ) then
    raise exception 'POS access requires ADMIN or SELLER role';
  end if;

  if p_client_key is null then
    raise exception 'Client key is required';
  end if;

  if p_payment_method not in ('CASH', 'YAPE') then
    raise exception 'Unsupported payment method';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  -- A retry of a completed request returns the original authoritative result.
  select id into v_sale_id
  from public.sales
  where client_key = p_client_key;

  if v_sale_id is not null then
    select jsonb_build_object(
      'sale_id', s.id,
      'client_key', s.client_key,
      'payment_method', s.payment_method,
      'status', s.status,
      'total', s.total,
      'amount_received', s.amount_received,
      'amount_change', s.amount_change,
      'created_at', s.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', si.product_id,
          'product_name', si.product_name,
          'unit_type', si.unit_type,
          'quantity', si.quantity,
          'unit_selling_price', si.unit_selling_price,
          'line_subtotal', si.line_subtotal
        ) order by si.id)
        from public.sale_items si
        where si.sale_id = s.id
      ), '[]'::jsonb)
    ) into v_item
    from public.sales s
    where s.id = v_sale_id;
    return v_item;
  end if;

  -- Lock every distinct product in deterministic order. All POS sales use this
  -- lock, so two sellers cannot both consume the final available quantity.
  for v_product_id in
    select distinct x.product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    order by x.product_id
  loop
    perform 1
    from public.products
    where products.id = v_product_id
    for update;

    if not found then
      raise exception 'Product not found';
    end if;
  end loop;

  -- The first request may have committed while this retry waited for the
  -- product lock. Check again before doing stock validation.
  select id into v_sale_id
  from public.sales
  where client_key = p_client_key;

  if v_sale_id is not null then
    select jsonb_build_object(
      'sale_id', s.id,
      'client_key', s.client_key,
      'payment_method', s.payment_method,
      'status', s.status,
      'total', s.total,
      'amount_received', s.amount_received,
      'amount_change', s.amount_change,
      'created_at', s.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', si.product_id,
          'product_name', si.product_name,
          'unit_type', si.unit_type,
          'quantity', si.quantity,
          'unit_selling_price', si.unit_selling_price,
          'line_subtotal', si.line_subtotal
        ) order by si.id)
        from public.sale_items si
        where si.sale_id = s.id
      ), '[]'::jsonb)
    ) into v_item
    from public.sales s
    where s.id = v_sale_id;
    return v_item;
  end if;

  for v_item in
    select jsonb_build_object('product_id', x.product_id, 'quantity', sum(x.quantity))
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by x.product_id
    order by x.product_id
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_quantity is null or v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then
      raise exception 'Quantity must be positive with at most 3 decimals';
    end if;

    select name, unit_type, purchase_cost, selling_price, is_active
      into v_name, v_unit_type, v_purchase_cost, v_selling_price, v_is_active
    from public.products
    where id = v_product_id;

    if not v_is_active then
      raise exception 'Product is inactive or unavailable';
    end if;

    if v_unit_type = 'UNIT' and v_quantity <> trunc(v_quantity) then
      raise exception 'UNIT products require whole-number quantities';
    end if;

    select coalesce(sum(quantity), 0)
      into v_stock
    from public.inventory_movements
    where product_id = v_product_id;

    if v_stock < v_quantity then
      raise exception 'Insufficient stock for product %', v_name;
    end if;

    v_line_subtotal := round(v_quantity * v_selling_price, 2);
    v_total := v_total + v_line_subtotal;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'product_name', v_name,
      'unit_type', v_unit_type,
      'quantity', v_quantity,
      'unit_purchase_cost', v_purchase_cost,
      'unit_selling_price', v_selling_price,
      'line_subtotal', v_line_subtotal
    ));
  end loop;

  if p_payment_method = 'CASH' then
    if p_amount_received is null or p_amount_received < v_total then
      raise exception 'Cash received must be at least the sale total';
    end if;
    v_change := p_amount_received - v_total;
  else
    if p_amount_received is not null then
      raise exception 'YAPE does not accept cash received';
    end if;
    v_change := null;
  end if;

  insert into public.sales (
    client_key,
    seller_id,
    payment_method,
    status,
    total,
    amount_received,
    amount_change
  )
  values (
    p_client_key,
    auth.uid(),
    p_payment_method,
    'CONFIRMED',
    v_total,
    case when p_payment_method = 'CASH' then p_amount_received else null end,
    v_change
  )
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.sale_items (
      sale_id,
      product_id,
      product_name,
      unit_type,
      quantity,
      unit_purchase_cost,
      unit_selling_price,
      line_subtotal
    )
    values (
      v_sale_id,
      (v_item ->> 'product_id')::uuid,
      v_item ->> 'product_name',
      (v_item ->> 'unit_type')::public.unit_type,
      (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_purchase_cost')::numeric,
      (v_item ->> 'unit_selling_price')::numeric,
      (v_item ->> 'line_subtotal')::numeric
    );

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      sale_id,
      note,
      created_by
    )
    values (
      (v_item ->> 'product_id')::uuid,
      'SALE',
      -((v_item ->> 'quantity')::numeric),
      v_sale_id,
      'POS sale',
      auth.uid()
    );
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'client_key', p_client_key,
    'payment_method', p_payment_method,
    'status', 'CONFIRMED',
    'total', v_total,
    'amount_received', case when p_payment_method = 'CASH' then p_amount_received else null end,
    'amount_change', v_change,
    'created_at', now(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', si.product_id,
        'product_name', si.product_name,
        'unit_type', si.unit_type,
        'quantity', si.quantity,
        'unit_selling_price', si.unit_selling_price,
        'line_subtotal', si.line_subtotal
      ) order by si.id)
      from public.sale_items si
      where si.sale_id = v_sale_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric) from public;
revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric) from anon;
grant execute on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric) to authenticated;

-- No UPDATE or DELETE policies are created for confirmed sales, sale items, or
-- inventory movements. Existing direct inventory access remains ADMIN-only.
