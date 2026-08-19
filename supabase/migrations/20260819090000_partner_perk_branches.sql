-- Brenda 19.8.26: "the businesses we work with — I want an option to tap a
-- location and navigate there. The cafe has 3 branches, each one tappable."
--
-- A perk can therefore carry a list of branches. Each branch is
--   { "name": "רש\"י", "address": "רש\"י 12, רמת גן", "link": "https://..." }
-- name is what she shows the mom, address is what the app navigates to, and
-- link is an optional override (a Waze / Google Maps short link she pasted)
-- for the cases where a plain address search lands on the wrong pin.
-- Empty array = a single-location or online perk, exactly as before.

alter table public.partner_perks
  add column if not exists branches jsonb not null default '[]'::jsonb;

comment on column public.partner_perks.branches is
  'Branch list: [{name, address, link}]. link is optional — when empty the app builds a maps link from address. [] = no branch list.';

-- Tapping a branch is a real, separate signal from visiting a website, so it
-- gets its own analytics action rather than reusing visit_link.
alter table public.perk_analytics
  drop constraint if exists perk_analytics_action_type_check;

alter table public.perk_analytics
  add constraint perk_analytics_action_type_check
  check (action_type in ('view', 'copy_code', 'visit_link', 'navigate'));
