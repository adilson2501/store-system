-- Extend the legacy sales payment invariant to cover CREDIT sales.
-- The customer-payment constraint remains a separate, unchanged guard.

alter table public.sales
  drop constraint sales_cash_values_check;

alter table public.sales
  add constraint sales_cash_values_check check (
    (payment_method = 'CASH'
      and amount_received is not null
      and amount_change is not null
      and amount_received >= total
      and amount_change = amount_received - total
      and customer_id is null)
    or (payment_method = 'YAPE'
      and amount_received is null
      and amount_change is null
      and customer_id is null)
    or (payment_method = 'CREDIT'
      and amount_received is null
      and amount_change is null
      and customer_id is not null)
  );
