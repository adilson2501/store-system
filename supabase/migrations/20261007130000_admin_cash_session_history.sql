-- ADMIN-only read API for cash-session history.
-- CLOSED sessions use their immutable close snapshot; OPEN sessions aggregate
-- only explicitly attributed current operations.

create or replace function public.get_admin_cash_session_summary(
  p_session_id uuid
)
returns table (
  session_id uuid,
  operator_id uuid,
  status public.cash_session_status,
  opened_at timestamptz,
  closed_at timestamptz,
  opening_cash numeric(12, 2),
  cash_sales numeric(12, 2),
  yape_sales numeric(12, 2),
  credit_sales numeric(12, 2),
  cash_debt_payments numeric(12, 2),
  yape_debt_payments numeric(12, 2),
  total_sales numeric(12, 2),
  expected_cash numeric(12, 2),
  counted_cash numeric(12, 2),
  difference numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'ADMIN'
  ) then
    raise exception 'Cash session history requires ADMIN role';
  end if;

  if p_session_id is null then
    raise exception 'Cash session is required';
  end if;

  select *
    into v_session
  from public.cash_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Cash session not found';
  end if;

  if v_session.status = 'CLOSED' then
    return query
    select
      v_session.id,
      v_session.operator_id,
      v_session.status,
      v_session.opened_at,
      v_session.closed_at,
      v_session.opening_cash,
      v_session.cash_sales_at_close,
      v_session.yape_sales_at_close,
      v_session.credit_sales_at_close,
      v_session.cash_debt_payments_at_close,
      v_session.yape_debt_payments_at_close,
      (v_session.cash_sales_at_close
        + v_session.yape_sales_at_close
        + v_session.credit_sales_at_close)::numeric(12, 2),
      v_session.expected_cash_at_close,
      v_session.counted_cash,
      v_session.difference;
    return;
  end if;

  return query
  with sales_totals as (
    select
      coalesce(sum(s.total) filter (where s.payment_method = 'CASH'), 0)::numeric(12, 2) as cash_sales,
      coalesce(sum(s.total) filter (where s.payment_method = 'YAPE'), 0)::numeric(12, 2) as yape_sales,
      coalesce(sum(s.total) filter (where s.payment_method = 'CREDIT'), 0)::numeric(12, 2) as credit_sales
    from public.sales s
    where s.cash_session_id = v_session.id
      and s.status = 'CONFIRMED'
  ), payment_totals as (
    select
      (-coalesce(sum(l.amount) filter (where l.payment_method = 'CASH'), 0))::numeric(12, 2) as cash_debt_payments,
      (-coalesce(sum(l.amount) filter (where l.payment_method = 'YAPE'), 0))::numeric(12, 2) as yape_debt_payments
    from public.customer_credit_ledger l
    where l.cash_session_id = v_session.id
      and l.movement_type = 'PAYMENT'
  )
  select
    v_session.id,
    v_session.operator_id,
    v_session.status,
    v_session.opened_at,
    v_session.closed_at,
    v_session.opening_cash,
    st.cash_sales,
    st.yape_sales,
    st.credit_sales,
    pt.cash_debt_payments,
    pt.yape_debt_payments,
    (st.cash_sales + st.yape_sales + st.credit_sales)::numeric(12, 2),
    (v_session.opening_cash + st.cash_sales + pt.cash_debt_payments)::numeric(12, 2),
    null::numeric(12, 2),
    null::numeric(12, 2)
  from sales_totals st
  cross join payment_totals pt;
end;
$$;

revoke all on function public.get_admin_cash_session_summary(uuid) from public;
revoke all on function public.get_admin_cash_session_summary(uuid) from anon;
grant execute on function public.get_admin_cash_session_summary(uuid) to authenticated;
