-- B2 user/operator management.
-- Auth remains the identity authority; profiles contain application access state.

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create type public.user_management_event_type as enum (
  'USER_CREATED',
  'ROLE_CHANGED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'PASSWORD_RESET_REQUESTED'
);

create table public.user_management_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users (id) on delete restrict,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  event_type public.user_management_event_type not null,
  previous_role public.app_role,
  new_role public.app_role,
  previous_is_active boolean,
  new_is_active boolean,
  created_at timestamptz not null default now()
);

create index user_management_events_target_created_at_idx
  on public.user_management_events (target_user_id, created_at desc);

alter table public.user_management_events enable row level security;

create policy "Admins can read user management events"
  on public.user_management_events
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.user_management_events from public, anon, authenticated;
grant select on public.user_management_events to authenticated;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
      and is_active
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.require_active_role(p_required_role public.app_role default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role
    into v_role
  from public.profiles
  where id = auth.uid()
    and is_active;

  if not found then
    raise exception 'User access is inactive';
  end if;

  if p_required_role is not null and v_role <> p_required_role
    and not (p_required_role = 'SELLER' and v_role = 'ADMIN') then
    raise exception 'Required user role is not available';
  end if;
end;
$$;

revoke all on function public.require_active_role(public.app_role) from public;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
    and (
      coalesce(current_setting('app.user_management', true), '') <> 'on'
      or not public.is_admin()
    )
    and session_user <> 'postgres' then
    raise exception 'Only administrators can change roles or active state';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.update_managed_user(
  p_target_user_id uuid,
  p_role public.app_role,
  p_is_active boolean,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_other_admins integer;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  perform public.require_active_role('ADMIN'::public.app_role);

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'Display name must be between 1 and 120 characters';
  end if;

  -- Serialize this transition with cash-session opening for the same operator.
  perform pg_advisory_xact_lock(hashtext(p_target_user_id::text)::bigint);

  -- The user count is small. Locking all profiles makes role/status transitions
  -- and the last-admin invariant one serialized operation.
  perform 1 from public.profiles order by id for update;

  select * into v_before
  from public.profiles
  where id = p_target_user_id
  for update;
  if not found then
    raise exception 'User profile not found';
  end if;

  if v_before.is_active and not p_is_active
    and exists (
      select 1 from public.cash_sessions
      where operator_id = p_target_user_id and status = 'OPEN'
    ) then
    raise exception 'User has an open cash session';
  end if;

  if v_before.role = 'ADMIN' and v_before.is_active
    and (p_role <> 'ADMIN' or not p_is_active) then
    select count(*)::integer into v_other_admins
    from public.profiles
    where id <> p_target_user_id
      and role = 'ADMIN'
      and is_active;
    if v_other_admins = 0 then
      raise exception 'At least one active administrator is required';
    end if;
  end if;

  perform set_config('app.user_management', 'on', true);

  update public.profiles
  set role = p_role,
      is_active = p_is_active,
      display_name = v_name
  where id = p_target_user_id
  returning * into v_after;

  if v_before.role is distinct from v_after.role then
    insert into public.user_management_events (
      target_user_id, actor_user_id, event_type,
      previous_role, new_role, previous_is_active, new_is_active
    ) values (
      p_target_user_id, auth.uid(), 'ROLE_CHANGED',
      v_before.role, v_after.role, v_before.is_active, v_after.is_active
    );
  end if;

  if v_before.is_active is distinct from v_after.is_active then
    insert into public.user_management_events (
      target_user_id, actor_user_id, event_type,
      previous_role, new_role, previous_is_active, new_is_active
    ) values (
      p_target_user_id, auth.uid(),
      case when v_after.is_active then 'USER_REACTIVATED'::public.user_management_event_type
           else 'USER_DEACTIVATED'::public.user_management_event_type end,
      v_before.role, v_after.role, v_before.is_active, v_after.is_active
    );
  end if;

  return jsonb_build_object(
    'id', v_after.id,
    'role', v_after.role,
    'is_active', v_after.is_active,
    'display_name', v_after.display_name,
    'created_at', v_after.created_at
  );
end;
$$;

revoke all on function public.update_managed_user(uuid, public.app_role, boolean, text) from public, anon;
grant execute on function public.update_managed_user(uuid, public.app_role, boolean, text) to authenticated;

create or replace function public.record_user_created(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.require_active_role('ADMIN'::public.app_role);
  select * into v_profile from public.profiles where id = p_target_user_id;
  if not found then raise exception 'User profile not found'; end if;

  if not exists (
    select 1 from public.user_management_events
    where target_user_id = p_target_user_id and event_type = 'USER_CREATED'
  ) then
    insert into public.user_management_events (
      target_user_id, actor_user_id, event_type, new_role, new_is_active
    ) values (
      p_target_user_id, auth.uid(), 'USER_CREATED', v_profile.role, v_profile.is_active
    );
  end if;
end;
$$;

revoke all on function public.record_user_created(uuid) from public, anon;
grant execute on function public.record_user_created(uuid) to authenticated;

-- Keep existing RPC implementations intact and put the active-user guard in
-- front of every exposed operational path.
alter function public.get_pos_catalog(text, text) rename to b2_original_get_pos_catalog;
create function public.get_pos_catalog(p_barcode text default null, p_search text default null)
returns table (id uuid, name text, barcode text, unit_type public.unit_type, selling_price numeric(12,2), is_active boolean, stock_quantity numeric(12,3))
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_get_pos_catalog(p_barcode, p_search); end; $$;
grant execute on function public.get_pos_catalog(text, text) to authenticated;

alter function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid, uuid) rename to b2_original_confirm_sale;
create function public.confirm_sale(p_client_key uuid, p_payment_method public.payment_method, p_items jsonb, p_amount_received numeric default null, p_customer_id uuid default null, p_cash_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_confirm_sale(p_client_key, p_payment_method, p_items, p_amount_received, p_customer_id, p_cash_session_id); end; $$;
grant execute on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid, uuid) to authenticated;

alter function public.customer_balance(uuid) rename to b2_original_customer_balance;
create function public.customer_balance(p_customer_id uuid) returns numeric(12,2)
language plpgsql stable security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_customer_balance(p_customer_id); end; $$;
grant execute on function public.customer_balance(uuid) to authenticated;

alter function public.search_pos_customers(text) rename to b2_original_search_pos_customers;
create function public.search_pos_customers(p_search text default null)
returns table (id uuid, name text, phone text, credit_limit numeric(12,2), current_debt numeric(12,2), available_credit numeric(12,2), active boolean, credit_enabled boolean)
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_search_pos_customers(p_search); end; $$;
grant execute on function public.search_pos_customers(text) to authenticated;

alter function public.get_customer_credit_detail(uuid) rename to b2_original_get_customer_credit_detail;
create function public.get_customer_credit_detail(p_customer_id uuid)
returns table (id uuid, name text, phone text, notes text, credit_limit numeric(12,2), credit_enabled boolean, active boolean, current_debt numeric(12,2), available_credit numeric(12,2))
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_get_customer_credit_detail(p_customer_id); end; $$;
grant execute on function public.get_customer_credit_detail(uuid) to authenticated;

alter function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) rename to b2_original_register_customer_payment;
create function public.register_customer_payment(p_client_key uuid, p_customer_id uuid, p_amount numeric, p_payment_method public.payment_method, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_register_customer_payment(p_client_key, p_customer_id, p_amount, p_payment_method, p_note); end; $$;
grant execute on function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) to authenticated;

alter function public.open_cash_session(uuid, numeric) rename to b2_original_open_cash_session;
create function public.open_cash_session(p_client_key uuid, p_opening_cash numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_active_role();
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);
  return public.b2_original_open_cash_session(p_client_key, p_opening_cash);
end; $$;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated;

alter function public.get_current_cash_session() rename to b2_original_get_current_cash_session;
create function public.get_current_cash_session()
returns table (session_id uuid, opened_at timestamptz, opening_cash numeric(12,2), status public.cash_session_status)
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_get_current_cash_session(); end; $$;
grant execute on function public.get_current_cash_session() to authenticated;

alter function public.get_current_cash_session_summary() rename to b2_original_get_current_cash_session_summary;
create function public.get_current_cash_session_summary()
returns table (session_id uuid, opened_at timestamptz, opening_cash numeric(12,2), cash_sales numeric(12,2), yape_sales numeric(12,2), credit_sales numeric(12,2), cash_debt_payments numeric(12,2), yape_debt_payments numeric(12,2), total_sales numeric(12,2), expected_cash numeric(12,2))
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_get_current_cash_session_summary(); end; $$;
grant execute on function public.get_current_cash_session_summary() to authenticated;

alter function public.close_cash_session(uuid, uuid, numeric) rename to b2_original_close_cash_session;
create function public.close_cash_session(p_session_id uuid, p_close_client_key uuid, p_counted_cash numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_close_cash_session(p_session_id, p_close_client_key, p_counted_cash); end; $$;
grant execute on function public.close_cash_session(uuid, uuid, numeric) to authenticated;

alter function public.get_admin_cash_session_summary(uuid) rename to b2_original_get_admin_cash_session_summary;
create function public.get_admin_cash_session_summary(p_session_id uuid)
returns table (session_id uuid, operator_id uuid, status public.cash_session_status, opened_at timestamptz, closed_at timestamptz, opening_cash numeric(12,2), cash_sales numeric(12,2), yape_sales numeric(12,2), credit_sales numeric(12,2), cash_debt_payments numeric(12,2), yape_debt_payments numeric(12,2), total_sales numeric(12,2), expected_cash numeric(12,2), counted_cash numeric(12,2), difference numeric(12,2))
language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return query select * from public.b2_original_get_admin_cash_session_summary(p_session_id); end; $$;
grant execute on function public.get_admin_cash_session_summary(uuid) to authenticated;

alter function public.confirm_purchase(uuid, uuid, date, jsonb, text) rename to b2_original_confirm_purchase;
create function public.confirm_purchase(p_client_key uuid, p_supplier_id uuid, p_purchase_date date, p_items jsonb, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_confirm_purchase(p_client_key, p_supplier_id, p_purchase_date, p_items, p_reference); end; $$;
grant execute on function public.confirm_purchase(uuid, uuid, date, jsonb, text) to authenticated;

alter function public.void_purchase(uuid, text, uuid) rename to b2_original_void_purchase;
create function public.void_purchase(p_purchase_id uuid, p_reason text, p_client_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_void_purchase(p_purchase_id, p_reason, p_client_key); end; $$;
grant execute on function public.void_purchase(uuid, text, uuid) to authenticated;

alter function public.void_sale(uuid, text, uuid) rename to b2_original_void_sale;
create function public.void_sale(p_sale_id uuid, p_reason text, p_client_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_void_sale(p_sale_id, p_reason, p_client_key); end; $$;
grant execute on function public.void_sale(uuid, text, uuid) to authenticated;

alter function public.adjust_product_stock(uuid, numeric, text) rename to b2_original_adjust_product_stock;
create function public.adjust_product_stock(p_product_id uuid, p_target_stock numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_adjust_product_stock(p_product_id, p_target_stock, p_reason); end; $$;
grant execute on function public.adjust_product_stock(uuid, numeric, text) to authenticated;

alter function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) rename to b2_original_register_inventory_loss;
create function public.register_inventory_loss(p_product_id uuid, p_quantity numeric, p_reason public.inventory_loss_reason, p_note text default null, p_operation_key uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_register_inventory_loss(p_product_id, p_quantity, p_reason, p_note, p_operation_key); end; $$;
grant execute on function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) to authenticated;

alter function public.create_product_with_initial_stock(text, text, uuid, public.unit_type, numeric, numeric, numeric) rename to b2_original_create_product_with_initial_stock;
create function public.create_product_with_initial_stock(p_name text, p_barcode text default null, p_category_id uuid default null, p_unit_type public.unit_type default null, p_purchase_cost numeric default 0, p_selling_price numeric default 0, p_initial_stock numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_create_product_with_initial_stock(p_name, p_barcode, p_category_id, p_unit_type, p_purchase_cost, p_selling_price, p_initial_stock); end; $$;
grant execute on function public.create_product_with_initial_stock(text, text, uuid, public.unit_type, numeric, numeric, numeric) to authenticated;

alter function public.update_product(uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean) rename to b2_original_update_product;
create function public.update_product(p_product_id uuid, p_name text, p_barcode text default null, p_category_id uuid default null, p_unit_type public.unit_type default null, p_purchase_cost numeric default null, p_selling_price numeric default null, p_is_active boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin perform public.require_active_role(); return public.b2_original_update_product(p_product_id, p_name, p_barcode, p_category_id, p_unit_type, p_purchase_cost, p_selling_price, p_is_active); end; $$;
grant execute on function public.update_product(uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean) to authenticated;

-- Renaming preserves the old function ACL. Remove access to the unchecked
-- implementations and make every wrapper explicit about its ACL.
revoke all on function public.b2_original_get_pos_catalog(text, text) from public, anon, authenticated;
revoke all on function public.b2_original_confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.b2_original_customer_balance(uuid) from public, anon, authenticated;
revoke all on function public.b2_original_search_pos_customers(text) from public, anon, authenticated;
revoke all on function public.b2_original_get_customer_credit_detail(uuid) from public, anon, authenticated;
revoke all on function public.b2_original_register_customer_payment(uuid, uuid, numeric, public.payment_method, text) from public, anon, authenticated;
revoke all on function public.b2_original_open_cash_session(uuid, numeric) from public, anon, authenticated;
revoke all on function public.b2_original_get_current_cash_session() from public, anon, authenticated;
revoke all on function public.b2_original_get_current_cash_session_summary() from public, anon, authenticated;
revoke all on function public.b2_original_close_cash_session(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.b2_original_get_admin_cash_session_summary(uuid) from public, anon, authenticated;
revoke all on function public.b2_original_confirm_purchase(uuid, uuid, date, jsonb, text) from public, anon, authenticated;
revoke all on function public.b2_original_void_purchase(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.b2_original_void_sale(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.b2_original_adjust_product_stock(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.b2_original_register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) from public, anon, authenticated;
revoke all on function public.b2_original_create_product_with_initial_stock(text, text, uuid, public.unit_type, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.b2_original_update_product(uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean) from public, anon, authenticated;

revoke all on function public.get_pos_catalog(text, text) from public, anon;
revoke all on function public.confirm_sale(uuid, public.payment_method, jsonb, numeric, uuid, uuid) from public, anon;
revoke all on function public.customer_balance(uuid) from public, anon;
revoke all on function public.search_pos_customers(text) from public, anon;
revoke all on function public.get_customer_credit_detail(uuid) from public, anon;
revoke all on function public.register_customer_payment(uuid, uuid, numeric, public.payment_method, text) from public, anon;
revoke all on function public.open_cash_session(uuid, numeric) from public, anon;
revoke all on function public.get_current_cash_session() from public, anon;
revoke all on function public.get_current_cash_session_summary() from public, anon;
revoke all on function public.close_cash_session(uuid, uuid, numeric) from public, anon;
revoke all on function public.get_admin_cash_session_summary(uuid) from public, anon;
revoke all on function public.confirm_purchase(uuid, uuid, date, jsonb, text) from public, anon;
revoke all on function public.void_purchase(uuid, text, uuid) from public, anon;
revoke all on function public.void_sale(uuid, text, uuid) from public, anon;
revoke all on function public.adjust_product_stock(uuid, numeric, text) from public, anon;
revoke all on function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) from public, anon;
revoke all on function public.create_product_with_initial_stock(text, text, uuid, public.unit_type, numeric, numeric, numeric) from public, anon;
revoke all on function public.update_product(uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean) from public, anon;
