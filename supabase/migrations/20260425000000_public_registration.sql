-- ────────────────────────────────────────────────────────────────────────────
-- Public registration landing page
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add public_registration flag on workshops
alter table workshops add column if not exists public_registration boolean not null default false;

-- 2. Registration leads table
create table if not exists registration_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  selected_workshop_id uuid references workshops(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','paid','handled')),
  source text,
  created_at timestamptz not null default now()
);

create index if not exists registration_leads_created_at_idx on registration_leads (created_at desc);
create index if not exists registration_leads_status_idx on registration_leads (status);

-- 3. RLS
alter table registration_leads enable row level security;

drop policy if exists "anyone can insert registration leads" on registration_leads;
create policy "anyone can insert registration leads"
  on registration_leads for insert
  to anon, authenticated
  with check (true);

drop policy if exists "admins read registration leads" on registration_leads;
create policy "admins read registration leads"
  on registration_leads for select
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

drop policy if exists "admins update registration leads" on registration_leads;
create policy "admins update registration leads"
  on registration_leads for update
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

drop policy if exists "admins delete registration leads" on registration_leads;
create policy "admins delete registration leads"
  on registration_leads for delete
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

-- 4. Allow anonymous read of workshops where public_registration = true
-- (existing policy may already allow public read of active workshops; if not, this ensures the form page works)
drop policy if exists "anon can read public registration workshops" on workshops;
create policy "anon can read public registration workshops"
  on workshops for select
  to anon
  using (public_registration = true and is_active = true);

-- 5. Seed landing_hero_text into global_settings
insert into global_settings (setting_key, setting_value, setting_type, category, description)
values ('landing_hero_text', 'ברוכה הבאה לסדנאות מימו', 'text', 'landing', 'כיתוב ראשי בעמוד ההרשמה הציבורי')
on conflict (setting_key) do nothing;
