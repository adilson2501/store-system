-- Checkpoint G2: reserve a movement type for future purchase reversal.
-- No PURCHASE_REVERSAL rows are created by this migration.

alter type public.inventory_movement_type
  add value if not exists 'PURCHASE_REVERSAL';
