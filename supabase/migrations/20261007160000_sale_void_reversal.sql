-- Full-sale void foundation.
-- Economic reversal is available only through the ADMIN-only void_sale RPC.

alter table public.sales
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete restrict,
  add column void_reason text,
  add column void_client_key uuid;

do $$
begin
  if exists (
    select 1
    from public.sales
    where status = 'VOIDED'
      and (
        voided_at is null
        or voided_by is null
        or void_reason is null
        or void_client_key is null
      )
  ) then
    raise exception 'Cannot add sale void metadata constraint: existing VOIDED sale has incomplete audit metadata';
  end if;
end;
$$;

alter table public.sales
  add constraint sales_void_metadata_check check (
    (
      status = 'CONFIRMED'
      and voided_at is null
      and voided_by is null
      and void_reason is null
      and void_client_key is null
    )
    or (
      status = 'VOIDED'
      and voided_at is not null
      and voided_by is not null
      and void_reason is not null
      and length(trim(void_reason)) between 3 and 500
      and void_client_key is not null
    )
  );

create unique index sales_void_client_key_unique_idx
  on public.sales (void_client_key)
  where void_client_key is not null;

-- The authoritative sale path normalizes duplicate product IDs. Fail before
-- creating the reversal index if historical data violates that invariant.
do $$
declare
  v_sale_id uuid;
  v_product_id uuid;
  v_count bigint;
begin
  select sale_id, product_id, count(*)
    into v_sale_id, v_product_id, v_count
  from public.sale_items
  group by sale_id, product_id
  having count(*) > 1
  limit 1;

  if v_sale_id is not null then
    raise exception 'Cannot create sale reversal index: duplicate sale item for sale %, product %, count %',
      v_sale_id, v_product_id, v_count;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.inventory_movements
    where movement_type = 'REVERSAL'
      and sale_id is null
  ) then
    raise exception 'Cannot create sale reversal constraint: existing REVERSAL movement has no sale_id';
  end if;
end;
$$;

-- Fail clearly rather than hiding any pre-existing duplicate reversal data.
do $$
declare
  v_sale_id uuid;
  v_product_id uuid;
  v_count bigint;
begin
  select sale_id, product_id, count(*)
    into v_sale_id, v_product_id, v_count
  from public.inventory_movements
  where movement_type = 'REVERSAL'
  group by sale_id, product_id
  having count(*) > 1
  limit 1;

  if v_sale_id is not null then
    raise exception 'Cannot create sale reversal index: duplicate inventory reversal for sale %, product %, count %',
      v_sale_id, v_product_id, v_count;
  end if;
end;
$$;

alter table public.inventory_movements
  drop constraint inventory_movements_sale_link_check;

alter table public.inventory_movements
  add constraint inventory_movements_sale_link_check check (
    (movement_type in ('SALE', 'REVERSAL') and sale_id is not null)
    or (movement_type not in ('SALE', 'REVERSAL') and sale_id is null)
  );

create unique index inventory_movements_sale_product_reversal_unique_idx
  on public.inventory_movements (sale_id, product_id)
  where movement_type = 'REVERSAL';

alter table public.customer_credit_ledger
  drop constraint customer_credit_ledger_direction_check;

alter table public.customer_credit_ledger
  add constraint customer_credit_ledger_direction_check check (
    (
      movement_type = 'CREDIT_SALE'
      and amount > 0
      and sale_id is not null
      and client_key is null
      and payment_method is null
    )
    or (
      movement_type = 'CREDIT_SALE_REVERSAL'
      and amount < 0
      and sale_id is not null
      and client_key is null
      and payment_method is null
    )
    or (
      movement_type = 'PAYMENT'
      and amount < 0
      and sale_id is null
      and client_key is not null
      and payment_method in ('CASH', 'YAPE')
    )
  );

