-- Checkpoint G2: purchase-specific movement source and sign constraints.
-- The economic operation that inserts these rows is intentionally deferred.

do $$
begin
  if exists (
    select 1
    from public.inventory_movements
    where (movement_type = 'SALE' and (sale_id is null or purchase_id is not null))
       or (movement_type = 'REVERSAL' and (sale_id is null or purchase_id is not null))
       or (movement_type = 'ENTRY' and sale_id is not null)
       or (movement_type = 'PURCHASE_REVERSAL' and (sale_id is not null or purchase_id is null))
       or (movement_type in ('LOSS', 'ADJUSTMENT') and (sale_id is not null or purchase_id is not null))
  ) then
    raise exception 'Cannot replace inventory movement source constraint: existing movement has an invalid source link';
  end if;

  if exists (
    select 1
    from public.inventory_movements
    where (movement_type = 'ENTRY' and quantity <= 0)
       or (movement_type = 'SALE' and quantity >= 0)
       or (movement_type = 'LOSS' and quantity >= 0)
       or (movement_type = 'REVERSAL' and quantity <= 0)
       or (movement_type = 'PURCHASE_REVERSAL' and quantity >= 0)
       or (movement_type = 'ADJUSTMENT' and quantity = 0)
  ) then
    raise exception 'Cannot replace inventory movement direction constraint: existing movement has an invalid quantity sign';
  end if;

  if exists (
    select 1
    from public.inventory_movements
    where movement_type = 'PURCHASE_REVERSAL'
    group by purchase_id, product_id
    having count(*) > 1
  ) then
    raise exception 'Cannot create purchase reversal uniqueness index: duplicate purchase/product reversal exists';
  end if;
end;
$$;

alter table public.inventory_movements
  drop constraint inventory_movements_sale_link_check,
  drop constraint inventory_movements_direction_check;

alter table public.inventory_movements
  add constraint inventory_movements_sale_link_check check (
    (
      movement_type = 'SALE'
      and sale_id is not null
      and purchase_id is null
    )
    or (
      movement_type = 'REVERSAL'
      and sale_id is not null
      and purchase_id is null
    )
    or (
      movement_type = 'ENTRY'
      and sale_id is null
    )
    or (
      movement_type = 'PURCHASE_REVERSAL'
      and sale_id is null
      and purchase_id is not null
    )
    or (
      movement_type in ('LOSS', 'ADJUSTMENT')
      and sale_id is null
      and purchase_id is null
    )
  ),
  add constraint inventory_movements_direction_check check (
    (movement_type = 'ENTRY' and quantity > 0)
    or (movement_type = 'SALE' and quantity < 0)
    or (movement_type = 'LOSS' and quantity < 0)
    or (movement_type = 'ADJUSTMENT' and quantity <> 0)
    or (movement_type = 'REVERSAL' and quantity > 0)
    or (movement_type = 'PURCHASE_REVERSAL' and quantity < 0)
  );

create unique index inventory_movements_purchase_product_reversal_unique_idx
  on public.inventory_movements (purchase_id, product_id)
  where movement_type = 'PURCHASE_REVERSAL';
