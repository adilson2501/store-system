-- Checkpoint G2: purchase void audit columns only.
-- The authoritative void_purchase operation is intentionally deferred.

alter table public.purchases
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete restrict,
  add column void_reason text,
  add column void_client_key uuid;

do $$
begin
  if exists (
    select 1
    from public.purchases
    where status = 'VOIDED'
      and (
        voided_at is null
        or voided_by is null
        or void_reason is null
        or void_client_key is null
      )
  ) then
    raise exception 'Cannot add purchase void metadata constraint: existing VOIDED purchase has incomplete audit metadata';
  end if;
end;
$$;

alter table public.purchases
  add constraint purchases_void_metadata_check check (
    (
      status = 'CONFIRMED'
      and voided_at is null
      and voided_by is null
      and void_reason is null
      and void_client_key is null
    )
    or (
      status = 'VOIDED'
      and voided_at is not null
      and voided_by is not null
      and void_reason is not null
      and length(trim(void_reason)) between 3 and 500
      and void_client_key is not null
    )
  );

create unique index purchases_void_client_key_unique_idx
  on public.purchases (void_client_key)
  where void_client_key is not null;

create index purchases_voided_at_idx
  on public.purchases (voided_at desc)
  where voided_at is not null;
