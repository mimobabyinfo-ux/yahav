-- Workshop program: exercises as records, session templates, glossary,
-- and "what we actually covered" per cohort meeting. 3.9.2026.
--
-- Why: a meeting used to be one body_html block, so nothing could be
-- filtered by topic, searched, or given its own video, and every wording
-- fix was a fix in four places (the same exercise lives in several
-- meetings and in both workshops). Content now lives ONCE in `exercises`;
-- a session template is only an ordered list of exercise ids.

-- ── topics ────────────────────────────────────────────────────────────────
create table if not exists public.program_topics (
  key           text primary key,
  label         text not null,
  display_order int  not null default 0
);

insert into public.program_topics (key, label, display_order) values
  ('tummy',      'זמן בטן',              1),
  ('side',       'צד והתהפכויות',        2),
  ('calm',       'רוגע וויסות',          3),
  ('hands',      'ידיים, מבט ותקשורת',   4),
  ('balance',    'שיווי משקל ותנועה',    5),
  ('carry',      'הרמה, מנשא ונשיאה',    6),
  ('senses',     'מרקמים וחושים',        7)
on conflict (key) do update set label = excluded.label, display_order = excluded.display_order;

-- ── exercises ─────────────────────────────────────────────────────────────
create table if not exists public.exercises (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                       -- stable handle for seeding
  title       text not null,
  how         text,                              -- what we do (light html allowed)
  why         text,                              -- the "why" box
  caution     text,                              -- the red "stop" box
  lyrics      text,                              -- warm-up songs
  video_url   text,                              -- videos bucket, /object/public/ form
  topics      text[] not null default '{}',      -- program_topics.key
  terms       text[] not null default '{}',      -- glossary.term
  age_range   text,
  is_warmup   boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists exercises_topics_idx on public.exercises using gin (topics);

-- ── session templates (order only, content lives in exercises) ────────────
create table if not exists public.session_templates (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  meeting_number int  not null,
  title          text not null,
  intro          text,                           -- opening paragraphs (html)
  outro          text,                           -- closing line (html)
  exercise_ids   uuid[] not null default '{}',
  include_warmup boolean not null default true,
  unique (workshop_id, meeting_number)
);

-- ── glossary ──────────────────────────────────────────────────────────────
create table if not exists public.glossary (
  id       uuid primary key default gen_random_uuid(),
  term     text not null unique,
  plain    text not null,
  aliases  text[] not null default '{}'
);

-- ── what a cohort actually got to ─────────────────────────────────────────
-- Stores what was SKIPPED, not what was done: a row that does not exist
-- means "everything", which is the zero-click default Brenda asked for.
-- Skipped exercises rise to the top of the next meeting (derived in the
-- app, nothing to write).
create table if not exists public.cohort_sessions (
  id                   uuid primary key default gen_random_uuid(),
  cohort_id            uuid not null references public.workshop_cohorts(id) on delete cascade,
  meeting_number       int  not null,
  skipped_exercise_ids uuid[] not null default '{}',
  note                 text,
  updated_at           timestamptz not null default now(),
  unique (cohort_id, meeting_number)
);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.program_topics    enable row level security;
alter table public.exercises         enable row level security;
alter table public.session_templates enable row level security;
alter table public.glossary          enable row level security;
alter table public.cohort_sessions   enable row level security;

-- Content is readable by any signed-in user. Which WORKSHOP she may open
-- is already decided by purchased_workshops in the app and by
-- users_read_accessible_content on workshop_content; the program tables
-- only make sense inside a workshop she already reached.
drop policy if exists program_topics_read    on public.program_topics;
drop policy if exists exercises_read         on public.exercises;
drop policy if exists session_templates_read on public.session_templates;
drop policy if exists glossary_read          on public.glossary;
create policy program_topics_read    on public.program_topics    for select to authenticated using (true);
create policy exercises_read         on public.exercises         for select to authenticated using (true);
create policy session_templates_read on public.session_templates for select to authenticated using (true);
create policy glossary_read          on public.glossary          for select to authenticated using (true);

drop policy if exists program_topics_admin    on public.program_topics;
drop policy if exists exercises_admin         on public.exercises;
drop policy if exists session_templates_admin on public.session_templates;
drop policy if exists glossary_admin          on public.glossary;
drop policy if exists cohort_sessions_admin   on public.cohort_sessions;
create policy program_topics_admin    on public.program_topics    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy exercises_admin         on public.exercises         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy session_templates_admin on public.session_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy glossary_admin          on public.glossary          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cohort_sessions_admin   on public.cohort_sessions   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A mother reads the rows of her own cohorts. registration_leads is
-- admin-read-only, so the lookup goes through a SECURITY DEFINER helper,
-- the same pattern as my_lead_ids().
create or replace function public.my_cohort_ids()
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select distinct rl.cohort_id from registration_leads rl
   where rl.id in (select my_lead_ids()) and rl.cohort_id is not null;
$$;
revoke all on function public.my_cohort_ids() from public;
grant execute on function public.my_cohort_ids() to authenticated;

drop policy if exists cohort_sessions_read_own on public.cohort_sessions;
create policy cohort_sessions_read_own on public.cohort_sessions
  for select to authenticated
  using (cohort_id in (select public.my_cohort_ids()));

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();
drop trigger if exists cohort_sessions_touch on public.cohort_sessions;
create trigger cohort_sessions_touch before update on public.cohort_sessions
  for each row execute function public.touch_updated_at();

-- Warm-up set differs per workshop (מגלים has מחא מחא, עטופים does not),
-- so each template carries its own ordered warm-up list.
alter table public.session_templates add column if not exists warmup_exercise_ids uuid[] not null default '{}';
