-- ── Families (multi-parent sync) ──────────────────────────────────────────────
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users(id) on delete set null,
  family_name text,
  invite_code text unique default upper(substring(gen_random_uuid()::text, 1, 8)),
  created_at  timestamptz default now()
);

alter table public.user_profiles
  add column if not exists family_id uuid references public.families(id) on delete set null;

alter table public.families enable row level security;

create policy "family_select" on public.families for select using (
  id in (select family_id from public.user_profiles where id = auth.uid())
  or exists(select 1 from public.user_profiles where id = auth.uid() and is_admin = true)
);
create policy "family_insert" on public.families for insert with check (auth.uid() = created_by);
create policy "family_update" on public.families for update using (
  id in (select family_id from public.user_profiles where id = auth.uid())
  or exists(select 1 from public.user_profiles where id = auth.uid() and is_admin = true)
);

-- ── Purchased workshops ────────────────────────────────────────────────────────
create table if not exists public.purchased_workshops (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  workshop_id   uuid references public.workshops(id) on delete cascade not null,
  purchase_date timestamptz default now(),
  amount_paid   numeric,
  notes         text,
  created_at    timestamptz default now(),
  unique(user_id, workshop_id)
);

alter table public.purchased_workshops enable row level security;

create policy "purchases_select_own" on public.purchased_workshops for select using (auth.uid() = user_id);
create policy "purchases_admin_all" on public.purchased_workshops for all using (
  exists(select 1 from public.user_profiles where id = auth.uid() and is_admin = true)
);

-- ── Lead status constraint (ensure valid values) ──────────────────────────────
alter table public.user_profiles
  drop constraint if exists user_profiles_lead_status_check;

alter table public.user_profiles
  add constraint user_profiles_lead_status_check
  check (lead_status in ('new_lead','active_workshop','post_service') or lead_status is null);
