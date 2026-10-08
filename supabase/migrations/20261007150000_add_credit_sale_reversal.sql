-- Credit-sale reversal movement type. Kept separate so the enum value is
-- committed before the next migration uses it in constraints and functions.

alter type public.customer_credit_movement_type
  add value if not exists 'CREDIT_SALE_REVERSAL';
