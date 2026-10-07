-- B3: administrator-only sales reporting over historical sale snapshots.

create or replace function public.get_admin_sales_report(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_active_role('ADMIN'::public.app_role);

  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'Report period is invalid';
  end if;

  with confirmed_sales as (
    select
      s.id,
      s.created_at,
      (s.created_at at time zone 'America/Lima')::date as business_date,
      s.payment_method,
      s.total
    from public.sales s
    where s.status = 'CONFIRMED'
      and s.created_at >= p_start
      and s.created_at < p_end
  ), sale_totals as (
    select
      cs.id,
      cs.created_at,
      cs.business_date,
      cs.payment_method,
      cs.total,
      round(
        coalesce(sum(si.line_subtotal), 0)
        - coalesce(sum(si.unit_purchase_cost * si.quantity), 0),
        2
      ) as gross_profit
    from confirmed_sales cs
    left join public.sale_items si on si.sale_id = cs.id
    group by cs.id, cs.created_at, cs.business_date, cs.payment_method, cs.total
  ), daily as (
    select
      business_date,
      count(*)::numeric as sale_count,
      round(sum(total), 2) as total_sold,
      round(sum(gross_profit), 2) as gross_profit
    from sale_totals
    group by business_date
    order by business_date
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_sold', coalesce((select round(sum(total), 2) from sale_totals), 0::numeric),
      'sale_count', coalesce((select count(*) from sale_totals), 0),
      'cash', coalesce((select round(sum(total), 2) from sale_totals where payment_method = 'CASH'), 0::numeric),
      'yape', coalesce((select round(sum(total), 2) from sale_totals where payment_method = 'YAPE'), 0::numeric),
      'credit', coalesce((select round(sum(total), 2) from sale_totals where payment_method = 'CREDIT'), 0::numeric),
      'gross_profit', coalesce((select round(sum(gross_profit), 2) from sale_totals), 0::numeric)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_date', business_date,
        'sale_count', sale_count,
        'total_sold', total_sold,
        'gross_profit', gross_profit
      ) order by business_date)
      from daily
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_sales_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_admin_sales_report(timestamptz, timestamptz) to authenticated;
