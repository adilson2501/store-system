-- Checkpoint G3: authoritative ADMIN-only full purchase void.
-- This operation is intentionally database-only; application actions and UI
-- are deferred to a later checkpoint.

create or replace function public.void_purchase(
  p_purchase_id uuid,
  p_reason text,
  p_client_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_reason text;
  v_item record;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_current_stock numeric(12, 3);
  v_resulting_cost numeric(12, 2);
  v_voided_at timestamptz;
  v_result jsonb := '[]'::jsonb;
  v_expected_item_count integer;
  v_reversal_count integer;
  v_cost_reversal_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'Only administrators can void purchases';
  end if;

  if p_purchase_id is null then
    raise exception using errcode = 'P0001', message = 'Purchase is required';
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

  -- Serialize all attempts for this purchase before examining status or
  -- idempotency metadata.
  select *
    into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Purchase not found';
  end if;

  if v_purchase.status = 'VOIDED' then
    if exists (
      select 1
      from public.purchases
      where void_client_key = p_client_key
        and id <> v_purchase.id
    ) then
      raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
    end if;

    if v_purchase.void_client_key = p_client_key then
      if v_purchase.void_reason is distinct from v_reason then
        raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
      end if;

      select count(*)::integer
        into v_expected_item_count
      from public.purchase_items
      where purchase_id = v_purchase.id;

      select count(*)::integer
        into v_reversal_count
      from public.inventory_movements
      where purchase_id = v_purchase.id
        and movement_type = 'PURCHASE_REVERSAL';

      select count(*)::integer
        into v_cost_reversal_count
      from public.product_cost_history
      where source_id = v_purchase.id
        and source_type = 'PURCHASE_REVERSAL';

      if v_expected_item_count = 0
        or v_reversal_count <> v_expected_item_count
        or v_cost_reversal_count <> v_expected_item_count then
        raise exception using errcode = 'P0001', message = 'Purchase reversal consistency failure';
      end if;

      if exists (
        select 1
        from public.purchase_items pi
        where pi.purchase_id = v_purchase.id
          and (
            not exists (
              select 1
              from public.inventory_movements im
              where im.purchase_id = pi.purchase_id
                and im.product_id = pi.product_id
                and im.movement_type = 'PURCHASE_REVERSAL'
                and im.quantity = -pi.quantity
            )
            or not exists (
              select 1
              from public.product_cost_history pch
              where pch.product_id = pi.product_id
                and pch.source_type = 'PURCHASE_REVERSAL'
                and pch.source_id = pi.purchase_id
            )
          )
      ) then
        raise exception using errcode = 'P0001', message = 'Purchase reversal consistency failure';
      end if;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_id', pi.product_id,
            'reversed_quantity', -im.quantity,
            'resulting_purchase_cost', pch.cost
          ) order by pi.product_id
        ),
        '[]'::jsonb
      )
        into v_result
      from public.purchase_items pi
      join public.inventory_movements im
        on im.purchase_id = pi.purchase_id
       and im.product_id = pi.product_id
       and im.movement_type = 'PURCHASE_REVERSAL'
      join public.product_cost_history pch
        on pch.product_id = pi.product_id
       and pch.source_type = 'PURCHASE_REVERSAL'
       and pch.source_id = pi.purchase_id
      where pi.purchase_id = v_purchase.id;

      return jsonb_build_object(
        'purchase_id', v_purchase.id,
        'status', v_purchase.status,
        'voided_at', v_purchase.voided_at,
        'void_reason', v_purchase.void_reason,
        'inventory_reversal_count', v_reversal_count,
        'products', v_result
      );
    end if;

    raise exception using errcode = 'P0001', message = 'Purchase is already voided';
  end if;

  if v_purchase.status <> 'CONFIRMED' then
    raise exception using errcode = 'P0001', message = 'Purchase is already voided';
  end if;

  -- The client key is globally unique across purchase voids. The target row
  -- is already locked; a concurrent request for another purchase is handled
  -- by the unique index during the final metadata update.
  if exists (
    select 1
    from public.purchases
    where void_client_key = p_client_key
      and id <> v_purchase.id
  ) then
    raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
  end if;

  select count(*)::integer
    into v_expected_item_count
  from public.purchase_items
  where purchase_id = v_purchase.id;

  if v_expected_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'Purchase has no items';
  end if;

  -- Every post-G1 purchase must have one matching authoritative PURCHASE
  -- event per persisted item. Legacy purchases fail before any product lock or
  -- economic write and are intentionally not made reversible here.
  if exists (
    select 1
    from public.purchase_items pi
    where pi.purchase_id = v_purchase.id
      and not exists (
        select 1
        from public.product_cost_history pch
        where pch.product_id = pi.product_id
          and pch.source_type = 'PURCHASE'
          and pch.source_id = v_purchase.id
          and pch.cost = pi.unit_purchase_cost
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Purchase cost history is incomplete';
  end if;

  -- Confirm that each persisted item has exactly one original purchase entry
  -- before locking products or preparing compensating movements.
  if exists (
    select 1
    from public.purchase_items pi
    where pi.purchase_id = v_purchase.id
      and (
        not exists (
          select 1
          from public.inventory_movements im
          where im.purchase_id = pi.purchase_id
            and im.product_id = pi.product_id
            and im.movement_type = 'ENTRY'
            and im.quantity = pi.quantity
        )
        or (
          select count(*)
          from public.inventory_movements im
          where im.purchase_id = pi.purchase_id
            and im.product_id = pi.product_id
            and im.movement_type = 'ENTRY'
        ) <> 1
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Purchase reversal consistency failure';
  end if;

  if exists (
    select 1
    from public.inventory_movements
    where purchase_id = v_purchase.id
      and movement_type = 'PURCHASE_REVERSAL'
  )
  or exists (
    select 1
    from public.product_cost_history
    where source_id = v_purchase.id
      and source_type = 'PURCHASE_REVERSAL'
  ) then
    raise exception using errcode = 'P0001', message = 'Purchase reversal already exists';
  end if;

  -- Match confirm_purchase, confirm_sale, void_sale, and update_product:
  -- every affected product is locked in ascending UUID order.
  for v_product_id in
    select distinct product_id
    from public.purchase_items
    where purchase_id = v_purchase.id
    order by product_id
  loop
    select *
      into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Product not found for purchase item';
    end if;
  end loop;

  -- All stock and cost checks happen after product locks and before any
  -- compensating movement or product-cost write.
  for v_item in
    select product_id, quantity
    from public.purchase_items
    where purchase_id = v_purchase.id
    order by product_id
  loop
    select coalesce(sum(quantity), 0)::numeric(12, 3)
      into v_current_stock
    from public.inventory_movements
    where product_id = v_item.product_id;

    if v_current_stock < v_item.quantity then
      raise exception using errcode = 'P0001', message = 'Insufficient stock to reverse purchase';
    end if;

    select pch.cost
      into v_resulting_cost
    from public.product_cost_history pch
    where pch.product_id = v_item.product_id
      and pch.source_type in ('INITIAL', 'LEGACY_BASELINE', 'MANUAL_ADJUSTMENT', 'PURCHASE')
      and (
        pch.source_type <> 'PURCHASE'
        or (
          pch.source_id <> v_purchase.id
          and exists (
            select 1
            from public.purchases source_purchase
            where source_purchase.id = pch.source_id
              and source_purchase.status = 'CONFIRMED'
          )
        )
      )
    order by pch.sequence desc
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'Purchase cost history is incomplete';
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_item.product_id,
        'reversed_quantity', v_item.quantity,
        'resulting_purchase_cost', v_resulting_cost
      )
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(v_result) as result_items(value)
  loop
    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      sale_id,
      purchase_id,
      note,
      created_by
    )
    values (
      (v_item.value ->> 'product_id')::uuid,
      'PURCHASE_REVERSAL',
      -((v_item.value ->> 'reversed_quantity')::numeric),
      null,
      v_purchase.id,
      'Purchase void reversal',
      auth.uid()
    );

    update public.products
    set purchase_cost = (v_item.value ->> 'resulting_purchase_cost')::numeric
    where id = (v_item.value ->> 'product_id')::uuid;

    insert into public.product_cost_history (
      product_id,
      source_type,
      source_id,
      cost,
      created_by
    )
    values (
      (v_item.value ->> 'product_id')::uuid,
      'PURCHASE_REVERSAL',
      v_purchase.id,
      (v_item.value ->> 'resulting_purchase_cost')::numeric,
      auth.uid()
    );
  end loop;

  v_voided_at := now();

  begin
    update public.purchases
    set status = 'VOIDED',
        voided_at = v_voided_at,
        voided_by = auth.uid(),
        void_reason = v_reason,
        void_client_key = p_client_key
    where id = v_purchase.id
    returning * into v_purchase;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'Void idempotency conflict';
  end;

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'status', v_purchase.status,
    'voided_at', v_purchase.voided_at,
    'void_reason', v_purchase.void_reason,
    'inventory_reversal_count', v_expected_item_count,
    'products', v_result
  );
end;
$$;

revoke all on function public.void_purchase(uuid, text, uuid) from public, anon;
grant execute on function public.void_purchase(uuid, text, uuid) to authenticated;
