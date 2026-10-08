-- Checkpoint G2: reserve the VOIDED purchase status.
-- This migration intentionally adds no void behavior or audit metadata.

alter type public.purchase_status
  add value if not exists 'VOIDED';
