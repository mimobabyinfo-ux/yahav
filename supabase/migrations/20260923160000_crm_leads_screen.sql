-- יהב 23.9.26: admin "לידים" screen on top of the CRM (MoreThan / GHL).
-- Applied to production via Supabase MCP on 23.9.26 (migration name crm_leads_screen).
-- crm_leads / crm_inbound are filled by edge function crm-leads-sync (cron every 5 min);
-- outcome buttons go through edge function crm-lead-action (writes to GHL).

create table if not exists public.crm_leads (
  opp_id text primary key,
  contact_id text,
  pipeline text not null,
  pipeline_id text,
  stage_id text,
  stage_name text,
  status text,
  name text,
  phone text,
  phone_local text,
  email text,
  tags text[] default '{}',
  source text,
  products text[] default '{}',
  no_answer text,
  follow_up_date date,
  crm_created_at timestamptz,
  stage_changed_at timestamptz,
  crm_updated_at timestamptz,
  notes jsonb default '[]'::jsonb,
  open_tasks jsonb default '[]'::jsonb,
  last_inbound_at timestamptz,
  last_inbound_text text,
  app_summary text,
  app_paid_future boolean default false,
  brief_rank int,
  brief_bucket text,
  brief_action text,
  brief_why text,
  brief_known text,
  brief_if_no_answer text,
  brief_at timestamptz,
  last_action_at timestamptz,
  last_action_label text,
  synced_at timestamptz default now(),
  is_open boolean default true
);

create table if not exists public.crm_inbound (
  contact_id text primary key,
  name text,
  phone text,
  phone_local text,
  last_message_at timestamptz,
  last_message_text text,
  channel text,
  has_open_opp boolean default false,
  dismissed_at timestamptz,
  synced_at timestamptz default now()
);

create table if not exists public.crm_lead_actions (
  id uuid primary key default gen_random_uuid(),
  opp_id text,
  contact_id text,
  lead_name text,
  action text not null,
  note text,
  callback_date date,
  target_stage_id text,
  actor text,
  source text default 'screen',
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  crm_ok boolean,
  crm_result jsonb
);
create index if not exists crm_lead_actions_opp_idx on public.crm_lead_actions(opp_id, created_at desc);

alter table public.crm_leads enable row level security;
alter table public.crm_inbound enable row level security;
alter table public.crm_lead_actions enable row level security;
create policy crm_leads_admin_all on public.crm_leads for all using (public.is_admin()) with check (public.is_admin());
create policy crm_inbound_admin_all on public.crm_inbound for all using (public.is_admin()) with check (public.is_admin());
create policy crm_lead_actions_admin_all on public.crm_lead_actions for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.crm_cohort_occupancy()
returns table(workshop text, start_date date, start_time time, capacity int, paid bigint)
language sql security definer set search_path = public as $$
  select w.title, c.start_date, c.start_time, c.capacity,
         count(r.id) filter (where r.status = 'paid')
  from workshop_cohorts c
  join workshops w on w.id = c.workshop_id
  left join registration_leads r on r.cohort_id = c.id
  where public.is_admin() and c.is_active and c.start_date >= (now() at time zone 'Asia/Jerusalem')::date
    and (w.title like '%עטופים%' or w.title like '%מגלים%' or w.title like '%אבות%')
  group by 1,2,3,4
  order by 2,3;
$$;
grant execute on function public.crm_cohort_occupancy() to authenticated;

alter publication supabase_realtime add table public.crm_leads;
alter publication supabase_realtime add table public.crm_inbound;

-- cron (applied in prod, key copied from the existing sync-paid-to-crm job):
-- select cron.schedule('crm-leads-sync-5min', '*/5 * * * *', <same http_post as sync-paid-to-crm-hourly, url .../crm-leads-sync>);
