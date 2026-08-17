-- Brenda 17.8.26: a perk should be able to expire.
-- Two independent limits, either or both, NULL = no limit:
--   valid_days_from_join — counted per mother from the day she joined the
--     community (her user_profiles.created_at). "15% at the cafe, first
--     month only" is valid_days_from_join = 30.
--   valid_until — one absolute end date for everyone, for a perk that runs
--     until a fixed date regardless of when she joined.
-- A perk is live for a mother while BOTH limits still hold.

alter table public.partner_perks
  add column if not exists valid_days_from_join integer,
  add column if not exists valid_until date;

alter table public.partner_perks
  drop constraint if exists partner_perks_valid_days_positive;

alter table public.partner_perks
  add constraint partner_perks_valid_days_positive
  check (valid_days_from_join is null or valid_days_from_join > 0);

comment on column public.partner_perks.valid_days_from_join is
  'Days from the mother''s community join date during which this perk is valid. NULL = no time limit.';
comment on column public.partner_perks.valid_until is
  'Absolute last day the perk is valid, for everyone. NULL = no end date.';
