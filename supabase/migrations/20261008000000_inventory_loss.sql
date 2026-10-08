-- B1: append-only inventory loss / waste registration.
-- Known operational losses remain LOSS movements; unknown stock discrepancies
-- continue to use ADJUSTMENT.

do $$
begin
  if exists (
    select 1
    from public.inventory_movements
    where movement_type = 'LOSS'
  ) then
    raise exception 'Cannot add LOSS metadata while historical LOSS movements exist; review them before applying B1';
  end if;
end;
$$;

create type public.inventory_loss_reason as enum (
  'EXPIRED',
  'DAMAGED',
  'BROKEN',
  'SPOILED',
  'LOST',
  'OTHER'
);

alter table public.inventory_movements
  add column loss_reason public.inventory_loss_reason,
  add column operation_key uuid;

alter table public.inventory_movements
  add constraint inventory_movements_loss_metadata_check check (
    (
      movement_type = 'LOSS'
      and loss_reason is not null
      and operation_key is not null
    )
    or (
      movement_type <> 'LOSS'
      and loss_reason is null
      and operation_key is null
    )
  );

create unique index inventory_movements_loss_operation_key_unique_idx
  on public.inventory_movements (operation_key)
  where movement_type = 'LOSS' and operation_key is not null;

create or replace function public.register_inventory_loss(
  p_product_id uuid,
  p_quantity numeric,
  p_reason public.inventory_loss_reason,
  p_note text default null,
  p_operation_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.inventory_movements%rowtype;
  v_product_unit_type public.unit_type;
  v_current numeric(12, 3);
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Only administrators can register inventory loss';
  end if;

  if p_product_id is null then
    raise exception 'Product is required';
  end if;

  if p_operation_key is null then
    raise exception 'Loss operation key is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Loss quantity must be greater than zero';
  end if;

  if p_quantity <> round(p_quantity, 3) then
    raise exception 'Loss quantity must have at most 3 decimals';
  end if;

  if p_reason is null then
    raise exception 'Loss reason is required';
  end if;

  if p_reason = 'OTHER' and v_note is null then
    raise exception 'A note is required for OTHER loss reason';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Loss note must have at most 500 characters';
  end if;

  select *
    into v_existing
  from public.inventory_movements
  where movement_type = 'LOSS'
    and operation_key = p_operation_key;

  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.product_id <> p_product_id
      or v_existing.quantity <> -p_quantity
      or v_existing.loss_reason <> p_reason
      or v_existing.note is distinct from v_note then
      raise exception 'LOSS_IDEMPOTENCY_CONFLICT';
    end if;

    select coalesce(sum(quantity), 0)::numeric(12, 3)
      into v_current
    from public.inventory_movements
    where product_id = v_existing.product_id;

    return jsonb_build_object(
      'movement_id', v_existing.id,
      'operation_key', v_existing.operation_key,
      'product_id', v_existing.product_id,
      'movement_type', v_existing.movement_type,
      'quantity', -v_existing.quantity,
      'loss_reason', v_existing.loss_reason,
      'note', v_existing.note,
      'previous_stock', v_current + v_existing.quantity,
      'new_stock', v_current
    );
  end if;

  -- Every inventory loss serializes on the product row before reading stock.
  select unit_type
    into v_product_unit_type
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product_unit_type = 'UNIT' and p_quantity <> trunc(p_quantity) then
    raise exception 'UNIT products require whole-number loss quantities';
  end if;

  select coalesce(sum(quantity), 0)::numeric(12, 3)
    into v_current
  from public.inventory_movements
  where product_id = p_product_id;

  if p_quantity > v_current then
    raise exception 'Insufficient stock for inventory loss';
  end if;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    loss_reason,
    operation_key,
    note,
    created_by
  )
  values (
    p_product_id,
    'LOSS',
    -p_quantity,
    p_reason,
    p_operation_key,
    v_note,
    auth.uid()
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'operation_key', p_operation_key,
    'product_id', p_product_id,
    'movement_type', 'LOSS',
    'quantity', p_quantity,
    'loss_reason', p_reason,
    'note', v_note,
    'previous_stock', v_current,
    'new_stock', v_current - p_quantity
  );
end;
$$;

revoke all on function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) from public;
revoke all on function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) from anon;
grant execute on function public.register_inventory_loss(uuid, numeric, public.inventory_loss_reason, text, uuid) to authenticated;
