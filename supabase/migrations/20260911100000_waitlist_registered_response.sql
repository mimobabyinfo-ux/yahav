-- "יכולה ועוד אופציה של נרשמה".
--
-- Yahav 11.9.26: once he sees there is enough interest he opens the cohort
-- and the payment link, and whoever registers should leave the tally.
-- Two ways to get there, both wanted:
--   automatic - the admin panel matches waitlist rows against
--               registration_leads (same product, status='paid', same
--               user_id or normalized phone, created after she asked).
--               No column needed; it is computed when the panel loads.
--   by hand   - response='registered', for a payment that happened outside
--               the system (cash, a link he sent by hand).
--
-- Applied to production 2026-09-11 via the Supabase MCP; this file is the repo record.

alter table public.workshop_waitlist
  drop constraint if exists workshop_waitlist_response_check,
  add constraint workshop_waitlist_response_check
    check (response is null or response in ('yes', 'no', 'registered'));

comment on column public.workshop_waitlist.response is
  'yes = can make proposed_date, no = cannot, registered = she signed up (set by hand, or shown automatically when a paid registration_leads row matches). Null = not answered yet.';
