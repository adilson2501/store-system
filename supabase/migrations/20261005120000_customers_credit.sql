-- Customers, credit ledger, FIADO sales, and debt payments.
-- Economic writes remain RPC-only and append-oriented.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  notes text,
  credit_limit numeric(12, 2) not null default 0 check (credit_limit >= 0),
  credit_enabled boolean not null default true,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_name_idx on public.customers (lower(trim(name)));
create index customers_phone_idx on public.customers (phone) where phone is not null;

alter table public.customers enable row level security;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.sales
  add column customer_id uuid references public.customers (id) on delete restrict;

alter table public.sales
  add constraint sales_customer_payment_check check (
    (payment_method = 'CREDIT' and customer_id is not null)
    or (payment_method <> 'CREDIT' and customer_id is null)
  );

create index sales_customer_id_idx on public.sales (customer_id, created_at desc)
  where customer_id is not null;

create type public.customer_credit_movement_type as enum (
  'CREDIT_SALE',
  'PAYMENT'
);

create table public.customer_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  movement_type public.customer_credit_movement_type not null,
  amount numeric(12, 2) not null check (amount <> 0),
  sale_id uuid references public.sales (id) on delete restrict,
  client_key uuid,
  payment_method public.payment_method,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_credit_ledger_direction_check check (
    (movement_type = 'CREDIT_SALE' and amount > 0 and sale_id is not null and client_key is null and payment_method is null)
    or (movement_type = 'PAYMENT' and amount < 0 and sale_id is null and client_key is not null and payment_method in ('CASH', 'YAPE'))
  )
);

create index customer_credit_ledger_customer_idx
  on public.customer_credit_ledger (customer_id, created_at desc);

create unique index customer_credit_ledger_sale_unique_idx
  on public.customer_credit_ledger (sale_id)
  where movement_type = 'CREDIT_SALE';

create unique index customer_credit_ledger_client_key_unique_idx
  on public.customer_credit_ledger (client_key)
  where movement_type = 'PAYMENT' and client_key is not null;

alter table public.customer_credit_ledger enable row level security;

create or replace function public.customer_balance(p_customer_id uuid)
returns numeric(12, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(12, 2)
  from public.customer_credit_ledger
  where customer_id = p_customer_id;
$$;

revoke all on function public.customer_balance(uuid) from public;
grant execute on function public.customer_balance(uuid) to authenticated;

create or replace function public.assert_customer_balance(
  p_customer_id uuid,
  p_balance numeric
)
returns void
language plpgsql
immutable
as $$
begin
  if p_balance < 0 then
    raise exception 'Customer debt ledger has an invalid negative balance for %', p_customer_id;
  end if;
end;
$$;

revoke all on function public.assert_customer_balance(uuid, numeric) from public;

create policy "Admins can read all customers"
  on public.customers
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert customers"
  on public.customers
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update customers"
  on public.customers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can read customer ledger"
  on public.customer_credit_ledger
  for select
  to authenticated
  using (public.is_admin());

grant select, insert, update on public.customers to authenticated;
grant select on public.customer_credit_ledger to authenticated;

-- Seller-safe customer projection. Notes and administrative fields are omitted.
create or replace function public.search_pos_customers(p_search text default null)
returns table (
  id uuid,
  name text,
  phone text,
  credit_limit numeric(12, 2),
  current_debt numeric(12, 2),
  available_credit numeric(12, 2),
  active boolean,
  credit_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(p_search), '');
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('ADMIN', 'SELLER')
  ) then
    raise exception 'Customer access requires ADMIN or SELLER role';
  end if;

  return query
  select
    c.id,
    c.name,
    c.phone,
    c.credit_limit,
    coalesce(sum(l.amount), 0)::numeric(12, 2) as current_debt,
    (c.credit_limit - coalesce(sum(l.amount), 0))::numeric(12, 2) as available_credit,
    c.active,
    c.credit_enabled
  from public.customers c
  left join public.customer_credit_ledger l on l.customer_id = c.id
  where c.active
    and (v_search is null or c.name ilike '%' || v_search || '%' or c.phone ilike '%' || v_search || '%')
  group by c.id
  having coalesce(sum(l.amount), 0) >= 0
  order by c.name asc
  limit 50;
end;
$$;

revoke all on function public.search_pos_customers(text) from public;
revoke all on function public.search_pos_customers(text) from anon;
grant execute on function public.search_pos_customers(text) to authenticated;

create or replace function public.get_customer_credit_detail(p_customer_id uuid)
returns table (
  id uuid,
  name text,
  phone text,
  notes text,
  credit_limit numeric(12, 2),
  credit_enabled boolean,
  active boolean,
  current_debt numeric(12, 2),
  available_credit numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('ADMIN', 'SELLER')
  ) then
    raise exception 'Customer access requires ADMIN or SELLER role';
  end if;

  return query
  select
    c.id,
    c.name,
    c.phone,
    case when public.is_admin() then c.notes else null end,
    c.credit_limit,
    c.credit_enabled,
    c.active,
    coalesce(sum(l.amount), 0)::numeric(12, 2),
    (c.credit_limit - coalesce(sum(l.amount), 0))::numeric(12, 2)
  from public.customers c
  left join public.customer_credit_ledger l on l.customer_id = c.id
  where c.id = p_customer_id
  group by c.id;

  if not found then
    raise exception 'Customer not found';
  end if;
