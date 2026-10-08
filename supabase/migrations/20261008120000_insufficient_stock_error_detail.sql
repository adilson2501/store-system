-- Preserve the active confirm_sale wrapper and enrich only the underlying
-- insufficient-stock exception with the value observed while the product row
-- was locked.
create or replace function public.b2_original_confirm_sale(
  p_client_key uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_amount_received numeric default null,
  p_customer_id uuid default null,
  p_cash_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.sales%rowtype;
  v_sale_id uuid;
  v_cash_session_id uuid;
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
  v_normalized_items jsonb;
  v_fingerprint text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role in ('ADMIN', 'SELLER')
  ) then
    raise exception using errcode = 'P0001', message = 'POS access requires ADMIN or SELLER role';
  end if;

  if p_client_key is null then
    raise exception using errcode = 'P0001', message = 'Client key is required';
  end if;

  if p_cash_session_id is null then
    raise exception using errcode = 'P0001', message = 'Cash session is required';
  end if;

  if p_payment_method not in ('CASH', 'YAPE', 'CREDIT') then
    raise exception using errcode = 'P0001', message = 'Unsupported payment method';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one sale item is required';
  end if;

  -- Validate only the structure needed to canonicalize the request before the
  -- existing-key path. Mutable economic authorization happens only for new sales.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(trim(v_item ->> 'product_id'), '') is null
      or nullif(trim(v_item ->> 'quantity'), '') is null then
      raise exception using errcode = 'P0001', message = 'Invalid sale item';
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', normalized.product_id::text,
        'quantity', to_char(normalized.quantity, 'FM9999999990.000')
      )
      order by normalized.product_id
    ),
    '[]'::jsonb
  )
  into v_normalized_items
  from (
    select x.product_id, sum(x.quantity)::numeric as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by x.product_id
  ) normalized;

  for v_item in select value from jsonb_array_elements(v_normalized_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity <> round(v_quantity, 3) then
      raise exception using errcode = 'P0001', message = 'Quantity must be positive with at most 3 decimals';
    end if;
  end loop;

  v_fingerprint := md5(
    jsonb_build_object(
      'version', 1,
      'cash_session_id', p_cash_session_id::text,
      'payment_method', p_payment_method::text,
      'customer_id', p_customer_id::text,
      'amount_received', case when p_payment_method = 'CASH' then to_char(p_amount_received, 'FM9999999990.00') else null end,
      'items', v_normalized_items
    )::text
  );

  -- Existing requests are resolved before current session, customer, stock, or
  -- payment authorization. A matching retry returns the original authority.
  select *
    into v_existing
  from public.sales
  where client_key = p_client_key;

  if found then
    if v_existing.seller_id <> auth.uid() and not public.is_admin() then
      raise exception using errcode = 'P0001', message = 'Sale recovery is not permitted';
    end if;

    if v_existing.request_fingerprint is null then
      raise exception using errcode = 'P0001', message = 'Legacy sale recovery is unavailable';
    end if;

    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'SALE_IDEMPOTENCY_CONFLICT';
    end if;

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
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', si.product_id,
          'product_name', si.product_name,
          'unit_type', si.unit_type,
          'quantity', si.quantity,
          'unit_selling_price', si.unit_selling_price,
          'line_subtotal', si.line_subtotal
        ) order by si.id)
        from public.sale_items si where si.sale_id = s.id
      ), '[]'::jsonb)
    ) into v_result
    from public.sales s
    where s.id = v_existing.id;
    return v_result;
  end if;

  if p_payment_method = 'CREDIT' and p_customer_id is null
    or p_payment_method <> 'CREDIT' and p_customer_id is not null then
    raise exception using errcode = 'P0001', message = 'Customer is required only for FIADO sales';
  end if;

  if p_payment_method = 'YAPE' and p_amount_received is not null then
    raise exception using errcode = 'P0001', message = 'YAPE does not accept cash received';
  end if;

  if p_payment_method = 'CREDIT' and p_amount_received is not null then
    raise exception using errcode = 'P0001', message = 'FIADO does not accept cash received';
  end if;

  -- New sales must use exactly the captured session. Never substitute another
  -- open session after the client has captured its originating session.
  select id into v_cash_session_id
  from public.cash_sessions
  where id = p_cash_session_id
    and operator_id = auth.uid()
    and status = 'OPEN'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Open cash session is required';
  end if;

  if p_payment_method = 'CREDIT' then
    select active, credit_enabled, credit_limit
      into v_customer_active, v_credit_enabled, v_credit_limit
    from public.customers
    where id = p_customer_id
    for update;
    if not found then raise exception using errcode = 'P0001', message = 'Customer not found'; end if;
    if not v_customer_active then raise exception using errcode = 'P0001', message = 'Customer is inactive'; end if;
    if not v_credit_enabled then raise exception using errcode = 'P0001', message = 'Customer credit is disabled'; end if;
    select coalesce(sum(amount), 0)::numeric(12, 2)
      into v_current_debt
    from public.customer_credit_ledger
    where customer_id = p_customer_id;
    perform public.assert_customer_balance(p_customer_id, v_current_debt);
  end if;

  for v_product_id in
    select (item ->> 'product_id')::uuid
    from jsonb_array_elements(v_normalized_items) as normalized_items(item)
    order by (item ->> 'product_id')::uuid
  loop
    perform 1 from public.products where id = v_product_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'Product not found'; end if;
  end loop;

  -- A concurrent first request may have committed while locks were acquired.
  select * into v_existing from public.sales where client_key = p_client_key;
  if found then
    if v_existing.seller_id <> auth.uid() and not public.is_admin() then
      raise exception using errcode = 'P0001', message = 'Sale recovery is not permitted';
    end if;
    if v_existing.request_fingerprint is null
      or v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'SALE_IDEMPOTENCY_CONFLICT';
    end if;

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
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', si.product_id,
          'product_name', si.product_name,
          'unit_type', si.unit_type,
          'quantity', si.quantity,
          'unit_selling_price', si.unit_selling_price,
          'line_subtotal', si.line_subtotal
        ) order by si.id)
        from public.sale_items si where si.sale_id = s.id
      ), '[]'::jsonb)
    ) into v_result
    from public.sales s
    where s.id = v_existing.id;
    return v_result;
  end if;

  for v_item in select value from jsonb_array_elements(v_normalized_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    select name, unit_type, purchase_cost, selling_price, is_active
      into v_name, v_unit_type, v_purchase_cost, v_selling_price, v_is_active
    from public.products where id = v_product_id;
    if not v_is_active then raise exception using errcode = 'P0001', message = 'Product is inactive or unavailable'; end if;
    if v_unit_type = 'UNIT' and v_quantity <> trunc(v_quantity) then
      raise exception using errcode = 'P0001', message = 'UNIT products require whole-number quantities';
    end if;
    select coalesce(sum(quantity), 0) into v_stock
    from public.inventory_movements where product_id = v_product_id;
    if v_stock < v_quantity then
      raise exception using
        errcode = 'P0001',
        message = format('Insufficient stock for product %s', v_name),
        detail = json_build_object(
          'code', 'INSUFFICIENT_STOCK',
          'productId', v_product_id::text,
          'productName', v_name,
          'unitType', v_unit_type::text,
          'availableStock', to_char(v_stock, 'FM9999999990.000')
        )::text;
    end if;
    if v_unit_type = 'WEIGHT' then
      v_line_subtotal := round(v_quantity * v_selling_price * 10) / 10;
    else
      v_line_subtotal := round(v_quantity * v_selling_price, 2);
    end if;
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
      raise exception using errcode = 'P0001', message = 'Cash received must be at least the sale total';
    end if;
    v_change := p_amount_received - v_total;
  elsif p_payment_method = 'CREDIT' then
    if v_current_debt + v_total > v_credit_limit then
      raise exception using errcode = 'P0001', message = 'Credit limit exceeded';
    end if;
  end if;

  begin
    insert into public.sales (
      client_key, request_fingerprint, seller_id, payment_method, customer_id,
      cash_session_id, status, total, amount_received, amount_change
    )
    values (
      p_client_key, v_fingerprint, auth.uid(), p_payment_method, p_customer_id,
      v_cash_session_id, 'CONFIRMED', v_total,
      case when p_payment_method = 'CASH' then p_amount_received else null end,
      v_change
    )
    returning id into v_sale_id;
  exception
    when unique_violation then
      select * into v_existing from public.sales where client_key = p_client_key;
      if not found or v_existing.seller_id <> auth.uid() and not public.is_admin()
        or v_existing.request_fingerprint is null
        or v_existing.request_fingerprint <> v_fingerprint then
        raise exception using errcode = 'P0001', message = 'SALE_IDEMPOTENCY_CONFLICT';
      end if;
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
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id', si.product_id,
            'product_name', si.product_name,
            'unit_type', si.unit_type,
            'quantity', si.quantity,
            'unit_selling_price', si.unit_selling_price,
            'line_subtotal', si.line_subtotal
          ) order by si.id)
          from public.sale_items si where si.sale_id = s.id
        ), '[]'::jsonb)
      ) into v_result
      from public.sales s where s.id = v_existing.id;
      return v_result;
  end;

  for v_item in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.sale_items (
      sale_id, product_id, product_name, unit_type, quantity,
      unit_purchase_cost, unit_selling_price, line_subtotal
    )
    values (
      v_sale_id, (v_item ->> 'product_id')::uuid, v_item ->> 'product_name',
      (v_item ->> 'unit_type')::public.unit_type, (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_purchase_cost')::numeric, (v_item ->> 'unit_selling_price')::numeric,
      (v_item ->> 'line_subtotal')::numeric
    );
    insert into public.inventory_movements (product_id, movement_type, quantity, sale_id, note, created_by)
    values (
      (v_item ->> 'product_id')::uuid, 'SALE', -((v_item ->> 'quantity')::numeric),
      v_sale_id, 'POS sale', auth.uid()
    );
  end loop;

  if p_payment_method = 'CREDIT' then
    insert into public.customer_credit_ledger (
      customer_id, movement_type, amount, sale_id, cash_session_id, created_by
    )
    values (p_customer_id, 'CREDIT_SALE', v_total, v_sale_id, v_cash_session_id, auth.uid());
  end if;

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
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', si.product_id,
        'product_name', si.product_name,
        'unit_type', si.unit_type,
        'quantity', si.quantity,
        'unit_selling_price', si.unit_selling_price,
        'line_subtotal', si.line_subtotal
      ) order by si.id)
      from public.sale_items si where si.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sales s
  where s.id = v_sale_id;
  return v_result;
end;
$$;
