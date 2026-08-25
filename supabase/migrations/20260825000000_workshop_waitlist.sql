-- "כשייפתח מחזור חדש אני רוצה לדעת".
--
-- Yahav 25.8.26: a product whose cohorts have all ended still showed a buy
-- button. Mothers pressed it, recordStorePurchase wrote a registration_leads
-- row with source='store', and they sat in the admin looking like people who
-- owed money for a workshop that does not exist yet. Three of those in two
-- days (מעין קאו, בר אטרי, שלי אסף).
--
-- Interest is not a registration, so it does not live in registration_leads.
-- Its own table keeps it out of the unpaid counts and the red card forever.
--
-- Applied to production 2026-08-25; this file is the repo record.

create table if not exists public.workshop_waitlist (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  -- Denormalised on purpose: this is who asked, at the moment she asked.
  -- A profile edit months later must not rewrite the contact details Brenda
  -- is about to reach out on.
  name text not null,
  phone text,
  normalized_phone text generated always as (public.normalize_il_phone(phone)) stored,
  email text,
  note text,
  created_at timestamptz not null default now(),
  -- Set when Brenda tells her a cohort opened. Kept rather than deleted, so
  -- "who did we already tell" survives and nobody gets told twice.
  notified_at timestamptz,
  notified_cohort_id uuid references public.workshop_cohorts(id) on delete set null
);

-- One entry per person per product. Pressing the button twice is a no-op,
-- not a duplicate row in Brenda's list.
create unique index if not exists workshop_waitlist_user_uniq
  on public.workshop_waitlist (workshop_id, user_id) where user_id is not null;
create unique index if not exists workshop_waitlist_phone_uniq
  on public.workshop_waitlist (workshop_id, normalized_phone)
  where user_id is null and normalized_phone is not null;
create index if not exists workshop_waitlist_pending_idx
  on public.workshop_waitlist (workshop_id, created_at) where notified_at is null;

alter table public.workshop_waitlist enable row level security;

-- A mother may add herself and may see only her own row (so the button can
-- render as "נעדכן אותך"). She can never read the list.
drop policy if exists "Join the waitlist" on public.workshop_waitlist;
create policy "Join the waitlist" on public.workshop_waitlist
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Read own waitlist rows" on public.workshop_waitlist;
create policy "Read own waitlist rows" on public.workshop_waitlist
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Leave the waitlist" on public.workshop_waitlist;
create policy "Leave the waitlist" on public.workshop_waitlist
  for delete to authenticated using (user_id = (select auth.uid()));

-- Admin sees and manages everything. auth.uid() is wrapped in a scalar
-- subquery so it is evaluated once per query instead of once per row — the
-- auth_rls_initplan fix, applied here from the start rather than retrofitted.
drop policy if exists "Admins manage the waitlist" on public.workshop_waitlist;
create policy "Admins manage the waitlist" on public.workshop_waitlist
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p
                      where p.id = (select auth.uid()) and p.is_admin = true));

-- Which products offer the waitlist instead of a buy button once their
-- cohorts have run out.
--
-- A flag and not a rule, deliberately. "No upcoming cohort" does not mean
-- "cannot be bought": ליווי פרטני and תהליך ליווי have never had a cohort
-- and are purchasable any day of the week. Inferring the waitlist from
-- missing cohorts would have removed their buy button and quietly cost sales.
alter table public.workshops
  add column if not exists waitlist_enabled boolean not null default false;

comment on column public.workshops.waitlist_enabled is
  'When true and the product has no upcoming cohort, the store shows a waitlist button instead of the buy button.';

update public.workshops
   set waitlist_enabled = true
 where title in ('סדנת עיסוי תינוקות', 'מפגש אבות');
