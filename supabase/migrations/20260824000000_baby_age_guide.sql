-- Age-based status guide for the home dashboard.
--
-- Mirrors pregnancy_weekly_guide, which is the app's existing precedent for
-- "where are we right now" content: one row per band, matched against the
-- selected child's age in days, rendered as a home card that opens a sheet.
--
-- Bands are NOT uniform on purpose. They follow the resolution of Brenda's
-- own course material: per month from birth to 4 months, then 4-6 / 6-8,
-- then the wider bands her milestone table covers. Every text column is
-- nullable because her material genuinely says nothing for some slots at
-- some ages, and an empty section is honest where invented text would not be.
--
-- The 10 content rows are seeded directly into the project (same as
-- workshop_content) and are editable from the database.

create table if not exists public.baby_age_guide (
  id              uuid primary key default gen_random_uuid(),
  title           text    not null,
  subtitle        text,
  age_start_days  integer not null,
  age_end_days    integer not null,
  development     text,
  senses          text,
  communication   text,
  feeding_sleep   text,
  reflexes        text,
  what_to_do      text,
  red_flags       text,
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint baby_age_guide_range_ok check (age_end_days >= age_start_days)
);

create index if not exists baby_age_guide_range_idx
  on public.baby_age_guide (age_start_days, age_end_days);

alter table public.baby_age_guide enable row level security;

drop policy if exists "Read active age guide" on public.baby_age_guide;
create policy "Read active age guide"
  on public.baby_age_guide for select to authenticated
  using (is_active = true);

drop policy if exists "Admins manage age guide" on public.baby_age_guide;
create policy "Admins manage age guide"
  on public.baby_age_guide for all to authenticated
  using (exists (select 1 from user_profiles where user_profiles.id = auth.uid() and user_profiles.is_admin = true))
  with check (exists (select 1 from user_profiles where user_profiles.id = auth.uid() and user_profiles.is_admin = true));
