-- Screen B / B3: lead stages with a terminal negative state + lost reasons,
-- and B8: the four insight views the redesigned תובנות tab reads.
--
-- lead_status is NOT touched or repurposed — AuthContext.tsx and
-- OnboardingPage.tsx write 'new_lead' to it on signup. lead_stage is the
-- new pipeline column, backfilled from lead_status.

-- ── B3: columns on user_profiles ────────────────────────────────────
alter table user_profiles
  add column if not exists lead_stage text not null default 'new_lead',
  add column if not exists lost_reason text,
  add column if not exists lost_reason_note text,
  add column if not exists lead_stage_changed_at timestamptz default now();

alter table user_profiles drop constraint if exists user_profiles_lead_stage_check;
alter table user_profiles add constraint user_profiles_lead_stage_check
  check (lead_stage in ('new_lead','contacted','registered','paid','lost'));

alter table user_profiles drop constraint if exists user_profiles_lost_reason_check;
alter table user_profiles add constraint user_profiles_lost_reason_check
  check (lost_reason is null or lost_reason in ('no_response','price','timing','chose_other','not_relevant','other'));

-- Backfill from the lifecycle column (kept as-is): anyone already in or
-- past a workshop counts as a closed-won lead.
update user_profiles set lead_stage = case lead_status
  when 'active_workshop' then 'paid'
  when 'post_service'    then 'paid'
  else 'new_lead' end
where lead_status is not null and lead_status <> 'new_lead' and lead_stage = 'new_lead';

-- ── B3: stage history — what makes "average days to close" possible ─
create table if not exists lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  reason text,
  changed_by uuid references user_profiles(id),
  changed_at timestamptz default now()
);

alter table lead_stage_history enable row level security;

drop policy if exists "admin reads lead history" on lead_stage_history;
create policy "admin reads lead history" on lead_stage_history
  for select using (is_admin());

drop policy if exists "admin writes lead history" on lead_stage_history;
create policy "admin writes lead history" on lead_stage_history
  for insert with check (is_admin());

-- History rows are written by a trigger, not by the client — a stage
-- change can never silently skip the log.
create or replace function log_lead_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_stage is distinct from old.lead_stage then
    insert into lead_stage_history (user_id, from_stage, to_stage, reason, changed_by)
    values (new.id, old.lead_stage, new.lead_stage,
            case when new.lead_stage = 'lost' then new.lost_reason end,
            auth.uid());
    new.lead_stage_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_lead_stage_change on user_profiles;
create trigger trg_lead_stage_change before update on user_profiles
  for each row execute function log_lead_stage_change();

-- ── B8: views (aggregates only — same owner-view pattern as
--    v_video_performance / v_retention_cohort) ─────────────────────────

-- One funnel crossing screens: store → questionnaire → registered →
-- paid → attended. "attended" mirrors the client-side effectiveStatus():
-- stored handled, or paid whose cohort start moment has passed.
create or replace view v_registration_funnel as
select
  (select count(*) from user_activities
     where event_type = 'page_view' and event_data->>'page' = 'workshops') as store_views,
  (select count(*) from form_submissions s
     where s.form_id in (select linked_form_id from workshops where linked_form_id is not null)) as forms_filled,
  (select count(*) from registration_leads) as registered,
  (select count(*) from registration_leads where status in ('paid','handled')) as paid,
  (select count(*) from registration_leads l
     left join workshop_cohorts c on c.id = l.cohort_id
     where l.status = 'handled'
        or (l.status = 'paid' and c.id is not null
            and (c.start_date < current_date
                 or (c.start_date = current_date and c.start_time is not null and c.start_time < localtime)))) as attended;

-- Fill per open (active, not yet started) cohort.
create or replace view v_cohort_fill as
select
  c.id as cohort_id,
  c.workshop_id,
  w.title as workshop_title,
  c.start_date,
  c.start_time,
  c.label,
  coalesce(c.capacity, w.stock_quantity) as capacity,
  (select count(*) from registration_leads l where l.cohort_id = c.id) as registered
from workshop_cohorts c
join workshops w on w.id = c.workshop_id
where c.is_active
  and (c.start_date > current_date
       or (c.start_date = current_date and (c.start_time is null or c.start_time >= localtime)));

-- Community events: real attendance (measurable since vendor check-in
-- shipped) + this-month hygiene (events missing a vendor / a check-in link).
create or replace view v_event_attendance as
select
  (select count(*) from event_registrations r
     join community_events e on e.id = r.event_id
     where e.event_date < current_date and r.status in ('registered','attended','no_show')) as past_registered,
  (select count(*) from event_registrations r
     join community_events e on e.id = r.event_id
     where e.event_date < current_date and r.status = 'attended') as past_attended,
  (select count(*) from event_registrations r
     join community_events e on e.id = r.event_id
     where e.event_date < current_date and r.status = 'no_show') as past_no_show,
  (select count(*) from community_events e
     where e.is_active and date_trunc('month', e.event_date) = date_trunc('month', current_date)) as events_this_month,
  (select count(*) from community_events e
     where e.is_active and date_trunc('month', e.event_date) = date_trunc('month', current_date)
       and e.vendor_id is null and coalesce(e.vendor_name,'') = '') as events_no_vendor,
  (select count(*) from community_events e
     where e.is_active and date_trunc('month', e.event_date) = date_trunc('month', current_date)
       and not exists (select 1 from event_checkin_tokens t where t.event_id = e.id)) as events_no_checkin;

-- Lead pipeline + outcomes. Close rate excludes leads still in progress
-- (B6: the client labels it "X מתוך Y לידים שהוכרעו").
create or replace view v_lead_outcomes as
select
  count(*) as total_leads,
  count(*) filter (where lead_stage = 'new_lead') as stage_new,
  count(*) filter (where lead_stage = 'contacted') as stage_contacted,
  count(*) filter (where lead_stage = 'registered') as stage_registered,
  count(*) filter (where lead_stage = 'paid') as stage_paid,
  count(*) filter (where lead_stage = 'lost') as stage_lost,
  count(*) filter (where lead_stage = 'new_lead'
                   and coalesce(lead_stage_changed_at, created_at) < now() - interval '48 hours') as open_unanswered_48h,
  (select round(avg(extract(epoch from (h.changed_at - p2.created_at)) / 86400)::numeric, 1)
     from lead_stage_history h
     join user_profiles p2 on p2.id = h.user_id
     where h.to_stage = 'paid') as avg_days_to_close
from user_profiles
where is_admin is not true;
