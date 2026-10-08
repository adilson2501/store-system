-- Round WEIGHT sale lines to the nearest S/. 0.10.
-- Positive exact midpoints round upward. UNIT lines retain cent rounding.

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

  -- Preserve sale idempotency before requiring a currently open session.
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
    ) into v_item
    from public.sales s where s.id = v_sale_id;
    return v_item;
  end if;

  -- Every new economic operation locks its session before customer/products.
  select id into v_cash_session_id
  from public.cash_sessions
  where operator_id = auth.uid() and status = 'OPEN'
  for update;
  if not found then raise exception 'Open cash session is required'; end if;

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
    select distinct x.product_id
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    order by x.product_id
  loop
    perform 1 from public.products where id = v_product_id for update;
    if not found then raise exception 'Product not found'; end if;
  end loop;

  -- A concurrent first request may have committed while product locks waited.
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
    ) into v_item
    from public.sales s where s.id = v_sale_id;
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
    select coalesce(sum(quantity), 0) into v_stock
      from public.inventory_movements where product_id = v_product_id;
    if v_stock < v_quantity then raise exception 'Insufficient stock for product %', v_name; end if;

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
      raise exception 'Cash received must be at least the sale total';
    end if;
    v_change := p_amount_received - v_total;
  elsif p_payment_method = 'YAPE' then
    if p_amount_received is not null then raise exception 'YAPE does not accept cash received'; end if;
  else
    if p_amount_received is not null then raise exception 'FIADO does not accept cash received'; end if;
    if v_current_debt + v_total > v_credit_limit then raise exception 'Credit limit exceeded'; end if;
  end if;

  insert into public.sales (
    client_key, seller_id, payment_method, customer_id, cash_session_id,
    status, total, amount_received, amount_change
  )
  values (
    p_client_key, auth.uid(), p_payment_method, p_customer_id, v_cash_session_id,
    'CONFIRMED', v_total,
    case when p_payment_method = 'CASH' then p_amount_received else null end,
    v_change
  )
  returning id into v_sale_id;

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

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'client_key', p_client_key,
    'payment_method', p_payment_method,
    'status', 'CONFIRMED',
    'total', v_total,
    'amount_received', case when p_payment_method = 'CASH' then p_amount_received else null end,
    'amount_change', v_change,
    'customer_id', p_customer_id,
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
      from public.sale_items si where si.sale_id = v_sale_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) from public;
revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) from anon;
grant execute on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid) to authenticated;
