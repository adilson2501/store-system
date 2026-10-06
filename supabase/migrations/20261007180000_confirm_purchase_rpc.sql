-- Checkpoint C: authoritative ADMIN-only purchase confirmation.
-- Purchase quantities are always base inventory units; no package semantics
-- are persisted here.

create or replace function public.confirm_purchase(
  p_client_key uuid,
  p_supplier_id uuid,
  p_purchase_date date,
  p_items jsonb,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.purchases%rowtype;
  v_purchase public.purchases%rowtype;
  v_supplier public.suppliers%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_sorted_items jsonb;
  v_result jsonb;
  v_reference text;
  v_fingerprint text;
  v_raw_product_id text;
  v_quantity_text text;
  v_cost_text text;
  v_product_id uuid;
  v_quantity numeric;
  v_cost numeric;
  v_line_subtotal numeric;
  v_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'Only administrators can confirm purchases';
  end if;

  if p_client_key is null then
    raise exception using errcode = 'P0001', message = 'Purchase client key is required';
  end if;

  if p_supplier_id is null then
    raise exception using errcode = 'P0001', message = 'Supplier is required';
  end if;

  if p_purchase_date is null then
    raise exception using errcode = 'P0001', message = 'Purchase date is required';
  end if;

  v_reference := nullif(trim(coalesce(p_reference, '')), '');
  if v_reference is not null and length(v_reference) > 120 then
    raise exception using errcode = 'P0001', message = 'Purchase reference must have at most 120 characters';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Purchase items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one purchase item is required';
  end if;

  -- Normalize only client-supplied identity and numeric values. Product name,
  -- unit type, subtotals, and total are intentionally not accepted as input.
  for v_item in
    select value
    from jsonb_array_elements(p_items) as entries(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'Invalid purchase item';
    end if;

    v_raw_product_id := nullif(trim(v_item ->> 'product_id'), '');
    v_quantity_text := nullif(trim(v_item ->> 'quantity'), '');
    v_cost_text := nullif(trim(v_item ->> 'unit_purchase_cost'), '');

    if v_raw_product_id is null or v_quantity_text is null or v_cost_text is null then
      raise exception using errcode = 'P0001', message = 'Invalid purchase item';
    end if;

    begin
      v_product_id := v_raw_product_id::uuid;
    exception
      when invalid_text_representation then
        raise exception using errcode = 'P0001', message = 'Invalid purchase item product';
    end;

    if exists (
      select 1
      from jsonb_array_elements(v_normalized_items) as existing_items(value)
      where existing_items.value ->> 'product_id' = v_product_id::text
    ) then
      raise exception using errcode = 'P0001', message = 'Duplicate product in purchase';
    end if;

    if v_quantity_text !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception using errcode = 'P0001', message = 'Invalid purchase item quantity';
    end if;

    if position('.' in v_quantity_text) > 0
      and length(v_quantity_text) - position('.' in v_quantity_text) > 3 then
      raise exception using errcode = 'P0001', message = 'Purchase quantity must have at most 3 decimals';
    end if;

    begin
      v_quantity := v_quantity_text::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'Invalid purchase item quantity';
    end;

    if v_quantity <= 0 or v_quantity > 999999999.999 then
      raise exception using errcode = 'P0001', message = 'Purchase quantity must be positive and fit inventory precision';
    end if;

    if v_cost_text !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception using errcode = 'P0001', message = 'Invalid acquisition cost';
    end if;

    if position('.' in v_cost_text) > 0
      and length(v_cost_text) - position('.' in v_cost_text) > 2 then
      raise exception using errcode = 'P0001', message = 'Acquisition cost must have at most 2 decimals';
    end if;

    begin
      v_cost := v_cost_text::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'Invalid acquisition cost';
    end;

    if v_cost < 0 or v_cost > 9999999999.99 then
      raise exception using errcode = 'P0001', message = 'Acquisition cost must be zero or greater and fit money precision';
    end if;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id::text,
        'quantity', v_quantity,
        'unit_purchase_cost', v_cost
      )
    );
  end loop;

  select coalesce(
    jsonb_agg(item order by (item ->> 'product_id')::uuid),
    '[]'::jsonb
  )
    into v_sorted_items
  from jsonb_array_elements(v_normalized_items) as sorted_items(item);

  v_fingerprint := md5(
    jsonb_build_object(
      'supplier_id', p_supplier_id::text,
      'purchase_date', p_purchase_date::text,
      'reference', v_reference,
      'items', v_sorted_items
    )::text
  );

  -- Fast path for completed requests. The fingerprint makes the client key
  -- payload-aware instead of treating the key alone as sufficient.
  select *
    into v_existing
  from public.purchases
  where client_key = p_client_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'Purchase idempotency conflict';
    end if;

    select jsonb_build_object(
      'purchase_id', p.id,
      'client_key', p.client_key,
      'supplier_id', p.supplier_id,
      'purchase_date', p.purchase_date,
      'status', p.status,
      'reference', p.reference,
      'total', p.total,
      'created_at', p.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', pi.product_id,
          'product_name', pi.product_name,
          'unit_type', pi.unit_type,
          'quantity', pi.quantity,
          'unit_purchase_cost', pi.unit_purchase_cost,
          'line_subtotal', pi.line_subtotal
        ) order by pi.id)
        from public.purchase_items pi
        where pi.purchase_id = p.id
      ), '[]'::jsonb)
    )
      into v_result
    from public.purchases p
    where p.id = v_existing.id;

    return v_result;
  end if;

  -- Supplier is the first lock for purchases. This serializes activation
  -- changes with confirmation and keeps the economic lock order explicit.
  select *
    into v_supplier
  from public.suppliers
  where id = p_supplier_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Supplier not found';
  end if;

  if not v_supplier.active then
    raise exception using errcode = 'P0001', message = 'Supplier is inactive';
  end if;

  -- Lock all products in UUID order, matching confirm_sale and void_sale.
  for v_product_id in
    select (item ->> 'product_id')::uuid
    from jsonb_array_elements(v_sorted_items) as locked_items(item)
    order by (item ->> 'product_id')::uuid
  loop
    perform 1
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'Product not found';
    end if;
  end loop;

  -- A concurrent request may have committed while this request waited for
  -- the supplier/product locks. Recheck before any economic writes.
  select *
    into v_existing
  from public.purchases
  where client_key = p_client_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'Purchase idempotency conflict';
    end if;

    select jsonb_build_object(
      'purchase_id', p.id,
      'client_key', p.client_key,
      'supplier_id', p.supplier_id,
      'purchase_date', p.purchase_date,
      'status', p.status,
      'reference', p.reference,
      'total', p.total,
      'created_at', p.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', pi.product_id,
          'product_name', pi.product_name,
          'unit_type', pi.unit_type,
          'quantity', pi.quantity,
          'unit_purchase_cost', pi.unit_purchase_cost,
          'line_subtotal', pi.line_subtotal
        ) order by pi.id)
        from public.purchase_items pi
        where pi.purchase_id = p.id
      ), '[]'::jsonb)
    )
      into v_result
    from public.purchases p
    where p.id = v_existing.id;

    return v_result;
  end if;

  -- Product rows are locked above, so product metadata and current costs are
  -- authoritative for this entire transaction.
  for v_item in
    select item
    from jsonb_array_elements(v_sorted_items) as validated_items(item)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_cost := (v_item ->> 'unit_purchase_cost')::numeric;

    select *
      into v_product
    from public.products
    where id = v_product_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'Product not found';
    end if;

    if not v_product.is_active then
      raise exception using errcode = 'P0001', message = 'Product is inactive or unavailable';
    end if;

    if v_product.unit_type = 'UNIT' and v_quantity <> trunc(v_quantity) then
      raise exception using errcode = 'P0001', message = 'UNIT products require whole-number quantities';
    end if;

    if v_product.unit_type = 'WEIGHT' and v_quantity <> round(v_quantity, 3) then
      raise exception using errcode = 'P0001', message = 'WEIGHT quantities must have at most 3 decimals';
    end if;

    v_line_subtotal := round(v_quantity * v_cost, 2);
    v_total := v_total + v_line_subtotal;

    if v_total > 9999999999.99 then
      raise exception using errcode = 'P0001', message = 'Purchase total exceeds money precision';
    end if;
  end loop;

  -- The unique client key is the concurrency backstop. A concurrent request
  -- with different supplier/product locks can reach this insert first; recover
  -- deliberately from that unique violation instead of exposing raw SQL.
  begin
    insert into public.purchases (
      client_key,
      request_fingerprint,
      supplier_id,
      purchase_date,
      status,
      reference,
      total,
      created_by
    )
    values (
      p_client_key,
      v_fingerprint,
      p_supplier_id,
      p_purchase_date,
      'CONFIRMED',
      v_reference,
      v_total,
      auth.uid()
    )
    returning * into v_purchase;
  exception
    when unique_violation then
      select *
        into v_existing
      from public.purchases
      where client_key = p_client_key;

      if not found or v_existing.request_fingerprint <> v_fingerprint then
        raise exception using errcode = 'P0001', message = 'Purchase idempotency conflict';
      end if;

      select jsonb_build_object(
        'purchase_id', p.id,
        'client_key', p.client_key,
        'supplier_id', p.supplier_id,
        'purchase_date', p.purchase_date,
        'status', p.status,
        'reference', p.reference,
        'total', p.total,
        'created_at', p.created_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id', pi.product_id,
            'product_name', pi.product_name,
            'unit_type', pi.unit_type,
            'quantity', pi.quantity,
            'unit_purchase_cost', pi.unit_purchase_cost,
            'line_subtotal', pi.line_subtotal
          ) order by pi.id)
          from public.purchase_items pi
          where pi.purchase_id = p.id
        ), '[]'::jsonb)
      )
        into v_result
      from public.purchases p
      where p.id = v_existing.id;

      return v_result;
  end;

  for v_item in
    select item
    from jsonb_array_elements(v_sorted_items) as persisted_items(item)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_cost := (v_item ->> 'unit_purchase_cost')::numeric;

    select *
      into v_product
    from public.products
    where id = v_product_id;

    v_line_subtotal := round(v_quantity * v_cost, 2);

    insert into public.purchase_items (
      purchase_id,
      product_id,
      product_name,
      unit_type,
      quantity,
      unit_purchase_cost,
      line_subtotal
    )
    values (
      v_purchase.id,
      v_product.id,
      v_product.name,
      v_product.unit_type,
      v_quantity,
      v_cost,
      v_line_subtotal
    );

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
      v_product.id,
      'ENTRY',
      v_quantity,
      null,
      v_purchase.id,
      'Purchase receiving',
      auth.uid()
    );

    update public.products
    set purchase_cost = v_cost
    where id = v_product.id;
  end loop;

  select jsonb_build_object(
    'purchase_id', p.id,
    'client_key', p.client_key,
    'supplier_id', p.supplier_id,
    'purchase_date', p.purchase_date,
    'status', p.status,
    'reference', p.reference,
    'total', p.total,
    'created_at', p.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', pi.product_id,
        'product_name', pi.product_name,
        'unit_type', pi.unit_type,
        'quantity', pi.quantity,
        'unit_purchase_cost', pi.unit_purchase_cost,
        'line_subtotal', pi.line_subtotal
      ) order by pi.id)
      from public.purchase_items pi
      where pi.purchase_id = p.id
    ), '[]'::jsonb)
  )
    into v_result
  from public.purchases p
  where p.id = v_purchase.id;

  return v_result;
end;
$$;

revoke all on function public.confirm_purchase(uuid, uuid, date, jsonb, text) from public;
revoke all on function public.confirm_purchase(uuid, uuid, date, jsonb, text) from anon;
grant execute on function public.confirm_purchase(uuid, uuid, date, jsonb, text) to authenticated;
