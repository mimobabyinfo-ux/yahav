-- One bite of the age guide per day.
--
-- Brenda 24.8.26: the full band read as a wall of text. The point of the
-- guide is to give a mother a reason to open the app every morning, so the
-- card now shows ONE thing a day and the full band stays one tap behind it.
--
-- Rows here are derived from baby_age_guide by splitting each section into
-- its own lines. `context` carries the heading a line sat under (בשכיבה על
-- הגב, אבני דרך עד גיל שישה חודשים) so a line still makes sense alone.
--
-- Which item shows is deterministic from the baby's age in days, not stored
-- per mother: day N inside a band shows item N. Every baby the same age
-- sees the same line on the same day, which is also what makes it worth
-- talking about in the WhatsApp group. No write on read, no drift offline.
--
-- red_flags is deliberately NOT split into daily items. A warning sign is
-- something a mother should meet while reading about the whole stage, not
-- something the app pushes at her on a random Tuesday.
--
-- Content rows are seeded directly into the project (same as
-- workshop_content and baby_age_guide itself).

create table if not exists public.baby_age_guide_items (
  id             uuid primary key default gen_random_uuid(),
  band_id        uuid not null references public.baby_age_guide(id) on delete cascade,
  age_start_days integer not null,
  age_end_days   integer not null,
  section        text    not null,
  context        text,
  body           text    not null,
  display_order  integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists baby_age_guide_items_range_idx
  on public.baby_age_guide_items (age_start_days, age_end_days, display_order);

alter table public.baby_age_guide_items enable row level security;

drop policy if exists "Read active age guide items" on public.baby_age_guide_items;
create policy "Read active age guide items"
  on public.baby_age_guide_items for select to authenticated
  using (is_active = true);

drop policy if exists "Admins manage age guide items" on public.baby_age_guide_items;
create policy "Admins manage age guide items"
  on public.baby_age_guide_items for all to authenticated
  using (exists (select 1 from user_profiles where user_profiles.id = auth.uid() and user_profiles.is_admin = true))
  with check (exists (select 1 from user_profiles where user_profiles.id = auth.uid() and user_profiles.is_admin = true));
