-- Enum-only migration.
-- This must commit before any later migration references the new enum value.

alter type public.payment_method add value if not exists 'CREDIT';
