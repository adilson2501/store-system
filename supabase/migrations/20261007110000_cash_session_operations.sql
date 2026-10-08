-- Cash session lifecycle RPCs.
-- Sales and customer payment RPCs intentionally do not require a session yet.

create or replace function public.open_cash_session(
  p_client_key uuid,
  p_opening_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.cash_sessions%rowtype;
  v_session public.cash_sessions%rowtype;
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
    raise exception 'Cash session access requires ADMIN or SELLER role';
  end if;

  if p_client_key is null then
    raise exception 'Open client key is required';
  end if;

  if p_opening_cash is null
    or p_opening_cash < 0
    or p_opening_cash <> round(p_opening_cash, 2) then
    raise exception 'Opening cash must be zero or greater with at most 2 decimals';
  end if;

  select *
    into v_existing
  from public.cash_sessions
  where open_client_key = p_client_key;

  if found then
    if v_existing.operator_id <> auth.uid()
      or v_existing.opening_cash <> p_opening_cash then
      raise exception 'Open session idempotency conflict';
    end if;

    return jsonb_build_object(
      'session_id', v_existing.id,
      'operator_id', v_existing.operator_id,
      'opened_at', v_existing.opened_at,
      'opening_cash', v_existing.opening_cash,
      'status', v_existing.status,
      'close_client_key', v_existing.close_client_key
    );
  end if;

  if exists (
    select 1
    from public.cash_sessions
    where operator_id = auth.uid()
      and status = 'OPEN'
  ) then
    raise exception 'Operator already has an open cash session';
  end if;

  insert into public.cash_sessions (
    operator_id,
    opening_cash,
    open_client_key,
    status
  )
  values (
    auth.uid(),
    p_opening_cash,
    p_client_key,
    'OPEN'
  )
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'operator_id', v_session.operator_id,
    'opened_at', v_session.opened_at,
    'opening_cash', v_session.opening_cash,
    'status', v_session.status,
    'close_client_key', v_session.close_client_key
  );
exception
  when unique_violation then
    if exists (
      select 1
      from public.cash_sessions
      where operator_id = auth.uid()
        and status = 'OPEN'
    ) then
      raise exception 'Operator already has an open cash session';
    end if;
    raise exception 'Open session idempotency conflict';
end;
$$;

revoke all on function public.open_cash_session(uuid, numeric) from public;
revoke all on function public.open_cash_session(uuid, numeric) from anon;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated;

create or replace function public.get_current_cash_session()
returns table (
  session_id uuid,
  opened_at timestamptz,
  opening_cash numeric(12, 2),
  status public.cash_session_status
)
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Cash session access requires ADMIN or SELLER role';
  end if;

  return query
  select
    cs.id,
    cs.opened_at,
    cs.opening_cash,
    cs.status
  from public.cash_sessions cs
  where cs.operator_id = auth.uid()
    and cs.status = 'OPEN';
end;
$$;

revoke all on function public.get_current_cash_session() from public;
revoke all on function public.get_current_cash_session() from anon;
grant execute on function public.get_current_cash_session() to authenticated;

