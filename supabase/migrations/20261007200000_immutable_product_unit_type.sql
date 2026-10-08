-- Checkpoint F1: product unit semantics become immutable after inventory history.
-- The product lock is acquired before checking movement history so this rule
-- serializes with the supported inventory-writing RPCs.

create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_barcode text default null,
  p_category_id uuid default null,
  p_unit_type public.unit_type default null,
  p_purchase_cost numeric default null,
  p_selling_price numeric default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_barcode text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Only administrators can update products';
  end if;

  if p_product_id is null then
    raise exception 'Product is required';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Product name is required';
  end if;

  if p_unit_type is null then
    raise exception 'Unit type is required';
  end if;

  if p_purchase_cost is null or p_purchase_cost < 0 then
    raise exception 'Purchase cost must be zero or greater';
  end if;

  if p_purchase_cost <> round(p_purchase_cost, 2) then
    raise exception 'Purchase cost must have at most 2 decimals';
  end if;

  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price must be zero or greater';
  end if;

  if p_selling_price <> round(p_selling_price, 2) then
    raise exception 'Selling price must have at most 2 decimals';
  end if;

  if p_is_active is null then
    raise exception 'Active state is required';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found';
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.unit_type <> p_unit_type
    and exists (
      select 1
      from public.inventory_movements
      where product_id = p_product_id
    ) then
    raise exception 'Product unit type cannot be changed after inventory history exists';
  end if;

  v_barcode := nullif(trim(p_barcode), '');

  update public.products
  set name = trim(p_name),
      barcode = v_barcode,
      category_id = p_category_id,
      unit_type = p_unit_type,
      purchase_cost = p_purchase_cost,
      selling_price = p_selling_price,
      is_active = p_is_active
  where id = p_product_id;

  if v_product.purchase_cost is distinct from p_purchase_cost then
    insert into public.product_cost_history (
      product_id,
      source_type,
      cost,
      created_by
    )
    values (
      p_product_id,
      'MANUAL_ADJUSTMENT',
      p_purchase_cost,
      auth.uid()
    );
  end if;

  return p_product_id;
end;
$$;

revoke all on function public.update_product(
  uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean
) from public, anon;
grant execute on function public.update_product(
  uuid, text, text, uuid, public.unit_type, numeric, numeric, boolean
) to authenticated;