end;
$$;

revoke all on function public.get_customer_credit_detail(uuid) from public;
revoke all on function public.get_customer_credit_detail(uuid) from anon;
grant execute on function public.get_customer_credit_detail(uuid) to authenticated;

drop function public.confirm_sale(uuid, public.payment_method, jsonb, numeric);

create or replace function public.confirm_sale(
  p_client_key uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_amount_received numeric default null,
  p_customer_id uuid default null
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
  v_lines jsonb := '[]'::jsonb;
  v_customer_active boolean;
  v_credit_enabled boolean;
  v_credit_limit numeric(12, 2);
  v_current_debt numeric(12, 2);
  v_line_subtotal numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('ADMIN', 'SELLER')) then
    raise exception 'POS access requires ADMIN or SELLER role';
  end if;
  if p_client_key is null then raise exception 'Client key is required'; end if;
  if p_payment_method not in ('CASH', 'YAPE', 'CREDIT') then raise exception 'Unsupported payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;
  if (p_payment_method = 'CREDIT' and p_customer_id is null)
    or (p_payment_method <> 'CREDIT' and p_customer_id is not null) then
    raise exception 'Customer is required only for FIADO sales';
  end if;

  select id into v_sale_id from public.sales where client_key = p_client_key;
  if v_sale_id is not null then
    select jsonb_build_object(
      'sale_id', s.id,
      'client_key', s.client_key,
      'payment_method', s.payment_method,
      'status', s.status,
      'total', s.total,
      'amount_received', s.amount_received,
      'amount_change', s.amount_change,
      'customer_id', s.customer_id,
      'created_at', s.created_at,
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', si.product_id,
              'product_name', si.product_name,
              'unit_type', si.unit_type,
              'quantity', si.quantity,
              'unit_selling_price', si.unit_selling_price,
              'line_subtotal', si.line_subtotal
            )
            order by si.id
          )
          from public.sale_items si
          where si.sale_id = s.id
        ),
        '[]'::jsonb
      )
    ) into v_item
    from public.sales s
    where s.id = v_sale_id;
    return v_item;
  end if;

  -- Every customer operation locks the customer first, then products.
  if p_payment_method = 'CREDIT' then
    select active, credit_enabled, credit_limit
      into v_customer_active, v_credit_enabled, v_credit_limit
    from public.customers where id = p_customer_id for update;
    if not found then raise exception 'Customer not found'; end if;
    if not v_customer_active then raise exception 'Customer is inactive'; end if;
    if not v_credit_enabled then raise exception 'Customer credit is disabled'; end if;
    select coalesce(sum(amount), 0)::numeric(12, 2) into v_current_debt
      from public.customer_credit_ledger where customer_id = p_customer_id;
    perform public.assert_customer_balance(p_customer_id, v_current_debt);
  end if;

  for v_product_id in
    select distinct x.product_id from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric) order by x.product_id
  loop
    perform 1 from public.products where id = v_product_id for update;
    if not found then raise exception 'Product not found'; end if;
  end loop;

  select id into v_sale_id from public.sales where client_key = p_client_key;
  if v_sale_id is not null then
    select jsonb_build_object(
      'sale_id', s.id,
      'client_key', s.client_key,
      'payment_method', s.payment_method,
      'status', s.status,
      'total', s.total,
      'amount_received', s.amount_received,
      'amount_change', s.amount_change,
      'customer_id', s.customer_id,
      'created_at', s.created_at,
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', si.product_id,
              'product_name', si.product_name,
              'unit_type', si.unit_type,
              'quantity', si.quantity,
              'unit_selling_price', si.unit_selling_price,
              'line_subtotal', si.line_subtotal
            )
            order by si.id
          )
          from public.sale_items si
          where si.sale_id = s.id
        ),
        '[]'::jsonb
      )
    ) into v_item
    from public.sales s
    where s.id = v_sale_id;
    return v_item;
  end if;

  for v_item in
    select jsonb_build_object('product_id', x.product_id, 'quantity', sum(x.quantity))
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by x.product_id order by x.product_id
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then
      raise exception 'Quantity must be positive with at most 3 decimals';
    end if;
    select name, unit_type, purchase_cost, selling_price, is_active
      into v_name, v_unit_type, v_purchase_cost, v_selling_price, v_is_active
    from public.products where id = v_product_id;
    if not v_is_active then raise exception 'Product is inactive or unavailable'; end if;
    if v_unit_type = 'UNIT' and v_quantity <> trunc(v_quantity) then
      raise exception 'UNIT products require whole-number quantities';
    end if;
    select coalesce(sum(quantity), 0) into v_stock from public.inventory_movements where product_id = v_product_id;
    if v_stock < v_quantity then raise exception 'Insufficient stock for product %', v_name; end if;
    v_line_subtotal := round(v_quantity * v_selling_price, 2);
    v_total := v_total + v_line_subtotal;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'product_name', v_name, 'unit_type', v_unit_type,
      'quantity', v_quantity, 'unit_purchase_cost', v_purchase_cost,
      'unit_selling_price', v_selling_price, 'line_subtotal', v_line_subtotal));
  end loop;

  if p_payment_method = 'CASH' then
    if p_amount_received is null or p_amount_received < v_total then raise exception 'Cash received must be at least the sale total'; end if;
    v_change := p_amount_received - v_total;
  elsif p_payment_method = 'YAPE' then
    if p_amount_received is not null then raise exception 'YAPE does not accept cash received'; end if;
  else
    if p_amount_received is not null then raise exception 'FIADO does not accept cash received'; end if;
    if v_current_debt + v_total > v_credit_limit then
      raise exception 'Credit limit exceeded';
    end if;
  end if;

  insert into public.sales (client_key, seller_id, payment_method, customer_id, status, total, amount_received, amount_change)
  values (p_client_key, auth.uid(), p_payment_method, p_customer_id, 'CONFIRMED', v_total,
    case when p_payment_method = 'CASH' then p_amount_received else null end, v_change)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.sale_items (sale_id, product_id, product_name, unit_type, quantity, unit_purchase_cost, unit_selling_price, line_subtotal)
    values (v_sale_id, (v_item ->> 'product_id')::uuid, v_item ->> 'product_name',
      (v_item ->> 'unit_type')::public.unit_type, (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_purchase_cost')::numeric, (v_item ->> 'unit_selling_price')::numeric,
      (v_item ->> 'line_subtotal')::numeric);
    insert into public.inventory_movements (product_id, movement_type, quantity, sale_id, note, created_by)
    values ((v_item ->> 'product_id')::uuid, 'SALE', -((v_item ->> 'quantity')::numeric), v_sale_id, 'POS sale', auth.uid());
  end loop;

  if p_payment_method = 'CREDIT' then
    insert into public.customer_credit_ledger (customer_id, movement_type, amount, sale_id, created_by)
    values (p_customer_id, 'CREDIT_SALE', v_total, v_sale_id, auth.uid());
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'client_key', p_client_key, 'payment_method', p_payment_method,
    'status', 'CONFIRMED', 'total', v_total,
    'amount_received', case when p_payment_method = 'CASH' then p_amount_received else null end,
    'amount_change', v_change, 'customer_id', p_customer_id, 'created_at', now(),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', si.product_id,
            'product_name', si.product_name,
            'unit_type', si.unit_type,
            'quantity', si.quantity,
            'unit_selling_price', si.unit_selling_price,
            'line_subtotal', si.line_subtotal
          )
          order by si.id
        )
        from public.sale_items si
        where si.sale_id = v_sale_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) from public;
revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) from anon;
grant execute on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) to authenticated;

create or replace function public.register_customer_payment(
  p_client_key uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_active boolean;
  v_balance numeric(12, 2);
  v_movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('ADMIN', 'SELLER')) then
    raise exception 'Customer payment access requires ADMIN or SELLER role';
  end if;
  if p_client_key is null then raise exception 'Client key is required'; end if;
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Payment amount must be positive with at most 2 decimals';
  end if;
  if p_payment_method not in ('CASH', 'YAPE') then raise exception 'Payment must be CASH or YAPE'; end if;

  select id, customer_id, amount, payment_method into v_existing
  from public.customer_credit_ledger
  where movement_type = 'PAYMENT' and client_key = p_client_key;
  if found then
    if v_existing.customer_id <> p_customer_id
      or v_existing.amount <> -p_amount
      or v_existing.payment_method <> p_payment_method then
      raise exception 'Payment idempotency conflict';
    end if;
    return jsonb_build_object('movement_id', v_existing.id, 'client_key', p_client_key,
      'customer_id', v_existing.customer_id, 'amount', p_amount,
      'payment_method', v_existing.payment_method, 'status', 'CONFIRMED');
  end if;

  -- Customer is always locked before reading its authoritative ledger balance.
  select active into v_active from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if not v_active then raise exception 'Customer is inactive'; end if;
  select coalesce(sum(amount), 0)::numeric(12, 2) into v_balance
    from public.customer_credit_ledger where customer_id = p_customer_id;
  perform public.assert_customer_balance(p_customer_id, v_balance);
  if p_amount > v_balance then raise exception 'Payment exceeds current debt'; end if;

  insert into public.customer_credit_ledger (customer_id, movement_type, amount, client_key, payment_method, note, created_by)
  values (p_customer_id, 'PAYMENT', -p_amount, p_client_key, p_payment_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_movement_id;

  return jsonb_build_object('movement_id', v_movement_id, 'client_key', p_client_key,
    'customer_id', p_customer_id, 'amount', p_amount, 'payment_method', p_payment_method,
    'previous_debt', v_balance, 'new_debt', v_balance - p_amount, 'status', 'CONFIRMED');
end;
$$;

revoke all on function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) from public;
revoke all on function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) from anon;
grant execute on function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) to authenticated;
