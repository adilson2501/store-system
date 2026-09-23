-- Inventory stock adjustment (ADMIN only), RPC-only.
-- Never mutates stock directly: authoritative stock remains the sum of
-- inventory_movements. A non-zero difference inserts exactly one ADJUSTMENT
-- movement; a zero difference inserts nothing.
-- Does not widen inventory_movements RLS and does not alter the ENTRY path.

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_target_stock numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_type public.unit_type;
  v_current numeric(12, 3);
  v_difference numeric(12, 3);
  v_movement_id uuid;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Only administrators can adjust stock';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Adjustment reason is required';
  end if;

  select unit_type into v_unit_type
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  select coalesce(sum(quantity), 0)
    into v_current
  from public.inventory_movements
  where product_id = p_product_id;

  if p_target_stock is null or p_target_stock < 0 then
    raise exception 'Target stock must be zero or greater';
  end if;

  if p_target_stock <> round(p_target_stock, 3) then
    raise exception 'Target stock must have at most 3 decimals';
  end if;

  if v_unit_type = 'UNIT' and p_target_stock <> trunc(p_target_stock) then
    raise exception 'UNIT products require a whole-number target stock';
  end if;

  v_difference := p_target_stock - v_current;

  if v_difference = 0 then
    return jsonb_build_object(
      'previous_stock', v_current,
      'new_stock', v_current,
      'difference', v_difference,
      'movement_id', null
    );
  end if;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    note,
    created_by
  )
  values (
    p_product_id,
    'ADJUSTMENT',
    v_difference,
    v_reason,
    auth.uid()
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'previous_stock', v_current,
    'new_stock', p_target_stock,
    'difference', v_difference,
    'movement_id', v_movement_id
  );
end;
$$;

revoke all on function public.adjust_product_stock(uuid, numeric, text) from public;
revoke all on function public.adjust_product_stock(uuid, numeric, text) from anon;
grant execute on function public.adjust_product_stock(uuid, numeric, text) to authenticated;