create unique index customer_credit_ledger_sale_reversal_unique_idx
  on public.customer_credit_ledger (sale_id)
  where movement_type = 'CREDIT_SALE_REVERSAL';

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text,
  p_client_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_cash_session public.cash_sessions%rowtype;
  v_customer public.customers%rowtype;
  v_existing_id uuid;
  v_cash_session_id uuid;
  v_reason text;
  v_balance numeric(12, 2);
  v_item record;
  v_product_id uuid;
  v_reversal_count integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'Only administrators can void sales';
  end if;

  if p_sale_id is null then
    raise exception using errcode = 'P0001', message = 'Sale is required';
  end if;

  if p_client_key is null then
    raise exception using errcode = 'P0001', message = 'Void client key is required';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception using errcode = 'P0001', message = 'Void reason must have at least 3 characters';
  end if;
  if length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'Void reason must have at most 500 characters';
  end if;

  select cash_session_id
    into v_cash_session_id
  from public.sales
  where id = p_sale_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sale not found';
  end if;

  -- Session is locked before the sale so close_cash_session and all current
  -- economic operations share the same first lock.
  if v_cash_session_id is not null then
    select *
      into v_cash_session
    from public.cash_sessions
    where id = v_cash_session_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Cash session not found';
    end if;
  end if;

  select *
    into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sale not found';
  end if;

  -- Recheck the key after locking the sale. This makes retries safe and
  -- prevents a second reversal from being attempted.
  if v_sale.void_client_key is not null then
    if v_sale.void_client_key = p_client_key and v_sale.void_reason = v_reason then
      select count(*)::integer
        into v_reversal_count
      from public.inventory_movements
      where sale_id = v_sale.id
        and movement_type = 'REVERSAL';

      return jsonb_build_object(
        'sale_id', v_sale.id,
        'status', v_sale.status,
        'payment_method', v_sale.payment_method,
        'total', v_sale.total,
        'customer_id', v_sale.customer_id,
        'cash_session_id', v_sale.cash_session_id,
        'created_at', v_sale.created_at,
        'voided_at', v_sale.voided_at,
        'voided_by', v_sale.voided_by,
        'void_reason', v_sale.void_reason,
        'void_client_key', v_sale.void_client_key,
        'inventory_reversal_count', 0
      );
    end if;

    if v_sale.status = 'VOIDED' then
      if v_sale.void_client_key = p_client_key then
        raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
      end if;
    end if;
  end if;

  select id
    into v_existing_id
  from public.sales
  where void_client_key = p_client_key;

  if found and v_existing_id <> v_sale.id then
    raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
  end if;

  if v_sale.status = 'VOIDED' then
    raise exception using errcode = 'P0001', message = 'Sale is already voided';
  end if;

  if v_sale.status <> 'CONFIRMED' then
    raise exception using errcode = 'P0001', message = 'Sale is already voided';
  end if;

  if v_cash_session_id is not null and v_cash_session.status = 'CLOSED' then
    raise exception using errcode = 'P0001', message = 'Sales belonging to closed cash sessions cannot be voided';
  end if;

  if v_sale.payment_method = 'CREDIT' then
    select *
      into v_customer
    from public.customers
    where id = v_sale.customer_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Customer not found';
    end if;

    select coalesce(sum(amount), 0)::numeric(12, 2)
      into v_balance
    from public.customer_credit_ledger
    where customer_id = v_sale.customer_id;

    if v_balance - v_sale.total < 0 then
      raise exception using
        errcode = 'P0001',
        message = 'Credit sale cannot be voided because the current customer balance is lower than the sale total';
    end if;
  end if;

  if not exists (
    select 1
    from public.sale_items
    where sale_id = v_sale.id
  ) then
    raise exception using errcode = 'P0001', message = 'Sale has no items';
  end if;

  -- Match confirm_sale product locking and keep the order deterministic.
  for v_product_id in
    select distinct product_id
    from public.sale_items
    where sale_id = v_sale.id
    order by product_id
  loop
    perform 1
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Product not found for sale item';
    end if;
  end loop;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = v_sale.id
    order by product_id, id
  loop
    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      sale_id,
      note,
      created_by
    )
    values (
      v_item.product_id,
      'REVERSAL',
      v_item.quantity,
      v_sale.id,
      'Sale void reversal',
      auth.uid()
    );
    v_reversal_count := v_reversal_count + 1;
  end loop;

  if v_sale.payment_method = 'CREDIT' then
    insert into public.customer_credit_ledger (
      customer_id,
      movement_type,
      amount,
      sale_id,
      cash_session_id,
      created_by
    )
    values (
      v_sale.customer_id,
      'CREDIT_SALE_REVERSAL',
      -v_sale.total,
      v_sale.id,
      v_sale.cash_session_id,
      auth.uid()
    );
  end if;

  begin
    update public.sales
    set status = 'VOIDED',
        voided_at = now(),
        voided_by = auth.uid(),
        void_reason = v_reason,
        void_client_key = p_client_key
    where id = v_sale.id
    returning * into v_sale;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
  end;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'status', v_sale.status,
    'payment_method', v_sale.payment_method,
    'total', v_sale.total,
    'customer_id', v_sale.customer_id,
    'cash_session_id', v_sale.cash_session_id,
    'created_at', v_sale.created_at,
    'voided_at', v_sale.voided_at,
    'voided_by', v_sale.voided_by,
    'void_reason', v_sale.void_reason,
    'void_client_key', v_sale.void_client_key,
    'inventory_reversal_count', v_reversal_count
  );
end;
$$;

revoke all on function public.void_sale(uuid, text, uuid) from public;
revoke all on function public.void_sale(uuid, text, uuid) from anon;
grant execute on function public.void_sale(uuid, text, uuid) to authenticated;
