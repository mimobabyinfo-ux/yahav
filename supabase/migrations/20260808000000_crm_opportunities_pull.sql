-- Yahav: "זה לא מערכת CRM" — the lead pipeline already lives in GHL
-- (336 opportunities with his own stage names, lost/won status, lost
-- reasons and timestamps), and leads arrive there from Facebook forms
-- and landing pages long before anyone reaches the app's הרשמות.
-- So the app stops pretending to own leads: the manual lead_stage
-- machine is removed and the insights read a mirror of the CRM,
-- refreshed hourly by the sync-crm-leads edge function.

-- ── Remove the duplicate source of truth (added one day earlier) ────
drop view if exists v_lead_outcomes;
drop trigger if exists trg_lead_stage_change on user_profiles;
drop function if exists log_lead_stage_change();
drop table if exists lead_stage_history cascade;

alter table user_profiles drop constraint if exists user_profiles_lead_stage_check;
alter table user_profiles drop constraint if exists user_profiles_lost_reason_check;
alter table user_profiles
  drop column if exists lead_stage,
  drop column if exists lost_reason,
  drop column if exists lost_reason_note,
  drop column if exists lead_stage_changed_at;
-- lead_status stays untouched: AuthContext + Onboarding write it on signup.

-- ── The CRM mirror ─────────────────────────────────────────────────
create table if not exists crm_opportunities (
  id text primary key,                -- GHL opportunity id
  contact_id text,
  contact_phone text,
  normalized_phone text,              -- 0XXXXXXXXX, matches the app's format
  name text,
  pipeline_id text,
  pipeline_name text,
  stage_id text,
  stage_name text,
  status text,                        -- open | won | lost | abandoned
  lost_reason_id text,
  source text,
  monetary_value numeric,
  crm_created_at timestamptz,
  last_status_change_at timestamptz,
  last_stage_change_at timestamptz,
  synced_at timestamptz default now()
);

create index if not exists crm_opportunities_status_idx on crm_opportunities (status);
create index if not exists crm_opportunities_phone_idx on crm_opportunities (normalized_phone);

alter table crm_opportunities enable row level security;

drop policy if exists "admin reads crm opportunities" on crm_opportunities;
create policy "admin reads crm opportunities" on crm_opportunities
  for select using (is_admin());
-- Writes come from the edge function with the service role, which
-- bypasses RLS — no insert/update policy on purpose.

-- ── Views the תובנות tab reads ─────────────────────────────────────
-- Close rate counts DECIDED opportunities only (won + lost); the app
-- labels it "N מתוך M לידים שהוכרעו" so the denominator is visible.
create or replace view v_crm_lead_outcomes as
select
  count(*)                                              as total_leads,
  count(*) filter (where status = 'open')               as open_leads,
  count(*) filter (where status = 'won')                as won_leads,
  count(*) filter (where status = 'lost')               as lost_leads,
  count(*) filter (where status = 'abandoned')          as abandoned_leads,
  count(*) filter (
    where status = 'open'
      and coalesce(last_stage_change_at, crm_created_at) < now() - interval '48 hours'
  )                                                     as open_unanswered_48h,
  round(avg(
    extract(epoch from (last_status_change_at - crm_created_at)) / 86400
  ) filter (where status = 'won' and last_status_change_at is not null)::numeric, 1)
                                                        as avg_days_to_close,
  count(*) filter (
    where crm_created_at >= date_trunc('month', now())
  )                                                     as new_this_month
from crm_opportunities;

-- Where open leads are sitting right now — the pipeline boxes.
create or replace view v_crm_pipeline as
select
  stage_id,
  coalesce(stage_name, 'ללא שלב') as stage_name,
  pipeline_name,
  count(*) as leads
from crm_opportunities
where status = 'open'
group by stage_id, stage_name, pipeline_name;

-- Why leads didn't close. GHL stores the reason Yahav picks when he
-- marks an opportunity lost, but exposes only its id on the
-- opportunity — the labels live in the location's opportunity settings
-- and aren't in the public API. So the ids are mirrored here with a
-- label column: sync-crm-leads inserts every id it sees (label NULL),
-- the edge function fills labels in if GHL ever answers for them, and
-- they can be named by hand once. Until a label exists the chart falls
-- back to the CRM stage, which carries the reason in his own words
-- (אין מענה / לא נסגר / לא רלוונטי) and is always populated.
create table if not exists crm_lost_reasons (
  id text primary key,
  label text,
  created_at timestamptz default now()
);

alter table crm_lost_reasons enable row level security;
drop policy if exists "admin reads crm lost reasons" on crm_lost_reasons;
create policy "admin reads crm lost reasons" on crm_lost_reasons
  for select using (is_admin());

-- The four ids currently in use, so they can be labelled immediately.
insert into crm_lost_reasons (id) values
  ('6a4f4664c5378784f4e67c74'),
  ('6a4f4b539d77fc645c165500'),
  ('6a4f4a3e0559dc2df84b9883'),
  ('6a4f4b7640cacdeacf8811c5')
on conflict (id) do nothing;

create or replace view v_crm_lost_reasons as
select
  coalesce(r.label, o.stage_name, 'ללא סיבה מתועדת') as reason,
  count(*)                                           as leads,
  bool_or(r.label is null)                           as label_missing
from crm_opportunities o
left join crm_lost_reasons r on r.id = o.lost_reason_id
where o.status = 'lost'
group by coalesce(r.label, o.stage_name, 'ללא סיבה מתועדת');

-- Applied separately after the first sync proved GHL exposes no
-- lost-reason labels: the admin names each reason id once in the
-- תובנות tab, and ids that appear later show up unlabelled rather than
-- collapsing into the (useless) 'לא נסגר' stage — all 200 lost leads
-- sit in that one stage.
drop policy if exists "admin writes crm lost reasons" on crm_lost_reasons;
create policy "admin writes crm lost reasons" on crm_lost_reasons
  for update using (is_admin()) with check (is_admin());

drop view if exists v_crm_lost_reasons;
create view v_crm_lost_reasons as
select
  o.lost_reason_id,
  r.label,
  count(*) as leads
from crm_opportunities o
left join crm_lost_reasons r on r.id = o.lost_reason_id
where o.status = 'lost'
group by o.lost_reason_id, r.label;

-- Hourly pull (mirrors the sync-*-to-crm cron pattern):
--   select cron.schedule('sync-crm-leads-hourly', '35 * * * *', $$ ... $$);
