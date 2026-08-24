-- The age guide, v2.
--
-- v1 (20260824000000 / 20260824010000) split a stage into daily items and
-- showed one line a day. Yahav 24.8.26 killed that: "במשך כל הטווח הזה הם
-- יקבלו את אותו מידע - מכיוון שהתפתחות היא קוראת בטווח ולא ביום יומיים או
-- אפילו שבוע." A fact that is true today is true in three days.
--
-- So: one row per age RANGE. `headline` is the single sentence the home
-- card shows. Everything deeper is a topic the mother chooses to open.
--
-- baby_age_guide / baby_age_guide_items stay in place, unread, rather than
-- being dropped. Nothing renders them any more.
--
-- Applied to production on 2026-08-24; this file is the repo record, hence
-- the IF NOT EXISTS guards. It reproduces exactly what is live.

create table if not exists public.age_stages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  age_start_days integer not null,
  age_end_days integer not null,
  headline text not null,          -- the one line on the dashboard card
  intro text,                      -- opening paragraph inside the guide
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (age_end_days >= age_start_days)
);

-- kind='consult' is the red-flag topic. Stored and edited like any other
-- topic so Brenda can retune its wording from the admin screen; only the
-- tone and the styling differ, because the flags must never read as
-- alarming ("אני לא רוצה להלחיץ את האמהות").
create table if not exists public.age_stage_topics (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.age_stages(id) on delete cascade,
  kind text not null default 'topic' check (kind in ('topic', 'consult')),
  emoji text,
  title text not null,
  teaser text,
  body text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists age_stages_range_idx
  on public.age_stages (age_start_days, age_end_days);
create index if not exists age_stage_topics_stage_idx
  on public.age_stage_topics (stage_id, display_order);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists age_stages_touch on public.age_stages;
create trigger age_stages_touch before update on public.age_stages
  for each row execute function public.touch_updated_at();

drop trigger if exists age_stage_topics_touch on public.age_stage_topics;
create trigger age_stage_topics_touch before update on public.age_stage_topics
  for each row execute function public.touch_updated_at();

alter table public.age_stages enable row level security;
alter table public.age_stage_topics enable row level security;

-- Mothers read only what is switched on. Admins get a second, wider policy
-- (RLS ORs permissive policies), which is what lets the admin screen list
-- and re-enable a stage that is currently off.
drop policy if exists "Read active stages" on public.age_stages;
create policy "Read active stages" on public.age_stages
  for select to authenticated using (is_active = true);

drop policy if exists "Read active stage topics" on public.age_stage_topics;
create policy "Read active stage topics" on public.age_stage_topics
  for select to authenticated using (is_active = true);

drop policy if exists "Admins manage stages" on public.age_stages;
create policy "Admins manage stages" on public.age_stages
  for all to authenticated
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "Admins manage stage topics" on public.age_stage_topics;
create policy "Admins manage stage topics" on public.age_stage_topics
  for all to authenticated
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin = true));