create or replace function public.get_current_cash_session_summary()
returns table (
  session_id uuid,
  opened_at timestamptz,
  opening_cash numeric(12, 2),
  cash_sales numeric(12, 2),
  yape_sales numeric(12, 2),
  credit_sales numeric(12, 2),
  cash_debt_payments numeric(12, 2),
  yape_debt_payments numeric(12, 2),
  total_sales numeric(12, 2),
  expected_cash numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Cash session access requires ADMIN or SELLER role';
  end if;

  return query
  with current_session as (
    select cs.id, cs.opened_at, cs.opening_cash
    from public.cash_sessions cs
    where cs.operator_id = auth.uid()
      and cs.status = 'OPEN'
  ), sales_totals as (
    select
      s.cash_session_id,
      coalesce(sum(s.total) filter (where s.payment_method = 'CASH'), 0)::numeric(12, 2) as cash_sales,
      coalesce(sum(s.total) filter (where s.payment_method = 'YAPE'), 0)::numeric(12, 2) as yape_sales,
      coalesce(sum(s.total) filter (where s.payment_method = 'CREDIT'), 0)::numeric(12, 2) as credit_sales
    from public.sales s
    where s.status = 'CONFIRMED'
      and s.cash_session_id is not null
    group by s.cash_session_id
  ), payment_totals as (
    select
      l.cash_session_id,
      (-coalesce(sum(l.amount) filter (where l.payment_method = 'CASH'), 0))::numeric(12, 2) as cash_debt_payments,
      (-coalesce(sum(l.amount) filter (where l.payment_method = 'YAPE'), 0))::numeric(12, 2) as yape_debt_payments
    from public.customer_credit_ledger l
    where l.movement_type = 'PAYMENT'
      and l.cash_session_id is not null
    group by l.cash_session_id
  )
  select
    cs.id,
    cs.opened_at,
    cs.opening_cash,
    coalesce(st.cash_sales, 0)::numeric(12, 2),
    coalesce(st.yape_sales, 0)::numeric(12, 2),
    coalesce(st.credit_sales, 0)::numeric(12, 2),
    coalesce(pt.cash_debt_payments, 0)::numeric(12, 2),
    coalesce(pt.yape_debt_payments, 0)::numeric(12, 2),
    (coalesce(st.cash_sales, 0) + coalesce(st.yape_sales, 0) + coalesce(st.credit_sales, 0))::numeric(12, 2),
    (cs.opening_cash + coalesce(st.cash_sales, 0) + coalesce(pt.cash_debt_payments, 0))::numeric(12, 2)
  from current_session cs
  left join sales_totals st on st.cash_session_id = cs.id
  left join payment_totals pt on pt.cash_session_id = cs.id;
end;
$$;

revoke all on function public.get_current_cash_session_summary() from public;
revoke all on function public.get_current_cash_session_summary() from anon;
grant execute on function public.get_current_cash_session_summary() to authenticated;

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_close_client_key uuid,
  p_counted_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_close_key_session_id uuid;
  v_cash_sales numeric(12, 2);
  v_yape_sales numeric(12, 2);
  v_credit_sales numeric(12, 2);
  v_cash_debt_payments numeric(12, 2);
  v_yape_debt_payments numeric(12, 2);
  v_total_sales numeric(12, 2);
  v_expected_cash numeric(12, 2);
  v_difference numeric(12, 2);
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
    raise exception 'Cash session access requires ADMIN or SELLER role';
  end if;

  if p_session_id is null then
    raise exception 'Cash session is required';
  end if;

  if p_close_client_key is null then
    raise exception 'Close client key is required';
  end if;

  select *
    into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Cash session not found';
  end if;

  if v_session.operator_id <> auth.uid() then
    raise exception 'Only the session operator can close this cash session';
  end if;

  select id
    into v_close_key_session_id
  from public.cash_sessions
  where close_client_key = p_close_client_key;

  if found and v_close_key_session_id <> p_session_id then
    raise exception 'Close session idempotency conflict';
  end if;

  if v_session.status = 'CLOSED' then
    if v_session.close_client_key = p_close_client_key
      and v_session.counted_cash = p_counted_cash then
      return jsonb_build_object(
        'session_id', v_session.id,
        'status', v_session.status,
        'opened_at', v_session.opened_at,
        'closed_at', v_session.closed_at,
        'opening_cash', v_session.opening_cash,
        'cash_sales', v_session.cash_sales_at_close,
        'yape_sales', v_session.yape_sales_at_close,
        'credit_sales', v_session.credit_sales_at_close,
        'cash_debt_payments', v_session.cash_debt_payments_at_close,
        'yape_debt_payments', v_session.yape_debt_payments_at_close,
        'total_sales', v_session.cash_sales_at_close + v_session.yape_sales_at_close + v_session.credit_sales_at_close,
        'expected_cash', v_session.expected_cash_at_close,
        'counted_cash', v_session.counted_cash,
        'difference', v_session.difference
      );
    end if;

    if v_session.close_client_key = p_close_client_key then
      raise exception 'Close session idempotency conflict';
    end if;

    raise exception 'Cash session is already closed';
  end if;

  if p_counted_cash is null
    or p_counted_cash < 0
    or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'Counted cash must be zero or greater with at most 2 decimals';
  end if;

  select
    coalesce(sum(s.total) filter (where s.payment_method = 'CASH'), 0)::numeric(12, 2),
    coalesce(sum(s.total) filter (where s.payment_method = 'YAPE'), 0)::numeric(12, 2),
    coalesce(sum(s.total) filter (where s.payment_method = 'CREDIT'), 0)::numeric(12, 2)
    into v_cash_sales, v_yape_sales, v_credit_sales
  from public.sales s
  where s.cash_session_id = v_session.id
    and s.status = 'CONFIRMED';

  select
    (-coalesce(sum(l.amount) filter (where l.payment_method = 'CASH'), 0))::numeric(12, 2),
    (-coalesce(sum(l.amount) filter (where l.payment_method = 'YAPE'), 0))::numeric(12, 2)
    into v_cash_debt_payments, v_yape_debt_payments
  from public.customer_credit_ledger l
  where l.cash_session_id = v_session.id
    and l.movement_type = 'PAYMENT';

  v_total_sales := v_cash_sales + v_yape_sales + v_credit_sales;
  v_expected_cash := v_session.opening_cash + v_cash_sales + v_cash_debt_payments;
  v_difference := p_counted_cash - v_expected_cash;

  update public.cash_sessions
  set status = 'CLOSED',
      closed_at = now(),
      closed_by = auth.uid(),
      counted_cash = p_counted_cash,
      expected_cash_at_close = v_expected_cash,
      difference = v_difference,
      close_client_key = p_close_client_key,
      cash_sales_at_close = v_cash_sales,
      yape_sales_at_close = v_yape_sales,
      credit_sales_at_close = v_credit_sales,
      cash_debt_payments_at_close = v_cash_debt_payments,
      yape_debt_payments_at_close = v_yape_debt_payments
  where id = v_session.id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', 'CLOSED',
    'opened_at', v_session.opened_at,
    'closed_at', now(),
    'opening_cash', v_session.opening_cash,
    'cash_sales', v_cash_sales,
    'yape_sales', v_yape_sales,
    'credit_sales', v_credit_sales,
    'cash_debt_payments', v_cash_debt_payments,
    'yape_debt_payments', v_yape_debt_payments,
    'total_sales', v_total_sales,
    'expected_cash', v_expected_cash,
    'counted_cash', p_counted_cash,
    'difference', v_difference
  );
end;
$$;

revoke all on function public.close_cash_session(uuid, uuid, numeric) from public;
revoke all on function public.close_cash_session(uuid, uuid, numeric) from anon;
grant execute on function public.close_cash_session(uuid, uuid, numeric) to authenticated;
