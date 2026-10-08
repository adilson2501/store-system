-- Cash session foundation. Existing sales and credit payments remain valid
-- without a session; operational attribution is enforced in a later migration.

create type public.cash_session_status as enum ('OPEN', 'CLOSED');

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users (id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_cash numeric(12, 2) not null,
  open_client_key uuid not null,
  status public.cash_session_status not null default 'OPEN',
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete restrict,
  counted_cash numeric(12, 2),
  expected_cash_at_close numeric(12, 2),
  difference numeric(12, 2),
  close_client_key uuid,
  cash_sales_at_close numeric(12, 2),
  yape_sales_at_close numeric(12, 2),
  credit_sales_at_close numeric(12, 2),
  cash_debt_payments_at_close numeric(12, 2),
  yape_debt_payments_at_close numeric(12, 2),
  created_at timestamptz not null default now(),
  constraint cash_sessions_opening_cash_check check (
    opening_cash >= 0 and opening_cash = round(opening_cash, 2)
  ),
  constraint cash_sessions_counted_cash_check check (
    counted_cash is null or (counted_cash >= 0 and counted_cash = round(counted_cash, 2))
  ),
  constraint cash_sessions_close_totals_check check (
    (cash_sales_at_close is null or cash_sales_at_close >= 0)
    and (yape_sales_at_close is null or yape_sales_at_close >= 0)
    and (credit_sales_at_close is null or credit_sales_at_close >= 0)
    and (cash_debt_payments_at_close is null or cash_debt_payments_at_close >= 0)
    and (yape_debt_payments_at_close is null or yape_debt_payments_at_close >= 0)
  ),
  constraint cash_sessions_state_consistency_check check (
    (
      status = 'OPEN'
      and closed_at is null
      and closed_by is null
      and counted_cash is null
      and expected_cash_at_close is null
      and difference is null
      and close_client_key is null
      and cash_sales_at_close is null
      and yape_sales_at_close is null
      and credit_sales_at_close is null
      and cash_debt_payments_at_close is null
      and yape_debt_payments_at_close is null
    )
    or (
      status = 'CLOSED'
      and closed_at is not null
      and closed_by is not null
      and counted_cash is not null
      and expected_cash_at_close is not null
      and difference is not null
      and close_client_key is not null
      and cash_sales_at_close is not null
      and yape_sales_at_close is not null
      and credit_sales_at_close is not null
      and cash_debt_payments_at_close is not null
      and yape_debt_payments_at_close is not null
      and difference = counted_cash - expected_cash_at_close
    )
  )
);

create unique index cash_sessions_open_client_key_unique_idx
  on public.cash_sessions (open_client_key);

create unique index cash_sessions_close_client_key_unique_idx
  on public.cash_sessions (close_client_key)
  where close_client_key is not null;

create unique index cash_sessions_one_open_per_operator_idx
  on public.cash_sessions (operator_id)
  where status = 'OPEN';

create index cash_sessions_operator_opened_at_idx
  on public.cash_sessions (operator_id, opened_at desc);

alter table public.sales
  add column cash_session_id uuid references public.cash_sessions (id) on delete restrict;

alter table public.customer_credit_ledger
  add column cash_session_id uuid references public.cash_sessions (id) on delete restrict;

create index sales_cash_session_created_at_idx
  on public.sales (cash_session_id, created_at desc)
  where cash_session_id is not null;

create index customer_credit_ledger_cash_session_created_at_idx
  on public.customer_credit_ledger (cash_session_id, created_at desc)
  where cash_session_id is not null;

alter table public.cash_sessions enable row level security;

create policy "Operators can read own cash sessions"
  on public.cash_sessions
  for select
  to authenticated
  using (operator_id = auth.uid());

create policy "Admins can read all cash sessions"
  on public.cash_sessions
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.cash_sessions from public;
revoke all on public.cash_sessions from anon;
grant select on public.cash_sessions to authenticated;
